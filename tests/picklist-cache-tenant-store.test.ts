// The picklist cache is shared across per-request tool handlers of the same
// tenant (gateway mode builds a handler per request), and never across tenants
// or impersonated resources.

import {
  PicklistCache,
  picklistStoreKey,
  _resetTenantPicklistStore,
  FieldInfo,
} from '../src/services/picklist.cache';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';

const logger = new Logger('error');

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

beforeEach(() => _resetTenantPicklistStore());

describe('picklistStoreKey', () => {
  it('keys by lowercased tenant, and separately per impersonated resource', () => {
    expect(picklistStoreKey('API@Example.com')).toBe('api@example.com');
    expect(picklistStoreKey('api@example.com', 42)).toBe('api@example.com#as:42');
  });

  it('returns undefined without a tenant, keeping the cache instance-local', () => {
    expect(picklistStoreKey(null)).toBeUndefined();
    expect(picklistStoreKey(undefined, 42)).toBeUndefined();
  });
});

describe('PicklistCache tenant store', () => {
  it('shares loaded fields between instances with the same key', async () => {
    const load = jest.fn().mockResolvedValue(fields('New'));
    await new PicklistCache(logger, load, 'tenant-a').getFields('Tickets');
    const second = await new PicklistCache(logger, load, 'tenant-a').getFields('Tickets');
    expect(second[0].picklistValues![0].label).toBe('New');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent loads across instances', async () => {
    let resolve!: (f: FieldInfo[]) => void;
    const load = jest.fn().mockReturnValue(new Promise<FieldInfo[]>((r) => (resolve = r)));
    const a = new PicklistCache(logger, load, 'tenant-a').getFields('Tickets');
    const b = new PicklistCache(logger, load, 'tenant-a').getFields('Tickets');
    resolve(fields('New'));
    await Promise.all([a, b]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never serves one tenant\'s fields to another, or an impersonated view to the API user', async () => {
    await new PicklistCache(logger, jest.fn().mockResolvedValue(fields('A')), 'tenant-a').getFields('Tickets');
    await new PicklistCache(logger, jest.fn().mockResolvedValue(fields('A as 7')), 'tenant-a#as:7').getFields('Tickets');

    const otherTenant = jest.fn().mockResolvedValue(fields('B'));
    expect((await new PicklistCache(logger, otherTenant, 'tenant-b').getFields('Tickets'))[0].picklistValues![0].label).toBe('B');
    expect(otherTenant).toHaveBeenCalledTimes(1);

    const apiUser = await new PicklistCache(logger, jest.fn(), 'tenant-a').getFields('Tickets');
    expect(apiUser[0].picklistValues![0].label).toBe('A');
  });

  it('keeps instances without a key isolated', async () => {
    const load = jest.fn().mockResolvedValue(fields('New'));
    await new PicklistCache(logger, load).getFields('Tickets');
    await new PicklistCache(logger, load).getFields('Tickets');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load, so the next call retries', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 429'))
      .mockResolvedValueOnce(fields('New'));
    expect(await new PicklistCache(logger, load, 'tenant-a').getFields('Tickets')).toEqual([]);
    const retried = await new PicklistCache(logger, load, 'tenant-a').getFields('Tickets');
    expect(retried[0].picklistValues![0].label).toBe('New');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('refetches after the TTL', async () => {
    const load = jest.fn().mockResolvedValueOnce(fields('Old')).mockResolvedValueOnce(fields('New'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      await new PicklistCache(logger, load, 'tenant-a', 60_000).getFields('Tickets');
      now.mockReturnValue(1_000 + 60_001);
      const fresh = await new PicklistCache(logger, load, 'tenant-a', 60_000).getFields('Tickets');
      expect(fresh[0].picklistValues![0].label).toBe('New');
    } finally {
      now.mockRestore();
    }
  });
});

describe('AutotaskToolHandler', () => {
  const cacheOf = (svc: AutotaskService) =>
    (new AutotaskToolHandler(svc, logger) as unknown as { picklistCache: PicklistCache }).picklistCache;
  const service = (username: string, impersonationResourceId?: number, label = 'New') =>
    ({
      getFieldInfo: jest.fn().mockResolvedValue(fields(label)),
      getTenantKey: () => username.toLowerCase(),
      getImpersonationResourceId: () => impersonationResourceId,
    }) as unknown as AutotaskService;

  it('reuses field info across per-request handlers for the same tenant', async () => {
    const first = service('api@example.com');
    await cacheOf(first).getFields('Tickets');
    const second = service('api@example.com');
    await cacheOf(second).getFields('Tickets');
    expect(first.getFieldInfo).toHaveBeenCalledTimes(1);
    expect(second.getFieldInfo).not.toHaveBeenCalled();
  });

  it('gives an impersonated handler its own entries', async () => {
    await cacheOf(service('api@example.com')).getFields('Tickets');
    const impersonated = service('api@example.com', 42, 'Narrow');
    const got = await cacheOf(impersonated).getFields('Tickets');
    expect(impersonated.getFieldInfo).toHaveBeenCalledTimes(1);
    expect(got[0].picklistValues![0].label).toBe('Narrow');
  });
});
