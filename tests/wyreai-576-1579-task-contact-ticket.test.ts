// WYREAI-576: autotask_create_task gains phaseID + assignedResourceRoleID,
// autotask_update_task exists, autotask_update_ticket can set the SLA.
// WYREAI-1579: autotask_create_contact posts to the Companies child route, and
// ticket tools reject a missing ticketId before any request is made.

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

const def = (name: string) => TOOL_DEFINITIONS.find(t => t.name === name);

function setup() {
  const service = new AutotaskService(config, logger);
  const handler = new AutotaskToolHandler(service, logger);
  return { service, handler };
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autotask_create_task (WYREAI-576)', () => {
  test('advertises phaseID and the assigned resource role fields', () => {
    const props = def('autotask_create_task')!.inputSchema.properties as Record<string, any>;
    expect(props.phaseID.type).toBe('number');
    expect(props.assignedResourceRoleID.type).toBe('number');
    expect(props.assignedResourceRoleName.type).toBe('string');
  });

  test('forwards phaseID and an explicit role without resolving one', async () => {
    const { service, handler } = setup();
    const create = jest.spyOn(service, 'createTask').mockResolvedValue(9);
    const resolveRole = jest.spyOn(service, 'resolveRoleForResource');

    const result = await handler.callTool('autotask_create_task', {
      projectID: 5, title: 'T', status: 1, phaseID: 77, assignedResourceID: 12, assignedResourceRoleID: 4,
    });

    expect(result.isError).toBeFalsy();
    expect(create).toHaveBeenCalledWith({
      projectID: 5, title: 'T', status: 1, phaseID: 77, assignedResourceID: 12, assignedResourceRoleID: 4, taskType: 1,
    });
    expect(resolveRole).not.toHaveBeenCalled();
  });

  test('resolves the role from the role name and does not send the name to Autotask', async () => {
    const { service, handler } = setup();
    const create = jest.spyOn(service, 'createTask').mockResolvedValue(9);
    const resolveRole = jest.spyOn(service, 'resolveRoleForResource').mockResolvedValue(31);

    await handler.callTool('autotask_create_task', {
      projectID: 5, title: 'T', status: 1, assignedResourceID: 12, assignedResourceRoleName: 'Engineer',
    });

    expect(resolveRole).toHaveBeenCalledWith(12, 'Engineer');
    const sent = create.mock.calls[0]![0] as Record<string, any>;
    expect(sent.assignedResourceRoleID).toBe(31);
    expect(sent).not.toHaveProperty('assignedResourceRoleName');
  });

  test('assignedResourceRoleName without assignedResourceID is an explicit error', async () => {
    const { service, handler } = setup();
    const create = jest.spyOn(service, 'createTask').mockResolvedValue(9);

    const result = await handler.callTool('autotask_create_task', {
      projectID: 5, title: 'T', status: 1, assignedResourceRoleName: 'Engineer',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('assignedResourceRoleName requires assignedResourceID');
    expect(create).not.toHaveBeenCalled();
  });

  test('does not resolve a role for an unassigned task', async () => {
    const { service, handler } = setup();
    const create = jest.spyOn(service, 'createTask').mockResolvedValue(9);
    const resolveRole = jest.spyOn(service, 'resolveRoleForResource');

    await handler.callTool('autotask_create_task', { projectID: 5, title: 'T', status: 1 });

    expect(resolveRole).not.toHaveBeenCalled();
    expect(create.mock.calls[0]![0]).not.toHaveProperty('assignedResourceRoleID');
  });
});

describe('autotask_update_task (WYREAI-576)', () => {
  test('exists, requires only taskId, and is in the projects category', () => {
    expect(def('autotask_update_task')!.inputSchema.required).toEqual(['taskId']);
    expect(TOOL_CATEGORIES.projects.tools).toContain('autotask_update_task');
  });

  test('looks up the project, resolves the role and forwards the writable fields', async () => {
    const { service, handler } = setup();
    jest.spyOn(service, 'getTask').mockResolvedValue({ id: 88, projectID: 5 });
    jest.spyOn(service, 'resolveRoleForResource').mockResolvedValue(31);
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_update_task', {
      taskId: 88, status: 5, assignedResourceID: 12, endDateTime: '2026-12-01T17:00:00Z', unrelated: 'x',
    });

    expect(result.isError).toBeFalsy();
    expect(update).toHaveBeenCalledWith(88, {
      status: 5, assignedResourceID: 12, assignedResourceRoleID: 31, endDateTime: '2026-12-01T17:00:00Z', projectID: 5,
    });
  });

  test('skips the task lookup when projectID is given', async () => {
    const { service, handler } = setup();
    const get = jest.spyOn(service, 'getTask');
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    await handler.callTool('autotask_update_task', { taskId: 88, projectID: 6, status: 2 });

    expect(get).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(88, { status: 2, projectID: 6 });
  });

  test('errors without calling Autotask when no updatable field is given', async () => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_update_task', { taskId: 88 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no updatable fields');
    expect(update).not.toHaveBeenCalled();
  });

  test('without taskId errors before any request, directly and through autotask_execute_tool', async () => {
    const { service, handler } = setup();
    const get = jest.spyOn(service, 'getTask');
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    for (const call of [
      () => handler.callTool('autotask_update_task', { projectID: 6, status: 2 }),
      () => handler.callTool('autotask_update_task', { status: 2 }),
      () => handler.callTool('autotask_execute_tool', { toolName: 'autotask_update_task', arguments: { projectID: 6, status: 2 } }),
    ]) {
      const result = await call();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('taskId is required');
    }
    expect(get).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test('rejects a non-integer projectID before any request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any);
    const { handler } = setup();

    const result = await handler.callTool('autotask_update_task', { taskId: 88, projectID: '5/../Resources', status: 2 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('projectID is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('assignedResourceRoleName without assignedResourceID is an explicit error', async () => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_update_task', { taskId: 88, assignedResourceRoleName: 'Engineer' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('assignedResourceRoleName requires assignedResourceID');
    expect(update).not.toHaveBeenCalled();
  });

  test('errors when the task does not exist', async () => {
    const { service, handler } = setup();
    jest.spyOn(service, 'getTask').mockResolvedValue(null);
    const update = jest.spyOn(service, 'updateTask').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_update_task', { taskId: 88, status: 2 });

    expect(result.isError).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('autotask_update_ticket serviceLevelAgreementID (WYREAI-576)', () => {
  test('is advertised and forwarded, including null to clear the SLA', async () => {
    const props = def('autotask_update_ticket')!.inputSchema.properties as Record<string, any>;
    expect(props.serviceLevelAgreementID).toBeDefined();

    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    await handler.callTool('autotask_update_ticket', { ticketId: 10, serviceLevelAgreementID: null });
    expect(update).toHaveBeenLastCalledWith(10, { serviceLevelAgreementID: null });

    await handler.callTool('autotask_update_ticket', { ticketId: 10, serviceLevelAgreementID: 3 });
    expect(update).toHaveBeenLastCalledWith(10, { serviceLevelAgreementID: 3 });
  });
});

describe('autotask_create_contact (WYREAI-1579)', () => {
  function mockFetchOk() {
    return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ itemId: 555 }),
    } as unknown as Response);
  }

  test('POSTs to /Companies/{companyID}/Contacts, never the top-level /Contacts', async () => {
    const fetchMock = mockFetchOk();
    const { service } = setup();

    const id = await service.createContact({ companyID: 777, firstName: 'Jane', lastName: 'Doe' });

    expect(id).toBe(555);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(new URL(url).pathname).toBe('/ATServicesRest/v1.0/Companies/777/Contacts');
    expect(JSON.parse(init.body as string)).toMatchObject({ companyID: 777, firstName: 'Jane' });
  });

  test('accepts companyID 0 (the root company)', async () => {
    const fetchMock = mockFetchOk();
    const { service } = setup();

    await service.createContact({ companyID: 0, firstName: 'Jane', lastName: 'Doe' });

    expect(new URL((fetchMock.mock.calls[0] as [string])[0]).pathname).toBe('/ATServicesRest/v1.0/Companies/0/Contacts');
  });

  test('rejects a missing companyID without a request', async () => {
    const fetchMock = mockFetchOk();
    const { service } = setup();

    await expect(service.createContact({ firstName: 'Jane', lastName: 'Doe' })).rejects.toThrow('companyID is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('createContact companyID hardening (WYREAI-1579)', () => {
  test.each(['5/../Resources', 1.5, -1, 'abc', '', null])('rejects companyID %p without a request', async (bad) => {
    const fetchMock = jest.spyOn(global, 'fetch' as any);
    const { service } = setup();

    await expect(service.createContact({ companyID: bad as any, firstName: 'J', lastName: 'D' }))
      .rejects.toThrow('companyID is required and must be a non-negative integer');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ticketId validation (WYREAI-1579)', () => {
  test.each([
    ['autotask_update_ticket', { title: 'x' }],
    ['autotask_create_ticket_note', { title: 'x', description: 'y', noteType: 1, publish: 1 }],
    ['autotask_search_ticket_attachments', {}],
  ])('%s without ticketId errors before any Autotask call', async (name, args) => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);
    const note = jest.spyOn(service, 'createTicketNote').mockResolvedValue(1);
    const attachments = jest.spyOn(service, 'searchTicketAttachments').mockResolvedValue([]);

    const result = await handler.callTool(name, args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ticketId is required');
    expect(update).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
    expect(attachments).not.toHaveBeenCalled();
  });

  test.each([0, -4, 1.5, 'abc', null, '', true, [11], {}])('rejects ticketId %p', async (bad) => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_update_ticket', { ticketId: bad, title: 'x' });

    expect(result.isError).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  test('is also enforced through autotask_execute_tool', async () => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    const result = await handler.callTool('autotask_execute_tool', {
      toolName: 'autotask_update_ticket',
      arguments: { title: 'x' },
    });

    expect(result.isError).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  test('a valid ticketId (including a numeric string) still goes through', async () => {
    const { service, handler } = setup();
    const update = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    await handler.callTool('autotask_update_ticket', { ticketId: 10, title: 'x' });
    await handler.callTool('autotask_update_ticket', { ticketId: '11', title: 'x' });

    expect(update).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['autotask_get_ticket_details', {}],
    ['autotask_create_ticket_charge', { chargeType: 'x' }],
  ])('%s without ticketID errors before any request', async (name, args) => {
    const fetchMock = jest.spyOn(global, 'fetch' as any);
    const { handler } = setup();

    const result = await handler.callTool(name, args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ticketID is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
