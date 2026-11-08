// Ticket 153715: autotask_execute_tool was called with `id` instead of
// `ticketId` for autotask_update_ticket. Nothing checked the arguments, so the
// handler read ticketId as undefined, JSON.stringify dropped `id: undefined`
// from the PATCH body, and Autotask answered HTTP 500 "No matching records
// found" - followed by an impersonation/permissions hint that sent the
// operator down the wrong path. These tests cover each layer of the fix.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { AutotaskHttpClient } from '../src/services/autotask-http';
import { validateToolArguments, suggestParam } from '../src/utils/arg-validation';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = new Logger('error');

const API_URL = 'https://webservices2.autotask.net/ATServicesRest/';

const config: McpServerConfig = {
  name: 'test-server',
  version: '0.0.0',
  autotask: {
    username: 'user@example.com',
    secret: 'secret',
    integrationCode: 'integration-code',
    apiUrl: API_URL,
  },
};

function mockFetch(status = 200, body: unknown = {}) {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

const executeTool = (handler: AutotaskToolHandler, toolName: string, args: Record<string, unknown>) =>
  handler.callTool('autotask_execute_tool', { toolName, arguments: args });

beforeEach(() => {
  _resetZoneUrlCache();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('validateToolArguments', () => {
  const schema = {
    properties: { ticketId: {}, title: {}, status: {} },
    required: ['ticketId'],
  };

  it('accepts a valid call', () => {
    expect(validateToolArguments('t', schema, { ticketId: 1, title: 'x' })).toBeNull();
  });

  it('names the tool, the missing and unknown parameters, and the valid ones', () => {
    const msg = validateToolArguments('autotask_update_ticket', schema, { id: 5, title: 'x' })!;
    expect(msg).toContain('autotask_update_ticket');
    expect(msg).toContain('missing required parameter: ticketId');
    expect(msg).toContain('unknown parameter: id');
    expect(msg).toContain('Valid parameters: ticketId, title, status');
    expect(msg).toContain("did you mean 'ticketId'");
  });

  it('suggests the canonical casing', () => {
    expect(suggestParam('ticketid', ['ticketId', 'title'])).toBe('ticketId');
    expect(suggestParam('TicketId', ['ticketId', 'title'])).toBe('ticketId');
  });

  it('gives no suggestion when nothing is close', () => {
    const msg = validateToolArguments('t', schema, { ticketId: 1, banana: 1 })!;
    expect(msg).toContain('unknown parameter: banana');
    expect(msg).not.toContain('did you mean');
  });

  it('respects additionalProperties: true', () => {
    expect(validateToolArguments('t', { ...schema, additionalProperties: true }, { ticketId: 1, anything: 2 })).toBeNull();
  });

  it('still reports missing required parameters when additionalProperties is true', () => {
    expect(validateToolArguments('t', { ...schema, additionalProperties: true }, { anything: 2 })).toContain('ticketId');
  });
});

describe('execute_tool argument validation', () => {
  function setup() {
    const service = new AutotaskService(config, logger);
    const updateSpy = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);
    return { updateSpy, handler: new AutotaskToolHandler(service, logger) };
  }

  it('rejects `id` for update_ticket with a did-you-mean error and makes no HTTP call (ticket 153715)', async () => {
    const fetchMock = mockFetch();
    const { updateSpy, handler } = setup();

    const res = await executeTool(handler, 'autotask_update_ticket', {
      id: 153715,
      assignedResourceID: 29682943,
      assignedResourceRoleID: 29683355,
    });

    expect(res.isError).toBe(true);
    const text = res.content[0].text;
    expect(text).toContain('autotask_update_ticket');
    expect(text).toContain('missing required parameter: ticketId');
    expect(text).toContain('unknown parameter: id');
    expect(text).toContain("did you mean 'ticketId'");
    expect(text).toContain('Valid parameters:');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing required parameter', async () => {
    const fetchMock = mockFetch();
    const { updateSpy, handler } = setup();
    const res = await executeTool(handler, 'autotask_update_ticket', { title: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('missing required parameter: ticketId');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown parameter even when the required ones are present', async () => {
    const fetchMock = mockFetch();
    const { updateSpy, handler } = setup();
    const res = await executeTool(handler, 'autotask_update_ticket', { ticketId: 1, bogusField: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('unknown parameter: bogusField');
    expect(res.content[0].text).not.toContain('missing required');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still runs a valid call through execute_tool', async () => {
    const { updateSpy, handler } = setup();
    const res = await executeTool(handler, 'autotask_update_ticket', { ticketId: 153715, priority: 2 });
    expect(res.isError).toBeFalsy();
    expect(updateSpy).toHaveBeenCalledWith(153715, expect.objectContaining({ priority: 2 }));
  });

  it('a valid call reaches Autotask as PATCH /Tickets with the id in the body', async () => {
    const fetchMock = mockFetch(200, { itemId: 153715 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const res = await executeTool(handler, 'autotask_update_ticket', { ticketId: 153715, priority: 2 });
    expect(res.isError).toBeFalsy();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toMatchObject({ id: 153715, priority: 2 });
  });
});

describe('direct tools/call argument validation (the SDK does not validate)', () => {
  it('callTool rejects the same bad call before any handler or HTTP request', async () => {
    const fetchMock = mockFetch();
    const service = new AutotaskService(config, logger);
    const updateSpy = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined);
    const handler = new AutotaskToolHandler(service, logger);

    const res = await handler.callTool('autotask_update_ticket', { id: 153715, priority: 2 });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("did you mean 'ticketId'");
    expect(updateSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the companyId spelling for a companyID parameter', async () => {
    const service = new AutotaskService(config, logger);
    jest.spyOn(service, 'searchTickets').mockResolvedValue([{ id: 1 } as any]);
    const handler = new AutotaskToolHandler(service, logger);
    const res = await handler.callTool('autotask_search_tickets', { companyId: 5 });
    expect(res.isError).toBeFalsy();
  });
});

describe('AutotaskHttpClient refuses writes without a valid record id', () => {
  const client = () => new AutotaskHttpClient('user@example.com', 'secret', 'CODE', API_URL, logger);

  it.each([
    ['undefined', undefined],
    ['0', 0],
    ['negative', -4],
    ['fractional', 1.5],
    ['a string', '12'],
    ['NaN', NaN],
  ])('update() throws before fetch when the id is %s', async (_label, id) => {
    const fetchMock = mockFetch();
    await expect(client().update('Tickets', id as any, { priority: 1 })).rejects.toThrow(/positive integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delete() throws before fetch when the id is undefined or 0', async () => {
    const fetchMock = mockFetch();
    await expect(client().delete('Tickets', undefined as any)).rejects.toThrow(/positive integer/);
    await expect(client().delete('Tickets', 0)).rejects.toThrow(/positive integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('childUpdate() throws before fetch when the child id is missing', async () => {
    const fetchMock = mockFetch();
    await expect(client().childUpdate('Companies', 5, 'Contacts', undefined as any, { a: 1 })).rejects.toThrow(/positive integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('childUpdate() accepts parent id 0 (the root company)', async () => {
    const fetchMock = mockFetch();
    await client().childUpdate('Companies', 0, 'Contacts', 9, { firstName: 'J' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('update() with a valid id still sends the PATCH', async () => {
    const fetchMock = mockFetch();
    await client().update('Tickets', 153715, { priority: 1 });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ id: 153715, priority: 1 });
  });
});

describe('impersonation / permissions hint', () => {
  const impersonating = () =>
    new AutotaskHttpClient('user@example.com', 'secret', 'CODE', API_URL, logger, 29682886);

  it('is not appended to a failure the request itself caused', async () => {
    mockFetch(500, { errors: ['No matching records found'] });
    const err = (await impersonating().update('Tickets', 1, { priority: 1 }).catch((e: Error) => e)) as Error;
    expect(err.message).toContain('No matching records found');
    expect(err.message).not.toMatch(/impersonat/i);
  });

  it('is appended, worded as a possible cause, on a 403', async () => {
    mockFetch(403, { errors: ['Forbidden'] });
    const err = (await impersonating().update('Tickets', 1, { priority: 1 }).catch((e: Error) => e)) as Error;
    expect(err.message).toContain('29682886');
    expect(err.message).toContain('one possible cause');
  });

  it('is appended on a permission-shaped body even with another status', async () => {
    mockFetch(500, { errors: ['User does not have permission to update this entity'] });
    const err = (await impersonating().update('Tickets', 1, { priority: 1 }).catch((e: Error) => e)) as Error;
    expect(err.message).toContain('one possible cause');
  });

  it('never appears without impersonation', async () => {
    mockFetch(403, { errors: ['Forbidden'] });
    const plain = new AutotaskHttpClient('user@example.com', 'secret', 'CODE', API_URL, logger);
    const err = (await plain.update('Tickets', 1, { priority: 1 }).catch((e: Error) => e)) as Error;
    expect(err.message).not.toMatch(/impersonat/i);
  });
});

describe('autotask_search_tickets searchTerm', () => {
  it('matches ticket number prefix OR title in a single or-group (asserts on the body sent)', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    const service = new AutotaskService(config, logger);
    await service.searchTickets({ searchTerm: 'printer offline' } as any);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toMatch(/\/Tickets\/query$/);
    const { filter } = JSON.parse(init.body as string);
    expect(filter).toContainEqual({
      op: 'or',
      items: [
        { op: 'beginsWith', field: 'ticketNumber', value: 'printer offline' },
        { op: 'contains', field: 'title', value: 'printer offline' },
      ],
    });
    // The default open-tickets filter is still ANDed alongside it.
    expect(filter).toContainEqual({ op: 'noteq', field: 'status', value: 5 });
  });

  it('adds no or-group when there is no searchTerm', async () => {
    const fetchMock = mockFetch(200, { items: [] });
    await new AutotaskService(config, logger).searchTickets({} as any);
    const { filter } = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(filter.some((f: any) => f.op === 'or')).toBe(false);
  });
});
