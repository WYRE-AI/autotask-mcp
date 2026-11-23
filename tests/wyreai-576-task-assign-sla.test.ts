// WYREAI-576: project tasks could be created but not placed in a phase,
// assigned with a role, or updated at all, and a ticket's SLA could not be
// set or cleared, so due dates recomputed from the SLA kept springing back.

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
    apiUrl: 'https://webservices2.autotask.net/ATServicesRest/',
  },
};

type Call = { path: string; method: string; body: any };
type Route = (body: any) => unknown;

function mockAutotask(routes: Record<string, Route>): { calls: Call[] } {
  const calls: Call[] = [];
  jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any, init: any) => {
    const path = String(url).replace(/^.*ATServicesRest\/?(v1\.0)?/, '');
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method: init?.method ?? 'GET', body });
    const key = Object.keys(routes).find(k => path.endsWith(k));
    if (!key) {
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => `no route for ${path}` } as unknown as Response;
    }
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(routes[key](body)) } as unknown as Response;
  });
  return { calls };
}

const TECH = 29682887;
const PROJECT = 5021;
const TASK = 78005;

const oneRole = {
  '/ResourceRoles/query': () => ({ items: [{ id: 1, resourceID: TECH, roleID: 501, isActive: true }], pageDetails: { count: 1 } }),
  '/Roles/query': () => ({ items: [{ id: 501, name: 'Help Desk', isActive: true }], pageDetails: { count: 1 } }),
};

const twoRoles = {
  '/ResourceRoles/query': () => ({ items: [
    { id: 1, resourceID: TECH, roleID: 501, isActive: true },
    { id: 2, resourceID: TECH, roleID: 502, isActive: true },
  ], pageDetails: { count: 2 } }),
  '/Roles/query': () => ({ items: [
    { id: 501, name: 'Help Desk', isActive: true },
    { id: 502, name: 'Engineer', isActive: true },
  ], pageDetails: { count: 2 } }),
};

function handler(): AutotaskToolHandler {
  return new AutotaskToolHandler(new AutotaskService(config, logger), logger);
}

function find(calls: Call[], method: string, suffix: string): Call | undefined {
  return calls.find(c => c.method === method && c.path.endsWith(suffix));
}

beforeEach(() => _resetZoneUrlCache());
afterEach(() => jest.restoreAllMocks());

describe('autotask_create_task phase and assignment', () => {
  test('advertises phaseID and the assigned resource role fields', () => {
    const props = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_task')!.inputSchema.properties;
    expect(props.phaseID.type).toBe('number');
    expect(props.assignedResourceRoleID.type).toBe('number');
    expect(props.assignedResourceRoleName.type).toBe('string');
  });

  test('posts phaseID and fills the resource\'s only role', async () => {
    const { calls } = mockAutotask({ ...oneRole, [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }) });

    const result = await handler().callTool('autotask_create_task', {
      projectID: PROJECT, title: 'Set up VPN', status: 1, phaseID: 77, assignedResourceID: TECH,
    });

    expect(result.isError).toBeFalsy();
    const body = find(calls, 'POST', `/Projects/${PROJECT}/Tasks`)!.body;
    expect(body).toMatchObject({ phaseID: 77, assignedResourceID: TECH, assignedResourceRoleID: 501, taskType: 1 });
  });

  test('resolves assignedResourceRoleName and never sends it to Autotask', async () => {
    const { calls } = mockAutotask({ ...twoRoles, [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }) });

    await handler().callTool('autotask_create_task', {
      projectID: PROJECT, title: 't', status: 1, assignedResourceID: TECH, assignedResourceRoleName: 'Engineer',
    });

    const body = find(calls, 'POST', `/Projects/${PROJECT}/Tasks`)!.body;
    expect(body.assignedResourceRoleID).toBe(502);
    expect(body).not.toHaveProperty('assignedResourceRoleName');
  });

  test('several roles and no choice is an error naming them, with nothing created', async () => {
    const { calls } = mockAutotask({ ...twoRoles, [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }) });

    const result = await handler().callTool('autotask_create_task', {
      projectID: PROJECT, title: 't', status: 1, assignedResourceID: TECH,
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text as string;
    expect(text).toContain('Help Desk (roleID 501)');
    expect(text).toContain('Engineer (roleID 502)');
    expect(find(calls, 'POST', `/Projects/${PROJECT}/Tasks`)).toBeUndefined();
  });

  test('an unassigned task looks up no role', async () => {
    const { calls } = mockAutotask({ [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }) });

    await handler().callTool('autotask_create_task', { projectID: PROJECT, title: 't', status: 1 });

    expect(find(calls, 'POST', `/Projects/${PROJECT}/Tasks`)!.body).not.toHaveProperty('assignedResourceRoleID');
    expect(calls.some(c => c.path.endsWith('/ResourceRoles/query'))).toBe(false);
  });
});

describe('autotask_update_task', () => {
  test('is advertised as a write tool filed under projects', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toEqual(['taskId']);
    expect(tool!.annotations?.readOnlyHint).not.toBe(true);
    expect(TOOL_CATEGORIES.projects.tools).toContain('autotask_update_task');
  });

  test('looks up the project, then PATCHes the project\'s Tasks with only the given fields', async () => {
    const { calls } = mockAutotask({
      ...oneRole,
      [`/Tasks/${TASK}`]: () => ({ item: { id: TASK, projectID: PROJECT } }),
      [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }),
    });

    const result = await handler().callTool('autotask_update_task', {
      taskId: TASK, status: 2, assignedResourceID: TECH, endDateTime: '2026-03-20T17:00:00Z',
    });

    expect(result.isError).toBeFalsy();
    expect(find(calls, 'PATCH', `/Projects/${PROJECT}/Tasks`)!.body).toEqual({
      id: TASK, status: 2, assignedResourceID: TECH, assignedResourceRoleID: 501, endDateTime: '2026-03-20T17:00:00Z',
    });
  });

  test('uses a given projectID without a lookup and keeps a given role', async () => {
    const { calls } = mockAutotask({ [`/Projects/${PROJECT}/Tasks`]: () => ({ itemId: TASK }) });

    await handler().callTool('autotask_update_task', {
      taskId: TASK, projectID: PROJECT, assignedResourceID: TECH, assignedResourceRoleID: 502, phaseID: 9,
    });

    expect(calls.some(c => c.method === 'GET')).toBe(false);
    expect(find(calls, 'PATCH', `/Projects/${PROJECT}/Tasks`)!.body).toEqual({
      id: TASK, assignedResourceID: TECH, assignedResourceRoleID: 502, phaseID: 9,
    });
  });

  test('a missing task is an error and nothing is patched', async () => {
    const { calls } = mockAutotask({});

    const result = await handler().callTool('autotask_update_task', { taskId: TASK, status: 5 });

    expect(result.isError).toBe(true);
    expect(calls.some(c => c.method === 'PATCH')).toBe(false);
  });

  test('refuses an update with no fields', async () => {
    const { calls } = mockAutotask({});

    const result = await handler().callTool('autotask_update_task', { taskId: TASK, projectID: PROJECT });

    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('autotask_update_ticket serviceLevelAgreementID', () => {
  test('is advertised as a nullable number', () => {
    const props = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_ticket')!.inputSchema.properties;
    expect(props.serviceLevelAgreementID.type).toEqual(['number', 'null']);
    expect(props.serviceLevelAgreementID.description).toMatch(/null/);
  });

  test('sets an SLA', async () => {
    const { calls } = mockAutotask({ '/Tickets': () => ({ itemId: 12345 }) });

    await handler().callTool('autotask_update_ticket', { ticketId: 12345, serviceLevelAgreementID: 4 });

    expect(find(calls, 'PATCH', '/Tickets')!.body).toEqual({ id: 12345, serviceLevelAgreementID: 4 });
  });

  test('clearing sends an explicit null in the PATCH body', async () => {
    const { calls } = mockAutotask({ '/Tickets': () => ({ itemId: 12345 }) });

    await handler().callTool('autotask_update_ticket', {
      ticketId: 12345, serviceLevelAgreementID: null, dueDateTime: '2026-03-15T17:00:00Z',
    });

    const body = find(calls, 'PATCH', '/Tickets')!.body;
    expect(body).toHaveProperty('serviceLevelAgreementID', null);
    expect(body.dueDateTime).toBe('2026-03-15T17:00:00Z');
  });
});
