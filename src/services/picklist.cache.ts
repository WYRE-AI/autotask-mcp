// Lazy-loaded picklist cache for Autotask field values (queues, statuses, priorities, etc.)

import { Logger } from '../utils/logger.js';
import { vendorStatus } from '../utils/vendor-error.js';
import { AutotaskRateLimitError } from './autotask-http.js';

export interface PicklistValue {
  value: string;
  label: string;
  isDefaultValue?: boolean;
  sortOrder?: number;
  isActive?: boolean;
  isSystem?: boolean;
  parentValue?: string;
}

export interface FieldInfo {
  name: string;
  dataType: string;
  length?: number;
  isRequired: boolean;
  isReadOnly: boolean;
  isQueryable: boolean;
  isReference: boolean;
  referenceEntityType?: string;
  isPickList: boolean;
  picklistValues?: PicklistValue[];
  picklistParentValueField?: string;
}

/** How long loaded field info is reused before it is fetched again. */
const PICKLIST_TTL_MS = 30 * 60 * 1000;

/** After a failed refresh, how long the last good copy is served before retrying. */
const RETRY_BACKOFF_MS = 30 * 1000;

/**
 * An in-flight load older than this is treated as dead and replaced. On
 * Cloudflare Workers, I/O started by a request that has ended can be
 * cancelled, leaving a shared promise that never settles.
 */
const LOAD_DEAD_AFTER_MS = 90 * 1000;

/**
 * How long a caller waits on a load another caller started before starting
 * its own. A field-info load normally takes a second or two; past this the
 * other request may have been cancelled, and waiting out LOAD_DEAD_AFTER_MS
 * could outlast the caller's own client timeout.
 */
const JOIN_WAIT_MS = 10 * 1000;

/** Upper bound on shared entries (credential set x entity type). */
const SHARED_MAX_ENTRIES = 1000;

/** Why the latest field-info load failed: the vendor HTTP status, when there was one. */
export interface FieldsUnavailable {
  status?: number;
  /** On HTTP 429: when (epoch ms) Autotask said to try again. */
  rateLimitedUntil?: number;
}

/**
 * Field info plus, when the latest load from Autotask failed, why. `fields` is
 * then the last good copy, or [] when there is none.
 */
export interface FieldsLookup {
  fields: FieldInfo[];
  unavailable?: FieldsUnavailable;
}

interface InFlight {
  promise: Promise<FieldsLookup>;
  startedAt: number;
}

interface CachedFields {
  fields: FieldInfo[];
  loadedAt: number;
  /** Set by a failed refresh: serve `fields` without retrying until then. */
  retryAfter?: number;
  failure?: FieldsUnavailable;
}

/**
 * Cross-request store for field info, keyed by credential fingerprint (see
 * AutotaskService.getPicklistStoreKey) plus entity type.
 *
 * In gateway mode a new tool handler, and so a new PicklistCache, is built for
 * every request. With instance-local data every request refetched the field
 * definitions it needed: get_ticket_details alone pulls Tickets and
 * TicketNotes field info on each call.
 *
 * A hit returns data without calling Autotask, so the key has to prove the
 * caller holds the same credentials that loaded it, not just name the same
 * tenant: it is a hash of username, secret, integration code and API URL, and
 * an impersonated resource gets its own key because Autotask narrows its
 * view. Only successful loads are stored, so credentials Autotask rejects
 * never create an entry. Least recently used entries are evicted past
 * SHARED_MAX_ENTRIES, which bounds memory but does not keep any one tenant
 * warm: a busy gateway can push an idle tenant out, back to fetching.
 */
const sharedFields = new Map<string, CachedFields>();
const sharedLoading = new Map<string, InFlight>();

/** Reset the shared picklist store. Intended for tests only. */
export function _resetSharedPicklistStore(): void {
  sharedFields.clear();
  sharedLoading.clear();
}

export class PicklistCache {
  private cache: Map<string, CachedFields>;
  private loading: Map<string, InFlight>;
  /**
   * Cold failures this instance saw (nothing cached), kept out of the shared
   * store so rejected credentials leave nothing behind, and remembered for
   * RETRY_BACKOFF_MS so one request (gateway mode builds an instance per
   * request) doesn't repeat a failing call for every lookup it makes.
   */
  private coldFailures = new Map<string, { failure: FieldsUnavailable; retryAfter: number }>();
  private keyPrefix: string;
  private maxEntries: number;
  private logger: Logger;
  private getFieldInfoFn: (entityType: string) => Promise<FieldInfo[]>;

  /**
   * With a `storeKey` the loaded data is shared with every PicklistCache for
   * the same key; without one it is instance-local.
   */
  constructor(
    logger: Logger,
    getFieldInfoFn: (entityType: string) => Promise<FieldInfo[]>,
    storeKey?: string
  ) {
    this.logger = logger;
    this.getFieldInfoFn = getFieldInfoFn;
    if (storeKey) {
      this.cache = sharedFields;
      this.loading = sharedLoading;
      this.keyPrefix = `${storeKey}\u0000`;
      this.maxEntries = SHARED_MAX_ENTRIES;
    } else {
      this.cache = new Map();
      this.loading = new Map();
      this.keyPrefix = '';
      this.maxEntries = Infinity;
    }
  }

  /** Field info for an entity type (lazy-loaded, cached). See lookupFields. */
  async getFields(entityType: string): Promise<FieldInfo[]> {
    return (await this.lookupFields(entityType)).fields;
  }

  /**
   * Field info for an entity type, and whether the latest load failed.
   *
   * A fresh entry is returned as is. When it has expired, the caller that
   * finds it waits for a single refresh (run within its own request, so a
   * runtime that cancels I/O after a response can't strand it), while
   * concurrent callers get the cached copy at once. A failed load is never
   * cached: the last good copy is kept and served with the failure attached,
   * and refreshes are retried at most every RETRY_BACKOFF_MS. With nothing
   * cached, a failure returns [] with the failure attached, and this instance
   * doesn't retry it within the backoff.
   */
  async lookupFields(entityType: string): Promise<FieldsLookup> {
    const key = this.keyPrefix + entityType;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (!cached) {
      const cold = this.coldFailures.get(key);
      if (cold && now < cold.retryAfter) return { fields: [], unavailable: cold.failure };
      const result = await this.refresh(key, entityType, undefined, now);
      if (result.unavailable && result.fields.length === 0) {
        this.coldFailures.set(key, { failure: result.unavailable, retryAfter: Date.now() + RETRY_BACKOFF_MS });
      } else {
        this.coldFailures.delete(key);
      }
      return result;
    }

    // Re-insert so Map order tracks recency for eviction.
    this.cache.delete(key);
    this.cache.set(key, cached);
    const current = cached.failure ? { fields: cached.fields, unavailable: cached.failure } : { fields: cached.fields };
    const expired = now - cached.loadedAt >= PICKLIST_TTL_MS;
    const backingOff = cached.retryAfter !== undefined && now < cached.retryAfter;
    if (!expired || backingOff) return current;
    if (this.liveLoad(key, now)) return current; // another caller is refreshing it
    return this.refresh(key, entityType, cached.fields, now);
  }

  /** The in-flight load for `key`, unless there is none or it looks dead. */
  private liveLoad(key: string, now: number): InFlight | undefined {
    const inFlight = this.loading.get(key);
    return inFlight && now - inFlight.startedAt < LOAD_DEAD_AFTER_MS ? inFlight : undefined;
  }

  /**
   * Start a load for `key`, or join the live one. The shared result carries
   * `stale` on failure, so a caller that joins after the entry was evicted
   * still gets the last good copy. Never rejects.
   */
  private refresh(key: string, entityType: string, stale: FieldInfo[] | undefined, now: number): Promise<FieldsLookup> {
    const live = this.liveLoad(key, now);
    if (live) return this.join(live, key, entityType, stale);
    return this.startLoad(key, entityType, stale, now);
  }

  /** Start a load for `key`, replacing any in-flight one. Never rejects. */
  private startLoad(key: string, entityType: string, stale: FieldInfo[] | undefined, now: number): Promise<FieldsLookup> {
    const inFlight: InFlight = { startedAt: now, promise: Promise.resolve({ fields: [] }) };
    inFlight.promise = this.loadFields(entityType)
      .then((loaded): FieldsLookup => {
        // A load replaced as dead may still settle; it must not touch the
        // newer entry, only answer the callers that awaited it.
        const current = this.loading.get(key) === inFlight;
        if (!loaded.unavailable) {
          if (current) this.store(key, loaded.fields);
          return { fields: loaded.fields };
        }
        const entry = this.cache.get(key);
        if (entry && current) {
          entry.retryAfter = Date.now() + RETRY_BACKOFF_MS;
          entry.failure = loaded.unavailable;
        }
        return { fields: entry?.fields ?? stale ?? [], unavailable: loaded.unavailable };
      })
      .finally(() => {
        // A newer load may have replaced this one if it was taken for dead.
        if (this.loading.get(key) === inFlight) this.loading.delete(key);
      });
    this.loading.set(key, inFlight);
    return inFlight.promise;
  }

  /**
   * Wait on a load another caller started, for at most JOIN_WAIT_MS: it may
   * belong to a request whose I/O was cancelled and never settle. Past that,
   * start a fresh load, which replaces the stalled one, or join a newer load
   * if someone else already replaced it.
   */
  private async join(live: InFlight, key: string, entityType: string, stale: FieldInfo[] | undefined): Promise<FieldsLookup> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), JOIN_WAIT_MS);
    });
    try {
      const result = await Promise.race([live.promise, expired]);
      if (result) return result;
    } finally {
      clearTimeout(timer);
    }
    if (this.loading.get(key) === live) return this.startLoad(key, entityType, stale, Date.now());
    return this.refresh(key, entityType, stale, Date.now());
  }

  private store(key: string, fields: FieldInfo[]): void {
    this.cache.delete(key);
    this.cache.set(key, { fields, loadedAt: Date.now() });
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /**
   * Get picklist values for a specific field on an entity type
   */
  async getPicklistValues(entityType: string, fieldName: string): Promise<PicklistValue[]> {
    return (await this.lookupPicklistValues(entityType, fieldName)).values;
  }

  /** Active picklist values for a field, and whether the latest load failed. */
  async lookupPicklistValues(
    entityType: string,
    fieldName: string
  ): Promise<{ values: PicklistValue[]; unavailable?: FieldsUnavailable }> {
    const { fields, unavailable } = await this.lookupFields(entityType);
    const field = fields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
    const values = field?.isPickList && field.picklistValues
      ? field.picklistValues.filter(v => v.isActive !== false)
      : [];
    return unavailable ? { values, unavailable } : { values };
  }

  /**
   * Get queues (picklist values for the queueID field on Tickets)
   */
  async getQueues(): Promise<PicklistValue[]> {
    return this.getPicklistValues('Tickets', 'queueID');
  }

  /**
   * Get ticket statuses
   */
  async getTicketStatuses(): Promise<PicklistValue[]> {
    return this.getPicklistValues('Tickets', 'status');
  }

  /**
   * Get ticket priorities
   */
  async getTicketPriorities(): Promise<PicklistValue[]> {
    return this.getPicklistValues('Tickets', 'priority');
  }

  /** Never rejects: a failure comes back as `unavailable`, so a shared load can't either. */
  private async loadFields(entityType: string): Promise<FieldsLookup> {
    this.logger.debug(`Loading field info for entity: ${entityType}`);
    try {
      const fields = await this.getFieldInfoFn(entityType);
      this.logger.debug(`Loaded ${fields.length} fields for ${entityType}`);
      return { fields };
    } catch (error) {
      const status = vendorStatus(error);
      this.logger.error(`Failed to load field info for ${entityType}${status !== undefined ? ` (HTTP ${status})` : ''}:`, error);
      const unavailable: FieldsUnavailable = status !== undefined ? { status } : {};
      if (error instanceof AutotaskRateLimitError) {
        unavailable.rateLimitedUntil = Date.now() + error.retryAfterSeconds * 1000;
      }
      return { fields: [], unavailable };
    }
  }
}
