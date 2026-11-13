// Resolve the acting Conduit user's Autotask resource by email.
//
// Conduit (the gateway) forwards the acting user's verified email in
// X-Conduit-Acting-User-Email on S2S-authenticated requests. The sidecar looks
// up an active Autotask Resource with that exact email, using the tenant's own
// API credentials, and impersonates it on writes so notes and time entries are
// attributed to the person rather than the shared API user.
//
// Fallback is always "act as the API user": no match, more than one active
// match, only inactive matches, a lookup error, or Autotask rejecting the
// impersonation all mean no ImpersonationResourceId header. Logs never carry
// the email; they use a short hash of the cache key.

import { createHash } from 'node:crypto';

export const ACTING_USER_EMAIL_HEADER = 'x-conduit-acting-user-email';

// Deliberately strict: one address, no display name, no list separators.
const EMAIL_RE = /^[^\s@,;<>"'()[\]\\]+@[^\s@,;<>"'()[\]\\]+\.[^\s@,;<>"'()[\]\\]+$/;
const MAX_EMAIL_LENGTH = 254;

/** Normalize and validate an acting-user email. Undefined when absent or malformed. */
export function parseActingUserEmail(
  raw: string | undefined,
  logger?: { warn: (msg: string) => void }
): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim().toLowerCase();
  if (value === '') return undefined;
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(value)) {
    // Never echo the value: it is PII and may be attacker-shaped.
    logger?.warn('Ignoring malformed acting-user email header');
    return undefined;
  }
  return value;
}

export type ResolveOutcome = 'matched' | 'no-match' | 'ambiguous' | 'inactive' | 'error' | 'rejected';

interface CacheEntry {
  resourceId: number | null;
  outcome: ResolveOutcome;
  expiresAt: number;
}

const DEFAULT_HIT_TTL_MS = 15 * 60_000;
const DEFAULT_MISS_TTL_MS = 5 * 60_000;
const ERROR_TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

function ttlFromEnv(name: string, fallback: number): number {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<number | undefined>>();
let now: () => number = () => Date.now();

/** Cache key: tenant (API username) + acting email, hashed so the map never holds raw emails. */
export function impersonationCacheKey(username: string, email: string): string {
  return createHash('sha256').update(`${username.toLowerCase()}\n${email}`).digest('hex');
}

function store(key: string, resourceId: number | null, outcome: ResolveOutcome, ttlMs: number): void {
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    // Drop the oldest insertion; Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.delete(key);
  cache.set(key, { resourceId, outcome, expiresAt: now() + ttlMs });
}

export interface ResourceQueryClient {
  query<T>(
    entity: string,
    filter: Array<{ op: string; field?: string; value?: unknown }>,
    opts?: { maxRecords?: number; includeFields?: string[] }
  ): Promise<T[]>;
}

interface ResourceRow {
  id?: number;
  email?: string | null;
  isActive?: boolean;
}

/**
 * Pick the resource for `email` from query rows. Only an exact,
 * case-insensitive email match counts, and exactly one of those must be active.
 */
export function pickResource(rows: ResourceRow[], email: string): { resourceId: number | null; outcome: ResolveOutcome } {
  const exact = rows.filter(
    (r) => typeof r.id === 'number' && typeof r.email === 'string' && r.email.trim().toLowerCase() === email
  );
  if (exact.length === 0) return { resourceId: null, outcome: 'no-match' };
  const active = exact.filter((r) => r.isActive === true);
  if (active.length === 0) return { resourceId: null, outcome: 'inactive' };
  if (active.length > 1) return { resourceId: null, outcome: 'ambiguous' };
  return { resourceId: active[0]!.id as number, outcome: 'matched' };
}

/**
 * Resolve the Autotask resource ID for `email` in the tenant identified by
 * `username`. Cached per tenant+email (hits 15 min, misses 5 min, errors 1 min;
 * override with AUTOTASK_IMPERSONATION_CACHE_TTL_MS / _MISS_TTL_MS).
 * Concurrent lookups for the same key share one Autotask query.
 */
export async function resolveResourceIdByEmail(
  client: ResourceQueryClient,
  username: string,
  email: string,
  logger: { debug: (msg: string) => void }
): Promise<number | undefined> {
  const key = impersonationCacheKey(username, email);
  const tag = key.slice(0, 12);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) {
    return hit.resourceId ?? undefined;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const lookup = (async () => {
    try {
      const rows = await client.query<ResourceRow>(
        'Resources',
        [{ op: 'eq', field: 'email', value: email }],
        { maxRecords: 10, includeFields: ['id', 'email', 'isActive'] }
      );
      const { resourceId, outcome } = pickResource(rows ?? [], email);
      const ttl =
        resourceId !== null
          ? ttlFromEnv('AUTOTASK_IMPERSONATION_CACHE_TTL_MS', DEFAULT_HIT_TTL_MS)
          : ttlFromEnv('AUTOTASK_IMPERSONATION_MISS_TTL_MS', DEFAULT_MISS_TTL_MS);
      store(key, resourceId, outcome, ttl);
      logger.debug(
        resourceId !== null
          ? `Acting-user impersonation [${tag}]: matched resource ${resourceId}`
          : `Acting-user impersonation [${tag}]: ${outcome}; acting as the API user`
      );
      return resourceId ?? undefined;
    } catch (err) {
      store(key, null, 'error', ERROR_TTL_MS);
      const status = (err as { status?: number })?.status;
      logger.debug(
        `Acting-user impersonation [${tag}]: lookup failed${status ? ` (HTTP ${status})` : ''}; acting as the API user`
      );
      return undefined;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, lookup);
  return lookup;
}

/**
 * Autotask refused an impersonated write for this tenant+email (typically the
 * resource's security level doesn't allow impersonation). Stop impersonating
 * that user until the hit TTL passes so every write doesn't pay for a retry.
 */
export function markImpersonationRejected(username: string, email: string): void {
  store(
    impersonationCacheKey(username, email),
    null,
    'rejected',
    ttlFromEnv('AUTOTASK_IMPERSONATION_CACHE_TTL_MS', DEFAULT_HIT_TTL_MS)
  );
}

/** Tests only. */
export function __resetImpersonationCacheForTests(clock?: () => number): void {
  cache.clear();
  inflight.clear();
  now = clock ?? (() => Date.now());
}

/** Tests only. */
export function __impersonationCacheSize(): number {
  return cache.size;
}
