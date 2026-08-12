// Regression tests: a stale cached zone URL (e.g. after a Kaseya data-centre
// migration moves a tenant to a new zone) must not permanently 401 a tenant
// for the rest of the process lifetime. AutotaskHttpClient.request() retries
// once against a freshly-resolved zone on 401, and resolveAutotaskApiUrl's
// cache supports targeted per-username invalidation.

import { AutotaskHttpClient } from '../src/services/autotask-http';
import { _resetZoneUrlCache, invalidateZoneUrlCache, resolveAutotaskApiUrl } from '../src/utils/config';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

const makeClient = (apiUrl = 'https://webservices18.autotask.net/ATServicesRest/') =>
  new AutotaskHttpClient('user@example.com', 'secret', 'integration-code', apiUrl, logger as any);

beforeEach(() => {
  _resetZoneUrlCache();
  Object.values(logger).forEach((m: any) => m.mockReset?.());
});

describe('invalidateZoneUrlCache', () => {
  it('removes only the named username, leaving other cached zones intact', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: 'https://webservices2.autotask.net/atservicesrest/' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: 'https://webservices7.autotask.net/atservicesrest/' }) });

    await resolveAutotaskApiUrl('alice@example.com', undefined, logger, fetchMock as any);
    await resolveAutotaskApiUrl('bob@example.com', undefined, logger, fetchMock as any);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    invalidateZoneUrlCache('ALICE@example.com'); // case-insensitive key match

    // Alice re-resolves (cache miss); Bob still hits the cache (no new fetch call for Bob).
    const freshFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://webservices31.autotask.net/atservicesrest/' }),
    });
    const alice = await resolveAutotaskApiUrl('alice@example.com', undefined, logger, freshFetch as any);
    expect(alice).toBe('https://webservices31.autotask.net/atservicesrest/');
    expect(freshFetch).toHaveBeenCalledTimes(1);

    const bob = await resolveAutotaskApiUrl('bob@example.com', undefined, logger, freshFetch as any);
    expect(bob).toBe('https://webservices7.autotask.net/atservicesrest/');
    // Bob was a cache hit, so freshFetch was never called for Bob.
    expect(freshFetch).toHaveBeenCalledTimes(1);
  });
});

describe('AutotaskHttpClient 401 retry (stale zone cache)', () => {
  it('invalidates the cached base URL and retries once against a fresh zone on 401', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((urlArg: any) => {
      const url = String(urlArg);
      if (url.startsWith('https://webservices18')) {
        // Stale zone: rejects with 401.
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: { get: () => null },
          text: async () => JSON.stringify({ errors: ['Authentication failed'] }),
        } as any);
      }
      throw new Error(`unexpected host in test: ${url}`);
    });

    try {
      await expect(client.get('Companies', 123)).rejects.toThrow(/HTTP 401/);
      // First attempt + retry attempt, both against the same (only-configured) zone,
      // proving the retry actually fired rather than the first 401 propagating straight up.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('succeeds after invalidation once a fresh zone lookup returns a working host', async () => {
    // No explicit apiUrl: forces auto-detection through resolveAutotaskApiUrl,
    // so we can prove the retry re-resolves via a fresh zoneInformation call.
    // (Not routed through makeClient()'s default parameter — passing `undefined`
    // explicitly would still trigger its default value, defeating the point.)
    const client = new AutotaskHttpClient('user@example.com', 'secret', 'integration-code', undefined, logger as any);
    let zoneCalls = 0;

    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((urlArg: any) => {
      const url = String(urlArg);
      if (url.includes('zoneInformation')) {
        zoneCalls += 1;
        // First lookup returns the stale (pre-migration) zone; second returns Sydney.
        const zoneUrl =
          zoneCalls === 1
            ? 'https://webservices18.autotask.net/atservicesrest/'
            : 'https://webservices31.autotask.net/atservicesrest/';
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ url: zoneUrl }) } as any);
      }
      if (url.startsWith('https://webservices18')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: { get: () => null },
          text: async () => JSON.stringify({ errors: ['Authentication failed'] }),
        } as any);
      }
      if (url.startsWith('https://webservices31')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ item: { id: 123, companyName: 'Acme' } }),
        } as any);
      }
      throw new Error(`unexpected host in test: ${url}`);
    });

    try {
      const result = await client.get<{ id: number; companyName: string }>('Companies', 123);
      expect(result).toEqual({ id: 123, companyName: 'Acme' });
      expect(zoneCalls).toBe(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not retry a second time (avoids infinite loop) if the fresh zone also 401s', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ errors: ['Authentication failed'] }),
    } as any);

    try {
      await expect(client.get('Companies', 123)).rejects.toThrow(/HTTP 401/);
      expect(fetchMock).toHaveBeenCalledTimes(2); // original + exactly one retry, then throws
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not retry a 401 reached via rawRequest (already resolved to an absolute zone URL)', async () => {
    // rawRequest() resolves `${base}${path}` into an absolute URL itself before
    // calling request(), so request() sees path.startsWith('http') === true and
    // skips the retry — rewriting an already zone-baked absolute URL wouldn't
    // pick up a freshly-invalidated zone anyway.
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      text: async () => JSON.stringify({ errors: ['Authentication failed'] }),
    } as any);

    try {
      await expect(
        client.rawRequest('GET', '/Companies/query/next?paging=abc')
      ).rejects.toThrow(/HTTP 401/);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no retry
    } finally {
      fetchMock.mockRestore();
    }
  });
});
