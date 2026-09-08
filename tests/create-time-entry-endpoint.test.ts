// Regression tests for issue #277 / PR #278:
// createTimeEntry() used to route parent-scoped entries through the child
// collection routes `POST /Tickets/{id}/TimeEntries`, `POST /Tasks/{id}/TimeEntries`
// and `POST /Projects/{id}/TimeEntries`. Those routes do not exist in the Autotask
// REST API — TimeEntries is a top-level entity only — so every ticket- or
// task-scoped time entry died with a 404.
//
// The parent is expressed in the payload (`ticketID` / `taskID`), not in the URL,
// so all three shapes (ticket, task, regular) are one unconditional
// `POST /TimeEntries`. Autotask has no project-scoped time entry at all, so
// `projectID` is no longer an advertised input and is rejected up front rather
// than forwarded as an unknown field.

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

/**
 * Mock fetch with a single canned response, capturing every request the code
 * made so a failing test names the exact URL that was hit.
 */
function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

/** Human-readable "<METHOD> <pathname>" trace of every fetch the code made. */
function calledRoutes(fetchMock: jest.SpyInstance): string[] {
  return fetchMock.mock.calls.map(
    (c: any[]) => `${(c[1] as RequestInit).method} ${new URL(c[0] as string).pathname}`
  );
}

function requestBody(fetchMock: jest.SpyInstance, index = 0): any {
  return JSON.parse((fetchMock.mock.calls[index][1] as RequestInit).body as string);
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AutotaskService.createTimeEntry() endpoint (issue #277)', () => {
  test('ticket-scoped entries POST to /TimeEntries with ticketID in the body, not /Tickets/{id}/TimeEntries', async () => {
    const fetchMock = mockFetchOk({ itemId: 4242 });

    const service = new AutotaskService(config, logger);
    await expect(
      service.createTimeEntry({ ticketID: 48231, resourceID: 12, hoursWorked: 1.5 })
    ).resolves.toBe(4242);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/TimeEntries']);
    expect(requestBody(fetchMock)).toMatchObject({
      ticketID: 48231,
      resourceID: 12,
      hoursWorked: 1.5,
    });
  });

  test('task-scoped entries POST to /TimeEntries with taskID in the body, not /Tasks/{id}/TimeEntries', async () => {
    const fetchMock = mockFetchOk({ itemId: 99 });

    const service = new AutotaskService(config, logger);
    await expect(
      service.createTimeEntry({ taskID: 777, resourceID: 12, hoursWorked: 2 })
    ).resolves.toBe(99);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/TimeEntries']);
    expect(requestBody(fetchMock)).toMatchObject({ taskID: 777 });
  });

  test('regular time (no parent) POSTs to the same /TimeEntries route', async () => {
    const fetchMock = mockFetchOk({ itemId: 7 });

    const service = new AutotaskService(config, logger);
    await expect(
      service.createTimeEntry({ resourceID: 12, hoursWorked: 1, internalBillingCodeID: 3 } as any)
    ).resolves.toBe(7);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/TimeEntries']);
  });
});

describe('autotask_create_time_entry tool surface (issue #277)', () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_time_entry');

  test('does not advertise projectID — Autotask has no project-scoped time entry', () => {
    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.ticketID).toBeDefined();
    expect(props.taskID).toBeDefined();
    expect(props.projectID).toBeUndefined();
  });

  test('description does not promise project support', () => {
    expect(tool!.description.toLowerCase()).not.toContain('project,');
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
