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

interface CachedFields {
  fields: FieldInfo[];
  loadedAt: number;
}

interface PicklistStore {
  cache: Map<string, CachedFields>;
  loading: Map<string, Promise<FieldInfo[] | null>>;
}

/**
 * Cross-request store, keyed by tenant (and by impersonated resource, when
 * there is one).
 *
 * In gateway mode a new tool handler, and so a new PicklistCache, is built for
 * every request. With instance-local data every request refetched the field
 * definitions it needed: get_ticket_details alone pulls Tickets and
 * TicketNotes field info on each call. Same pattern and isolation argument as
 * tenantCacheStore in mapping.service.ts: the key is the tenant identity, so
 * two tenants never share an entry. Impersonated calls get their own key
 * because Autotask limits them to the impersonated resource's security level,
 * and that narrower view must not be served to anyone else.
 */
const tenantPicklistStore = new Map<string, PicklistStore>();

/** Reset the tenant picklist store. Intended for tests only. */
export function _resetTenantPicklistStore(): void {
  tenantPicklistStore.clear();
}

/** Store key for a tenant, or undefined to keep the cache instance-local. */
export function picklistStoreKey(
  tenantKey: string | null | undefined,
  impersonationResourceId?: number
): string | undefined {
  if (!tenantKey) return undefined;
  const tenant = tenantKey.toLowerCase();
  return impersonationResourceId === undefined ? tenant : `${tenant}#as:${impersonationResourceId}`;
}

function newStore(): PicklistStore {
  return { cache: new Map(), loading: new Map() };
}

export class PicklistCache {
  private cache: Map<string, CachedFields>;
  private loading: Map<string, Promise<FieldInfo[] | null>>;
  private logger: Logger;
  private getFieldInfoFn: (entityType: string) => Promise<FieldInfo[]>;
  private ttlMs: number;

  /**
   * With a `storeKey` (see picklistStoreKey) the loaded data is shared with
   * every PicklistCache for the same key; without one it is instance-local.
   */
  constructor(
    logger: Logger,
    getFieldInfoFn: (entityType: string) => Promise<FieldInfo[]>,
    storeKey?: string,
    ttlMs: number = PICKLIST_TTL_MS
  ) {
    this.logger = logger;
    this.getFieldInfoFn = getFieldInfoFn;
    this.ttlMs = ttlMs;
    let store: PicklistStore;
    if (storeKey) {
      store = tenantPicklistStore.get(storeKey) ?? newStore();
      tenantPicklistStore.set(storeKey, store);
    } else {
      store = newStore();
    }
    this.cache = store.cache;
    this.loading = store.loading;
  }

  /**
   * Get field info for an entity type (lazy-loaded, cached).
   *
   * A failed load returns [] and is not cached, so the next call retries.
   * Caching it would pin an empty picklist for the whole TTL, and with a
   * shared store, for every request of the tenant.
   */
  async getFields(entityType: string): Promise<FieldInfo[]> {
    const cached = this.cache.get(entityType);
    if (cached && Date.now() - cached.loadedAt < this.ttlMs) {
      return cached.fields;
    }

    let pending = this.loading.get(entityType);
    if (!pending) {
      pending = this.loadFields(entityType)
        .then((fields) => {
          if (fields !== null) this.cache.set(entityType, { fields, loadedAt: Date.now() });
          return fields;
        })
        .finally(() => this.loading.delete(entityType));
      this.loading.set(entityType, pending);
    }
    return (await pending) ?? [];
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

  /**
   * Clear cache (e.g., if picklist values change)
   */
  clearCache(entityType?: string): void {
    if (entityType) {
      this.cache.delete(entityType);
    } else {
      this.cache.clear();
    }
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
