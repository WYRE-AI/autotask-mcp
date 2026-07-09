// Regression tests for ticket resource assignment and type/subtype support:
// - assignedResourceRoleID and dueDateTime were declared in the tool schemas
//   but silently stripped by the TICKET_WRITABLE_FIELDS whitelist, so every
//   assignment attempt failed Autotask validation (role required with resource).
// - autotask_update_ticket's schema hid ticketType/queueID/ticketCategory/etc.
//   even though the whitelist would pass them through.
// - When only assignedResourceID is supplied, the handler auto-resolves the
//   resource's default role so assignment works without a role lookup.

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

function buildHandler() {
  const service = new AutotaskService(mockConfig, mockLogger);
  const handler = new AutotaskToolHandler(service, mockLogger, false);
  return { service, handler };
}

describe('ticket assignment payload passthrough', () => {
  test('create_ticket forwards assignedResourceRoleID and dueDateTime', async () => {
    const { service, handler } = buildHandler();
    const createTicket = jest.spyOn(service, 'createTicket').mockResolvedValue(42);

    await handler.callTool('autotask_create_ticket', {
      companyID: 1,
      title: 't',
      description: 'd',
      assignedResourceID: 7,
      assignedResourceRoleID: 99,
      dueDateTime: '2026-08-01T17:00:00Z'
    });

    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedResourceID: 7,
        assignedResourceRoleID: 99,
        dueDateTime: '2026-08-01T17:00:00Z'
      })
    );
  });

  test('update_ticket forwards type/subtype/queue/category and role fields', async () => {
    const { service, handler } = buildHandler();
    const updateTicket = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    await handler.callTool('autotask_update_ticket', {
      ticketId: 5,
      assignedResourceID: 7,
      assignedResourceRoleID: 99,
      ticketType: 2,
      issueType: 10,
      subIssueType: 136,
      queueID: 8,
      ticketCategory: 3,
      source: 4,
      dueDateTime: '2026-08-01T17:00:00Z'
    });

    expect(updateTicket).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        assignedResourceID: 7,
        assignedResourceRoleID: 99,
        ticketType: 2,
        issueType: 10,
        subIssueType: 136,
        queueID: 8,
        ticketCategory: 3,
        source: 4,
        dueDateTime: '2026-08-01T17:00:00Z'
      })
    );
  });

  test('auto-resolves the default role when only assignedResourceID is given', async () => {
    const { service, handler } = buildHandler();
    jest.spyOn(service, 'resolveDefaultRoleForResource').mockResolvedValue(31);
    const createTicket = jest.spyOn(service, 'createTicket').mockResolvedValue(42);

    await handler.callTool('autotask_create_ticket', {
      companyID: 1,
      title: 't',
      description: 'd',
      assignedResourceID: 7
    });

    expect(service.resolveDefaultRoleForResource).toHaveBeenCalledWith(7);
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ assignedResourceID: 7, assignedResourceRoleID: 31 })
    );
  });

  test('does not override an explicitly provided role', async () => {
    const { service, handler } = buildHandler();
    const resolve = jest.spyOn(service, 'resolveDefaultRoleForResource');
    const updateTicket = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);

    await handler.callTool('autotask_update_ticket', {
      ticketId: 5,
      assignedResourceID: 7,
      assignedResourceRoleID: 99
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(updateTicket).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ assignedResourceRoleID: 99 })
    );
  });

  test('leaves payload untouched when no role can be resolved', async () => {
    const { service, handler } = buildHandler();
    jest.spyOn(service, 'resolveDefaultRoleForResource').mockResolvedValue(null);
    const createTicket = jest.spyOn(service, 'createTicket').mockResolvedValue(42);

    await handler.callTool('autotask_create_ticket', {
      companyID: 1,
      title: 't',
      description: 'd',
      assignedResourceID: 7
    });

    const payload = createTicket.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.assignedResourceRoleID).toBeUndefined();
  });
});

describe('update_ticket schema exposes categorization fields', () => {
  const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_ticket')!;
  const props = (def.inputSchema as { properties: Record<string, unknown> }).properties;

  test.each([
    'ticketType', 'queueID', 'ticketCategory', 'source', 'billingCodeID',
    'serviceLevelAgreementID', 'estimatedHours', 'projectID', 'resolution',
    'userDefinedFields', 'assignedResourceID', 'assignedResourceRoleID', 'dueDateTime'
  ])('%s is present', (field) => {
    expect(props[field]).toBeDefined();
  });
});

describe('resource role and secondary resource tools', () => {
  const toolNames = new Set(TOOL_DEFINITIONS.map(t => t.name));

  test('new tools are defined and categorized', () => {
    for (const name of [
      'autotask_search_resource_roles',
      'autotask_search_ticket_secondary_resources',
      'autotask_create_ticket_secondary_resource',
      'autotask_delete_ticket_secondary_resource'
    ]) {
      expect(toolNames.has(name)).toBe(true);
    }
    expect(TOOL_CATEGORIES.resources.tools).toContain('autotask_search_resource_roles');
    expect(TOOL_CATEGORIES.tickets.tools).toContain('autotask_create_ticket_secondary_resource');
  });

  test('delete_ticket_secondary_resource is marked destructive', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_delete_ticket_secondary_resource')!;
    expect(def.annotations?.destructiveHint).toBe(true);
  });

  test('create_ticket_secondary_resource auto-resolves role when omitted', async () => {
    const { service, handler } = buildHandler();
    jest.spyOn(service, 'resolveDefaultRoleForResource').mockResolvedValue(31);
    const create = jest.spyOn(service, 'createTicketSecondaryResource').mockResolvedValue(77);

    await handler.callTool('autotask_create_ticket_secondary_resource', {
      ticketID: 5,
      resourceID: 7
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ ticketID: 5, resourceID: 7, roleID: 31 })
    );
  });

  test('search_ticket_secondary_resources routes filters to the service', async () => {
    const { service, handler } = buildHandler();
    const search = jest.spyOn(service, 'searchTicketSecondaryResources').mockResolvedValue([]);

    await handler.callTool('autotask_search_ticket_secondary_resources', { ticketId: 5 });

    expect(search).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 5 }));
  });
});
