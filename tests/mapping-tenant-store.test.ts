/**
 * Regression tests for a gateway-timeout incident: in gateway mode a fresh
 * MappingService per request re-ran the full company pre-warm (30s+ on
 * tenants with thousands of companies) inside the tool-call response path,
 * so every call for a large tenant exceeded the gateway timeout (-32603)
 * while the Autotask API work itself succeeded.
 *
 * Fixes under test:
 *  1. Cache DATA is shared across requests per tenant (keyed by lowercased
 *     username) so the pre-warm runs once per expiry window, not per request.
 *  2. Callers block on warm-up/refresh only up to a bounded budget; past it
 *     they proceed with fallback lookups (cold) or stale entries (expired).
 *  3. Tenant isolation still holds: different tenant keys never share data
 *     (incident 2026-06-03).
 */

import { MappingService, _resetTenantCacheStore } from '../src/utils/mapping.service';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';

jest.mock('../src/services/autotask.service');

const mockLogger = new Logger('error');

function makeMockService(overrides: Partial<Record<string, jest.Mock>> = {}): jest.Mocked<AutotaskService> {
  return {
    listAllCompanies: jest.fn().mockResolvedValue([
      { id: 1, companyName: 'Acme Corp' },
      { id: 2, companyName: 'Widget Inc' },
    ]),
    searchResources: jest.fn().mockResolvedValue([
      { id: 10, firstName: 'John', lastName: 'Doe' },
    ]),
    getCompany: jest.fn().mockResolvedValue({ id: 3, companyName: 'Direct-Fetched Co' }),
    getResource: jest.fn().mockResolvedValue({ id: 10, firstName: 'John', lastName: 'Doe' }),
    ...overrides,
  } as unknown as jest.Mocked<AutotaskService>;
}

/** A promise that never resolves — simulates a 30s+ company walk. */
const hang = () => new Promise(() => { /* never settles */ });

beforeEach(() => {
  _resetTenantCacheStore();
});

describe('per-tenant shared cache store', () => {
  it('reuses warmed data across create() calls for the SAME tenant (no re-walk)', async () => {
    const svc1 = makeMockService();
    const a = await MappingService.create(svc1, mockLogger, { tenantKey: 'user@tenant-a.com' });
    expect(await a.getCompanyName(1)).toBe('Acme Corp');
    expect(svc1.listAllCompanies).toHaveBeenCalledTimes(1);

    // Simulates the next gateway request: new service + new MappingService,
    // same tenant credentials.
    const svc2 = makeMockService();
    const b = await MappingService.create(svc2, mockLogger, { tenantKey: 'USER@TENANT-A.COM' });
    expect(await b.getCompanyName(1)).toBe('Acme Corp');
    // The second request must NOT have re-run the full walk.
    expect(svc2.listAllCompanies).not.toHaveBeenCalled();
  });

  it('never shares data across DIFFERENT tenants (2026-06-03 isolation invariant)', async () => {
    const svcA = makeMockService({
      listAllCompanies: jest.fn().mockResolvedValue([{ id: 1, companyName: 'Tenant A Co' }]),
    });
    const svcB = makeMockService({
      listAllCompanies: jest.fn().mockResolvedValue([{ id: 1, companyName: 'Tenant B Co' }]),
    });

    const a = await MappingService.create(svcA, mockLogger, { tenantKey: 'user@tenant-a.com' });
    const b = await MappingService.create(svcB, mockLogger, { tenantKey: 'user@tenant-b.com' });

    expect(await a.getCompanyName(1)).toBe('Tenant A Co');
    expect(await b.getCompanyName(1)).toBe('Tenant B Co');
    expect(svcA.listAllCompanies).toHaveBeenCalledTimes(1);
    expect(svcB.listAllCompanies).toHaveBeenCalledTimes(1);
  });

  it('keeps instance-local data when no tenantKey is provided', async () => {
    const svc1 = makeMockService();
    const svc2 = makeMockService();
    await MappingService.create(svc1, mockLogger);
    await MappingService.create(svc2, mockLogger);
    // Without a key there is nothing to share — both instances walk.
    expect(svc1.listAllCompanies).toHaveBeenCalledTimes(1);
    expect(svc2.listAllCompanies).toHaveBeenCalledTimes(1);
  });
});

describe('bounded warm-up budget', () => {
  it('create() returns within the budget even when the company walk hangs', async () => {
    const svc = makeMockService({
      listAllCompanies: jest.fn().mockImplementation(hang),
      searchResources: jest.fn().mockImplementation(hang),
    });

    const started = Date.now();
    const instance = await MappingService.create(svc, mockLogger, {
      tenantKey: 'user@big-tenant.com',
      warmWaitMs: 50,
    });
    // Generous ceiling — the point is it doesn't wait for the hung walk.
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(instance).toBeInstanceOf(MappingService);
  });

  it('falls back to a direct per-ID lookup while the cold warm-up is still running', async () => {
    const svc = makeMockService({
      listAllCompanies: jest.fn().mockImplementation(hang),
      searchResources: jest.fn().mockImplementation(hang),
      getCompany: jest.fn().mockResolvedValue({ id: 7, companyName: 'Directly Fetched Co' }),
    });

    const instance = await MappingService.create(svc, mockLogger, {
      tenantKey: 'user@big-tenant.com',
      warmWaitMs: 50,
    });
    // Cache is cold (walk hung) — the name must still resolve via getCompany.
    expect(await instance.getCompanyName(7)).toBe('Directly Fetched Co');
    expect(svc.getCompany).toHaveBeenCalledWith(7);
  });

  it('serves stale entries instead of stalling when the cache has expired mid-refresh', async () => {
    // Warm normally first.
    const svc = makeMockService();
    const warmed = new MappingService(svc, mockLogger, 1 /* 1ms expiry */, false, 'user@stale.com', 50);
    await warmed.ensureInitialized();
    expect(await warmed.getCompanyName(1)).toBe('Acme Corp');

    // Expiry (1ms) has long passed; make the re-walk hang. A new request's
    // instance shares the same tenant store entry.
    const slowSvc = makeMockService({
      listAllCompanies: jest.fn().mockImplementation(hang),
      searchResources: jest.fn().mockImplementation(hang),
    });
    const next = new MappingService(slowSvc, mockLogger, 1, false, 'user@stale.com', 50);
    const started = Date.now();
    // Stale-while-revalidate: previous entries are still served.
    expect(await next.getCompanyName(1)).toBe('Acme Corp');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('a failed warm-up is not stamped valid — the next call retries the refresh', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('zone down'));
    const svc = makeMockService({
      listAllCompanies: failing,
      searchResources: jest.fn().mockRejectedValue(new Error('zone down')),
    });

    const instance = await MappingService.create(svc, mockLogger, { tenantKey: 'user@flaky.com' });
    expect(failing).toHaveBeenCalledTimes(1);

    // The failure must not have marked companies as fresh: a subsequent
    // lookup should attempt the walk again (previously initializeCache
    // stamped lastUpdated unconditionally, pinning an empty cache for 30min).
    failing.mockResolvedValue([{ id: 5, companyName: 'Recovered Co' }]);
    expect(await instance.getCompanyName(5)).toBe('Recovered Co');
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
