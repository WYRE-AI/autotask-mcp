// Autotask HTTP client — native fetch wrapper around the Autotask REST API.
//
// Replaces the autotask-node SDK in the service layer. The SDK gets several
// URL shapes wrong (PATCH /{Entity}/{id} returning 405, certain GETs 404,
// list() silently dropping filters), so we talk to the API directly.
//
// Zero new runtime deps — Node 18+ built-in `fetch` only.

import { resolveAutotaskApiUrl } from '../utils/config';
import { Logger } from '../utils/logger';

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

/**
 * Minimal HTTP client for the Autotask REST API.
 *
 * All public methods:
 * - use the zone-resolved base URL (cached per-username via resolveAutotaskApiUrl)
 * - send the standard ApiIntegrationcode/UserName/Secret auth headers
 * - apply a 30-second timeout via AbortSignal.timeout
 * - throw an Error on non-2xx with the API error array when available
 */
export class AutotaskHttpClient {
  private resolvedBaseUrl: string | null = null;

  constructor(
    private readonly username: string,
    private readonly secret: string,
    private readonly integrationCode: string,
    private readonly apiUrl: string | undefined,
    private readonly logger: Logger
  ) {}

  private async baseUrl(): Promise<string> {
    if (this.resolvedBaseUrl) return this.resolvedBaseUrl;
    const url = await resolveAutotaskApiUrl(this.username, this.apiUrl, this.logger);
    // Normalize: strip trailing slashes and append /v1.0 root.
    this.resolvedBaseUrl = `${url.replace(/\/+$/, '')}/v1.0`;
    return this.resolvedBaseUrl;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ApiIntegrationcode: this.integrationCode,
      UserName: this.username,
      Secret: this.secret,
    };
  }

  /**
   * Shared low-level request wrapper. `path` is either a leading-slash path
   * (resolved against the zone base URL) or an absolute URL (used by
   * pageDetails.nextPageUrl pagination).
   */
  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = path.startsWith('http') ? path : `${await this.baseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

    this.logger.debug(`Autotask HTTP ${method} ${url}`);

    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: this.headers(),
        signal: AbortSignal.timeout(30_000),
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      response = await fetch(url, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Autotask ${method} ${url} network error: ${msg}`);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const text = await response.text().catch(() => '');

    if (!response.ok) {
      let detail = text.slice(0, 1000);
      try {
        const parsed = JSON.parse(text);
        if (parsed?.errors && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          detail = parsed.errors.join('; ');
        }
      } catch {
        /* fall through with raw text */
      }
      throw new Error(`Autotask ${method} ${path} failed: HTTP ${response.status}: ${detail}`);
    }

    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as unknown as T;
    }
  }

  /**
   * Generic passthrough for any Autotask REST endpoint.
   *
   * Serializes `queryParams` onto the path as `?key=value&...` (URL-encoded)
   * and reuses the same auth headers, timeout, error handling, and base URL
   * resolution as every other method on this client.
   *
   * Use sparingly — typed helpers (get/query/create/update/delete) are
   * preferred. This is the escape hatch for endpoints not yet wrapped.
   */
  async rawRequest<T = any>(
    method: string,
    path: string,
    body?: any,
    queryParams?: Record<string, string | number | boolean>
  ): Promise<T> {
    let finalPath = path;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const qs = Object.entries(queryParams)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) {
        finalPath = `${path}${path.includes('?') ? '&' : '?'}${qs}`;
      }
    }
    return this.request<T>(method, finalPath, body);
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
   * `maxRecords` caps the server-side page size (Autotask calls this MaxRecords).
   * This method will keep following pageDetails.nextPageUrl until exhausted OR
   * until the collected length reaches `maxRecords` (whichever is smaller).
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
    const maxRecords = opts.maxRecords ?? 500;
    const body: Record<string, any> = {
      filter,
      MaxRecords: maxRecords,
    };
    if (opts.includeFields && opts.includeFields.length > 0) {
      body.IncludeFields = opts.includeFields;
    }

    const items: T[] = [];
    let resp = await this.request<QueryResponse<T>>('POST', `/${entity}/query`, body);
    if (resp?.items) items.push(...resp.items);

    while (
      resp?.pageDetails?.nextPageUrl &&
      items.length < maxRecords
    ) {
      resp = await this.request<QueryResponse<T>>('GET', resp.pageDetails.nextPageUrl);
      if (resp?.items) items.push(...resp.items);
    }

    return items.slice(0, maxRecords);
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
   */
  async update(entity: string, id: number, body: Record<string, any>): Promise<void> {
    await this.request<void>('PATCH', `/${entity}`, { id, ...body });
  }

  /**
   * DELETE /{Entity}/{id}
   */
  async delete(entity: string, id: number): Promise<void> {
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
    const body: Record<string, any> = {
      filter,
      MaxRecords: opts.maxRecords ?? 500,
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
