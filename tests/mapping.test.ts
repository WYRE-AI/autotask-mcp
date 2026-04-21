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
    searchCompanies: jest.fn().mockResolvedValue([
      { id: 1, companyName: 'Acme Corp' },
      { id: 2, companyName: 'Widget Inc' },
    ]),
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
      expect(mockService.searchCompanies).toHaveBeenCalled();
      expect(mockService.searchResources).toHaveBeenCalled();
    });
  });

  describe('getCompanyName', () => {
    it('should return cached company name', async () => {
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const name = await instance.getCompanyName(1);
      expect(name).toBe('Acme Corp');
    });

    it('should return null for unknown company ID', async () => {
      mockService.searchCompanies.mockResolvedValueOnce([]);
      const instance = await MappingService.getInstance(mockService, mockLogger);
      const name = await instance.getCompanyName(999);
      expect(name).toBeNull();
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

  describe('pagination', () => {
    it('should paginate until all companies are fetched', async () => {
      // Simulate a tenant with 250 companies — more than one page.
      const page1 = Array.from({ length: 200 }, (_, i) => ({
        id: i + 1,
        companyName: `Company ${i + 1}`,
      }));
      const page2 = Array.from({ length: 50 }, (_, i) => ({
        id: 200 + i + 1,
        companyName: `Company ${200 + i + 1}`,
      }));
      mockService.searchCompanies
        .mockResolvedValueOnce(page1 as any)
        .mockResolvedValueOnce(page2 as any);

      const instance = await MappingService.getInstance(mockService, mockLogger);

      expect(mockService.searchCompanies).toHaveBeenCalledTimes(2);
      expect(mockService.searchCompanies).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 200 });
      expect(mockService.searchCompanies).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 200 });

      // A company past the first page must be resolvable WITHOUT direct-lookup fallback.
      const name = await instance.getCompanyName(207);
      expect(name).toBe('Company 207');
      expect((mockService as any).getCompany).toBeUndefined();
    });

    it('should stop paginating when a short page is returned', async () => {
      mockService.searchCompanies.mockResolvedValueOnce([
        { id: 1, companyName: 'Only Co' },
      ] as any);

      await MappingService.getInstance(mockService, mockLogger);

      expect(mockService.searchCompanies).toHaveBeenCalledTimes(1);
    });

    it('should NOT cache results of the direct-lookup fallback (prevents stale-name poisoning)', async () => {
      // Tenant has one company; we ask for an ID not in that cache.
      // Simulates the real-world bug: direct-get returns a stale/wrong name
      // that previously got written to cache and served to every subsequent caller.
      mockService.searchCompanies.mockResolvedValueOnce([
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
      // later paginated refresh can correct the name without stale overrides.
      expect((mockService as any).getCompany).toHaveBeenCalledTimes(2);

      const stats = instance.getCacheStats();
      expect(stats.companies.count).toBe(1); // Only the one real company from pagination
    });
  });

  describe('error handling', () => {
    it('should handle searchCompanies failure gracefully', async () => {
      mockService.searchCompanies.mockRejectedValueOnce(new Error('API error'));
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
