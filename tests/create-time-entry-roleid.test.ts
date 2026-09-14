// Tests for autotask_create_time_entry auto-populating roleID on non-Regular
// (ticket- or task-scoped) time entries: it defaults to the parent's
// assignedResourceRoleID when the parent is assigned to the SAME resource
// logging the time, may be overridden by an explicit roleID, falls back to the
// resource's own active roles otherwise (see tests/resource-roles.test.ts), and
// throws an actionable error when none of those yields a role.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

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

function makeHandler() {
  const service = new AutotaskService(config, logger);
  const getTicketSpy = jest.spyOn(service, 'getTicket');
  const getTaskSpy = jest.spyOn(service, 'getTask');
  const createSpy = jest.spyOn(service, 'createTimeEntry').mockResolvedValue(4242);
  // Resource 12 holds no roles unless a test says otherwise, so the fallback
  // to the resource's own roles is observable as its "no active roles" error.
  const rolesSpy = jest.spyOn(service, 'searchResourceRoles').mockResolvedValue([]);
  const handler = new AutotaskToolHandler(service, logger);
  return { service, handler, getTicketSpy, getTaskSpy, createSpy, rolesSpy };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autotask_create_time_entry roleID defaulting', () => {
  test('happy path (ticket-scoped): roleID defaults from ticket.assignedResourceRoleID', async () => {
    const { handler, getTicketSpy, getTaskSpy, createSpy } = makeHandler();
    getTicketSpy.mockResolvedValue({ id: 48231, assignedResourceID: 12, assignedResourceRoleID: 7 } as any);

    const result = await handler.callTool('autotask_create_time_entry', {
      ticketID: 48231,
      resourceID: 12,
      hoursWorked: 1.5,
    });

    expect(result.isError).toBeFalsy();
    expect(getTicketSpy).toHaveBeenCalledWith(48231);
    expect(getTaskSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ ticketID: 48231, roleID: 7 }));
  });

  test('happy path (task-scoped): roleID defaults from task.assignedResourceRoleID', async () => {
    const { handler, getTicketSpy, getTaskSpy, createSpy } = makeHandler();
    getTaskSpy.mockResolvedValue({ id: 777, assignedResourceID: 12, assignedResourceRoleID: 9 } as any);

    const result = await handler.callTool('autotask_create_time_entry', {
      taskID: 777,
      resourceID: 12,
      hoursWorked: 2,
    });

    expect(result.isError).toBeFalsy();
    expect(getTaskSpy).toHaveBeenCalledWith(777);
    expect(getTicketSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ taskID: 777, roleID: 9 }));
  });

  test('an explicit roleID overrides the lookup and skips it entirely', async () => {
    const { handler, getTicketSpy, getTaskSpy, createSpy } = makeHandler();

    const result = await handler.callTool('autotask_create_time_entry', {
      ticketID: 48231,
      resourceID: 12,
      hoursWorked: 1.5,
      roleID: 3,
    });

    expect(result.isError).toBeFalsy();
    expect(getTicketSpy).not.toHaveBeenCalled();
    expect(getTaskSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ ticketID: 48231, roleID: 3 }));
  });

  test('a ticket assigned to someone else lends no role: the resource\'s own roles decide', async () => {
    const { handler, getTicketSpy, createSpy, rolesSpy } = makeHandler();
    getTicketSpy.mockResolvedValue({ id: 48231, assignedResourceID: 99, assignedResourceRoleID: 7 } as any);
    rolesSpy.mockResolvedValue([{ roleID: 5, roleName: 'Help Desk', resourceID: 12, isActive: true }]);

    const result = await handler.callTool('autotask_create_time_entry', {
      ticketID: 48231,
      resourceID: 12,
      hoursWorked: 1.5,
    });

    expect(result.isError).toBeFalsy();
    expect(rolesSpy).toHaveBeenCalledWith(12);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ ticketID: 48231, roleID: 5 }));
  });

  test('throws when the ticket has no assignedResourceRoleID, no roleID was provided, and the resource has no roles', async () => {
    const { handler, getTicketSpy, createSpy, rolesSpy } = makeHandler();
    getTicketSpy.mockResolvedValue({ id: 48231 } as any);

    const result = await handler.callTool('autotask_create_time_entry', {
      ticketID: 48231,
      resourceID: 12,
      hoursWorked: 1.5,
    });

    expect(result.isError).toBe(true);
    expect(rolesSpy).toHaveBeenCalledWith(12);
    expect(result.content[0].text).toContain('no active roles');
    expect(result.content[0].text).toContain('12');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('throws when the task has no assignedResourceRoleID, no roleID was provided, and the resource has no roles', async () => {
    const { handler, getTaskSpy, createSpy, rolesSpy } = makeHandler();
    getTaskSpy.mockResolvedValue({ id: 777 } as any);

    const result = await handler.callTool('autotask_create_time_entry', {
      taskID: 777,
      resourceID: 12,
      hoursWorked: 2,
    });

    expect(result.isError).toBe(true);
    expect(rolesSpy).toHaveBeenCalledWith(12);
    expect(result.content[0].text).toContain('no active roles');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('throws when the ticketID does not resolve to a ticket', async () => {
    const { handler, getTicketSpy, createSpy } = makeHandler();
    getTicketSpy.mockResolvedValue(null);

    const result = await handler.callTool('autotask_create_time_entry', {
      ticketID: 99999,
      resourceID: 12,
      hoursWorked: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No Ticket found matching');
    expect(result.content[0].text).toContain('99999');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('throws when the taskID does not resolve to a task', async () => {
    const { handler, getTaskSpy, createSpy } = makeHandler();
    getTaskSpy.mockResolvedValue(null);

    const result = await handler.callTool('autotask_create_time_entry', {
      taskID: 99999,
      resourceID: 12,
      hoursWorked: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No Task found matching');
    expect(result.content[0].text).toContain('99999');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('Regular Time entries (no ticket/task) never trigger the roleID lookup', async () => {
    const { handler, getTicketSpy, getTaskSpy, createSpy } = makeHandler();

    const result = await handler.callTool('autotask_create_time_entry', {
      resourceID: 12,
      hoursWorked: 1,
      internalBillingCodeID: 3,
    });

    expect(result.isError).toBeFalsy();
    expect(getTicketSpy).not.toHaveBeenCalled();
    expect(getTaskSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceID: 12, hoursWorked: 1 }));
    expect((createSpy.mock.calls[0][0] as any).roleID).toBeUndefined();
  });
});
