/** ATM-020: pagination URLs from responses must never redirect credentials. */
import { assertSamePaginationOrigin, AutotaskHttpClient, _resetRateLimitCooldowns } from '../src/services/autotask-http';
import { _resetZoneUrlCache } from '../src/utils/config';

const BASE = 'https://webservices28.autotask.net/ATServicesRest/v1.0';
const logger = { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() };
const ok = 'https://webservices28.autotask.net/atservicesrest/v1.0/Tickets/query/next?paging=tok';

describe('assertSamePaginationOrigin', () => {
  it('accepts same-origin next page (case-insensitive path)', () => {
    expect(assertSamePaginationOrigin(ok, BASE, 'Tickets')).toBe(ok);
  });
  it('resolves a relative nextPageUrl against the base', () => {
    expect(assertSamePaginationOrigin('/Tickets/query/next?paging=tok', BASE, 'Tickets')).toBe(`${BASE}/Tickets/query/next?paging=tok`);
  });
  it('refuses a different host', () => {
    expect(() => assertSamePaginationOrigin('https://evil.example/atservicesrest/v1.0/Tickets/query/next?paging=tok', BASE, 'Tickets'))
      .toThrow('Refusing to follow nextPageUrl to an unexpected host');
  });
  it('refuses a lookalike host and a different port', () => {
    expect(() => assertSamePaginationOrigin('https://webservices28.autotask.net.evil.example/ATServicesRest/v1.0/Tickets/query/next', BASE, 'Tickets')).toThrow();
    expect(() => assertSamePaginationOrigin('https://webservices28.autotask.net:8443/ATServicesRest/v1.0/Tickets/query/next', BASE, 'Tickets')).toThrow();
  });
  it('refuses http', () => {
    expect(() => assertSamePaginationOrigin(ok.replace('https:', 'http:'), BASE, 'Tickets')).toThrow('unexpected host');
  });
  it('refuses userinfo', () => {
    expect(() => assertSamePaginationOrigin('https://user:pw@webservices28.autotask.net/atservicesrest/v1.0/Tickets/query/next', BASE, 'Tickets')).toThrow('unexpected host');
  });
  it('refuses a path outside the API prefix or not query/next', () => {
    expect(() => assertSamePaginationOrigin('https://webservices28.autotask.net/other/Tickets/query/next', BASE, 'Tickets')).toThrow();
    expect(() => assertSamePaginationOrigin('https://webservices28.autotask.net/atservicesrest/v1.0/Companies/query/next', BASE, 'Tickets')).toThrow();
    expect(() => assertSamePaginationOrigin('https://webservices28.autotask.net/atservicesrest/v1.0/Tickets/1', BASE, 'Tickets')).toThrow();
  });
  it('does not put the query string in the error or log', () => {
    const l = { error: jest.fn() } as any;
    try { assertSamePaginationOrigin('https://evil.example/x?paging=SECRET', BASE, 'Tickets', l); } catch (e: any) {
      expect(e.message).not.toContain('SECRET');
    }
    expect(JSON.stringify(l.error.mock.calls)).not.toContain('SECRET');
  });
});

describe('AutotaskHttpClient.query pagination', () => {
  const origFetch = global.fetch;
  afterEach(() => { global.fetch = origFetch; });
  beforeEach(() => { _resetRateLimitCooldowns(); _resetZoneUrlCache(); });
  const page = (items: any[], next?: string) => Promise.resolve({
    ok: true, status: 200, headers: { get: () => null },
    text: async () => JSON.stringify({ items, pageDetails: { nextPageUrl: next ?? null } }),
  } as any);
  const client = () => new AutotaskHttpClient('u@example.com', 's', 'c', 'https://webservices28.autotask.net/ATServicesRest/', logger as any);

  it('follows a same-origin next page', async () => {
    const f = jest.fn().mockReturnValueOnce(page([{ id: 1 }], ok)).mockReturnValueOnce(page([{ id: 2 }]));
    global.fetch = f as any;
    expect(await client().query('Tickets', [], { maxRecords: 10 })).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('refuses a forged host and never sends credentials to it', async () => {
    const f = jest.fn().mockReturnValueOnce(page([{ id: 1 }], 'https://evil.example/atservicesrest/v1.0/Tickets/query/next?paging=x'));
    global.fetch = f as any;
    await expect(client().query('Tickets', [], { maxRecords: 10 })).rejects.toThrow('Refusing to follow nextPageUrl');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
