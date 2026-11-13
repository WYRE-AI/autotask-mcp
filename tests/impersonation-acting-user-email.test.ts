// Acting-user impersonation: Conduit forwards the acting user's verified email
// (X-Conduit-Acting-User-Email, S2S-trusted), the sidecar resolves the single
// active Autotask resource with that email and impersonates it on writes.

import {
  __impersonationCacheSize,
  __resetImpersonationCacheForTests,
  impersonationOperation,
  markImpersonationRejected,
  parseActingUserEmail,
  pickResource,
  resolveResourceIdByEmail,
} from '../src/services/impersonation-resolver';
import { classifyImpersonationRejection } from '../src/services/autotask-http';
import { parseCredentialsFromHeaders } from '../src/utils/config';
import { AutotaskMcpServer } from '../src/mcp/server';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { EnvironmentConfig } from '../src/utils/config';
import type { McpServerConfig } from '../src/types/mcp';

const logger = new Logger('error');
const quiet = { debug: jest.fn() };

beforeEach(() => {
  __resetImpersonationCacheForTests();
  quiet.debug.mockClear();
});

describe('parseActingUserEmail', () => {
  it('normalizes a valid address', () => {
    expect(parseActingUserEmail('  Tech.One@Example.COM ')).toBe('tech.one@example.com');
  });
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['no at', 'tech.example.com'],
    ['display name', 'Tech <tech@example.com>'],
    ['list', 'a@example.com,b@example.com'],
    ['too long', `${'a'.repeat(250)}@example.com`],
  ])('rejects %s', (_l, raw) => {
    expect(parseActingUserEmail(raw)).toBeUndefined();
  });
  it('warns without echoing the value', () => {
    const warn = jest.fn();
    parseActingUserEmail('not an email', { warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).not.toContain('not an email');
  });
});

describe('pickResource', () => {
  const email = 'tech@example.com';
  it('matches exactly one active resource, case-insensitively', () => {
    expect(pickResource([{ id: 5, email: 'TECH@example.com', isActive: true }], email)).toEqual({ resourceId: 5, outcome: 'matched' });
  });
  it('ignores rows whose email is not an exact match', () => {
    expect(pickResource([{ id: 5, email: 'tech@example.com.au', isActive: true }], email).outcome).toBe('no-match');
  });
  it('falls back when only inactive resources match', () => {
    expect(pickResource([{ id: 5, email, isActive: false }], email)).toEqual({ resourceId: null, outcome: 'inactive' });
  });
  it('falls back when more than one active resource matches', () => {
    expect(
      pickResource([{ id: 5, email, isActive: true }, { id: 6, email, isActive: true }], email)
    ).toEqual({ resourceId: null, outcome: 'ambiguous' });
  });
  it('one active plus inactive duplicates is still a confident match', () => {
    expect(pickResource([{ id: 5, email, isActive: false }, { id: 6, email, isActive: true }], email).resourceId).toBe(6);
  });
});

describe('resolveResourceIdByEmail cache', () => {
  function client(rows: unknown[] | Error) {
    return {
      query: jest.fn(async () => {
        if (rows instanceof Error) throw rows;
        return rows as never[];
      }),
    };
  }

  it('queries Resources by email and caches hits per tenant+email', async () => {
    const c = client([{ id: 9, email: 'tech@example.com', isActive: true }]);
    expect(await resolveResourceIdByEmail(c, 'api@tenant-a.example', 'tech@example.com', quiet)).toBe(9);
    expect(await resolveResourceIdByEmail(c, 'api@tenant-a.example', 'tech@example.com', quiet)).toBe(9);
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.query).toHaveBeenCalledWith(
      'Resources',
      [
        { op: 'eq', field: 'email', value: 'tech@example.com' },
        { op: 'eq', field: 'isActive', value: true },
      ],
      expect.objectContaining({ includeFields: ['id', 'email', 'isActive'] })
    );
  });

  it('keys by tenant so one tenant never reuses another tenant\'s resource ID', async () => {
    const a = client([{ id: 9, email: 'tech@example.com', isActive: true }]);
    const b = client([]);
    expect(await resolveResourceIdByEmail(a, 'api@tenant-a.example', 'tech@example.com', quiet)).toBe(9);
    expect(await resolveResourceIdByEmail(b, 'api@tenant-b.example', 'tech@example.com', quiet)).toBeUndefined();
    expect(b.query).toHaveBeenCalledTimes(1);
  });

  it('caches misses, and expires them after the miss TTL', async () => {
    let t = 1_000_000;
    __resetImpersonationCacheForTests(() => t);
    const c = client([]);
    expect(await resolveResourceIdByEmail(c, 'api@t.example', 'nobody@example.com', quiet)).toBeUndefined();
    expect(await resolveResourceIdByEmail(c, 'api@t.example', 'nobody@example.com', quiet)).toBeUndefined();
    expect(c.query).toHaveBeenCalledTimes(1);
    t += 5 * 60_000 + 1;
    await resolveResourceIdByEmail(c, 'api@t.example', 'nobody@example.com', quiet);
    expect(c.query).toHaveBeenCalledTimes(2);
  });

  it('expires hits after the hit TTL', async () => {
    let t = 1_000_000;
    __resetImpersonationCacheForTests(() => t);
    const c = client([{ id: 9, email: 'tech@example.com', isActive: true }]);
    await resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet);
    t += 15 * 60_000 - 1;
    await resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet);
    expect(c.query).toHaveBeenCalledTimes(1);
    t += 2;
    await resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet);
    expect(c.query).toHaveBeenCalledTimes(2);
  });

  it('falls back on a lookup error and logs without the email', async () => {
    const c = client(Object.assign(new Error('boom'), { status: 500 }));
    expect(await resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet)).toBeUndefined();
    const logged = quiet.debug.mock.calls.map((x) => x[0]).join('\n');
    expect(logged).toContain('lookup failed (HTTP 500)');
    expect(logged).not.toContain('tech@example.com');
  });

  it('shares one Autotask query between concurrent lookups', async () => {
    const c = client([{ id: 9, email: 'tech@example.com', isActive: true }]);
    const [x, y] = await Promise.all([
      resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet),
      resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet),
    ]);
    expect([x, y]).toEqual([9, 9]);
    expect(c.query).toHaveBeenCalledTimes(1);
  });

  it('normalizes the email so mixed-case callers still match and share the cache', async () => {
    const c = client([{ id: 9, email: 'tech@example.com', isActive: true }]);
    expect(await resolveResourceIdByEmail(c, 'api@t.example', ' Tech@Example.COM ', quiet)).toBe(9);
    expect(await resolveResourceIdByEmail(c, 'api@t.example', 'tech@example.com', quiet)).toBe(9);
    expect(c.query).toHaveBeenCalledTimes(1);
  });

  it('treats a full lookup page as ambiguous rather than trusting a truncated list', async () => {
    // Only one exact match in the page, but the page is full: not confident.
    const full = [{ id: 1, email: 'tech@example.com', isActive: true }, ...Array.from({ length: 4 }, (_, i) => ({ id: i + 2, email: 'x@example.com', isActive: true }))];
    expect(await resolveResourceIdByEmail(client(full), 'api@t.example', 'tech@example.com', quiet)).toBeUndefined();
  });

  it('never stores raw emails in the cache', async () => {
    await resolveResourceIdByEmail(client([]), 'api@t.example', 'tech@example.com', quiet);
    expect(__impersonationCacheSize()).toBe(1);
  });
});

describe('classifyImpersonationRejection', () => {
  it('retries only rejected 4xx responses', () => {
    expect(classifyImpersonationRejection(403, '')).toBe('retry');
    expect(classifyImpersonationRejection(400, 'impersonation not permitted')).toBe('retry');
  });
  it('never retries a 500; a structured impersonation 500 only suppresses', () => {
    expect(classifyImpersonationRejection(500, '{"errors":["Impersonation is not allowed for this resource"]}')).toBe('suppress');
    expect(classifyImpersonationRejection(500, 'impersonation proxy crashed')).toBe(false);
  });
  it('ignores gateway 5xx, 429s and ordinary validation errors', () => {
    expect(classifyImpersonationRejection(502, '{"errors":["impersonation"]}')).toBe(false);
    expect(classifyImpersonationRejection(503, 'impersonation')).toBe(false);
    expect(classifyImpersonationRejection(500, '{"errors":["Title is required"]}')).toBe(false);
    expect(classifyImpersonationRejection(429, 'impersonation')).toBe(false);
    expect(classifyImpersonationRejection(400, 'Title is required')).toBe(false);
  });
});

describe('header trust in the request factory', () => {
  const baseConfig: McpServerConfig = { name: 'autotask-mcp', version: '0', autotask: {} };
  const envConfig: EnvironmentConfig = {
    autotask: {},
    server: { name: 'autotask-mcp', version: '0' },
    transport: { type: 'http', port: 0, host: '127.0.0.1' },
    logging: { level: 'error', format: 'simple' },
    auth: { mode: 'gateway' },
    lazyLoading: false,
  };
  const tenant = {
    'x-api-key': 'api@tenant.example',
    'x-api-secret': 's',
    'x-integration-code': 'C',
    'x-conduit-acting-user-email': 'Tech@Example.com',
  };

  function credsFor(headers: Record<string, string>, opts?: { trustActingUserEmail?: boolean }) {
    const server = new AutotaskMcpServer(baseConfig, logger, envConfig);
    const spy = jest
      .spyOn(server, 'createRequestServer')
      .mockReturnValue({} as ReturnType<AutotaskMcpServer['createRequestServer']>);
    (server.requestFactory(opts) as (ctx: unknown) => unknown)({ requestInfo: { headers: new Headers(headers) } });
    return spy.mock.calls[0][0];
  }

  it('parses the email from headers', () => {
    expect(parseCredentialsFromHeaders(tenant).actingUserEmail).toBe('tech@example.com');
  });

  it('keeps the email only when the transport verified S2S', () => {
    expect(credsFor(tenant, { trustActingUserEmail: true })?.actingUserEmail).toBe('tech@example.com');
    expect(credsFor(tenant)?.actingUserEmail).toBeUndefined();
    expect(credsFor(tenant, { trustActingUserEmail: false })?.actingUserEmail).toBeUndefined();
  });
});

describe('AutotaskHttpClient with an acting-user email', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

  function stubFetch(handler: (c: Call) => { status: number; body: unknown }) {
    const calls: Call[] = [];
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        url,
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        ...(typeof init.body === 'string' ? { body: init.body } : {}),
      };
      calls.push(call);
      const { status, body } = handler(call);
      const text = JSON.stringify(body);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => text,
        headers: new Headers(),
      };
    });
    return calls;
  }

  function service(actingUserEmail: string | undefined, impersonationResourceId?: number) {
    const autotask: McpServerConfig['autotask'] = {
      username: 'api@tenant.example',
      secret: 's',
      integrationCode: 'C',
      apiUrl: 'https://webservices99.autotask.net/ATServicesRest',
    };
    if (actingUserEmail) autotask.actingUserEmail = actingUserEmail;
    if (impersonationResourceId) autotask.impersonationResourceId = impersonationResourceId;
    return new AutotaskService({ name: 't', version: '0', autotask }, logger);
  }

  const resourceRows = (rows: unknown[]) => ({ status: 200, body: { items: rows, pageDetails: {} } });
  const note = { title: 't', description: 'd', noteType: 1, publish: 1 };

  it('impersonates the matched resource on a ticket note create, and looks it up as the API user', async () => {
    const calls = stubFetch((c) =>
      c.url.endsWith('/Resources/query')
        ? resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }])
        : { status: 200, body: { itemId: 1 } }
    );
    await service('tech@example.com').createTicketNote(7, note);
    const lookup = calls.find((c) => c.url.endsWith('/Resources/query'))!;
    const write = calls.find((c) => c.url.endsWith('/Tickets/7/Notes'))!;
    expect(lookup.headers).not.toHaveProperty('ImpersonationResourceId');
    expect(write.headers.ImpersonationResourceId).toBe('77');
  });

  it('does not impersonate reads', async () => {
    const calls = stubFetch((c) =>
      c.url.endsWith('/Resources/query')
        ? resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }])
        : resourceRows([])
    );
    await service('tech@example.com').searchTicketNotes(7);
    expect(calls.some((c) => c.url.endsWith('/Resources/query'))).toBe(false);
    expect(calls.every((c) => !('ImpersonationResourceId' in c.headers))).toBe(true);
  });

  it('writes as the API user when nothing matches', async () => {
    const calls = stubFetch((c) =>
      c.url.endsWith('/Resources/query') ? resourceRows([]) : { status: 200, body: { itemId: 1 } }
    );
    await service('nobody@example.com').createProjectNote(8, note);
    const write = calls.find((c) => c.url.endsWith('/Projects/8/Notes'))!;
    expect(write.headers).not.toHaveProperty('ImpersonationResourceId');
  });

  it('retries a 4xx impersonation rejection once as the API user, then stops impersonating that operation', async () => {
    const calls = stubFetch((c) => {
      if (c.url.endsWith('/Resources/query')) return resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }]);
      if (c.headers.ImpersonationResourceId) return { status: 403, body: { errors: ['Impersonation is not permitted'] } };
      return { status: 200, body: { itemId: 1 } };
    });
    const svc = service('tech@example.com');
    await expect(svc.createTicketNote(7, note)).resolves.toBe(1);
    const writes = calls.filter((c) => c.url.endsWith('/Tickets/7/Notes'));
    expect(writes.map((w) => w.headers.ImpersonationResourceId)).toEqual(['77', undefined]);
    await svc.createTicketNote(7, note);
    const after = calls.filter((c) => c.url.endsWith('/Tickets/7/Notes')).slice(2);
    expect(after.map((w) => w.headers.ImpersonationResourceId)).toEqual([undefined]);
  });

  it('does not retry a 500 impersonation refusal (no duplicate risk), but the next attempt runs as the API user', async () => {
    const calls = stubFetch((c) => {
      if (c.url.endsWith('/Resources/query')) return resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }]);
      if (c.headers.ImpersonationResourceId) return { status: 500, body: { errors: ['Impersonation is not permitted'] } };
      return { status: 200, body: { itemId: 1 } };
    });
    const svc = service('tech@example.com');
    await expect(svc.createTicketNote(7, note)).rejects.toThrow(/trying again will record it as the API user/);
    expect(calls.filter((c) => c.url.endsWith('/Tickets/7/Notes'))).toHaveLength(1);
    await expect(svc.createTicketNote(7, note)).resolves.toBe(1);
    const writes = calls.filter((c) => c.url.endsWith('/Tickets/7/Notes'));
    expect(writes.map((w) => w.headers.ImpersonationResourceId)).toEqual(['77', undefined]);
  });

  it('does not retry an ordinary validation error', async () => {
    const calls = stubFetch((c) => {
      if (c.url.endsWith('/Resources/query')) return resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }]);
      return { status: 500, body: { errors: ['Title is required'] } };
    });
    await expect(service('tech@example.com').createTicketNote(7, note)).rejects.toThrow(/Title is required/);
    expect(calls.filter((c) => c.url.endsWith('/Tickets/7/Notes'))).toHaveLength(1);
  });

  it('an explicit resource ID wins and is never replaced by the email lookup', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { itemId: 1 } }));
    await service('tech@example.com', 555).createTicketNote(7, note);
    expect(calls.some((c) => c.url.endsWith('/Resources/query'))).toBe(false);
    expect(calls[0]!.headers.ImpersonationResourceId).toBe('555');
  });

  it('a rejection suppresses impersonation for that operation only', async () => {
    markImpersonationRejected('api@tenant.example', 'Tech@example.com', 'POST /Tickets/{id}/Notes');
    const calls = stubFetch((c) =>
      c.url.endsWith('/Resources/query')
        ? resourceRows([{ id: 77, email: 'tech@example.com', isActive: true }])
        : { status: 200, body: { itemId: 1 } }
    );
    const svc = service('tech@example.com');
    await svc.createTicketNote(9, note);
    expect(calls.find((c) => c.url.endsWith('/Tickets/9/Notes'))!.headers).not.toHaveProperty('ImpersonationResourceId');
    await svc.createProjectNote(8, note);
    expect(calls.find((c) => c.url.endsWith('/Projects/8/Notes'))!.headers.ImpersonationResourceId).toBe('77');
  });

  it('impersonationOperation normalizes IDs, the /v1.0 root, absolute URLs and query strings', () => {
    expect(impersonationOperation('post', '/Tickets/123/Notes')).toBe('POST /Tickets/{id}/Notes');
    expect(impersonationOperation('PATCH', 'https://webservices99.autotask.net/ATServicesRest/v1.0/Tickets?x=1')).toBe(
      'PATCH /ATServicesRest/Tickets'
    );
  });
});
