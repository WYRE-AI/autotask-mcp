// Autotask Service Tests
// Tests for the AutotaskService wrapper

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskService } from '../src/services/autotask.service';
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
    
    expect(typeof service.getTask).toBe('function');
    expect(typeof service.searchTasks).toBe('function');
    expect(typeof service.createTask).toBe('function');
    expect(typeof service.updateTask).toBe('function');
    
    expect(typeof service.testConnection).toBe('function');
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

    test('should handle attachment methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      
      await expect(service.getTicketAttachment(123, 456)).rejects.toThrow();
      await expect(service.searchTicketAttachments(123)).rejects.toThrow();
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

    test('should handle unsupported entity methods with proper error messages', async () => {
      const service = new AutotaskService(mockConfig, mockLogger);
      
      // Billing codes
      await expect(service.getBillingCode(123)).rejects.toThrow('Billing codes API not directly available');
      await expect(service.searchBillingCodes()).rejects.toThrow('Billing codes API not directly available');
      
      // Departments
      await expect(service.getDepartment(123)).rejects.toThrow('Departments API not directly available');
      await expect(service.searchDepartments()).rejects.toThrow('Departments API not directly available');
    });
  });
}); 