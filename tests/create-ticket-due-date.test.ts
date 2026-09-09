// autotask_create_ticket dropped dueDateTime: it was neither advertised in the
// tool schema nor in TICKET_WRITABLE_FIELDS, so a caller that supplied it had it
// silently stripped from the payload — and Autotask answered
// "dueDateTime is required.; on record number [0]" (HTTP 500), because the field
// is required on every new ticket unless the ticket category defaults it.
// (FellowHire: Synergy Solution IT, sansa-stark, 2026-09-09.)

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = new Logger('error');

const config: McpServerConfig = {
  name: 'test-server',
  version: '0.0.0',
  autotask: {
    username: 'user@example.com',
    secret: 'secret',
    integrationCode: 'integration-code',
    apiUrl: 'https://webservices2.autotask.net/ATServicesRest/',
  },
};

function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

function firstRequestBody(fetchMock: jest.SpyInstance): any {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autotask_create_ticket dueDateTime', () => {
  test('is advertised on the tool, as it is on autotask_update_ticket', () => {
    const create = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_ticket');
    const update = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_ticket');
    expect((create!.inputSchema.properties as any).dueDateTime).toMatchObject({ type: 'string' });
    expect((update!.inputSchema.properties as any).dueDateTime).toMatchObject({ type: 'string' });
    expect((create!.inputSchema.properties as any).dueDateTime.description).toMatch(/REQUIRES/);
  });

  test('reaches the POST /Tickets payload instead of being stripped', async () => {
    const fetchMock = mockFetchOk({ itemId: 19999 });
    const service = new AutotaskService(config, logger);
    const handler = new AutotaskToolHandler(service, logger);

    const result = await handler.callTool('autotask_create_ticket', {
      companyID: 1,
      title: 'Dispatch Time Entry August',
      description: 'Monthly dispatch time',
      status: 1,
      priority: 2,
      dueDateTime: '2026-08-31T23:59:00Z',
    });

    expect(result.isError).toBeFalsy();
    const body = firstRequestBody(fetchMock);
    expect(body.dueDateTime).toBe('2026-08-31T23:59:00Z');
    expect(body.title).toBe('Dispatch Time Entry August');
  });

  test('is optional: a call without it sends no dueDateTime key', async () => {
    const fetchMock = mockFetchOk({ itemId: 20000 });
    const service = new AutotaskService(config, logger);
    const handler = new AutotaskToolHandler(service, logger);

    await handler.callTool('autotask_create_ticket', {
      companyID: 1, title: 't', description: 'd', status: 1, priority: 2,
    });

    expect(firstRequestBody(fetchMock)).not.toHaveProperty('dueDateTime');
  });
});
