// Lazy-loaded picklist cache for Autotask field values (queues, statuses, priorities, etc.)

import { Logger } from '../utils/logger.js';

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

/** Upper bound on shared entries (credential set x entity type). */
const SHARED_MAX_ENTRIES = 1000;

interface CachedFields {
  fields: FieldInfo[];
  loadedAt: number;
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
const sharedLoading = new Map<string, Promise<FieldInfo[] | null>>();

/** Reset the shared picklist store. Intended for tests only. */
export function _resetSharedPicklistStore(): void {
  sharedFields.clear();
  sharedLoading.clear();
}

export class PicklistCache {
  private cache: Map<string, CachedFields>;
  private loading: Map<string, Promise<FieldInfo[] | null>>;
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

  /**
   * Get field info for an entity type (lazy-loaded, cached).
   *
   * A failed load is not cached, so the next call retries. Whatever the
   * failure (a 429, or credentials Autotask now rejects), it returns the last
   * good copy for this key if there is one, else [].
   */
  async getFields(entityType: string): Promise<FieldInfo[]> {
    const key = this.keyPrefix + entityType;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < PICKLIST_TTL_MS) {
      // Re-insert so Map order tracks recency for eviction.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.fields;
    }

    let pending = this.loading.get(key);
    if (!pending) {
      pending = this.loadFields(entityType)
        .then((fields) => {
          if (fields !== null) this.store(key, fields);
          return fields;
        })
        .finally(() => this.loading.delete(key));
      this.loading.set(key, pending);
    }
    return (await pending) ?? cached?.fields ?? [];
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
    const fields = await this.getFields(entityType);
    const field = fields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());

    if (!field || !field.isPickList || !field.picklistValues) {
      return [];
    }

    return field.picklistValues.filter(v => v.isActive !== false);
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

  /** Resolves to null on failure, so a shared in-flight load never rejects. */
  private async loadFields(entityType: string): Promise<FieldInfo[] | null> {
    this.logger.debug(`Loading field info for entity: ${entityType}`);
    try {
      const fields = await this.getFieldInfoFn(entityType);
      this.logger.debug(`Loaded ${fields.length} fields for ${entityType}`);
      return fields;
    } catch (error) {
      this.logger.error(`Failed to load field info for ${entityType}:`, error);
      return null;
    }
  }
}
