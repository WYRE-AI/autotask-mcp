// Per-tenant in-flight cap and the split between Autotask's two HTTP 429s.
//
// A thread-threshold 429 is a concurrency rejection (the call was not
// processed). It must back off and retry idempotent reads without arming the
// 60s hourly cooldown. An hourly-threshold 429 still arms that cooldown.
// Create/update POST/PATCH/PUT are not retried.

import {
  AutotaskHttpClient,
  AutotaskRateLimitError,
  DEFAULT_MAX_INFLIGHT,
  THREAD_LIMIT_BASE_DELAY_MS,
  THREAD_LIMIT_MAX_RETRIES,
  _resetRateLimitCooldowns,
  _resetTenantSemaphores,
  _setAutotaskSleepForTests,
  isAutotaskQueryRead,
  isThreadLimitMessage,
} from '../src/services/autotask-http';
import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

const previousMaxInflight = process.env.AUTOTASK_MAX_INFLIGHT;

const makeClient = (username = 'user@example.com') =>
  new AutotaskHttpClient(
    username,
    'secret',
    'integration-code',
    'https://webservices28.autotask.net/ATServicesRest/',
    logger as any
  );

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const THREAD_BODY = {
  errors: ['The API thread threshold of 3 threads has been exceeded'],
};

function threadLimitResponse(): Response {
  // Retry-After: 60 is what the hourly path would honor. A thread-limit
  // response must ignore it — both for the cooldown and for retryAfterSeconds.
  return jsonResponse(429, THREAD_BODY, { 'Retry-After': '60' });
}

function hourlyLimitResponse(): Response {
  return jsonResponse(429, { errors: ['API threshold exceeded'] }, { 'Retry-After': '60' });
}

function okItem(): Response {
  return jsonResponse(200, { item: { id: 1 }, ok: true });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const sleep = jest.fn(async (_ms: number) => {});

beforeEach(() => {
  _resetRateLimitCooldowns();
  _resetTenantSemaphores();
  _resetZoneUrlCache();
  sleep.mockClear();
  _setAutotaskSleepForTests(sleep);
  delete process.env.AUTOTASK_MAX_INFLIGHT;
  Object.values(logger).forEach((m: any) => m.mockReset?.());
});

afterEach(() => {
  _setAutotaskSleepForTests(null);
  _resetTenantSemaphores();
  _resetRateLimitCooldowns();
  if (previousMaxInflight === undefined) delete process.env.AUTOTASK_MAX_INFLIGHT;
  else process.env.AUTOTASK_MAX_INFLIGHT = previousMaxInflight;
});

describe('thread-limit vs hourly 429', () => {
  it('classifies a thread-threshold body and not an hourly threshold body', () => {
    expect(isThreadLimitMessage('The API thread threshold of 3 threads has been exceeded')).toBe(true);
    expect(isThreadLimitMessage('Exceeded the threshold of 3 concurrent threads')).toBe(true);
    expect(isThreadLimitMessage('API threshold exceeded')).toBe(false);
    expect(isThreadLimitMessage('IntegrationVendor exceeded the API threshold')).toBe(false);
  });

  it('treats /query and /query/next as reads, including absolute paging URLs', () => {
    expect(isAutotaskQueryRead('POST', '/Tickets/query')).toBe(true);
    expect(isAutotaskQueryRead('POST', '/Tickets/query/next?paging=abc')).toBe(true);
    expect(isAutotaskQueryRead('POST', '/Companies/5/Contacts/query')).toBe(true);
    expect(
      isAutotaskQueryRead(
        'POST',
        'https://webservices28.autotask.net/ATServicesRest/v1.0/Tickets/query/next?paging=abc'
      )
    ).toBe(true);
    expect(isAutotaskQueryRead('POST', '/Tickets')).toBe(false);
    expect(isAutotaskQueryRead('POST', '/Tickets/querySomething')).toBe(false);
    expect(isAutotaskQueryRead('PATCH', '/Tickets/query')).toBe(false);
  });

  it('backs off a thread-limit 429 on a query POST and does not arm the cooldown', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = makeClient();
    let calls = 0;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      calls += 1;
      return Promise.resolve(calls === 1 ? threadLimitResponse() : jsonResponse(200, { items: [{ id: 7 }] }));
    });

    try {
      const result = await client.rawRequest('POST', '/Tickets/query', {
        filter: [{ op: 'eq', field: 'id', value: 7 }],
      });
      expect(result).toEqual({ items: [{ id: 7 }] });
      expect(calls).toBe(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(sleep.mock.calls[0][0]).toBe(THREAD_LIMIT_BASE_DELAY_MS / 2);

      // Cooldown was not armed: the next call still goes upstream.
      await client.rawRequest('GET', '/Tickets/7');
      expect(calls).toBe(3);
    } finally {
      fetchMock.mockRestore();
      random.mockRestore();
    }
  });

  it('grows the backoff on successive thread-limit retries', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const client = makeClient();
    let calls = 0;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      calls += 1;
      if (calls < 3) return Promise.resolve(threadLimitResponse());
      return Promise.resolve(jsonResponse(200, { items: [] }));
    });

    try {
      await client.rawRequest('POST', '/Companies/query', { filter: [] });
      expect(sleep.mock.calls.map((call) => call[0])).toEqual([
        THREAD_LIMIT_BASE_DELAY_MS / 2,
        THREAD_LIMIT_BASE_DELAY_MS,
      ]);
    } finally {
      fetchMock.mockRestore();
      random.mockRestore();
    }
  });

  it('applies jitter so the first retry is not a fixed delay', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(1);
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementationOnce(() => Promise.resolve(threadLimitResponse()))
      .mockImplementation(() => Promise.resolve(jsonResponse(200, { items: [] })));

    try {
      await client.rawRequest('GET', '/Companies/1');
      expect(sleep.mock.calls[0][0]).toBe(THREAD_LIMIT_BASE_DELAY_MS);
    } finally {
      fetchMock.mockRestore();
      random.mockRestore();
    }
  });

  it('does not arm the cooldown when thread-limit retries are exhausted', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.endsWith('/Companies/2')) return Promise.resolve(okItem());
      return Promise.resolve(threadLimitResponse());
    });

    try {
      const err = await client.rawRequest('GET', '/Companies/1').catch((e) => e);
      expect(err).toBeInstanceOf(AutotaskRateLimitError);
      expect((err as AutotaskRateLimitError).retryAfterSeconds).toBe(1);
      expect((err as Error).message).toMatch(/thread threshold/i);
      expect((err as Error).message).not.toMatch(/NOT sent upstream/);
      expect(fetchMock).toHaveBeenCalledTimes(1 + THREAD_LIMIT_MAX_RETRIES);

      await expect(client.get('Companies', 2)).resolves.toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2 + THREAD_LIMIT_MAX_RETRIES);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('retries idempotent reads, including child query POSTs and DELETE', async () => {
    const cases: Array<[string, string]> = [
      ['GET', '/Companies/1'],
      ['DELETE', '/Companies/1'],
      ['POST', '/Companies/5/Contacts/query'],
      ['POST', '/Tickets/query/next?paging=abc'],
    ];

    for (const [method, path] of cases) {
      sleep.mockClear();
      _resetRateLimitCooldowns();
      let calls = 0;
      const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
        calls += 1;
        return Promise.resolve(calls === 1 ? threadLimitResponse() : jsonResponse(200, { ok: true }));
      });
      try {
        await expect(makeClient().rawRequest(method, path, { filter: [] })).resolves.toEqual({ ok: true });
        expect(calls).toBe(2);
        expect(sleep).toHaveBeenCalledTimes(1);
      } finally {
        fetchMock.mockRestore();
      }
    }
  });

  it('retries an absolute /query/next page inside query()', async () => {
    const client = makeClient();
    let nextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.endsWith('/Tickets/query')) {
        return Promise.resolve(jsonResponse(200, {
          items: [{ id: 1 }],
          pageDetails: {
            nextPageUrl: 'https://webservices28.autotask.net/ATServicesRest/v1.0/Tickets/query/next?paging=abc',
          },
        }));
      }
      nextCalls += 1;
      if (nextCalls === 1) return Promise.resolve(threadLimitResponse());
      return Promise.resolve(jsonResponse(200, { items: [{ id: 2 }] }));
    });

    try {
      await expect(client.query('Tickets', [{ op: 'gte', field: 'id', value: 0 }])).resolves.toEqual([
        { id: 1 },
        { id: 2 },
      ]);
      expect(nextCalls).toBe(2);
      expect(sleep).toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([
    ['POST', '/Companies'],
    ['PATCH', '/Companies'],
    ['PUT', '/Companies/9'],
  ])('does not retry a %s write on a thread-limit 429 or arm the cooldown', async (method, path) => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.endsWith('/Companies/2')) return Promise.resolve(okItem());
      return Promise.resolve(threadLimitResponse());
    });

    try {
      const err = await client.rawRequest(method, path, { companyName: 'Acme' }).catch((e) => e);
      expect(err).toBeInstanceOf(AutotaskRateLimitError);
      expect((err as Error).message).toMatch(/not retried automatically/i);
      expect((err as Error).message).toMatch(/NOT applied/);
      expect((err as AutotaskRateLimitError).retryAfterSeconds).toBe(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await expect(client.get('Companies', 2)).resolves.toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not retry client.create or fall through update() to PUT', async () => {
    const client = makeClient();
    const methods: string[] = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((...args: unknown[]) => {
      const init = args[1] as { method?: string } | undefined;
      methods.push(init?.method ?? '');
      return Promise.resolve(threadLimitResponse());
    });

    try {
      await expect(client.create('Tickets', { title: 'x' })).rejects.toBeInstanceOf(AutotaskRateLimitError);
      await expect(client.update('Companies', 5, { companyName: 'Acme' })).rejects.toBeInstanceOf(AutotaskRateLimitError);
      expect(methods).toEqual(['POST', 'PATCH']);
      expect(sleep).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('still arms the hourly cooldown and does not retry', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(async () => hourlyLimitResponse());

    try {
      const err = await client.rawRequest('POST', '/Tickets/query', { filter: [] }).catch((e) => e);
      expect(err).toBeInstanceOf(AutotaskRateLimitError);
      expect((err as AutotaskRateLimitError).retryAfterSeconds).toBe(60);
      expect((err as Error).message).toContain('Do NOT retry');
      expect(sleep).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await expect(client.get('Companies', 1)).rejects.toThrow(/NOT sent upstream/);
      await expect(client.create('Companies', { companyName: 'Acme' })).rejects.toThrow(/NOT sent upstream/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('holds the in-flight slot during thread-limit backoff', async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '1';
    const client = makeClient();
    let releaseSleep: () => void = () => {};
    _setAutotaskSleepForTests(() => new Promise((resolve) => {
      releaseSleep = () => resolve();
    }));

    let calls = 0;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve(threadLimitResponse());
      return Promise.resolve(okItem());
    });

    try {
      const first = client.get('Companies', 1);
      const second = client.get('Companies', 2);
      await flush();
      expect(calls).toBe(1);

      releaseSleep();
      await flush();
      const [a, b] = await Promise.all([first, second]);
      expect(a).toEqual({ id: 1 });
      expect(b).toEqual({ id: 1 });
      expect(calls).toBe(3);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('per-tenant in-flight semaphore', () => {
  it('caps in-flight requests and lets queued calls start as slots free', async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '2';
    const client = makeClient();
    let inFlight = 0;
    let maxInFlight = 0;
    const resolvers: Array<() => void> = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(okItem());
        });
      });
    });

    try {
      const all = Promise.all([1, 2, 3, 4].map((id) => client.get('Companies', id)));
      await flush();
      expect(resolvers).toHaveLength(2);
      expect(maxInFlight).toBe(2);

      resolvers.shift()?.();
      await flush();
      expect(resolvers).toHaveLength(2);
      expect(maxInFlight).toBe(2);

      while (resolvers.length > 0) {
        resolvers.shift()?.();
        await flush();
      }
      await all;
      expect(maxInFlight).toBe(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not share the cap across tenants', async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '1';
    const a = makeClient('a@example.com');
    const b = makeClient('b@example.com');
    let maxInFlight = 0;
    let inFlight = 0;
    const resolvers: Array<() => void> = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(okItem());
        });
      });
    });

    try {
      const all = Promise.all([a.get('Companies', 1), b.get('Companies', 1)]);
      await flush();
      expect(maxInFlight).toBe(2);
      expect(resolvers).toHaveLength(2);
      resolvers.forEach((release) => release());
      await all;
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('shares the cap across client instances of the same tenant', async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '1';
    const first = makeClient('User@Tenant.com');
    const second = makeClient('user@tenant.com');
    let maxInFlight = 0;
    let inFlight = 0;
    const resolvers: Array<() => void> = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(okItem());
        });
      });
    });

    try {
      const all = Promise.all([
        first.get('Companies', 1),
        second.get('Companies', 1),
      ]);
      await flush();
      expect(maxInFlight).toBe(1);
      expect(resolvers).toHaveLength(1);
      resolvers.shift()?.();
      await flush();
      expect(resolvers).toHaveLength(1);
      expect(maxInFlight).toBe(1);
      resolvers.shift()?.();
      await all;
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('falls back to the default cap when AUTOTASK_MAX_INFLIGHT is not a positive integer', async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '0';
    const client = makeClient();
    let maxInFlight = 0;
    let inFlight = 0;
    const resolvers: Array<() => void> = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(okItem());
        });
      });
    });

    try {
      const ids = Array.from({ length: DEFAULT_MAX_INFLIGHT + 2 }, (_, i) => i + 1);
      const all = Promise.all(ids.map((id) => client.get('Companies', id)));
      await flush();
      expect(maxInFlight).toBe(DEFAULT_MAX_INFLIGHT);
      expect(resolvers).toHaveLength(DEFAULT_MAX_INFLIGHT);
      while (resolvers.length > 0) {
        resolvers.shift()?.();
        await flush();
      }
      await all;
      expect(maxInFlight).toBe(DEFAULT_MAX_INFLIGHT);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('autotask_raw_request description', () => {
  it('tells callers that searches are POST /{Entity}/query and the path must not start with /v1.0', () => {
    const def = TOOL_DEFINITIONS.find((tool) => tool.name === 'autotask_raw_request');
    expect(def).toBeDefined();
    const description = def?.description ?? '';
    expect(description).toContain('POST /{Entity}/query');
    expect(description).toContain('{"filter":[...]}');
    expect(description).toContain('must not start with /v1.0');
    expect(description).toContain('POST /Companies/query {"filter":[{"op":"eq","field":"id","value":175}]}');
    const pathDescription = (def?.inputSchema as { properties: Record<string, { description?: string }> }).properties.path?.description;
    expect(pathDescription).toContain('Must not start with /v1.0');
  });
});
