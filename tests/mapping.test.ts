/**
 * Unit tests for MappingService
 * Tests caching, per-instance isolation, and name resolution
 */

import { MappingService } from '../src/utils/mapping.service';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';

// Mock AutotaskService
jest.mock('../src/services/autotask.service');

const mockLogger = new Logger('error');

function createMockAutotaskService(): jest.Mocked<AutotaskService> {
  return {
    // listAllCompanies is the bulk-load path used by MappingService for the
    // company cache pre-warm. searchCompanies (the tool-facing API) is no
    // longer consulted by MappingService — see refreshCompanyCache().
    listAllCompanies: jest.fn().mockResolvedValue([
      { id: 1, companyName: 'Acme Corp' },
      { id: 2, companyName: 'Widget Inc' },
    ]),
    searchCompanies: jest.fn(),
    searchResources: jest.fn().mockResolvedValue([
      { id: 10, firstName: 'John', lastName: 'Doe' },
      { id: 20, firstName: 'Jane', lastName: 'Smith' },
    ]),
    getResource: jest.fn().mockResolvedValue(
      { id: 10, firstName: 'John', lastName: 'Doe' }
    ),
  } as unknown as jest.Mocked<AutotaskService>;
}

describe('MappingService', () => {
  let mockService: jest.Mocked<AutotaskService>;

  beforeEach(() => {
    mockService = createMockAutotaskService();
  });

  describe('create', () => {
    it('should create an instance', async () => {
      const instance = await MappingService.create(mockService, mockLogger);
      expect(instance).toBeInstanceOf(MappingService);
    });

    it('should return a DISTINCT instance on each call (no cross-tenant leak)', async () => {
      // CRITICAL invariant: every MappingService.create() MUST return a fresh
      // instance bound to the supplied AutotaskService. Sharing instances
      // across calls = sharing caches across tenants = cross-tenant data
      // leak (see incident 2026-06-03). This is the regression guard.
      const tenantA = createMockAutotaskService();
      const tenantB = createMockAutotaskService();
      const first = await MappingService.create(tenantA, mockLogger);
      const second = await MappingService.create(tenantB, mockLogger);
      expect(first).not.toBe(second);
    });

    it('should initialize cache on creation', async () => {
      await MappingService.create(mockService, mockLogger);
      expect(mockService.listAllCompanies).toHaveBeenCalled();
      expect(mockService.searchResources).toHaveBeenCalled();
    });

    it('should NOT pre-warm cache when lazyLoading is enabled', async () => {
      await MappingService.create(mockService, mockLogger, { lazyLoading: true });
      // Both cache-fill paths should be skipped entirely — neither
      // listAllCompanies nor searchResources should fire.
      expect(mockService.listAllCompanies).not.toHaveBeenCalled();
      expect(mockService.searchResources).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyName', () => {
    it('should return cached company name', async () => {
      const instance = await MappingService.create(mockService, mockLogger);
      const name = await instance.getCompanyName(1);
      expect(name).toBe('Acme Corp');
    });

    it('should return null for unknown company ID', async () => {
      mockService.listAllCompanies.mockResolvedValueOnce([]);
      const instance = await MappingService.create(mockService, mockLogger);
      const name = await instance.getCompanyName(999);
      expect(name).toBeNull();
    });

    it('should hit direct-get on every call when lazyLoading skips pre-warm', async () => {
      // With the cache intentionally empty, getCompanyName must fall through
      // to the per-ID direct-get path and consult it on every call (since
      // direct-get results aren't written back to the cache).
      (mockService as any).getCompany = jest
        .fn()
        .mockResolvedValue({ id: 42, companyName: 'Lazy Lookup Co' });
      const instance = await MappingService.create(mockService, mockLogger, {
        lazyLoading: true,
      });

      const first = await instance.getCompanyName(42);
      const second = await instance.getCompanyName(42);
      expect(first).toBe('Lazy Lookup Co');
      expect(second).toBe('Lazy Lookup Co');
      expect((mockService as any).getCompany).toHaveBeenCalledTimes(2);
    });
  });

  describe('getResourceName', () => {
    it('should return cached resource name', async () => {
      const instance = await MappingService.create(mockService, mockLogger);
      const name = await instance.getResourceName(10);
      expect(name).toBe('John Doe');
    });

    it('should fallback to direct lookup for uncached resources', async () => {
      mockService.getResource.mockResolvedValueOnce(
        { id: 30, firstName: 'Bob', lastName: 'Jones' } as any
      );
      const instance = await MappingService.create(mockService, mockLogger);
      const name = await instance.getResourceName(30);
      expect(name).toBe('Bob Jones');
    });

    it('should return null when resource endpoint is unavailable', async () => {
      mockService.searchResources.mockResolvedValueOnce([]);
      const instance = await MappingService.create(mockService, mockLogger);
      // Empty cache means endpoint is unavailable - should return null without direct lookup
      const name = await instance.getResourceName(99);
      expect(name).toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('should report cache statistics', async () => {
      const instance = await MappingService.create(mockService, mockLogger);
      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(2);
      expect(stats.resources.count).toBe(2);
      expect(stats.companies.isValid).toBe(true);
      expect(stats.resources.isValid).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      const instance = await MappingService.create(mockService, mockLogger);
      instance.clearCache();
      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(0);
      expect(stats.resources.count).toBe(0);
    });
  });

  describe('bulk-load company cache', () => {
    // Cursor pagination is owned by http.query (covered in autotask-service
    // tests). At this layer we only verify that MappingService receives the
    // full result set from listAllCompanies — without re-asserting an outer
    // pagination loop that no longer exists (issue #101).

    it('should populate the cache with every company returned by listAllCompanies', async () => {
      // Simulate a tenant with 250 companies — more than one underlying API
      // page. http.query (inside listAllCompanies) walks Autotask's cursor
      // internally and returns a single flat array.
      const all = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        companyName: `Company ${i + 1}`,
      }));
      mockService.listAllCompanies.mockResolvedValueOnce(all as any);

      const instance = await MappingService.create(mockService, mockLogger);

      expect(mockService.listAllCompanies).toHaveBeenCalledTimes(1);

      // A company past the legacy first-page boundary must be resolvable
      // WITHOUT direct-lookup fallback — proves no off-by-one truncation.
      const name = await instance.getCompanyName(207);
      expect(name).toBe('Company 207');
      expect((mockService as any).getCompany).toBeUndefined();

      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(250);
    });

    it('should handle a single-page tenant cleanly', async () => {
      mockService.listAllCompanies.mockResolvedValueOnce([
        { id: 1, companyName: 'Only Co' },
      ] as any);

      await MappingService.create(mockService, mockLogger);

      expect(mockService.listAllCompanies).toHaveBeenCalledTimes(1);
    });

    it('should NOT cache results of the direct-lookup fallback (prevents stale-name poisoning)', async () => {
      // Tenant has one company; we ask for an ID not in that cache.
      // Simulates the real-world bug: direct-get returns a stale/wrong name
      // that previously got written to cache and served to every subsequent caller.
      mockService.listAllCompanies.mockResolvedValueOnce([
        { id: 1, companyName: 'Acme Corp' },
      ] as any);
      (mockService as any).getCompany = jest
        .fn()
        .mockResolvedValue({ id: 207, companyName: 'Stale Name From Direct Get' });

      const instance = await MappingService.create(mockService, mockLogger);

      const first = await instance.getCompanyName(207);
      const second = await instance.getCompanyName(207);
      expect(first).toBe('Stale Name From Direct Get');
      expect(second).toBe('Stale Name From Direct Get');

      // The fallback MUST be consulted on every call (not cached) so that a
      // later cache refresh can correct the name without stale overrides.
      expect((mockService as any).getCompany).toHaveBeenCalledTimes(2);

      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(1); // Only the one real company from listAllCompanies
    });
  });

  describe('error handling', () => {
    it('should handle listAllCompanies failure gracefully', async () => {
      mockService.listAllCompanies.mockRejectedValueOnce(new Error('API error'));
      const instance = await MappingService.create(mockService, mockLogger);
      // Should still be instantiated, just with empty company cache
      expect(instance).toBeInstanceOf(MappingService);
    });

    it('should handle 405 from resources endpoint', async () => {
      const error = new Error('Method Not Allowed') as any;
      error.response = { status: 405 };
      mockService.searchResources.mockRejectedValueOnce(error);
      const instance = await MappingService.create(mockService, mockLogger);
      const stats = instance.getCacheStats();
      expect(stats.resources.count).toBe(0);
      // Cache should still be marked as valid (prevents retry loops)
      expect(stats.resources.isValid).toBe(true);
    });
  });

  // Regression coverage for the 2026-06-03 cross-tenant data-leak incident.
  // The old static-singleton `getInstance()` bound the first caller's
  // AutotaskService to a class-level promise; every later caller — possibly a
  // different tenant — received that same instance and read that tenant's
  // company / resource names. Every test below MUST pass with each
  // MappingService.create() returning a fresh, fully-isolated instance.
  describe('tenant isolation (cross-tenant leak regression)', () => {
    function tenantService(prefix: string): jest.Mocked<AutotaskService> {
      return {
        listAllCompanies: jest.fn().mockResolvedValue([
          { id: 1, companyName: `${prefix}-Company-1` },
          { id: 2, companyName: `${prefix}-Company-2` },
        ]),
        searchCompanies: jest.fn(),
        searchResources: jest.fn().mockResolvedValue([
          { id: 10, firstName: prefix, lastName: 'Engineer' },
        ]),
        getResource: jest.fn(),
        getCompany: jest.fn(),
      } as unknown as jest.Mocked<AutotaskService>;
    }

    it('returns independent instances for two distinct tenants', async () => {
      const aSvc = tenantService('A');
      const bSvc = tenantService('B');
      const a = await MappingService.create(aSvc, mockLogger);
      const b = await MappingService.create(bSvc, mockLogger);

      expect(await a.getCompanyName(1)).toBe('A-Company-1');
      expect(await b.getCompanyName(1)).toBe('B-Company-1');
      expect(await a.getResourceName(10)).toBe('A Engineer');
      expect(await b.getResourceName(10)).toBe('B Engineer');
    });

    it('does NOT cross-pollute resource cache between tenants under concurrent init', async () => {
      // Simulates the original race: Tenant A and Tenant B initializing
      // their MappingServices concurrently. Each MUST resolve names from
      // its OWN AutotaskService — no caller may see the other tenant's data.
      const aSvc = tenantService('TenantA');
      const bSvc = tenantService('TenantB');

      const [a, b] = await Promise.all([
        MappingService.create(aSvc, mockLogger),
        MappingService.create(bSvc, mockLogger),
      ]);

      const [aName, bName] = await Promise.all([
        a.getResourceName(10),
        b.getResourceName(10),
      ]);
      expect(aName).toBe('TenantA Engineer');
      expect(bName).toBe('TenantB Engineer');
      expect(aSvc.searchResources).toHaveBeenCalled();
      expect(bSvc.searchResources).toHaveBeenCalled();
    });

    it('clearing one tenant\'s cache does not affect another tenant', async () => {
      const aSvc = tenantService('A');
      const bSvc = tenantService('B');
      const a = await MappingService.create(aSvc, mockLogger);
      const b = await MappingService.create(bSvc, mockLogger);

      a.clearCache();
      expect(a.getCacheStats().companies.count).toBe(0);
      expect(b.getCacheStats().companies.count).toBe(2);
      expect(await b.getCompanyName(1)).toBe('B-Company-1');
    });

    it('many concurrent tenants each see only their own data', async () => {
      // High-fan-out version of the race: 10 tenants initialize in parallel,
      // then each queries the SAME company ID. Every response must reflect
      // ONLY that tenant's data — never another tenant's.
      const tenants = Array.from({ length: 10 }, (_, i) => ({
        id: `T${i}`,
        svc: tenantService(`T${i}`),
      }));

      const instances = await Promise.all(
        tenants.map((t) => MappingService.create(t.svc, mockLogger))
      );

      const names = await Promise.all(
        instances.map((m) => m.getCompanyName(1))
      );

      names.forEach((name, i) => {
        expect(name).toBe(`T${i}-Company-1`);
      });
    });
  });
});
