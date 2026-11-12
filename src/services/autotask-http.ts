// Autotask HTTP client — native fetch wrapper around the Autotask REST API.
//
// Replaces the autotask-node SDK in the service layer. The SDK gets several
// URL shapes wrong (PATCH /{Entity}/{id} returning 405, certain GETs 404,
// list() silently dropping filters), so we talk to the API directly.
//
// Zero new runtime deps — Node 18+ built-in `fetch` only.

import { resolveAutotaskApiUrl, invalidateZoneUrlCache } from '../utils/config';
import { Logger } from '../utils/logger';

/**
 * Refuse to send a write whose record id is missing or not a positive integer.
 * A PATCH body with `id: undefined` loses the id in JSON.stringify and Autotask
 * answers HTTP 500 "No matching records found", which reads as a server fault
 * rather than a bad call.
 */
function assertValidId(action: string, id: unknown, { allowZero = false }: { allowZero?: boolean } = {}): asserts id is number {
  if (typeof id !== 'number' || !Number.isInteger(id) || id < (allowZero ? 0 : 1)) {
    throw new Error(
      `Cannot ${action}: record id must be ${allowZero ? 'a non-negative' : 'a positive'} integer, got ${id === undefined ? 'undefined' : JSON.stringify(id)}. No request was sent.`
    );
  }
}

/**
 * Whether a failed response looks like a permissions problem. Autotask has no
 * distinct status for "impersonation not permitted", so this is a heuristic:
 * 401/403, or a body that talks about permissions. A 500 such as "No matching
 * records found" is the request's own fault and must not get the hint.
 */
function looksLikePermissionFailure(status: number, detail: string): boolean {
  if (status === 401 || status === 403) return true;
  return /permission|not authori[sz]ed|unauthori[sz]ed|access denied|forbidden|security level|impersonat/i.test(detail);
}

export interface QueryFilter {
  op: string;
  field?: string;
  value?: any;
  items?: QueryFilter[];
}

export interface QueryOptions {
  maxRecords?: number;
  includeFields?: string[];
  page?: number;
}

interface PageDetails {
  nextPageUrl?: string | null;
  count?: number;
}

interface QueryResponse<T> {
  items?: T[];
  pageDetails?: PageDetails;
}

const RAW_REQUEST_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;

/**
 * Maximum value Autotask accepts for the per-page `MaxRecords` body param on
 * `/query` endpoints. Anything outside [1, AUTOTASK_MAX_PAGE_SIZE] returns
 * HTTP 500 with the body "maxCountOfRecordsToReturn must be between 1 and 500".
 * This is the per-page page-size limit, NOT a cap on total rows the caller
 * can retrieve — multi-page walks via `pageDetails.nextPageUrl` aggregate
 * across pages until the caller's `opts.maxRecords` total cap is reached.
 */
export const AUTOTASK_MAX_PAGE_SIZE = 500;

/**
 * Thrown when Autotask returns 429 (per-integration API threshold exceeded).
 * Carries `retryAfterSeconds` parsed from the `Retry-After` header (RFC 7231
 * — either an integer seconds value or an HTTP-date) so callers can back off
 * accurately. Tool handlers convert this into a structured `error_type:
 * "rate_limited"` tool result so LLM-driven workflows stop hammering the
 * same path. Issue #69 (faspina) — \"status report for all open projects
 * with notes\" fan-out tripped the threshold; the model couldn't tell what
 * happened from the generic HTTP error.
 *
 * Autotask thresholds (per integration code, per hour):
 *   - ~10k req/hr soft (warning email, sporadic 429s)
 *   - ~20k req/hr hard (sustained 429s until the window rolls)
 */
export class AutotaskRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'AutotaskRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Per-request ceiling for a single Autotask REST call. Distant zones (e.g.
 * an Azure US region talking to the Sydney zone) add meaningful RTT, and
 * heavyweight requests (500-row query pages, entityInformation) can
 * legitimately run long — cutting them off early just wastes the work.
 * Callers above us (gateway, MCP client) enforce their own end-to-end
 * budgets, so this is a backstop against a truly hung connection, not the
 * primary timeout.
 */
const REQUEST_TIMEOUT_MS = 60_000;

// Default backoff when Autotask doesn't send a parseable Retry-After header.
// One minute is conservative: their thresholds reset on a rolling hour window,
// so waiting longer than a minute is rarely useful, and waiting less risks
// re-tripping while still over.
const DEFAULT_RETRY_AFTER_SECONDS = 60;

function parseRetryAfter(headerValue: string | null): number {
  if (!headerValue) return DEFAULT_RETRY_AFTER_SECONDS;
  // RFC 7231: either an integer count of seconds, or an HTTP-date.
  const asInt = Number.parseInt(headerValue, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Per-tenant 429 cooldown gate, keyed by lowercased API username.
 *
 * Observed in production: LLM clients ignore the "Do NOT retry" text in the
 * rate-limit error and re-fire the same call within seconds, sending every
 * retry upstream into a tenant already over Autotask's hourly threshold —
 * which can extend the cooldown. Once a tenant gets a 429, we remember the
 * Retry-After deadline and fail every request for that tenant fast and
 * LOCALLY (no upstream call) until it passes. Retry-spamming then costs the
 * tenant nothing.
 *
 * Module-level and keyed by tenant credential (same isolation reasoning as
 * the zone cache): in gateway mode client instances are per-request, so an
 * instance-level gate would never trip across calls.
 */
const rateLimitCooldowns = new Map<string, number>();

/** Cap a bad/hostile Retry-After header so it can't lock a tenant out for long. */
const MAX_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Reset the cooldown gate. Intended for tests only.
 */
export function _resetRateLimitCooldowns(): void {
  rateLimitCooldowns.clear();
}

function assertSafeRelativePath(path: string): void {
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error('Autotask rawRequest: path must be a non-empty string');
  }
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /:\/\//.test(path) ||
    path.includes('..')
  ) {
    throw new Error('Autotask rawRequest: path must be a relative path beginning with "/" (no scheme, host, or traversal)');
  }
}

// ITSL GW-001 (10 Oct 2026): on a non-GET, a '?' or '#' (raw or percent-encoded)
// let a write endpoint pass a gateway check that matched the path's end against
// /query. GETs keep query strings. The one query a non-GET may carry is Autotask
// paging: POST /<Entity>/query/next?paging=<encoded json>.
function assertNoQueryInWritePath(method: string, path: string): void {
  if (method === 'GET') return;
  const q = path.indexOf('?');
  const base = q === -1 ? path : path.slice(0, q);
  const paging = q !== -1 && /\/query\/next\/?$/i.test(base) && /^paging=[^?#&]*$/i.test(path.slice(q + 1));
  if (path.includes('#') || /%3f|%23/i.test(base) || (q !== -1 && !paging)) {
    throw new Error('Autotask rawRequest: path must not contain "?" or "#" - pass query parameters in queryParams');
  }
}


/**
 * ATM-020: validate a pagination URL taken from an Autotask response before
 * credentials are sent to it. Returns the absolute URL to follow, or throws.
 *
 * Requires https, no userinfo, an origin exactly equal to the base URL's
 * origin, and a path of `<base path>/{entity}/query/next` (case-insensitive,
 * as Autotask lowercases the service path in the URLs it returns). A relative
 * URL is joined onto the base, matching how request() resolves paths.
 * Only origin + pathname are ever logged or put in the error (the query may
 * hold paging tokens).
 */
export function assertSamePaginationOrigin(
  nextPageUrl: string,
  base: string,
  entity: string,
  logger?: Logger,
): string {
  const refuse = (url: URL | null): never => {
    const where = url ? `${url.origin}${url.pathname}` : '(unparseable)';
    logger?.error(`Refusing to follow nextPageUrl to an unexpected host: ${where}`);
    throw new Error(`Refusing to follow nextPageUrl to an unexpected host (${where})`);
  };
  let baseUrl: URL;
  let url: URL;
  try {
    baseUrl = new URL(base);
    url = /^[a-z][a-z0-9+.-]*:/i.test(nextPageUrl)
      ? new URL(nextPageUrl)
      : new URL(`${base.replace(/\/+$/, '')}${nextPageUrl.startsWith('/') ? '' : '/'}${nextPageUrl}`);
  } catch {
    return refuse(null);
  }
  if (url.protocol !== 'https:' || url.username || url.password) return refuse(url);
  if (url.origin !== baseUrl.origin) return refuse(url);
  const prefix = baseUrl.pathname.replace(/\/+$/, '').toLowerCase();
  const expected = `${prefix}/${entity}/query/next`.toLowerCase();
  if (url.pathname.replace(/\/+$/, '').toLowerCase() !== expected) return refuse(url);
  return url.toString();
}

/**
 * Minimal HTTP client for the Autotask REST API.
 *
 * All public methods:
 * - use the zone-resolved base URL (cached per-username via resolveAutotaskApiUrl)
 * - send the standard ApiIntegrationcode/UserName/Secret auth headers
 * - apply a 60-second timeout via AbortSignal.timeout (REQUEST_TIMEOUT_MS)
 * - throw an Error on non-2xx with the API error array when available
 */
export class AutotaskHttpClient {
  private resolvedBaseUrl: string | null = null;

  constructor(
    private readonly username: string,
    private readonly secret: string,
    private readonly integrationCode: string,
    private readonly apiUrl: string | undefined,
    private readonly logger: Logger,
    private readonly impersonationResourceId?: number
  ) {}

  private async baseUrl(): Promise<string> {
    if (this.resolvedBaseUrl) return this.resolvedBaseUrl;
    const url = await resolveAutotaskApiUrl(this.username, this.apiUrl, this.logger);
    // Normalize: strip trailing slashes and append /v1.0 root.
    this.resolvedBaseUrl = `${url.replace(/\/+$/, '')}/v1.0`;
    return this.resolvedBaseUrl;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ApiIntegrationcode: this.integrationCode,
      UserName: this.username,
      Secret: this.secret,
    };
    // Impersonation is driven by this request header, NOT by the entity's
    // impersonatorCreatorResourceID field - that field is read-only and is
    // where Autotask *records* the impersonation, so setting it in a request
    // body is silently ignored. The impersonated resource must itself have
    // permission for the action, so an impersonated call is the intersection
    // of the API user's rights and the impersonated user's.
    if (this.impersonationResourceId !== undefined) {
      headers.ImpersonationResourceId = String(this.impersonationResourceId);
    }
    return headers;
  }

  /**
   * Shared low-level request wrapper. `path` is either a leading-slash path
   * (resolved against the zone base URL) or an absolute URL (used by
   * pageDetails.nextPageUrl pagination).
   */
  private async request<T>(method: string, path: string, body?: any, isZoneRetry = false): Promise<T> {
    // Cooldown gate: while this tenant is inside a known 429 window, fail
    // fast locally instead of sending more requests upstream. See
    // rateLimitCooldowns.
    const cooldownKey = this.username.toLowerCase();
    const cooldownUntil = rateLimitCooldowns.get(cooldownKey);
    if (cooldownUntil !== undefined) {
      const remainingSeconds = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remainingSeconds > 0) {
        throw new AutotaskRateLimitError(
          `Autotask API threshold exceeded (HTTP 429) — this tenant is in a ${remainingSeconds}s cooldown and this call was NOT sent upstream. ` +
          `Do NOT retry until the cooldown passes; retries cannot succeed and querying again immediately only delays recovery. ` +
          `Wait ${remainingSeconds}s, or ask the user to narrow the workload (smaller date ranges, specific IDs).`,
          remainingSeconds,
        );
      }
      rateLimitCooldowns.delete(cooldownKey);
    }

    const url = path.startsWith('http') ? path : `${await this.baseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

    this.logger.debug(`Autotask HTTP ${method} ${url}`);

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: this.headers(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      response = await fetch(url, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Autotask ${method} ${url} network error: ${msg}`, { cause: err });
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const text = await response.text().catch(() => '');

    if (!response.ok) {
      // A 401 against a relative (zone-resolved) path — as opposed to an
      // absolute pageDetails.nextPageUrl, which is already baked to a host
      // we can't safely rewrite — most often means our cached zone URL is
      // stale (e.g. a data-center migration moved this tenant to a new
      // zone after we cached the old one). Drop the cache and retry once
      // against a freshly-resolved zone before giving up.
      if (response.status === 401 && !isZoneRetry && !path.startsWith('http')) {
        this.logger.debug(
          `Autotask ${method} ${path} returned 401 — invalidating cached zone for ${this.username} and retrying once`
        );
        this.resolvedBaseUrl = null;
        invalidateZoneUrlCache(this.username);
        return this.request<T>(method, path, body, true);
      }
      let detail = text.slice(0, 1000);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          detail = parsed.errors.join('; ');
        }
      } catch {
        /* fall through with raw text */
      }
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        // Arm the per-tenant cooldown gate so any further calls (including
        // LLM retry-spam and mapping-cache lookups) fail fast locally until
        // the window passes instead of piling onto the throttled tenant.
        rateLimitCooldowns.set(
          cooldownKey,
          Date.now() + Math.min(retryAfter * 1000, MAX_COOLDOWN_MS),
        );
        // Single-line message that LLMs will read verbatim — instruct against
        // retry, surface the wait, point at the underlying issue. The structured
        // `retryAfterSeconds` field lets handlers do programmatic things too.
        throw new AutotaskRateLimitError(
          `Autotask API threshold exceeded (HTTP 429). Do NOT retry this call automatically — ` +
          `the next ${retryAfter}s will likely hit 429 again, and repeated retries can extend the ` +
          `cooldown. Ask the user to scope the query (e.g. narrow date range, filter by company/ticket ID) ` +
          `or wait ${retryAfter}s before trying again. Detail: ${detail}`,
          retryAfter,
        );
      }
      // Impersonation is intent, not best-effort: if the header was sent and
      // Autotask rejected the request, silently retrying without it would
      // make the call succeed as the shared API user with nobody noticing
      // attribution had quietly stopped happening - worse than an error,
      // since it defeats the whole point of impersonation (an accurate PSA
      // audit trail) while looking like success. So this never retries or
      // swallows anything; it only appends an actionable hint pointing at
      // the most common cause, alongside Autotask's own unmodified error -
      // Autotask doesn't document a distinct status/body for "impersonation
      // not permitted" specifically, so this can't reliably tell that case
      // apart from any other failure on the same request.
      const impersonationHint =
        this.impersonationResourceId !== undefined && looksLikePermissionFailure(response.status, detail)
          ? ` (this request was sent impersonating resource ${this.impersonationResourceId}; one possible cause is that resource's Autotask security level - check that it permits this action and has "Allow impersonation of resources with this security level" enabled)`
          : '';
      const httpError = new Error(
        `Autotask ${method} ${path} failed: HTTP ${response.status}: ${detail}${impersonationHint}`
      );
      // Attach the numeric status so callers can branch on it reliably instead
      // of substring-matching the message (the message embeds the response body,
      // which can coincidentally contain a status-like number).
      (httpError as Error & { status?: number }).status = response.status;
      throw httpError;
    }

    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as unknown as T;
    }
  }

  /**
   * Generic passthrough for any Autotask REST endpoint. The escape hatch is
   * tool-callable, so auth headers must only ever go to the zone-resolved
   * host — validation, method allowlist, and a final host assertion enforce
   * that independently.
   */
  async rawRequest<T = any>(
    method: string,
    path: string,
    body?: any,
    queryParams?: Record<string, string | number | boolean>
  ): Promise<T> {
    const upperMethod = method.toUpperCase();
    if (!(RAW_REQUEST_METHODS as readonly string[]).includes(upperMethod)) {
      throw new Error(`Autotask rawRequest: method must be one of ${RAW_REQUEST_METHODS.join(', ')}`);
    }
    assertSafeRelativePath(path);
    assertNoQueryInWritePath(upperMethod, path);

    let finalPath = path;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== null) params.append(k, String(v));
      }
      const qs = params.toString();
      if (qs) {
        finalPath = `${finalPath}${finalPath.includes('?') ? '&' : '?'}${qs}`;
      }
    }

    const base = await this.baseUrl();
    const absoluteUrl = `${base}${finalPath}`;
    if (new URL(absoluteUrl).host !== new URL(base).host) {
      throw new Error('Autotask rawRequest: refusing to send to non-zone host');
    }

    return this.request<T>(upperMethod, absoluteUrl, body);
  }

  /**
   * GET /{Entity}/{id} — returns the entity, or null on 404.
   */
  async get<T>(entity: string, id: number): Promise<T | null> {
    try {
      const res = await this.request<{ item?: T } & T>('GET', `/${entity}/${id}`);
      // Autotask returns { item: {...} } but some legacy routes return the entity at top level.
      return ((res as any)?.item ?? (res as any)) || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('HTTP 404')) return null;
      throw err;
    }
  }

  /**
   * POST /{Entity}/query — handles pagination transparently via nextPageUrl.
   *
   * `opts.maxRecords` is the TOTAL CAP — the caller's "stop after this many
   * rows" budget across the whole pagination walk. The PER-PAGE size sent in
   * the request body (`MaxRecords`) is a separate concept: Autotask rejects
   * any value outside [1, AUTOTASK_MAX_PAGE_SIZE] with
   * HTTP 500 "maxCountOfRecordsToReturn must be between 1 and 500". The
   * per-page size is therefore clamped to `min(maxRecords, AUTOTASK_MAX_PAGE_SIZE)`
   * regardless of how large the caller's total cap is, and the walk keeps
   * following `pageDetails.nextPageUrl` until exhausted or `items.length`
   * reaches the total cap.
   *
   * Pass an empty filter array to request "all rows" — the caller is expected
   * to supply the Autotask-required `{op:'gte', field:'id', value:0}` sentinel
   * if they actually want to fetch everything.
   */
  async query<T>(
    entity: string,
    filter: QueryFilter[],
    opts: QueryOptions = {}
  ): Promise<T[]> {
    const totalCap = opts.maxRecords ?? AUTOTASK_MAX_PAGE_SIZE;
    const pageSize = Math.min(totalCap, AUTOTASK_MAX_PAGE_SIZE);
    const body: Record<string, any> = {
      filter,
      MaxRecords: pageSize,
    };
    if (opts.includeFields && opts.includeFields.length > 0) {
      body.IncludeFields = opts.includeFields;
    }

    const items: T[] = [];
    let resp = await this.request<QueryResponse<T>>('POST', `/${entity}/query`, body);
    if (resp?.items) items.push(...resp.items);

    while (
      resp?.pageDetails?.nextPageUrl &&
      items.length < totalCap
    ) {
      // Autotask's thread-safe pagination returns nextPageUrl as
      // `/{entity}/query/next?paging=...` and requires the SAME POST + filter
      // body as the initial query; a GET returns HTTP 405 ("does not support
      // http method 'GET'"), which silently truncates large result sets (e.g.
      // the company name cache never loads past the first page).
      // ATM-020: never send credentials to a host the response merely names.
      const nextUrl = assertSamePaginationOrigin(
        resp.pageDetails.nextPageUrl,
        await this.baseUrl(),
        entity,
        this.logger,
      );
      resp = await this.request<QueryResponse<T>>('POST', nextUrl, body);
      if (resp?.items) items.push(...resp.items);
    }

    return items.slice(0, totalCap);
  }

  /**
   * POST /{Entity} — returns the created itemId.
   */
  async create(entity: string, body: any): Promise<number> {
    const res = await this.request<{ itemId?: number; item?: { id?: number }; id?: number }>(
      'POST',
      `/${entity}`,
      body
    );
    const id = res?.itemId ?? res?.item?.id ?? res?.id;
    if (typeof id !== 'number') {
      throw new Error(`Autotask create ${entity}: response did not include an itemId`);
    }
    return id;
  }

  /**
   * PATCH /{Entity} with body `{id, ...fields}`. This is the Autotask update
   * pattern — there is NO PATCH /{Entity}/{id} route (the SDK's default
   * generates one and gets 405 Method Not Allowed for every update).
   *
   * Zone DE1 (Zone 18) is an exception: its IIS instance does not register the
   * collection-level PATCH route at all and returns an HTML 404 (issue #133).
   * When that happens we fall back to `PUT /{Entity}/{id}`, which Autotask
   * supports universally across zones. The fallback is gated strictly on a 404
   * status so genuine validation errors (400/422) still surface to the caller.
   *
   * PUT sets every writable field missing from the body to null, so the
   * fallback turns a partial update into one that clears the rest of the
   * record. Callers that only ever send partial updates pass
   * `{ putFallback: false }` to get the PATCH 404 instead.
   *
   * `id` is always the one passed in: an `id` inside `body` is overridden
   * rather than allowed to redirect the update to another record.
   */
  async update(
    entity: string,
    id: number,
    body: Record<string, any>,
    { putFallback = true }: { putFallback?: boolean } = {}
  ): Promise<void> {
    assertValidId(`update ${entity}`, id);
    try {
      await this.request<void>('PATCH', `/${entity}`, { ...body, id });
    } catch (err) {
      if (putFallback && (err as { status?: number })?.status === 404) {
        this.logger.debug(
          `Autotask PATCH /${entity} returned 404 (likely Zone DE1) — retrying as PUT /${entity}/${id}`
        );
        await this.request<void>('PUT', `/${entity}/${id}`, { ...body, id });
        return;
      }
      throw err;
    }
  }

  /**
   * DELETE /{Entity}/{id}
   */
  async delete(entity: string, id: number): Promise<void> {
    assertValidId(`delete ${entity}`, id);
    await this.request<void>('DELETE', `/${entity}/${id}`);
  }

  /**
   * GET /{Entity}/entityInformation/fields — returns the raw { fields: [...] } shape.
   */
  async fieldInfo(entity: string): Promise<{ fields: any[] }> {
    const res = await this.request<{ fields?: any[]; items?: any[] }>(
      'GET',
      `/${entity}/entityInformation/fields`
    );
    return { fields: res?.fields || res?.items || [] };
  }

  /**
   * Picklist values for a specific field. Autotask typically embeds picklist
   * values inline inside the field info response, so we derive them from
   * fieldInfo() rather than hitting a separate endpoint (which does not exist
   * uniformly across entities).
   */
  async picklistValues(entity: string, fieldName: string): Promise<any[]> {
    const { fields } = await this.fieldInfo(entity);
    const match = fields.find((f: any) => f?.name === fieldName);
    return match?.picklistValues || [];
  }

  /**
   * GET /{ParentEntity}/{parentId}/{ChildEntity}/{childId}
   */
  async childGet<T>(
    parentEntity: string,
    parentId: number,
    childEntity: string,
    childId: number
  ): Promise<T | null> {
    try {
      const res = await this.request<{ item?: T } & T>(
        'GET',
        `/${parentEntity}/${parentId}/${childEntity}/${childId}`
      );
      return ((res as any)?.item ?? (res as any)) || null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('HTTP 404')) return null;
      throw err;
    }
  }

  /**
   * POST /{ParentEntity}/{parentId}/{ChildEntity}/query — child collection query.
   * Falls back to GET (no /query suffix) if POST returns 404, since some child
   * entities (Notes, Attachments) don't support the /query endpoint.
   */
  async childQuery<T>(
    parentEntity: string,
    parentId: number,
    childEntity: string,
    filter: QueryFilter[],
    opts: QueryOptions = {}
  ): Promise<T[]> {
    // Per-page size sent to Autotask must respect AUTOTASK_MAX_PAGE_SIZE.
    // childQuery does not walk nextPageUrl, so the request gets at most a
    // single page; clamping is the only thing that matters here.
    const pageSize = Math.min(opts.maxRecords ?? AUTOTASK_MAX_PAGE_SIZE, AUTOTASK_MAX_PAGE_SIZE);
    const body: Record<string, any> = {
      filter,
      MaxRecords: pageSize,
    };
    if (opts.includeFields && opts.includeFields.length > 0) {
      body.IncludeFields = opts.includeFields;
    }
    try {
      const res = await this.request<QueryResponse<T>>(
        'POST',
        `/${parentEntity}/${parentId}/${childEntity}/query`,
        body
      );
      return res?.items || [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('HTTP 404')) {
        // Fallback: GET /{Parent}/{id}/{Child} returns { items: [...] }
        const res = await this.request<QueryResponse<T>>(
          'GET',
          `/${parentEntity}/${parentId}/${childEntity}`
        );
        return res?.items || [];
      }
      throw err;
    }
  }

  /**
   * POST /{ParentEntity}/{parentId}/{ChildEntity} — create a child entity under a parent.
   */
  async childCreate(
    parentEntity: string,
    parentId: number,
    childEntity: string,
    body: any
  ): Promise<number> {
    const res = await this.request<{ itemId?: number; item?: { id?: number }; id?: number }>(
      'POST',
      `/${parentEntity}/${parentId}/${childEntity}`,
      body
    );
    const id = res?.itemId ?? res?.item?.id ?? res?.id;
    if (typeof id !== 'number') {
      throw new Error(
        `Autotask child create ${parentEntity}/${parentId}/${childEntity}: response did not include an itemId`
      );
    }
    return id;
  }

  /**
   * PATCH /{ParentEntity}/{parentId}/{ChildEntity} with `{id, ...fields}` — child update.
   */
  async childUpdate(
    parentEntity: string,
    parentId: number,
    childEntity: string,
    id: number,
    body: Record<string, any>
  ): Promise<void> {
    assertValidId(`update ${parentEntity}/${childEntity}`, id);
    // Parent id 0 is real: the root (MSP) company is Companies/0.
    assertValidId(`update ${parentEntity}/${childEntity} (parent)`, parentId, { allowZero: true });
    await this.request<void>(
      'PATCH',
      `/${parentEntity}/${parentId}/${childEntity}`,
      { id, ...body }
    );
  }

  /**
   * DELETE /{ParentEntity}/{parentId}/{ChildEntity}/{childId}
   */
  async childDelete(
    parentEntity: string,
    parentId: number,
    childEntity: string,
    childId: number
  ): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/${parentEntity}/${parentId}/${childEntity}/${childId}`
    );
  }
}
