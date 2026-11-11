// The picklist cache is shared across per-request tool handlers that hold the
// same credentials (gateway mode builds a handler per request), and never
// across different credentials, API URLs or impersonated resources.

import { PicklistCache, _resetSharedPicklistStore, FieldInfo } from '../src/services/picklist.cache';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

const logger = new Logger('error');
const TTL_MS = 30 * 60 * 1000;

const fields = (label: string): FieldInfo[] => [
  {
    name: 'status',
    dataType: 'integer',
    isRequired: true,
    isReadOnly: false,
    isQueryable: true,
    isReference: false,
    isPickList: true,
    picklistValues: [{ value: '1', label }],
  },
];
const labelOf = (f: FieldInfo[]) => f[0]?.picklistValues?.[0]?.label;
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => _resetSharedPicklistStore());

describe('AutotaskService.getPicklistStoreKey', () => {
  const key = (autotask: McpServerConfig['autotask']) =>
    new AutotaskService({ name: 't', version: '1', autotask }, logger).getPicklistStoreKey();
  const base = { username: 'API@example.com', secret: 's3cret', integrationCode: 'CODE' };

  it('is stable for the same credentials and ignores username case', () => {
    expect(key(base)).toBe(key({ ...base, username: 'api@example.com' }));
  });

  it('differs when the secret, integration code or API URL differs', () => {
    const k = key(base);
    expect(key({ ...base, secret: 'wrong' })).not.toBe(k);
    expect(key({ ...base, integrationCode: 'OTHER' })).not.toBe(k);
    expect(key({ ...base, apiUrl: 'https://attacker.example' })).not.toBe(k);
  });

  it('gives an impersonated resource its own key', () => {
    expect(key({ ...base, impersonationResourceId: 42 })).not.toBe(key(base));
  });

  it('does not contain the secret, and is null without full credentials', () => {
    expect(key(base)).not.toContain('s3cret');
    expect(key({ username: 'a@b.c' })).toBeNull();
  });
});

describe('PicklistCache shared store', () => {
  it('shares loaded fields between instances with the same key', async () => {
    const load = jest.fn().mockResolvedValue(fields('New'));
    await new PicklistCache(logger, load, 'k').getFields('Tickets');
    expect(labelOf(await new PicklistCache(logger, load, 'k').getFields('Tickets'))).toBe('New');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent loads across instances', async () => {
    let resolve!: (f: FieldInfo[]) => void;
    const load = jest.fn().mockReturnValue(new Promise<FieldInfo[]>((r) => (resolve = r)));
    const a = new PicklistCache(logger, load, 'k').getFields('Tickets');
    const b = new PicklistCache(logger, load, 'k').getFields('Tickets');
    resolve(fields('New'));
    await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never serves one key\'s fields under another', async () => {
    await new PicklistCache(logger, jest.fn().mockResolvedValue(fields('A')), 'key-a').getFields('Tickets');
    const other = jest.fn().mockResolvedValue(fields('B'));
    expect(labelOf(await new PicklistCache(logger, other, 'key-b').getFields('Tickets'))).toBe('B');
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('keeps instances without a key isolated', async () => {
    const load = jest.fn().mockResolvedValue(fields('New'));
    await new PicklistCache(logger, load).getFields('Tickets');
    await new PicklistCache(logger, load).getFields('Tickets');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('stores nothing for a failed load, so rejected credentials leave no entry', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 401'))
      .mockResolvedValueOnce(fields('New'));
    expect(await new PicklistCache(logger, load, 'k').getFields('Tickets')).toEqual([]);
    expect(labelOf(await new PicklistCache(logger, load, 'k').getFields('Tickets'))).toBe('New');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('serves an expired entry at once and refreshes it once in the background', async () => {
    let resolve!: (f: FieldInfo[]) => void;
    const load = jest
      .fn()
      .mockResolvedValueOnce(fields('Old'))
      .mockReturnValueOnce(new Promise<FieldInfo[]>((r) => (resolve = r)));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      await new PicklistCache(logger, load, 'k').getFields('Tickets');
      now.mockReturnValue(1_000 + TTL_MS + 1);
      // Both callers get the old copy without waiting; one refresh starts.
      expect(labelOf(await new PicklistCache(logger, load, 'k').getFields('Tickets'))).toBe('Old');
      expect(labelOf(await new PicklistCache(logger, load, 'k').getFields('Tickets'))).toBe('Old');
      expect(load).toHaveBeenCalledTimes(2);
      resolve(fields('New'));
      await flush();
      expect(labelOf(await new PicklistCache(logger, load, 'k').getFields('Tickets'))).toBe('New');
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });

  it('after a failed refresh, serves the last good copy with the status and backs off', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce(fields('Old'))
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 429'), { status: 429 }))
      .mockResolvedValueOnce(fields('New'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const cache = () => new PicklistCache(logger, load, 'k');
      await cache().getFields('Tickets');
      now.mockReturnValue(1_000 + TTL_MS + 1);
      await cache().lookupFields('Tickets'); // starts the refresh, which fails
      await flush();

      // Within the backoff: no new request, old copy plus the failure.
      now.mockReturnValue(1_000 + TTL_MS + 10_000);
      const during = await cache().lookupFields('Tickets');
      expect(labelOf(during.fields)).toBe('Old');
      expect(during.unavailable).toEqual({ status: 429 });
      expect(load).toHaveBeenCalledTimes(2);

      // After it: one retry, which succeeds and clears the failure.
      now.mockReturnValue(1_000 + TTL_MS + 31_000);
      await cache().lookupFields('Tickets');
      await flush();
      const after = await cache().lookupFields('Tickets');
      expect(labelOf(after.fields)).toBe('New');
      expect(after.unavailable).toBeUndefined();
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
    }
  });

  it('with nothing cached, a failure returns [] with the status', async () => {
    const load = jest.fn().mockRejectedValue(Object.assign(new Error('HTTP 500'), { status: 500 }));
    expect(await new PicklistCache(logger, load, 'k').lookupFields('Tickets')).toEqual({ fields: [], unavailable: { status: 500 } });
  });

  it('a caller joining a failed refresh after its entry was evicted still gets the last good copy', async () => {
    let reject!: (e: Error) => void;
    const load = jest.fn().mockImplementation(async (entity: string) => fields(entity));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      await new PicklistCache(logger, jest.fn().mockResolvedValue(fields('Old')), 'k').getFields('Tickets');
      now.mockReturnValue(1_000 + TTL_MS + 1);
      const failing = jest.fn().mockReturnValue(new Promise<FieldInfo[]>((_, r) => (reject = r)));
      await new PicklistCache(logger, failing, 'k').lookupFields('Tickets'); // refresh in flight
      for (let i = 0; i < 1000; i++) await new PicklistCache(logger, load, `k${i}`).getFields('Tickets'); // evicts 'k'
      const joined = new PicklistCache(logger, failing, 'k').lookupFields('Tickets');
      reject(new Error('HTTP 503'));
      const got = await joined;
      expect(labelOf(got.fields)).toBe('Old');
      expect(got.unavailable).toEqual({});
      expect(failing).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it('caps the shared store, evicting the least recently used entry', async () => {
    const load = jest.fn().mockImplementation(async (entity: string) => fields(entity));
    const keep = new PicklistCache(logger, load, 'keep');
    await keep.getFields('Tickets');
    for (let i = 0; i < 1000; i++) {
      await new PicklistCache(logger, load, `k${i}`).getFields('Tickets');
      if (i === 500) await keep.getFields('Tickets'); // refresh recency
    }
    const calls = load.mock.calls.length;
    await keep.getFields('Tickets'); // still cached: used recently
    expect(load.mock.calls.length).toBe(calls);
    await new PicklistCache(logger, load, 'k0').getFields('Tickets'); // evicted
    expect(load.mock.calls.length).toBe(calls + 1);
  });
});

describe('AutotaskToolHandler', () => {
  const service = (autotask: McpServerConfig['autotask'], label = 'New') => {
    const svc = new AutotaskService({ name: 't', version: '1', autotask }, logger);
    jest.spyOn(svc, 'getFieldInfo').mockResolvedValue(fields(label) as never);
    return svc;
  };
  const cacheOf = (svc: AutotaskService) =>
    (new AutotaskToolHandler(svc, logger) as unknown as { picklistCache: PicklistCache }).picklistCache;
  const creds = { username: 'api@example.com', secret: 's3cret', integrationCode: 'CODE' };

  it('reuses field info across per-request handlers with the same credentials', async () => {
    const first = service(creds);
    await cacheOf(first).getFields('Tickets');
    const second = service(creds);
    await cacheOf(second).getFields('Tickets');
    expect(first.getFieldInfo).toHaveBeenCalledTimes(1);
    expect(second.getFieldInfo).not.toHaveBeenCalled();
  });

  it('does not serve cached field info to the same username with a wrong secret', async () => {
    await cacheOf(service(creds)).getFields('Tickets');
    const wrong = service({ ...creds, secret: 'guess' }, 'Fetched');
    expect(labelOf(await cacheOf(wrong).getFields('Tickets'))).toBe('Fetched');
    expect(wrong.getFieldInfo).toHaveBeenCalledTimes(1);
  });

  it('gives an impersonated handler its own entries', async () => {
    await cacheOf(service(creds)).getFields('Tickets');
    const impersonated = service({ ...creds, impersonationResourceId: 42 }, 'Narrow');
    expect(labelOf(await cacheOf(impersonated).getFields('Tickets'))).toBe('Narrow');
    expect(impersonated.getFieldInfo).toHaveBeenCalledTimes(1);
  });
});
