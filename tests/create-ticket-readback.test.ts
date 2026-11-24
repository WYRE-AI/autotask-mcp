// autotask_create_ticket reads the new ticket back so the result names it the
// way people do: "Created ticket T20260101.0001 (ID 12345) in Service Desk". A
// failed read-back must never turn a created ticket into an error, and `data`
// stays the numeric ID for existing callers.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

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

const FIELDS = {
  fields: [
    {
      name: 'queueID', isPickList: true,
      picklistValues: [
        { value: 8, label: 'Service Desk', isActive: true },
      ],
    },
    { name: 'status', isPickList: true, picklistValues: [{ value: 1, label: 'New', isActive: true }] },
  ],
};

function respond(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Routes the fake Autotask API by method and path. */
function mockAutotask(opts: { ticket?: unknown; getStatus?: number; fieldsStatus?: number } = {}): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any, init: any) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && u.endsWith('/Tickets')) return respond(200, { itemId: 12345 });
    if (u.includes('/Tickets/entityInformation/fields')) {
      return respond(opts.fieldsStatus ?? 200, opts.fieldsStatus ? { errors: ['nope'] } : FIELDS);
    }
    if (method === 'GET' && /\/Tickets\/12345$/.test(u)) {
      if (opts.getStatus) return respond(opts.getStatus, { errors: ['boom'] });
      return respond(200, { item: opts.ticket });
    }
    return respond(404, { errors: [`unexpected ${method} ${u}`] });
  });
}

const args = {
  companyID: 1,
  title: 'Printer offline',
  description: 'The printer is offline',
  status: 1,
  priority: 2,
  dueDateTime: '2026-12-01T05:00:00Z',
};

const ticket = {
  id: 12345, ticketNumber: 'T20260101.0001', title: 'Printer offline', queueID: 8, status: 1,
};

beforeEach(() => _resetZoneUrlCache());
afterEach(() => jest.restoreAllMocks());

function parse(result: any): any {
  return JSON.parse(result.content[0].text);
}

describe('autotask_create_ticket read-back', () => {
  test('names the ticket number, queue, title and status', async () => {
    mockAutotask({ ticket });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const result = await handler.callTool('autotask_create_ticket', { ...args, queueID: 8 });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.message).toBe('Created ticket T20260101.0001 (ID 12345) in Service Desk: "Printer offline", status New');
    expect(body.data).toBe(12345);
    expect(body.ticket).toMatchObject({
      id: 12345, ticketNumber: 'T20260101.0001', queueID: 8, queue: 'Service Desk', statusID: 1, status: 'New',
    });
  });

  test('a failed read-back still reports success with the ID', async () => {
    mockAutotask({ getStatus: 500 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const result = await handler.callTool('autotask_create_ticket', { ...args, queueID: 8 });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.data).toBe(12345);
    expect(body.message).toMatch(/^Created ticket with ID 12345; the ticket number could not be read back/);
    expect(body.ticket.id).toBe(12345);
    expect(body.ticket.ticketNumber).toBeUndefined();
  });

  test('picklist failures fall back to the IDs', async () => {
    mockAutotask({ ticket, fieldsStatus: 500 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const body = parse(await handler.callTool('autotask_create_ticket', { ...args, queueID: 8 }));
    expect(body.message).toBe('Created ticket T20260101.0001 (ID 12345) in queue 8: "Printer offline", status #1');
  });
});

/** Never settles until the request is aborted, like a vendor call that hangs. */
function stalled(init: any, seen: AbortSignal[]): Promise<Response> {
  const signal = init?.signal as AbortSignal | undefined;
  if (signal) seen.push(signal);
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    }, { once: true });
  });
}

describe('autotask_create_ticket read-back deadline', () => {
  afterEach(() => jest.useRealTimers());

  test('a stalled ticket read-back returns the created ID after the deadline and cancels the request', async () => {
    jest.useFakeTimers();
    const seen: AbortSignal[] = [];
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      if (init?.method === 'POST' && u.endsWith('/Tickets')) return respond(200, { itemId: 12345 });
      if (u.endsWith('/Tickets/12345')) return stalled(init, seen);
      return respond(404, { errors: ['unexpected'] });
    });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);

    const pending = handler.callTool('autotask_create_ticket', { ...args, queueID: 8 });
    await jest.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.data).toBe(12345);
    expect(body.message).toBe('Created ticket with ID 12345; the ticket number could not be read back (timed out)');
    expect(body.ticket).toEqual({ id: 12345, error: 'timed out' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(s => s.aborted)).toBe(true);
    // The create itself was sent once and never retried.
    const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST');
    expect(posts).toHaveLength(1);
  });

  test('a stalled picklist lookup is bounded by the same deadline', async () => {
    jest.useFakeTimers();
    const seen: AbortSignal[] = [];
    jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'POST' && u.endsWith('/Tickets')) return respond(200, { itemId: 12345 });
      if (u.includes('/Tickets/entityInformation/fields')) return stalled(init, seen);
      if (u.endsWith('/Tickets/12345')) return respond(200, { item: ticket });
      return respond(404, { errors: ['unexpected'] });
    });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);

    const pending = handler.callTool('autotask_create_ticket', { ...args, queueID: 8 });
    await jest.advanceTimersByTimeAsync(5000);
    const body = parse(await pending);

    expect(body.data).toBe(12345);
    expect(body.message).toContain('could not be read back (timed out)');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(s => s.aborted)).toBe(true);
  });
});

describe('other create messages', () => {
  test('autotask_create_contact names the contact from its arguments', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue(respond(200, { itemId: 77 }));
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const body = parse(await handler.callTool('autotask_create_contact', {
      companyID: 1, firstName: 'Jane', lastName: 'Doe', emailAddress: 'jane@example.com',
    }));
    expect(body.message).toBe('Created contact Jane Doe (ID 77)');
    expect(body.data).toBe(77);
  });
});
