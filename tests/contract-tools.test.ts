// Contract management tool surface tests (issue #237):
// autotask_get_contract, extended autotask_search_contracts filters,
// autotask_list_expiring_contracts, and autotask_create_contracts_bulk.

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

const findTool = (name: string) => TOOL_DEFINITIONS.find(t => t.name === name);

const contractShell = (overrides: Record<string, any> = {}) => ({
  companyID: 1,
  contractName: 'Managed Services',
  contractType: 7,
  contractCategory: 3,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  ...overrides,
});

describe('contract tool definitions (issue #237)', () => {
  test('autotask_get_contract exists and requires id', () => {
    const tool = findTool('autotask_get_contract');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.id.type).toBe('number');
    expect(tool!.inputSchema.required).toEqual(['id']);
  });

  test('autotask_search_contracts exposes contractType and endDate range as optional filters', () => {
    const tool = findTool('autotask_search_contracts');
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.contractType.type).toBe('number');
    expect(props.endDateFrom.type).toBe('string');
    expect(props.endDateTo.type).toBe('string');
    expect(tool!.inputSchema.required ?? []).toEqual([]);
  });

  test('autotask_list_expiring_contracts exists with daysAhead/companyID/includeExpired', () => {
    const tool = findTool('autotask_list_expiring_contracts');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.daysAhead.type).toBe('number');
    expect(props.companyID.type).toBe('number');
    expect(props.includeExpired.type).toBe('boolean');
    expect(tool!.inputSchema.required ?? []).toEqual([]);
  });

  test('autotask_create_contracts_bulk requires a contracts array of contract shells', () => {
    const tool = findTool('autotask_create_contracts_bulk');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.contracts.type).toBe('array');
    expect(props.contracts.items.required).toEqual(
      expect.arrayContaining(['companyID', 'contractName', 'contractType', 'contractCategory', 'startDate', 'endDate'])
    );
    expect(tool!.inputSchema.required).toEqual(['contracts']);
  });

  test('financial category lists all contract tools', () => {
    expect(TOOL_CATEGORIES.financial.tools).toEqual(
      expect.arrayContaining([
        'autotask_search_contracts',
        'autotask_get_contract',
        'autotask_list_expiring_contracts',
        'autotask_create_contract',
        'autotask_create_contracts_bulk',
        'autotask_update_contract',
        'autotask_create_contract_service',
        'autotask_update_contract_service',
      ])
    );
  });
});

describe('contract tool handlers (issue #237)', () => {
  test('autotask_get_contract forwards id to service.getContract', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'getContract')
      .mockResolvedValue({ id: 55, contractName: 'Managed Services' } as any);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_get_contract', { id: 55 });
    expect(spy).toHaveBeenCalledWith(55);
    expect(result.isError).toBeFalsy();
  });

  test('autotask_search_contracts forwards contractType and endDate range to the service', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service, 'searchContracts').mockResolvedValue([{ id: 1 }] as any);
    const handler = new AutotaskToolHandler(service, mockLogger);
    await handler.callTool('autotask_search_contracts', {
      contractType: 7,
      endDateFrom: '2026-01-01',
      endDateTo: '2026-12-31',
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ contractType: 7, endDateFrom: '2026-01-01', endDateTo: '2026-12-31' })
    );
  });

  test('autotask_list_expiring_contracts forwards options to service.listExpiringContracts', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service as any, 'listExpiringContracts')
      .mockResolvedValue([{ id: 9, contractName: 'Expiring soon', endDate: '2026-08-20' }]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_list_expiring_contracts', {
      daysAhead: 45,
      companyID: 9,
      includeExpired: true,
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ daysAhead: 45, companyID: 9, includeExpired: true })
    );
    expect(result.isError).toBeFalsy();
  });

  test('autotask_create_contracts_bulk forwards shells and reports per-item results', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const spy = jest.spyOn(service as any, 'createContracts').mockResolvedValue([
      { index: 0, contractName: 'A', success: true, id: 11 },
      { index: 1, contractName: 'B', success: false, error: 'boom' },
    ]);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_create_contracts_bulk', {
      contracts: [contractShell({ contractName: 'A' }), contractShell({ contractName: 'B' })],
    });
    expect(spy).toHaveBeenCalledWith([
      expect.objectContaining({ contractName: 'A' }),
      expect.objectContaining({ contractName: 'B' }),
    ]);
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('1/2');
  });

  test('router routes expiring-contract intent to autotask_list_expiring_contracts', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger);
    const result = await handler.callTool('autotask_router', {
      intent: 'show contracts expiring in the next 60 days',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.suggestedTool).toBe('autotask_list_expiring_contracts');
  });
});
