/**
 * Mapping Service for Autotask ID-to-Name Resolution
 * Provides cached lookup functionality for company IDs and resource IDs
 */

import { AutotaskService } from '../services/autotask.service.js';
import { Logger } from './logger.js';

export interface MappingCache {
  companies: Map<number, string>;
  resources: Map<number, string>;
  lastUpdated: {
    companies: Date | null;
    resources: Date | null;
  };
}

export interface MappingResult {
  id: number;
  name: string;
  found: boolean;
}

/**
 * How long a request is allowed to block on cache warm-up before proceeding
 * with fallback (per-ID) lookups. The full pre-warm walks EVERY company in
 * the tenant (thousands of records for large MSPs, taking 30s+), which
 * exceeds the gateway's tool-call timeout — so responses must never wait
 * for it. The warm-up
 * continues in the background and lands in the shared tenant store for
 * subsequent requests.
 */
const WARM_WAIT_BUDGET_MS = 2_500;

/**
 * Cross-request cache store, keyed by tenant (lowercased API username).
 *
 * In gateway mode a new MappingService is constructed per request; without
 * this store every request re-ran the full company pre-warm (30s+ on large
 * tenants), stalling responses past the gateway timeout. Sharing the DATA
 * keyed by tenant credential keeps requests fast while preserving the
 * per-tenant isolation that the per-instance design exists to guarantee
 * (incident 2026-06-03): two tenants can never share a store entry because
 * the key IS the tenant identity.
 */
const tenantCacheStore = new Map<string, MappingCache>();

/**
 * Reset the tenant cache store. Intended for tests only.
 */
export function _resetTenantCacheStore(): void {
  tenantCacheStore.clear();
}

function tenantCacheFor(tenantKey: string): MappingCache {
  let entry = tenantCacheStore.get(tenantKey);
  if (!entry) {
    entry = {
      companies: new Map<number, string>(),
      resources: new Map<number, string>(),
      lastUpdated: { companies: null, resources: null },
    };
    tenantCacheStore.set(tenantKey, entry);
  }
  return entry;
}

export class MappingService {
  // Per-instance init promise (coalesces concurrent initializeCache calls
  // on the SAME instance). Must NOT be static — a class-level singleton
  // would bind every tenant's request to whichever AutotaskService warmed
  // the cache first, leaking that tenant's company/resource names into
  // every other tenant's response. See incident on 2026-06-03.
  private initPromise: Promise<void> | null = null;
  private refreshCompanyPromise: Promise<void> | null = null;
  private refreshResourcePromise: Promise<void> | null = null;

  private cache: MappingCache;
  private autotaskService: AutotaskService;
  private logger: Logger;
  private cacheExpiryMs: number;
  // When true, skip the eager pre-warm and rely on per-ID direct-get fallbacks.
  private lazyLoading: boolean;
  // Max time any caller may block on a cache warm-up/refresh before
  // proceeding with whatever data is available. See WARM_WAIT_BUDGET_MS.
  private warmWaitMs: number;

  public constructor(
    autotaskService: AutotaskService,
    logger: Logger,
    cacheExpiryMs: number = 30 * 60 * 1000,
    lazyLoading: boolean = false,
    tenantKey?: string,
    warmWaitMs: number = WARM_WAIT_BUDGET_MS,
  ) { // 30 minutes default
    this.autotaskService = autotaskService;
    this.logger = logger;
    this.cacheExpiryMs = cacheExpiryMs;
    this.lazyLoading = lazyLoading;
    this.warmWaitMs = warmWaitMs;
    // With a tenantKey, cache DATA is shared across instances of the same
    // tenant via tenantCacheStore (see its doc comment). Without one (tests,
    // or credentials not yet known), fall back to instance-local data.
    this.cache = tenantKey
      ? tenantCacheFor(tenantKey.toLowerCase())
      : {
          companies: new Map<number, string>(),
          resources: new Map<number, string>(),
          lastUpdated: {
            companies: null,
            resources: null,
          },
        };
  }

  /**
   * Construct and initialize a per-tenant MappingService instance.
   *
   * **MUST be called once per AutotaskService (i.e. once per request in
   * gateway mode), NEVER reused across tenants.** Concurrent calls on the
   * same instance coalesce via `this.initPromise`; cross-instance calls are
   * fully independent.
   *
   * Replaces the previous static-singleton `getInstance()` which leaked
   * cached company/resource names across tenants (incident 2026-06-03).
   */
  public static async create(
    autotaskService: AutotaskService,
    logger: Logger,
    options: {
      lazyLoading?: boolean;
      tenantKey?: string | undefined;
      warmWaitMs?: number | undefined;
    } = {},
  ): Promise<MappingService> {
    const instance = new MappingService(
      autotaskService,
      logger,
      undefined,
      options.lazyLoading,
      options.tenantKey,
      options.warmWaitMs,
    );
    // Kick off the warm-up but only block for the budget: the full company
    // pre-warm takes 30s+ on large tenants, which is longer than the
    // gateway's tool-call timeout. If it doesn't finish in time, the caller
    // proceeds with per-ID fallback lookups and the warm-up completes in
    // the background (landing in the shared tenant store when keyed).
    await instance.waitWithBudget(instance.ensureInitialized(), 'warm-up');
    return instance;
  }

  /**
   * Await `work` for at most `warmWaitMs`, then proceed regardless. Errors
   * are swallowed (logged upstream by the refresh methods) — mapping is a
   * best-effort decoration and must never fail or stall the actual tool call.
   */
  private async waitWithBudget(work: Promise<void>, label: string): Promise<void> {
    const settled = work.then(
      () => true,
      () => true,
    );
    if (this.warmWaitMs <= 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = await Promise.race([
      settled.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), this.warmWaitMs);
        timer.unref?.();
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (timedOut) {
      this.logger.info(
        `Mapping cache ${label} exceeded ${this.warmWaitMs}ms budget — continuing in background; this response uses fallback name lookups.`
      );
    }
  }

  /**
   * Per-instance init coalescing. Multiple concurrent callers on the same
   * MappingService share one initializeCache promise; once it resolves the
   * promise is cleared so a future cache-clear can re-init.
   */
  public async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeCache().catch((err) => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  /**
   * Initialize cache with company and resource data. When `lazyLoading` is set,
   * skip the eager pre-warm entirely — the cache stays empty and every
   * `getCompanyName()` / `getResourceName()` call falls through to the
   * per-record direct-get path. Cheaper at startup, more expensive per call.
   */
  private async initializeCache(): Promise<void> {
    if (this.lazyLoading) {
      this.logger.info(
        'MappingService: LAZY_LOADING enabled — skipping cache pre-warm. ID-to-name lookups will hit the API per record.'
      );
      return;
    }
    if (this.isCacheValid('companies') && this.isCacheValid('resources')) {
      return;
    }

    this.logger.info('Initializing mapping cache...');
    // The refresh methods stamp lastUpdated themselves on their own success
    // paths. Stamping unconditionally here would mark a FAILED warm-up as
    // valid for the full expiry window — with the shared tenant store that
    // would pin an empty cache on every request for that tenant.
    await Promise.all([
      this.refreshCompanyCache(),
      this.refreshResourceCache()
    ]);
    this.logger.info('Mapping cache initialized successfully', {
      companies: this.cache.companies.size,
      resources: this.cache.resources.size
    });
  }

  /**
   * Check if cache is valid (not expired)
   */
  private isCacheValid(type: 'companies' | 'resources'): boolean {
    const lastUpdated = this.cache.lastUpdated[type];
    if (!lastUpdated) {
      return false;
    }

    const now = new Date();
    const timeDiff = now.getTime() - lastUpdated.getTime();
    return timeDiff < this.cacheExpiryMs;
  }

  /**
   * Refresh cache if needed (expired). Each refresh method coalesces concurrent
   * callers internally via refreshCompanyPromise / refreshResourcePromise.
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    if (this.lazyLoading) return;
    const promises: Promise<void>[] = [];
    if (!this.isCacheValid('companies')) promises.push(this.refreshCompanyCache());
    if (!this.isCacheValid('resources')) promises.push(this.refreshResourceCache());
    if (promises.length > 0) await Promise.all(promises);
  }

  /**
   * Get company name by ID.
   *
   * Cache is the source of truth — populated by full paginated `list()` in
   * `refreshCompanyCache`. A single-record `getCompany(id)` fallback exists
   * for IDs added between refresh windows, but its result is NOT written to
   * the cache: direct-get results have been observed to disagree with the
   * paginated list for merged/renamed companies, and caching the bad value
   * would then be served to every subsequent caller for 30 minutes.
   */
  public async getCompanyName(companyId: number): Promise<string | null> {
    try {
      // Budget-bounded: an expired cache triggers a refresh, but we serve
      // the previous (stale) entries rather than stalling the response for
      // the full re-walk — company names change rarely, timeouts hurt always.
      await this.waitWithBudget(this.refreshCacheIfNeeded(), 'refresh');

      const cachedName = this.cache.companies.get(companyId);
      if (cachedName) {
        return cachedName;
      }

      this.logger.warn(
        `Company ${companyId} missing from paginated cache (size=${this.cache.companies.size}); falling back to direct lookup. Result will NOT be cached.`
      );
      const company = await this.autotaskService.getCompany(companyId);
      if (company?.companyName) {
        return company.companyName;
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to get company name for ID ${companyId}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Get resource name by ID with fallback lookup
   */
  public async getResourceName(resourceId: number): Promise<string | null> {
    try {
      await this.waitWithBudget(this.refreshCacheIfNeeded(), 'refresh');
      
      // Try cache first
      const cachedName = this.cache.resources.get(resourceId);
      if (cachedName) {
        return cachedName;
      }
      
      // Check if we have any resources in cache - if not, the endpoint likely isn't available
      if (this.cache.resources.size === 0) {
        this.logger.debug(`Resource ${resourceId} not found - Resources endpoint not available in this Autotask instance`);
        return null; // Gracefully return null instead of attempting individual lookup
      }
      
      // Fallback to direct API lookup (if cache just doesn't have this specific resource)
      this.logger.debug(`Resource ${resourceId} not in cache, attempting direct lookup`);
      try {
        const resource = await this.autotaskService.getResource(resourceId);
        if (resource && resource.firstName && resource.lastName) {
          const fullName = `${resource.firstName} ${resource.lastName}`.trim();
          // Add to cache for future use
          this.cache.resources.set(resourceId, fullName);
          return fullName;
        }
      } catch (directError) {
        this.logger.debug(`Direct resource lookup failed for ${resourceId}:`, directError);
      }
      
      this.cache.resources.set(resourceId, 'Unknown Resource');
      return 'Unknown Resource';
    } catch (error) {
      this.logger.error(`Failed to get resource name for ${resourceId}:`, error);
      return null;
    }
  }

  /**
   * Refresh the company cache
   */
  private async refreshCompanyCache(): Promise<void> {
    if (this.isCacheValid('companies')) return;
    if (this.refreshCompanyPromise) return this.refreshCompanyPromise;

    this.refreshCompanyPromise = (async () => {
      try {
        this.logger.info('Refreshing company cache...');

        // Bulk-load every company via the dedicated listAllCompanies path.
        // http.query walks Autotask's cursor (pageDetails.nextPageUrl)
        // internally until it hits maxRecords or runs out of pages. The
        // previous implementation looped on `searchCompanies({ page, pageSize })`
        // expecting offset semantics, but searchCompanies' `page` arg was
        // silently dropped — every iteration re-fetched the same page 1.
        // Cache ended up with the first ~200 companies after ~100 wasted
        // API calls (see issue #101).
        //
        // Atomic-swap: build a fresh Map and only assign on full success,
        // so a partial failure can't replace a good cache with a shorter one.
        const fresh = new Map<number, string>();
        const all = await this.autotaskService.listAllCompanies();
        for (const company of all) {
          if (company.id != null && company.companyName) {
            fresh.set(company.id, company.companyName);
          }
        }

        this.cache.companies = fresh;
        this.cache.lastUpdated.companies = new Date();
        this.logger.info(
          `Company cache refreshed with ${this.cache.companies.size} entries`
        );

      } catch (error) {
        this.logger.error('Failed to refresh company cache:', error);
        // Don't throw — keep any previously valid cache rather than wiping it.
      } finally {
        this.refreshCompanyPromise = null;
      }
    })();
    return this.refreshCompanyPromise;
  }

  /**
   * Refresh resource cache safely (handle endpoint limitations)
   */
  private async refreshResourceCache(): Promise<void> {
    if (this.isCacheValid('resources')) return;
    if (this.refreshResourcePromise) return this.refreshResourcePromise;

    this.refreshResourcePromise = (async () => {
      try {
        this.logger.debug('Refreshing resource cache...');
        
        // Note: Some Autotask instances don't support resource listing via REST API
        // This is a known limitation - see Autotask documentation
        const resources = await this.autotaskService.searchResources({ pageSize: 0 });
        
        this.cache.resources.clear();
        for (const resource of resources) {
          if (resource.id && resource.firstName && resource.lastName) {
            const fullName = `${resource.firstName} ${resource.lastName}`.trim();
            this.cache.resources.set(resource.id, fullName);
          }
        }
        
        this.cache.lastUpdated.resources = new Date();
        this.logger.info(`Resource cache refreshed: ${this.cache.resources.size} resources`);
        
      } catch (error) {
        // Handle the common case where Resources endpoint returns 405 Method Not Allowed
        if ((error as any)?.response?.status === 405) {
          this.logger.warn('Resources endpoint not available (405 Method Not Allowed) - this is common in Autotask REST API. Resource name mapping will be disabled.');
          this.cache.lastUpdated.resources = new Date(); // Mark as "refreshed" to prevent retry loops
          return;
        }
        
        // Handle other resource endpoint errors gracefully
        this.logger.error('Failed to refresh resource cache, continuing without resource names:', error);
        this.cache.lastUpdated.resources = new Date(); // Mark as "refreshed" to prevent retry loops
      } finally {
        this.refreshResourcePromise = null;
      }
    })();
    return this.refreshResourcePromise;
  }

  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.cache.companies.clear();
    this.cache.resources.clear();
    this.cache.lastUpdated.companies = null;
    this.cache.lastUpdated.resources = null;
    this.logger.info('Mapping cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    companies: { count: number; lastUpdated: Date | null; isValid: boolean };
    resources: { count: number; lastUpdated: Date | null; isValid: boolean };
  } {
    return {
      companies: {
        count: this.cache.companies.size,
        lastUpdated: this.cache.lastUpdated.companies,
        isValid: this.isCacheValid('companies'),
      },
      resources: {
        count: this.cache.resources.size,
        lastUpdated: this.cache.lastUpdated.resources,
        isValid: this.isCacheValid('resources'),
      },
    };
  }
}