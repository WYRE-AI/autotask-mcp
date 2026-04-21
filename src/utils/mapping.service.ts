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

export class MappingService {
  private static initPromise: Promise<MappingService> | null = null;
  private refreshCompanyPromise: Promise<void> | null = null;
  private refreshResourcePromise: Promise<void> | null = null;

  private cache: MappingCache;
  private autotaskService: AutotaskService;
  private logger: Logger;
  private cacheExpiryMs: number;

  private constructor(autotaskService: AutotaskService, logger: Logger, cacheExpiryMs: number = 30 * 60 * 1000) { // 30 minutes default
    this.autotaskService = autotaskService;
    this.logger = logger;
    this.cacheExpiryMs = cacheExpiryMs;
    this.cache = {
      companies: new Map<number, string>(),
      resources: new Map<number, string>(),
      lastUpdated: {
        companies: null,
        resources: null,
      },
    };
  }

  /**
   * Get singleton instance (concurrent calls share the same initialization promise)
   */
  public static async getInstance(autotaskService: AutotaskService, logger: Logger): Promise<MappingService> {
    if (!MappingService.initPromise) {
      MappingService.initPromise = (async () => {
        const instance = new MappingService(autotaskService, logger);
        await instance.initializeCache();
        return instance;
      })();
    }
    return MappingService.initPromise;
  }

  /**
   * Initialize cache with company and resource data
   */
  private async initializeCache(): Promise<void> {
    if (this.isCacheValid('companies') && this.isCacheValid('resources')) {
      return;
    }

    this.logger.info('Initializing mapping cache...');
    await Promise.all([
      this.refreshCompanyCache(),
      this.refreshResourceCache()
    ]);
    this.cache.lastUpdated.companies = new Date();
    this.cache.lastUpdated.resources = new Date();
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
      await this.refreshCacheIfNeeded();

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
      await this.refreshCacheIfNeeded();
      
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

        // Walk every page of /Companies to build the cache. The previous
        // implementation called searchCompanies({}) and assumed "no pageSize =
        // fetch all", but searchCompanies actually defaults to pageSize 25 and
        // returns only the first page — meaning the cache silently contained
        // only ~25 companies. That caused getCompanyName() to fall through to
        // direct-get for every other ID, and direct-get has been observed to
        // return incorrect names for some companies (see CHANGELOG). Build
        // the full cache in a fresh map and atomic-swap so a partial failure
        // never replaces a good cache with a shorter one.
        const pageSize = 200; // Autotask per-page cap per autotask.service.ts
        const fresh = new Map<number, string>();
        let page = 1;
        const maxPages = 100; // hard safety stop: 20k companies

        while (page <= maxPages) {
          const batch = await this.autotaskService.searchCompanies({ page, pageSize });
          for (const company of batch) {
            if (company.id != null && company.companyName) {
              fresh.set(company.id, company.companyName);
            }
          }
          if (batch.length < pageSize) break;
          page += 1;
        }

        if (page > maxPages) {
          this.logger.warn(
            `Company pagination hit safety cap (${maxPages} pages of ${pageSize}). Cache may be incomplete.`
          );
        }

        this.cache.companies = fresh;
        this.cache.lastUpdated.companies = new Date();
        this.logger.info(
          `Company cache refreshed with ${this.cache.companies.size} entries across ${page} page(s)`
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