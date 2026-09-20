/**
 * WYREAI-372/373: Autotask tool schemas mixed companyID/companyId/CompanyID
 * casings, and several code paths treated `companyID: 0` (WYRE Technology's
 * own Autotask company id) as "no company provided" because they used a
 * truthy check instead of an explicit undefined/null check.
 *
 * These tests would fail against the pre-fix code: the truthy-check tests
 * assert the filter/branch behavior that a `||`/`&&`/bare-value check gets
 * wrong specifically at id=0, and the casing tests assert the single
 * canonical schema key plus alias acceptance the fix introduces.
 */

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API')),
  },
}));

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
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
    integrationCode: 'test-integration-code',
    apiUrl: 'https://example.autotask.net/atservicesrest/',
  },
};

const mockLogger = new Logger('error');

const findTool = (name: string) => TOOL_DEFINITIONS.find(t => t.name === name);

describe('WYREAI-372: single canonical companyID casing in every inputSchema', () => {
  const affectedTools = [
    'autotask_get_company_site_configuration',
    'autotask_get_company_note',
    'autotask_search_company_notes',
    'autotask_create_company_note',
    'autotask_create_expense_item',
    'autotask_search_quotes',
    'autotask_create_quote',
    'autotask_search_opportunities',
    'autotask_create_opportunity',
    'autotask_search_billing_items',
    'autotask_search_service_calls',
  ];

  test.each(affectedTools)('%s advertises companyID, not companyId or CompanyID', (name) => {
    const tool = findTool(name);
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props).toHaveProperty('companyID');
    expect(props).not.toHaveProperty('companyId');
    expect(props).not.toHaveProperty('CompanyID');
  });

  test('no tool in the fleet advertises companyId or CompanyID in its inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const props = tool.inputSchema.properties as Record<string, any> | undefined;
      if (!props) continue;
      expect(props).not.toHaveProperty('companyId');
      expect(props).not.toHaveProperty('CompanyID');
    }
  });
});

describe('WYREAI-372: callTool accepts companyId/CompanyID as aliases for companyID', () => {
  test('a call using the old companyId casing still reaches the service with the value intact', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'getCompanySiteConfigurations').mockResolvedValue([]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    await handler.callTool('autotask_get_company_site_configuration', { companyId: 42 });
    expect(spy).toHaveBeenCalledWith(42);
  });

  test('a call using the old CompanyID casing still reaches the service with the value intact', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'getCompanySiteConfigurations').mockResolvedValue([]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    await handler.callTool('autotask_get_company_site_configuration', { CompanyID: 42 });
    expect(spy).toHaveBeenCalledWith(42);
  });

  test('company id 0 survives the alias normalization (not dropped as falsy)', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'getCompanySiteConfigurations').mockResolvedValue([]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    await handler.callTool('autotask_get_company_site_configuration', { companyId: 0 });
    expect(spy).toHaveBeenCalledWith(0);
  });
});

describe('WYREAI-373: companyID/companyId 0 is not treated as "no company provided"', () => {
  test('autotask_search_tickets with companyID: 0 does not trigger zero-filter elicitation', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'searchTickets').mockResolvedValue([]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    // No mcpServer wired up, so elicitation would throw/no-op if reached —
    // asserting on the forwarded filter itself is the real behavioral check.
    await handler.callTool('autotask_search_tickets', { companyID: 0 });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ companyId: 0 }));
  });

  test('searchQuotes forwards companyId: 0 as a real filter, not an omitted one', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ items: [], pageDetails: {} }),
      } as any)
    );
    try {
      await service.searchQuotes({ companyId: 0 });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      const companyFilter = body.filter.find((f: any) => f.field === 'companyID');
      expect(companyFilter).toBeDefined();
      expect(companyFilter.value).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('searchOpportunities forwards companyId: 0 as a real filter, not an omitted one', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify({ items: [], pageDetails: {} }),
      } as any)
    );
    try {
      await service.searchOpportunities({ companyId: 0 });
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      const companyFilter = body.filter.find((f: any) => f.field === 'companyID');
      expect(companyFilter).toBeDefined();
      expect(companyFilter.value).toBe(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
