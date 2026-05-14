/**
 * Unit tests for MappingService
 * Tests caching, singleton behavior, and name resolution
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
    // Reset the singleton between tests
    (MappingService as any).initPromise = null;
    mockService = createMockAutotaskService();
  });

  describe('getInstance', () => {
    it('should create a singleton instance', async () => {
      const instance = await MappingService.getInstance(mockService, mockLogger);
      expect(instance).toBeInstanceOf(MappingService);
    });

    it('should return the same instance on subsequent calls', async () => {
      const first = await MappingService.getInstance(mockService, mockLogger);
      const second = await MappingService.getInstance(mockService, mockLogger);
      expect(first).toBe(second);
    });

    it('should initialize cache on creation', async () => {
      await MappingService.getInstance(mockService, mockLogger);
      expect(mockService.listAllCompanies).toHaveBeenCalled();
      expect(mockService.searchResources).toHaveBeenCalled();
    });

    it('should NOT pre-warm cache when lazyLoading is enabled', async () => {
      await MappingService.getInstance(mockService, mockLogger, { lazyLoading: true });
      // Both cache-fill paths should be skipped entirely — neither
      // listAllCompanies nor searchResources should fire.
      expect(mockService.listAllCompanies).not.toHaveBeenCalled();
      expect(mockService.searchResources).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyName', () => {
    it('should return cached company name', async () => {
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const name = await instance.getCompanyName(1);
      expect(name).toBe('Acme Corp');
    });

    it('should return null for unknown company ID', async () => {
      mockService.listAllCompanies.mockResolvedValueOnce([]);
      const instance = await MappingService.getInstance(mockService, mockLogger);
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
      const instance = await MappingService.getInstance(mockService, mockLogger, {
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
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const name = await instance.getResourceName(10);
      expect(name).toBe('John Doe');
    });

    it('should fallback to direct lookup for uncached resources', async () => {
      mockService.getResource.mockResolvedValueOnce(
        { id: 30, firstName: 'Bob', lastName: 'Jones' } as any
      );
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const name = await instance.getResourceName(30);
      expect(name).toBe('Bob Jones');
    });

    it('should return null when resource endpoint is unavailable', async () => {
      mockService.searchResources.mockResolvedValueOnce([]);
      const instance = await MappingService.getInstance(mockService, mockLogger);
      // Empty cache means endpoint is unavailable - should return null without direct lookup
      const name = await instance.getResourceName(99);
      expect(name).toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('should report cache statistics', async () => {
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(2);
      expect(stats.resources.count).toBe(2);
      expect(stats.companies.isValid).toBe(true);
      expect(stats.resources.isValid).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached data', async () => {
      const instance = await MappingService.getInstance(mockService, mockLogger);
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

      const instance = await MappingService.getInstance(mockService, mockLogger);

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

      await MappingService.getInstance(mockService, mockLogger);

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

      const instance = await MappingService.getInstance(mockService, mockLogger);

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
      const instance = await MappingService.getInstance(mockService, mockLogger);
      // Should still be instantiated, just with empty company cache
      expect(instance).toBeInstanceOf(MappingService);
    });

    it('should handle 405 from resources endpoint', async () => {
      const error = new Error('Method Not Allowed') as any;
      error.response = { status: 405 };
      mockService.searchResources.mockRejectedValueOnce(error);
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const stats = instance.getCacheStats();
      expect(stats.resources.count).toBe(0);
      // Cache should still be marked as valid (prevents retry loops)
      expect(stats.resources.isValid).toBe(true);
    });
  });
});
