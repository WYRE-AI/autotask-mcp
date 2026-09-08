// Regression tests for issue #277: createTimeEntry() routed parent-scoped
// entries through child collection routes (POST /Tickets/{id}/TimeEntries and
// friends) that do not exist, so every ticket- or task-scoped entry 404'd.
// TimeEntries is a top-level entity; the parent travels in the payload.

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
    // Pre-set apiUrl so baseUrl() resolves without a zone-info network round-trip.
    apiUrl: 'https://webservices2.autotask.net/ATServicesRest/',
  },
};

/** Answer every request with one canned body. */
function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

/**
 * Human-readable "<METHOD> <pathname>" trace of every fetch the code made, so a
 * failing assertion names the exact URL that was requested.
 */
function calledRoutes(fetchMock: jest.SpyInstance): string[] {
  return fetchMock.mock.calls.map(
    (c: any[]) => `${(c[1] as RequestInit).method} ${new URL(c[0] as string).pathname}`
  );
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

describe('AutotaskService.createTimeEntry() endpoint (issue #277)', () => {
  // One behaviour, three shapes: the scope lives in the payload, so the route is
  // the same unconditional POST /TimeEntries for all of them.
  test.each([
    ['ticket-scoped', { ticketID: 48231, resourceID: 12, hoursWorked: 1.5 }],
    ['task-scoped', { taskID: 777, resourceID: 12, hoursWorked: 2 }],
    ['regular time (no parent)', { resourceID: 12, hoursWorked: 1, internalBillingCodeID: 3 }],
  ])('%s entries POST to /TimeEntries with the parent in the body', async (_label, payload) => {
    const fetchMock = mockFetchOk({ itemId: 4242 });

    const service = new AutotaskService(config, logger);
    await expect(service.createTimeEntry(payload as any)).resolves.toBe(4242);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/TimeEntries']);
    expect(firstRequestBody(fetchMock)).toMatchObject(payload);
  });
});

describe('autotask_create_time_entry tool surface (issue #277)', () => {
  test('does not advertise projectID — Autotask has no project-scoped time entry', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_time_entry');
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.ticketID).toBeDefined();
    expect(props.taskID).toBeDefined();
    expect(props.projectID).toBeUndefined();
  });

  test('rejects a stray projectID with an actionable message instead of forwarding it', async () => {
    const service = new AutotaskService(config, logger);
    const createSpy = jest.spyOn(service, 'createTimeEntry');
    const handler = new AutotaskToolHandler(service, logger);

    const result = await handler.callTool('autotask_create_time_entry', {
      projectID: 55,
      resourceID: 12,
      hoursWorked: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/project/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('the search tool drops the projectId filter too — the field does not exist to filter on', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_search_time_entries');
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.ticketId).toBeDefined();
    expect(props.taskId).toBeDefined();
    expect(props.projectId).toBeUndefined();
  });

  test('searching by projectId errors rather than silently returning every time entry', async () => {
    const service = new AutotaskService(config, logger);
    const searchSpy = jest.spyOn(service, 'searchTimeEntries');
    const handler = new AutotaskToolHandler(service, logger);

    const result = await handler.callTool('autotask_search_time_entries', { projectId: 55 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/autotask_search_tasks/);
    expect(searchSpy).not.toHaveBeenCalled();
  });

  test('searchTimeEntries never emits a projectID clause', async () => {
    const fetchMock = mockFetchOk({ items: [] });

    const service = new AutotaskService(config, logger);
    await service.searchTimeEntries({ ticketId: 7, projectId: 55 } as any);

    const body = firstRequestBody(fetchMock);
    expect(JSON.stringify(body)).not.toContain('projectID');
    expect(JSON.stringify(body)).toContain('ticketID');
  });

  test('still treats a parentless entry as Regular Time and asks for a category', async () => {
    const service = new AutotaskService(config, logger);
    jest.spyOn(service as any, 'getInternalBillingCodeNames')
      .mockResolvedValue(['Internal Meeting', 'Training']);
    const createSpy = jest.spyOn(service, 'createTimeEntry');
    const handler = new AutotaskToolHandler(service, logger);

    const result = await handler.callTool('autotask_create_time_entry', {
      resourceID: 12,
      hoursWorked: 1,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Internal Meeting');
    expect(createSpy).not.toHaveBeenCalled();
  });
});
