// Role ids are Autotask's gate on two everyday writes — a ticket assigned to
// a resource, and any ticket/task time entry — and until now nothing here
// could discover one: no tool listed a resource's roles, the compact search
// formatter stripped roleID / assignedResourceRoleID from every result, and
// autotask_create_ticket dropped assignedResourceRoleID from its payload
// even when a caller knew it. A fellow was left guessing ids, which Autotask
// answers with "Role does not exist or is invalid" and nothing more.
// (FellowHire: Synergy Solution IT, sansa-stark, 2026-09-10.)

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { formatCompactResponse } from '../src/utils/response.formatter';
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

type Route = (body: any) => unknown;

/**
 * A fetch that answers by URL suffix, so a test can script ResourceRoles,
 * Roles, Tickets and TimeEntries independently and then read back what was
 * POSTed where.
 */
function mockAutotask(routes: Record<string, Route>): { calls: Array<{ path: string; method: string; body: any }> } {
  const calls: Array<{ path: string; method: string; body: any }> = [];
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

const RYAN = 29682887;

const ryanRoles = {
  '/ResourceRoles/query': () => ({ items: [
    { id: 1, resourceID: RYAN, roleID: 501, isActive: true, departmentID: 7, hourlyRate: 150 },
    { id: 2, resourceID: RYAN, roleID: 502, isActive: true, departmentID: 7, hourlyRate: 175 },
  ], pageDetails: { count: 2 } }),
  '/Roles/query': () => ({ items: [
    { id: 501, name: 'Help Desk', isActive: true },
    { id: 502, name: 'Engineer', isActive: true },
  ], pageDetails: { count: 2 } }),
};

const oneRole = {
  '/ResourceRoles/query': () => ({ items: [{ id: 1, resourceID: RYAN, roleID: 501, isActive: true }], pageDetails: { count: 1 } }),
  '/Roles/query': () => ({ items: [{ id: 501, name: 'Help Desk', isActive: true }], pageDetails: { count: 1 } }),
};

function handler(): AutotaskToolHandler {
  return new AutotaskToolHandler(new AutotaskService(config, logger), logger);
}

function posted(calls: Array<{ path: string; method: string; body: any }>, suffix: string): any {
  const call = calls.find(c => c.method === 'POST' && c.path.endsWith(suffix) && !c.path.endsWith('/query'));
  expect(call).toBeDefined();
  return call!.body;
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autotask_search_resource_roles', () => {
  test('is advertised, read-only, and filed under resources', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_search_resource_roles');
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(TOOL_CATEGORIES.resources.tools).toContain('autotask_search_resource_roles');
  });

  test('joins a resource\'s active assignments to the role names', async () => {
    const { calls } = mockAutotask(ryanRoles);

    const result = await handler().callTool('autotask_search_resource_roles', { resourceId: RYAN });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as any).text as string;
    expect(text).toContain('Help Desk (roleID 501)');
    expect(text).toContain('Engineer (roleID 502)');

    // Filtered on the resource and on active, never an enumeration.
    const rolesQuery = calls.find(c => c.path.endsWith('/ResourceRoles/query'))!.body;
    expect(rolesQuery.filter).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'resourceID', value: RYAN },
      { op: 'eq', field: 'isActive', value: true },
    ]));
    const namesQuery = calls.find(c => c.path.endsWith('/Roles/query'))!.body;
    expect(namesQuery.filter).toEqual([{ op: 'in', field: 'id', value: [501, 502] }]);
  });

  test('one role held across several departments or queues is one role', async () => {
    // Real data (Synergy, 2026-09-10): Help Desk came back five times for one
    // resource, once per queue. Counted as assignments it would have looked
    // like an ambiguous choice; it is a single role.
    mockAutotask({
      '/ResourceRoles/query': () => ({ items: [
        { id: 1, resourceID: RYAN, roleID: 501, isActive: true, departmentID: 7 },
        { id: 2, resourceID: RYAN, roleID: 501, isActive: true },
        { id: 3, resourceID: RYAN, roleID: 501, isActive: true, queueID: 4 },
      ], pageDetails: { count: 3 } }),
      '/Roles/query': () => ({ items: [{ id: 501, name: 'Help Desk', isActive: true }], pageDetails: { count: 1 } }),
      '/Tickets': () => ({ itemId: 19905 }),
    });

    const service = new AutotaskService(config, logger);
    expect(await service.searchResourceRoles(RYAN)).toHaveLength(1);
    expect(await service.resolveRoleForResource(RYAN)).toBe(501);
  });

  test('resolves resourceName when no id is given', async () => {
    mockAutotask({
      '/Resources/query': () => ({ items: [{ id: RYAN, firstName: 'Ryan', lastName: 'Rampersaud', isActive: true }], pageDetails: { count: 1 } }),
      ...oneRole,
    });

    const result = await handler().callTool('autotask_search_resource_roles', { resourceName: 'Ryan Rampersaud' });

    expect(result.isError).toBeFalsy();
    expect((result.content[0] as any).text).toContain('Help Desk (roleID 501)');
  });
});

describe('autotask_create_ticket assigned resource role', () => {
  test('assignedResourceRoleID reaches the payload instead of being stripped', async () => {
    const { calls } = mockAutotask({ '/Tickets': () => ({ itemId: 19900 }) });

    const result = await handler().callTool('autotask_create_ticket', {
      companyID: 1, title: 't', description: 'd', status: 1, priority: 2,
      assignedResourceID: RYAN, assignedResourceRoleID: 501,
    });

    expect(result.isError).toBeFalsy();
    const body = posted(calls, '/Tickets');
    expect(body.assignedResourceID).toBe(RYAN);
    expect(body.assignedResourceRoleID).toBe(501);
    // Nothing looked up: the caller already knew the role.
    expect(calls.some(c => c.path.endsWith('/ResourceRoles/query'))).toBe(false);
  });

  test('fills the role from the resource\'s only active role when none is given', async () => {
    const { calls } = mockAutotask({ ...oneRole, '/Tickets': () => ({ itemId: 19901 }) });

    const result = await handler().callTool('autotask_create_ticket', {
      companyID: 1, title: 't', description: 'd', status: 1, priority: 2, assignedResourceID: RYAN,
    });

    expect(result.isError).toBeFalsy();
    expect(posted(calls, '/Tickets').assignedResourceRoleID).toBe(501);
  });

  test('picks the role by name when the resource holds several', async () => {
    const { calls } = mockAutotask({ ...ryanRoles, '/Tickets': () => ({ itemId: 19902 }) });

    const result = await handler().callTool('autotask_create_ticket', {
      companyID: 1, title: 't', description: 'd', status: 1, priority: 2,
      assignedResourceID: RYAN, assignedResourceRoleName: 'help desk',
    });

    expect(result.isError).toBeFalsy();
    const body = posted(calls, '/Tickets');
    expect(body.assignedResourceRoleID).toBe(501);
    expect(body).not.toHaveProperty('assignedResourceRoleName');
  });

  test('refuses to guess between several roles, naming them', async () => {
    const { calls } = mockAutotask({ ...ryanRoles, '/Tickets': () => ({ itemId: 19903 }) });

    const result = await handler().callTool('autotask_create_ticket', {
      companyID: 1, title: 't', description: 'd', status: 1, priority: 2, assignedResourceID: RYAN,
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as any).text as string;
    expect(text).toContain('Help Desk (roleID 501)');
    expect(text).toContain('Engineer (roleID 502)');
    expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/Tickets'))).toBe(false);
  });

  test('an unassigned ticket needs no role and looks nothing up', async () => {
    const { calls } = mockAutotask({ '/Tickets': () => ({ itemId: 19904 }) });

    await handler().callTool('autotask_create_ticket', { companyID: 1, title: 't', description: 'd', status: 1, priority: 2 });

    expect(posted(calls, '/Tickets')).not.toHaveProperty('assignedResourceRoleID');
    expect(calls.some(c => c.path.endsWith('/ResourceRoles/query'))).toBe(false);
  });
});

describe('autotask_create_time_entry roleID', () => {
  // A fresh object per call: the handler resolves into (and deletes from) its argument.
  const entry = (): Record<string, any> => ({ ticketID: 19879, resourceID: RYAN, dateWorked: '2026-09-10', startDateTime: '2026-09-10T09:00:00', endDateTime: '2026-09-10T10:00:00', hoursWorked: 1, summaryNotes: 'work' });

  test('inherits the parent\'s role when the parent is assigned to the same resource', async () => {
    const { calls } = mockAutotask({
      '/Tickets/19879': () => ({ item: { id: 19879, assignedResourceID: RYAN, assignedResourceRoleID: 502 } }),
      '/TimeEntries': () => ({ itemId: 700 }),
    });

    const result = await handler().callTool('autotask_create_time_entry', entry());

    expect(result.isError).toBeFalsy();
    expect(posted(calls, '/TimeEntries').roleID).toBe(502);
    expect(calls.some(c => c.path.endsWith('/ResourceRoles/query'))).toBe(false);
  });

  test('an unassigned parent (null role) falls back to the resource\'s only role', async () => {
    const { calls } = mockAutotask({
      '/Tickets/19879': () => ({ item: { id: 19879, assignedResourceID: null, assignedResourceRoleID: null } }),
      ...oneRole,
      '/TimeEntries': () => ({ itemId: 701 }),
    });

    const result = await handler().callTool('autotask_create_time_entry', entry());

    expect(result.isError).toBeFalsy();
    expect(posted(calls, '/TimeEntries').roleID).toBe(501);
  });

  test('a parent assigned to someone else does not lend its role', async () => {
    const { calls } = mockAutotask({
      '/Tickets/19879': () => ({ item: { id: 19879, assignedResourceID: 12345, assignedResourceRoleID: 999 } }),
      ...oneRole,
      '/TimeEntries': () => ({ itemId: 702 }),
    });

    const result = await handler().callTool('autotask_create_time_entry', entry());

    expect(result.isError).toBeFalsy();
    expect(posted(calls, '/TimeEntries').roleID).toBe(501);
  });

  test('roleName picks among several roles and never reaches the payload', async () => {
    const { calls } = mockAutotask({ ...ryanRoles, '/TimeEntries': () => ({ itemId: 703 }) });

    const result = await handler().callTool('autotask_create_time_entry', { ...entry(), roleName: 'Help Desk' });

    expect(result.isError).toBeFalsy();
    const body = posted(calls, '/TimeEntries');
    expect(body.roleID).toBe(501);
    expect(body).not.toHaveProperty('roleName');
    // The parent was not consulted: the caller said which role.
    expect(calls.some(c => c.path.endsWith('/Tickets/19879'))).toBe(false);
  });

  test('several roles and no name is refused with the roles listed', async () => {
    const { calls } = mockAutotask({
      '/Tickets/19879': () => ({ item: { id: 19879, assignedResourceID: null, assignedResourceRoleID: null } }),
      ...ryanRoles,
      '/TimeEntries': () => ({ itemId: 704 }),
    });

    const result = await handler().callTool('autotask_create_time_entry', entry());

    expect(result.isError).toBe(true);
    expect((result.content[0] as any).text).toContain('Help Desk (roleID 501)');
    expect(calls.some(c => c.method === 'POST' && c.path.endsWith('/TimeEntries'))).toBe(false);
  });

  test('an explicit roleID is sent as given', async () => {
    const { calls } = mockAutotask({ '/TimeEntries': () => ({ itemId: 705 }) });

    await handler().callTool('autotask_create_time_entry', { ...entry(), roleID: 501 });

    expect(posted(calls, '/TimeEntries').roleID).toBe(501);
    expect(calls.some(c => c.path.endsWith('/Tickets/19879'))).toBe(false);
  });
});

describe('compact search results keep the role ids', () => {
  test('time entries carry roleID and tickets carry assignedResourceRoleID', () => {
    const entries = formatCompactResponse([{ id: 1, resourceID: RYAN, roleID: 501, ticketID: 2, dateWorked: '2026-09-10', hoursWorked: 1, summaryNotes: 'x', internalNotes: 'hidden' }], 'timeEntries', {});
    expect(entries.items[0]).toMatchObject({ roleID: 501 });
    expect(entries.items[0]).not.toHaveProperty('internalNotes');

    const tickets = formatCompactResponse([{ id: 2, ticketNumber: 'T1', title: 't', status: 1, priority: 2, companyID: 1, assignedResourceID: RYAN, assignedResourceRoleID: 501, description: 'hidden' }], 'tickets', {});
    expect(tickets.items[0]).toMatchObject({ assignedResourceRoleID: 501 });
    expect(tickets.items[0]).not.toHaveProperty('description');
  });
});
