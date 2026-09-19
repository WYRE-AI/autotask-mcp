// Lazy Loading / Progressive Tool Discovery Tests

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
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

const mockLogger = new Logger('error');

describe('Lazy Loading - Tool Categories', () => {
  test('TOOL_CATEGORIES should be defined', () => {
    expect(TOOL_CATEGORIES).toBeDefined();
    expect(typeof TOOL_CATEGORIES).toBe('object');
  });

  test('should have expected categories', () => {
    const categoryNames = Object.keys(TOOL_CATEGORIES);
    expect(categoryNames).toContain('utility');
    expect(categoryNames).toContain('companies');
    expect(categoryNames).toContain('tickets');
    expect(categoryNames).toContain('financial');
    expect(categoryNames).toContain('products_and_services');
  });

  test('every category should have description and non-empty tools array', () => {
    for (const [, cat] of Object.entries(TOOL_CATEGORIES)) {
      expect(cat.description).toBeTruthy();
      expect(Array.isArray(cat.tools)).toBe(true);
      expect(cat.tools.length).toBeGreaterThan(0);
    }
  });

  test('all categorized tools should exist in TOOL_DEFINITIONS', () => {
    const toolNames = new Set(TOOL_DEFINITIONS.map(t => t.name));
    for (const [, cat] of Object.entries(TOOL_CATEGORIES)) {
      for (const toolName of cat.tools) {
        expect(toolNames.has(toolName)).toBe(true);
      }
    }
  });

  test('meta-tools should exist in TOOL_DEFINITIONS', () => {
    const toolNames = new Set(TOOL_DEFINITIONS.map(t => t.name));
    expect(toolNames.has('autotask_list_categories')).toBe(true);
    expect(toolNames.has('autotask_list_category_tools')).toBe(true);
    expect(toolNames.has('autotask_execute_tool')).toBe(true);
  });
});

describe('Lazy Loading - Tool Handler', () => {
  test('should return all tools when lazy loading is disabled', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, false);
    const tools = await handler.listTools();
    expect(tools.length).toBe(TOOL_DEFINITIONS.length);
  });

  test('should return only meta-tools when lazy loading is enabled', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, true);
    const tools = await handler.listTools();
    expect(tools.length).toBe(4);
    const names = tools.map(t => t.name);
    expect(names).toContain('autotask_list_categories');
    expect(names).toContain('autotask_list_category_tools');
    expect(names).toContain('autotask_execute_tool');
    expect(names).toContain('autotask_router');
  });

  test('autotask_list_categories should return all categories', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, true);
    const result = await handler.callTool('autotask_list_categories', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.length).toBe(Object.keys(TOOL_CATEGORIES).length);
    // Each category should have name, description, and toolCount
    for (const cat of parsed.data) {
      expect(cat.name).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(typeof cat.toolCount).toBe('number');
    }
  });

  test('autotask_list_category_tools should return tools for valid category', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, true);
    const result = await handler.callTool('autotask_list_category_tools', { category: 'companies' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.length).toBe(TOOL_CATEGORIES.companies.tools.length);
    // Each tool should have full schema
    for (const tool of parsed.data) {
      expect(tool.name).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  test('autotask_list_category_tools should error for invalid category', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, true);
    const result = await handler.callTool('autotask_list_category_tools', { category: 'nonexistent' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unknown category');
  });
});

describe('Decision Tree Router', () => {
  const FIXED_NOW = new Date('2026-09-19T15:32:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('should route ticket search intent', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    jest.spyOn(service, 'searchCompanies').mockResolvedValue([{ id: 99, companyName: 'Acme Corp' }]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'find tickets for Acme Corp' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams.companyID).toBe(99);
    expect(parsed.data.suggestedParams.searchTerm).toBeUndefined();
  });

  test('tickets today suggests createdAfter as the UTC date', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const searchSpy = jest.spyOn(service, 'searchCompanies');
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'tickets today' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams).toEqual({ createdAfter: '2026-09-19' });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  test('tickets at WYRE today suggests companyID 0 and createdAfter without searching companies', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const searchSpy = jest.spyOn(service, 'searchCompanies');
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'tickets at WYRE today' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams).toEqual({ companyID: 0, createdAfter: '2026-09-19' });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  test('tickets for Amaero resolves companyID via searchCompanies and never sets searchTerm', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    jest.spyOn(service, 'searchCompanies').mockResolvedValue([{ id: 296, companyName: 'Amaero' }]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'tickets for Amaero' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams).toEqual({ companyID: 296 });
    expect(parsed.data.requiredParams).toEqual([]);
  });

  test('search tickets for T20260917 sets searchTerm to the ticket-number prefix', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const searchSpy = jest.spyOn(service, 'searchCompanies');
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'search tickets for T20260917' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams).toEqual({ searchTerm: 'T20260917' });
    expect(searchSpy).not.toHaveBeenCalled();
  });

  test('unresolved company name omits searchTerm and requires companyID', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    jest.spyOn(service, 'searchCompanies').mockResolvedValue([]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'tickets for Amaero' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_tickets');
    expect(parsed.data.suggestedParams).toEqual({});
    expect(parsed.data.requiredParams).toEqual(['companyID']);
  });

  test('should route time entry intent with extracted params', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'log 2 hours on ticket 12345' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_create_time_entry');
    expect(parsed.data.suggestedParams.hoursWorked).toBe(2);
    expect(parsed.data.suggestedParams.ticketID).toBe(12345);
  });

  test('should route quote creation intent', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'create a new quote for client' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_create_quote');
  });

  test('should fallback to list_categories for unknown intent', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'do something random' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_list_categories');
  });

  test('should route company search with quoted name', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', { intent: 'search companies for "Wyre Technology"' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_search_companies');
    expect(parsed.data.suggestedParams.searchTerm).toBe('Wyre Technology');
  });
});

describe('autotask_update_ticket schema', () => {
  const updateTicketTool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_ticket');

  test('tool definition exists', () => {
    expect(updateTicketTool).toBeDefined();
  });

  test('exposes issueType as an optional number', () => {
    const props = updateTicketTool!.inputSchema.properties as Record<string, any>;
    expect(props.issueType).toBeDefined();
    expect(props.issueType.type).toBe('number');
    expect(updateTicketTool!.inputSchema.required).not.toContain('issueType');
  });

  test('exposes subIssueType as an optional number', () => {
    const props = updateTicketTool!.inputSchema.properties as Record<string, any>;
    expect(props.subIssueType).toBeDefined();
    expect(props.subIssueType.type).toBe('number');
    expect(updateTicketTool!.inputSchema.required).not.toContain('subIssueType');
  });

  test('buildTicketPayload (via handler) forwards issueType and subIssueType to updateTicket', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const updateSpy = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined as any);
    const handler = new AutotaskToolHandler(service, mockLogger);
    await handler.callTool('autotask_update_ticket', {
      ticketId: 42,
      issueType: 7,
      subIssueType: 13
    });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, payload] = updateSpy.mock.calls[0];
    expect(id).toBe(42);
    expect(payload).toEqual(expect.objectContaining({ issueType: 7, subIssueType: 13 }));
  });
});
