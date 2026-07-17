// Autotask Service Tests
// Tests for the AutotaskService wrapper

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskService, MATCH_ALL } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

const mockConfig: McpServerConfig = {
  name: 'test-server',
  version: '1.0.0',
  autotask: {
    username: 'test-username',
    secret: 'test-secret', 
    integrationCode: 'test-integration-code'
  }
};

// Create a proper mock logger
const mockLogger = new Logger('error'); // Use error level to suppress logs during tests

/**
 * Build a minimal Response-like object for mocking global fetch. The
 * AutotaskHttpClient reads `.ok`, `.status`, and `.text()` (it parses JSON
 * from the text), so we only need those three.
 */
function jsonResponse(body: any, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('AutotaskService', () => {
  test('should be instantiable', () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    expect(service).toBeInstanceOf(AutotaskService);
    expect(mockConfig.name).toBe('test-server');
  });

  test('should validate required configuration', async () => {
    const invalidConfig = { ...mockConfig };
    delete invalidConfig.autotask.username;
    
    const service = new AutotaskService(invalidConfig, mockLogger);
    await expect(service.initialize()).rejects.toThrow('Missing required Autotask credentials');
  });

  test('should handle connection failure gracefully', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const result = await service.testConnection();
    expect(result).toBe(false);
  });

  test('should have all expected methods', () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    
    // Test presence of key methods
    expect(typeof service.getCompany).toBe('function');
    expect(typeof service.searchCompanies).toBe('function');
    expect(typeof service.createCompany).toBe('function');
    expect(typeof service.updateCompany).toBe('function');
    
    expect(typeof service.getContact).toBe('function');
    expect(typeof service.searchContacts).toBe('function');
    expect(typeof service.createContact).toBe('function');
    expect(typeof service.updateContact).toBe('function');
    
    expect(typeof service.getTicket).toBe('function');
    expect(typeof service.searchTickets).toBe('function');
    expect(typeof service.createTicket).toBe('function');
    expect(typeof service.updateTicket).toBe('function');
    
    expect(typeof service.createTimeEntry).toBe('function');
    expect(typeof service.getTimeEntries).toBe('function');
    
    expect(typeof service.getProject).toBe('function');
    expect(typeof service.searchProjects).toBe('function');
    expect(typeof service.createProject).toBe('function');
    expect(typeof service.updateProject).toBe('function');
    
    expect(typeof service.getResource).toBe('function');
    expect(typeof service.searchResources).toBe('function');
    
    expect(typeof service.getConfigurationItem).toBe('function');
    expect(typeof service.searchConfigurationItems).toBe('function');
    expect(typeof service.createConfigurationItem).toBe('function');
    expect(typeof service.updateConfigurationItem).toBe('function');
    
    expect(typeof service.getContract).toBe('function');
    expect(typeof service.searchContracts).toBe('function');
    
    expect(typeof service.getInvoice).toBe('function');
    expect(typeof service.searchInvoices).toBe('function');
    expect(typeof service.getInvoiceDetails).toBe('function');
    
    expect(typeof service.getTask).toBe('function');
    expect(typeof service.searchTasks).toBe('function');
    expect(typeof service.createTask).toBe('function');
    expect(typeof service.updateTask).toBe('function');
    
    expect(typeof service.testConnection).toBe('function');

    expect(typeof service.getCompanySiteConfigurations).toBe('function');
    expect(typeof service.updateCompanySiteConfiguration).toBe('function');
  });

  describe('Company Site Configurations', () => {
    test('getCompanySiteConfigurations should propagate errors when client cannot connect', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      await expect(service.getCompanySiteConfigurations(123)).rejects.toThrow();
    });

    test('updateCompanySiteConfiguration should propagate errors when client cannot connect', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      await expect(service.updateCompanySiteConfiguration(456, { someField: 'value' })).rejects.toThrow();
    });
  });

  // Tests for new entity methods
  describe('New Entity Methods', () => {
    test('should handle notes methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      
      // Test ticket notes
      await expect(service.getTicketNote(123, 456)).rejects.toThrow();
      await expect(service.searchTicketNotes(123)).rejects.toThrow();
      await expect(service.createTicketNote(123, { title: 'Test', description: 'Test note' })).rejects.toThrow();
      
      // Test project notes
      await expect(service.getProjectNote(123, 456)).rejects.toThrow();
      await expect(service.searchProjectNotes(123)).rejects.toThrow();
      await expect(service.createProjectNote(123, { title: 'Test', description: 'Test note' })).rejects.toThrow();
      
      // Test company notes
      await expect(service.getCompanyNote(123, 456)).rejects.toThrow();
      await expect(service.searchCompanyNotes(123)).rejects.toThrow();
      await expect(service.createCompanyNote(123, { title: 'Test', description: 'Test note' })).rejects.toThrow();
    });

    test('should expose ticket checklist item CRUD methods', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      expect(typeof service.searchTicketChecklistItems).toBe('function');
      expect(typeof service.createTicketChecklistItem).toBe('function');
      expect(typeof service.updateTicketChecklistItem).toBe('function');
      expect(typeof service.deleteTicketChecklistItem).toBe('function');

      // With the mocked client failing to initialize, every call should reject.
      await expect(service.searchTicketChecklistItems(123)).rejects.toThrow();
      await expect(service.createTicketChecklistItem(123, { itemName: 'Step 1' })).rejects.toThrow();
      await expect(service.updateTicketChecklistItem(123, 456, { isCompleted: true })).rejects.toThrow();
      await expect(service.deleteTicketChecklistItem(123, 456)).rejects.toThrow();
    });

    test('should expose ticket history methods and require ticketId for search', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      expect(typeof service.getTicketHistory).toBe('function');
      expect(typeof service.searchTicketHistory).toBe('function');

      // Friendly guard fires before any HTTP attempt — verifies we don't leak
      // a generic 400 from Autotask when the caller forgets ticketId.
      await expect(service.searchTicketHistory({})).rejects.toThrow(/ticketId is required/);

      // With the mocked client failing to initialize, real calls should reject.
      await expect(service.getTicketHistory(456)).rejects.toThrow();
      await expect(service.searchTicketHistory({ ticketId: 123 })).rejects.toThrow();
    });

    test('should handle attachment methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getTicketAttachment(123, 456)).rejects.toThrow();
      await expect(service.searchTicketAttachments(123)).rejects.toThrow();
    });

    describe('getTicketAttachment endpoint routing', () => {
      // Real-looking apiUrl bypasses the HTTP client's zone auto-detect.
      const configWithUrl: McpServerConfig = {
        name: 'test-server',
        version: '1.0.0',
        autotask: {
          username: 'test-username',
          secret: 'test-secret',
          integrationCode: 'test-integration-code',
          apiUrl: 'https://example.autotask.net/atservicesrest/',
        },
      };
      let service: AutotaskService;

      beforeEach(() => {
        service = new AutotaskService(configWithUrl, mockLogger);
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      test('includeData=false hits the child endpoint and returns metadata only', async () => {
        const fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ item: { id: 456, ticketID: 123, fileName: 'a.pdf', fileSize: 100 } }));

        const r = await service.getTicketAttachment(123, 456);

        expect(r).toEqual({ id: 456, ticketID: 123, fileName: 'a.pdf', fileSize: 100 });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        // Child endpoint — never returns the binary `data` field
        expect(url).toBe('https://example.autotask.net/atservicesrest/v1.0/Tickets/123/Attachments/456');
      });

      test('includeData=true hits the top-level entity endpoint and returns data', async () => {
        const smallBase64 = Buffer.from('hello').toString('base64');
        const fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ item: { id: 456, ticketID: 123, fileName: 'a.pdf', data: smallBase64 } }));

        const r = await service.getTicketAttachment(123, 456, { includeData: true });

        expect(r?.data).toBe(smallBase64);
        expect(r?.dataOmittedReason).toBeUndefined();
        const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
        // Top-level entity endpoint — the only one that populates `data`
        expect(url).toBe('https://example.autotask.net/atservicesrest/v1.0/TicketAttachments/456');
      });

      test('includeData=true strips oversized data and surfaces dataOmittedReason', async () => {
        // Build a base64 string above the 750_000-byte default cap
        const big = 'A'.repeat(1_000_000);
        jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ item: { id: 456, ticketID: 123, fileName: 'big.bin', data: big } }));

        const r = await service.getTicketAttachment(123, 456, { includeData: true });

        expect(r).not.toBeNull();
        expect(r?.data).toBeUndefined();
        expect(r?.dataOmittedReason).toMatch(/exceeds inline limit/);
        expect(r?.fileName).toBe('big.bin');
      });

      test('includeData=true returns null when attachment belongs to a different ticket', async () => {
        jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ item: { id: 456, ticketID: 999, fileName: 'a.pdf' } }));

        // Caller asked for ticket 123, but attachment 456 belongs to ticket 999.
        // Must not leak it across tickets.
        const r = await service.getTicketAttachment(123, 456, { includeData: true });
        expect(r).toBeNull();
      });

      test('includeData=true respects a higher maxInlineBase64Bytes', async () => {
        const data = 'A'.repeat(1_000_000);
        jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ item: { id: 456, ticketID: 123, fileName: 'big.bin', data } }));

        // Raise the cap so this exact payload fits.
        const r = await service.getTicketAttachment(123, 456, {
          includeData: true,
          maxInlineBase64Bytes: 2_000_000,
        });
        expect(r?.data).toBe(data);
        expect(r?.dataOmittedReason).toBeUndefined();
      });
    });

    describe('createTicketAttachment', () => {
      const validBase64 = Buffer.from('hello world').toString('base64');

      test('rejects invalid base64 before any HTTP call', async () => {
        const service = new AutotaskService(mockConfig, mockLogger);
        // Spy to ensure ensureClient is never reached
        const ensureSpy = jest
          .spyOn(service as any, 'ensureClient')
          .mockResolvedValue({ axios: { post: jest.fn() } });

        await expect(
          service.createTicketAttachment(123, {
            title: 'bad.bin',
            fullPath: 'bad.bin',
            data: 'not*valid*base64!!!'
          })
        ).rejects.toThrow(/not valid base64/);

        expect(ensureSpy).not.toHaveBeenCalled();
      });

      test('rejects oversized attachments before any HTTP call', async () => {
        const service = new AutotaskService(mockConfig, mockLogger);
        const ensureSpy = jest
          .spyOn(service as any, 'ensureClient')
          .mockResolvedValue({ axios: { post: jest.fn() } });

        // 4 MB of zero bytes, base64-encoded
        const big = Buffer.alloc(4 * 1024 * 1024).toString('base64');
        await expect(
          service.createTicketAttachment(123, {
            title: 'huge.bin',
            fullPath: 'huge.bin',
            data: big
          })
        ).rejects.toThrow(/exceeds the Autotask 3MB/);

        expect(ensureSpy).not.toHaveBeenCalled();
      });

      test('happy path posts to /Tickets/{id}/Attachments and returns itemId', async () => {
        // Build a fresh config — earlier tests mutate mockConfig.autotask by
        // deleting fields, so we can't spread from it here.
        const configWithUrl: McpServerConfig = {
          name: 'test-server',
          version: '1.0.0',
          autotask: {
            username: 'test-username',
            secret: 'test-secret',
            integrationCode: 'test-integration-code',
            apiUrl: 'https://example.autotask.net/atservicesrest/',
          },
        };
        const service = new AutotaskService(configWithUrl, mockLogger);

        const fetchSpy = jest
          .spyOn(globalThis, 'fetch')
          .mockResolvedValue(jsonResponse({ itemId: 987 }));

        try {
          const id = await service.createTicketAttachment(555, {
            title: 'readme.txt',
            fullPath: 'readme.txt',
            data: validBase64,
            contentType: 'text/plain',
            publish: 1,
          });

          expect(id).toBe(987);
          expect(fetchSpy).toHaveBeenCalledTimes(1);
          const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
          expect(url).toBe('https://example.autotask.net/atservicesrest/v1.0/Tickets/555/Attachments');
          expect(init.method).toBe('POST');
          const headers = init.headers as Record<string, string>;
          expect(headers.ApiIntegrationcode).toBe('test-integration-code');
          expect(headers.UserName).toBe('test-username');
          expect(headers.Secret).toBe('test-secret');
          const body = JSON.parse(init.body as string);
          expect(body.title).toBe('readme.txt');
          expect(body.fullPath).toBe('readme.txt');
          expect(body.data).toBe(validBase64);
          expect(body.attachmentType).toBe('FILE_ATTACHMENT');
          expect(body.publish).toBe(1);
          expect(body.parentId).toBe(555);
        } finally {
          fetchSpy.mockRestore();
        }
      });
    });

    test('should handle expense methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      
      await expect(service.getExpenseReport(123)).rejects.toThrow();
      await expect(service.searchExpenseReports()).rejects.toThrow();
      await expect(service.createExpenseReport({ name: 'Test Report', submitterID: 123 })).rejects.toThrow();
      
      // Expense items
      await expect(service.getExpenseItem(456)).rejects.toThrow();
      await expect(service.searchExpenseItems()).rejects.toThrow();
      await expect(service.createExpenseItem({ description: 'Test', expenseDate: '2024-01-01', expenseCurrencyExpenseAmount: 100 })).rejects.toThrow();
    });

    test('should handle quote methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      
      await expect(service.getQuote(123)).rejects.toThrow();
      await expect(service.searchQuotes()).rejects.toThrow();
      await expect(service.createQuote({ name: 'Test Quote', companyID: 123 })).rejects.toThrow();
    });

    test('should handle opportunity methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getOpportunity(123)).rejects.toThrow();
      await expect(service.searchOpportunities()).rejects.toThrow();
    });

    test('should handle product methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getProduct(123)).rejects.toThrow();
      await expect(service.searchProducts()).rejects.toThrow();
    });

    test('should handle service methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getService(123)).rejects.toThrow();
      await expect(service.searchServices()).rejects.toThrow();
    });

    test('should handle service bundle methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getServiceBundle(123)).rejects.toThrow();
      await expect(service.searchServiceBundles()).rejects.toThrow();
    });

    test('should handle quote item methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      await expect(service.getQuoteItem(123)).rejects.toThrow();
      await expect(service.searchQuoteItems()).rejects.toThrow();
      await expect(service.createQuoteItem({ quoteID: 1, quantity: 5 })).rejects.toThrow();
      await expect(service.updateQuoteItem(123, { quantity: 10 })).rejects.toThrow();
      await expect(service.deleteQuoteItem(1, 123)).rejects.toThrow();
    });

    test('should handle billing code methods (now implemented, require credentials)', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      // Billing codes are now implemented via client.financial.billingCodes
      // Without credentials they throw a credentials error
      await expect(service.getBillingCode(123)).rejects.toThrow();
      await expect(service.searchBillingCodes()).rejects.toThrow();
    });

    test('should handle unsupported entity methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);

      // Departments are still not directly available
      await expect(service.getDepartment(123)).rejects.toThrow('Departments API not directly available');
      await expect(service.searchDepartments()).rejects.toThrow('Departments API not directly available');
    });
  });

  describe('Invoice details and billing item filters', () => {
    // Config with an explicit apiUrl so AutotaskHttpClient skips the
    // unauthenticated zoneInformation lookup and goes straight to the
    // entity endpoints we're stubbing below.
    // Fresh config (don't spread mockConfig — other tests mutate its autotask fields).
    const configWithUrl: McpServerConfig = {
      name: 'test-server',
      version: '1.0.0',
      autotask: {
        username: 'test-username',
        secret: 'test-secret',
        integrationCode: 'test-integration-code',
        apiUrl: 'https://example.autotask.net/atservicesrest/',
      },
    };
    const BASE = 'https://example.autotask.net/atservicesrest/v1.0';

    /**
     * Install a fetch stub that dispatches on (method, url) to a handler.
     * Returns the spy so tests can inspect calls. Always restored via
     * afterEach below.
     */
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    afterEach(() => {
      if (fetchSpy) fetchSpy.mockRestore();
    });

    test('getInvoiceDetails fetches invoice then queries BillingItems by invoiceID', async () => {
      const invoice = { id: 42, invoiceNumber: 'INV-42', totalAmount: 100 };
      const lineItems = [
        { id: 1, invoiceID: 42, itemName: 'Labor', extendedPrice: 80 },
        { id: 2, invoiceID: 42, itemName: 'Parts', extendedPrice: 20 },
      ];

      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();

        if (method === 'GET' && url === `${BASE}/Invoices/42`) {
          return jsonResponse({ item: invoice });
        }
        if (method === 'POST' && url === `${BASE}/BillingItems/query`) {
          const body = JSON.parse(init!.body as string);
          expect(body.filter).toContainEqual({ op: 'eq', field: 'invoiceID', value: 42 });
          return jsonResponse({ items: lineItems, pageDetails: { nextPageUrl: null } });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const result = await service.getInvoiceDetails(42);

      expect(result?.id).toBe(42);
      expect(result?.lineItems).toHaveLength(2);
      expect(result?.lineItems?.[0].itemName).toBe('Labor');
    });

    test('getInvoiceDetails returns empty lineItems when BillingItems query fails', async () => {
      const invoice = { id: 7, invoiceNumber: 'INV-7' };

      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();

        if (method === 'GET' && url === `${BASE}/Invoices/7`) {
          return jsonResponse({ item: invoice });
        }
        if (method === 'POST' && url === `${BASE}/BillingItems/query`) {
          // Simulate Autotask returning a hard failure for the line items query.
          return jsonResponse({ errors: ['billing items unavailable'] }, 500);
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const result = await service.getInvoiceDetails(7);

      // Service swallows the BillingItems failure and returns the invoice
      // with an empty lineItems array (see getInvoiceDetails implementation).
      expect(result?.id).toBe(7);
      expect(result?.lineItems).toEqual([]);
    });

    test('searchBillingItems translates isInvoiced and date range into filter body', async () => {
      let capturedBody: any;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        expect(url).toBe(`${BASE}/BillingItems/query`);
        expect((init?.method || 'GET').toUpperCase()).toBe('POST');
        capturedBody = JSON.parse(init!.body as string);
        return jsonResponse({ items: [], pageDetails: { nextPageUrl: null } });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchBillingItems({
        isInvoiced: false,
        ticketId: 555,
        projectId: 777,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      const filters = capturedBody.filter;
      expect(filters).toContainEqual({ op: 'notExist', field: 'invoiceID' });
      expect(filters).toContainEqual({ op: 'eq', field: 'ticketID', value: 555 });
      expect(filters).toContainEqual({ op: 'eq', field: 'projectID', value: 777 });
      expect(filters).toContainEqual({ op: 'gte', field: 'itemDate', value: '2026-01-01' });
      expect(filters).toContainEqual({ op: 'lte', field: 'itemDate', value: '2026-01-31' });
    });

    test('searchBillingItems emits exist filter when isInvoiced=true', async () => {
      let capturedBody: any;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        capturedBody = JSON.parse(init!.body as string);
        return jsonResponse({ items: [], pageDetails: { nextPageUrl: null } });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchBillingItems({ isInvoiced: true } as any);

      expect(capturedBody.filter).toContainEqual({ op: 'exist', field: 'invoiceID' });
    });

    // ---- Company search pagination (regression: issue #101) ----

    test('searchCompanies defaults to page 1 / pageSize 25 when called with no args', async () => {
      // Closes the patch-coverage gap on the new `Math.max(1, options.page || 1)`
      // line: the truthy-page path is exercised by the test below; this covers
      // the default-page fallback. Also exercises the falsy-pageSize fallback
      // for completeness.
      let capturedMaxRecords: number | undefined;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        const body = JSON.parse(init!.body as string);
        capturedMaxRecords = body.MaxRecords;
        return jsonResponse({
          items: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, companyName: `Co ${i + 1}` })),
          pageDetails: { nextPageUrl: null },
        });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const result = await service.searchCompanies();

      // page=1, pageSize=25 (defaults) → targetEnd=25, slice(0, 25)
      expect(result).toHaveLength(25);
      expect(result[0].id).toBe(1);
      expect(capturedMaxRecords).toBe(25);
    });

    test('searchCompanies applies searchTerm and isActive filters', async () => {
      // Covers the filter-building branches on lines 134/137, plus the
      // `filters.length > 0 ? filters : MATCH_ALL` ternary truthy path.
      let capturedFilters: any;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        capturedFilters = JSON.parse(init!.body as string).filter;
        return jsonResponse({ items: [], pageDetails: { nextPageUrl: null } });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchCompanies({ searchTerm: 'Acme', isActive: true });

      expect(capturedFilters).toContainEqual({ op: 'contains', field: 'companyName', value: 'Acme' });
      expect(capturedFilters).toContainEqual({ op: 'eq', field: 'isActive', value: true });
    });

    test('searchCompanies honors page by slicing over http.query cursor pagination', async () => {
      // Simulate a tenant whose /Companies/query endpoint returns:
      //   - first POST  → 200 items + nextPageUrl
      //   - second POST → 200 items + nextPageUrl
      //   - third POST  → 100 items, no nextPage
      // Autotask's cursor pagination requires POST on nextPageUrl (a GET 405s).
      const totalRecords = 500;
      const buildBatch = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          companyName: `Company ${start + i}`,
        }));
      let callIndex = 0;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'POST' && url === `${BASE}/Companies/query`) {
          callIndex = 1;
          return jsonResponse({
            items: buildBatch(1, 200),
            pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=2` },
          });
        }
        if (method === 'POST' && url.includes('Companies/query?page=2')) {
          callIndex = 2;
          return jsonResponse({
            items: buildBatch(201, 200),
            pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=3` },
          });
        }
        if (method === 'POST' && url.includes('Companies/query?page=3')) {
          callIndex = 3;
          return jsonResponse({
            items: buildBatch(401, 100),
            pageDetails: { nextPageUrl: null },
          });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);

      // page 2, pageSize 200 → callers expect IDs 201..400.
      const result = await service.searchCompanies({ page: 2, pageSize: 200 });
      expect(result).toHaveLength(200);
      expect(result[0].id).toBe(201);
      expect(result[result.length - 1].id).toBe(400);
      // http.query walked the cursor 2× (enough for the target slice), not all 3 pages.
      expect(callIndex).toBeGreaterThanOrEqual(2);
      void totalRecords;
    });

    test('listAllCompanies returns every record across all pages without slicing', async () => {
      // Same 3-page tenant as above — listAllCompanies should return all 500.
      const buildBatch = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          companyName: `Company ${start + i}`,
        }));
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'POST' && url === `${BASE}/Companies/query`) {
          return jsonResponse({
            items: buildBatch(1, 200),
            pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=2` },
          });
        }
        if (method === 'POST' && url.includes('Companies/query?page=2')) {
          return jsonResponse({
            items: buildBatch(201, 200),
            pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=3` },
          });
        }
        if (method === 'POST' && url.includes('Companies/query?page=3')) {
          return jsonResponse({
            items: buildBatch(401, 100),
            pageDetails: { nextPageUrl: null },
          });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const all = await service.listAllCompanies();
      expect(all).toHaveLength(500);
      expect(all[0].id).toBe(1);
      expect(all[499].id).toBe(500);
    });

    test('cursor pagination POSTs the nextPageUrl with the filter body (not GET)', async () => {
      // Regression: Autotask returns nextPageUrl as `/query/next?paging=...`,
      // which only accepts POST with the original filter body. A GET returns
      // HTTP 405 and truncates results to the first page.
      const calls: Array<{ method: string; url: string; body: any }> = [];
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        calls.push({ method, url, body });
        if (url.endsWith('/Companies/query')) {
          return jsonResponse({
            items: [{ id: 1, companyName: 'A' }],
            pageDetails: { nextPageUrl: `${BASE}/Companies/query/next?paging=abc` },
          });
        }
        // The next-page request — must be POST; a GET here would mean the bug.
        if (method !== 'POST') {
          return new Response('{"Message":"The requested resource does not support http method \'GET\'."}', { status: 405 });
        }
        return jsonResponse({ items: [{ id: 2, companyName: 'B' }], pageDetails: { nextPageUrl: null } });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const all = await service.listAllCompanies();

      expect(all.map(c => c.id)).toEqual([1, 2]);
      const nextCall = calls.find(c => c.url.includes('/query/next'));
      expect(nextCall?.method).toBe('POST');
      expect(nextCall?.body).toHaveProperty('filter');
    });

    test('listAllCompanies warns and returns when maxRecords cap is hit', async () => {
      const buildBatch = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          companyName: `Company ${start + i}`,
        }));
      // Endless cursor — every page returns 200 + a next link. Without the cap
      // we'd loop forever; the cap forces termination.
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        const m = url.match(/page=(\d+)/);
        const page = m ? parseInt(m[1], 10) : 1;
        return jsonResponse({
          items: buildBatch((page - 1) * 200 + 1, 200),
          pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=${page + 1}` },
        });
        void method;
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const warnSpy = jest.spyOn(mockLogger, 'warn');
      const all = await service.listAllCompanies(400);

      expect(all).toHaveLength(400);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('hit maxRecords cap'));
      warnSpy.mockRestore();
    });

    // ---- Per-page MaxRecords clamping (regression: listAllCompanies HTTP 500) ----

    test('listAllCompanies clamps per-page MaxRecords to <=500 even when total cap is large', async () => {
      // Without clamping, `listAllCompanies()` (default cap 20_000) would
      // send `MaxRecords: 20000` in the request body, which Autotask rejects
      // with HTTP 500 "maxCountOfRecordsToReturn must be between 1 and 500".
      // The fix is to separate the caller's TOTAL cap (used as a stop
      // condition while walking pageDetails.nextPageUrl) from the PER-PAGE
      // size sent to the API.
      const capturedMaxRecords: number[] = [];
      const buildBatch = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          companyName: `Company ${start + i}`,
        }));
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'POST' && url === `${BASE}/Companies/query`) {
          const body = JSON.parse(init!.body as string);
          capturedMaxRecords.push(body.MaxRecords);
          return jsonResponse({
            items: buildBatch(1, 500),
            pageDetails: { nextPageUrl: `${BASE}/Companies/query?page=2` },
          });
        }
        if (method === 'POST' && url.includes('Companies/query?page=2')) {
          return jsonResponse({
            items: buildBatch(501, 200),
            pageDetails: { nextPageUrl: null },
          });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const all = await service.listAllCompanies(); // default cap 20_000

      // The body of the initial POST MUST clamp to <=500 even though the
      // caller wanted up to 20_000 total. The cursor walk handles the rest.
      expect(capturedMaxRecords).toHaveLength(1);
      expect(capturedMaxRecords[0]).toBeLessThanOrEqual(500);
      expect(all).toHaveLength(700);
    });

    test('query() honors caller total cap smaller than per-page clamp', async () => {
      // When the caller asks for fewer rows than the per-page max (e.g. 25),
      // the per-page MaxRecords must equal the caller's small ask — not 500.
      // Keeps targeted-fetch costs low for small queries.
      let capturedMaxRecords: number | undefined;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        const body = JSON.parse(init!.body as string);
        capturedMaxRecords = body.MaxRecords;
        return jsonResponse({
          items: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, companyName: `Co ${i + 1}` })),
          pageDetails: { nextPageUrl: null },
        });
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const result = await service.searchCompanies({ page: 1, pageSize: 25 } as any);

      expect(result).toHaveLength(25);
      expect(capturedMaxRecords).toBe(25);
    });

    // ---- search* filter translation (regression: issues #104, #105) ----
    //
    // Four search methods (Contracts, ConfigurationItems, Invoices, Tasks)
    // previously accepted schema-shaped filter args (companyID, searchTerm,
    // etc.) and silently dropped them, returning MATCH_ALL page-1 for every
    // call. These tests mock fetch directly and assert the request body's
    // `filter` array reflects the caller's intent.

    // Captures the request body sent to /<entity>/query. Side-effect: assigns
    // the per-suite `fetchSpy` so afterEach's restoreAllMocks still cleans up.
    const captureFilter = (entity: string): (() => any) => {
      let captured: any = null;
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        if (url.endsWith(`/${entity}/query`)) {
          captured = JSON.parse(init!.body as string);
        }
        return jsonResponse({ items: [], pageDetails: { nextPageUrl: null } });
      });
      return () => captured;
    };

    test('searchContracts translates companyID, status, searchTerm', async () => {
      const capture = captureFilter('Contracts');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchContracts({ companyID: 12345, status: 1, searchTerm: 'Managed' } as any);
      const body = capture();
      expect(body.filter).toContainEqual({ op: 'eq', field: 'companyID', value: 12345 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'status', value: 1 });
      expect(body.filter).toContainEqual({ op: 'contains', field: 'contractName', value: 'Managed' });
    });

    test('searchContracts with no filter args sends MATCH_ALL (no regression)', async () => {
      const capture = captureFilter('Contracts');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchContracts({});
      expect(capture().filter).toEqual(MATCH_ALL);
    });

    test('searchConfigurationItems translates companyID, isActive, productID, searchTerm', async () => {
      const capture = captureFilter('ConfigurationItems');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchConfigurationItems({
        companyID: 999,
        isActive: true,
        productID: 42,
        searchTerm: 'laptop',
      } as any);
      const body = capture();
      expect(body.filter).toContainEqual({ op: 'eq', field: 'companyID', value: 999 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'isActive', value: true });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'productID', value: 42 });
      expect(body.filter).toContainEqual({ op: 'contains', field: 'referenceTitle', value: 'laptop' });
    });

    test('searchConfigurationItems translates configurationItemType and configurationItemCategoryID', async () => {
      const capture = captureFilter('ConfigurationItems');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchConfigurationItems({
        companyID: 999,
        configurationItemType: 2,
        configurationItemCategoryID: 5,
      } as any);
      const body = capture();
      expect(body.filter).toContainEqual({ op: 'eq', field: 'companyID', value: 999 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'configurationItemType', value: 2 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'configurationItemCategoryID', value: 5 });
    });

    test('searchInvoices translates companyID, invoiceNumber, isVoided', async () => {
      const capture = captureFilter('Invoices');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchInvoices({
        companyID: 12345,
        invoiceNumber: 'INV-2024-001',
        isVoided: false,
      } as any);
      const body = capture();
      expect(body.filter).toContainEqual({ op: 'eq', field: 'companyID', value: 12345 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'invoiceNumber', value: 'INV-2024-001' });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'isVoided', value: false });
    });

    test('searchTasks translates projectID, status, assignedResourceID, searchTerm', async () => {
      const capture = captureFilter('Tasks');
      const service = new AutotaskService(configWithUrl, mockLogger);
      await service.searchTasks({
        projectID: 100,
        status: 2,
        assignedResourceID: 29744150,
        searchTerm: 'deploy',
      } as any);
      const body = capture();
      expect(body.filter).toContainEqual({ op: 'eq', field: 'projectID', value: 100 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'status', value: 2 });
      expect(body.filter).toContainEqual({ op: 'eq', field: 'assignedResourceID', value: 29744150 });
      expect(body.filter).toContainEqual({ op: 'contains', field: 'title', value: 'deploy' });
    });

    test('searchTasks honors page via slice-and-dice (same pattern as #101 searchCompanies fix)', async () => {
      // Mock cursor: page 1 returns 25 items (IDs 1-25) + nextPageUrl, page 2 returns 25 (IDs 26-50).
      const buildBatch = (start: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: start + i,
          title: `Task ${start + i}`,
        }));
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (method === 'POST' && url === `${BASE}/Tasks/query`) {
          return jsonResponse({
            items: buildBatch(1, 25),
            pageDetails: { nextPageUrl: `${BASE}/Tasks/query?page=2` },
          });
        }
        if (method === 'POST' && url.includes('Tasks/query?page=2')) {
          return jsonResponse({
            items: buildBatch(26, 25),
            pageDetails: { nextPageUrl: null },
          });
        }
        throw new Error(`unexpected fetch ${method} ${url}`);
      });

      const service = new AutotaskService(configWithUrl, mockLogger);
      const result = await service.searchTasks({ page: 2, pageSize: 25 } as any);

      // page=2 with pageSize=25 → targetEnd=50, slice(25, 50) → tasks 26-50
      expect(result).toHaveLength(25);
      expect(result[0].id).toBe(26);
      expect(result[result.length - 1].id).toBe(50);
    });
  });
});
