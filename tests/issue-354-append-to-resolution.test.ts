// Issue #354: Tickets.resolution was writable but not advertised on
// autotask_update_ticket, and autotask_create_time_entry had no equivalent of
// the Autotask UI's "append to resolution" checkbox. These tests mock fetch and
// assert on the requests actually sent.

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

type Reply = { status?: number; body?: unknown };

function res({ status = 200, body = {} }: Reply): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Route fetch by "<METHOD> <path after /v1.0>". Ticket GETs consume `ticketGets`
 * in order (the last reply repeats).
 */
function mockApi(opts: { ticketGets?: Reply[]; post?: Reply; patch?: Reply } = {}) {
  const ticketGets = [...(opts.ticketGets ?? [{ body: { item: { id: 100, resolution: '' } } }])];
  return jest.spyOn(global, 'fetch' as any).mockImplementation((async (url: string, init: RequestInit) => {
    const route = `${init.method} ${new URL(url).pathname.replace('/ATServicesRest/v1.0', '')}`;
    if (route.startsWith('POST ') && route.endsWith('/query')) return res({ body: { items: [] } });
    if (route === 'GET /Tickets/100') {
      return res(ticketGets.length > 1 ? ticketGets.shift()! : ticketGets[0]!);
    }
    if (route === 'POST /TimeEntries') return res(opts.post ?? { body: { itemId: 4242 } });
    if (route === 'PATCH /Tickets') return res(opts.patch ?? { body: { itemId: 100 } });
    throw new Error(`unexpected request ${route}`);
  }) as any);
}

// Ignores the mapping-cache warm-up queries (POST /<Entity>/query) that callTool()
// issues when formatting any object result; they are unrelated to this feature.
const routes = (f: jest.SpyInstance) =>
  f.mock.calls.map((c: any[]) => `${(c[1] as RequestInit).method} ${new URL(c[0] as string).pathname.replace('/ATServicesRest/v1.0', '')}`)
    .filter((r: string) => !r.endsWith('/query'));

const bodyOf = (f: jest.SpyInstance, route: string) => {
  const i = routes(f).indexOf(route);
  return JSON.parse((f.mock.calls[i][1] as RequestInit).body as string);
};

const ticketWith = (resolution: string): Reply => ({ body: { item: { id: 100, resolution } } });

const baseArgs = {
  ticketID: 100,
  resourceID: 12,
  roleID: 3,
  dateWorked: '2026-10-29',
  hoursWorked: 1,
  summaryNotes: 'B',
  internalNotes: 'secret internal',
  appendToResolution: true,
};

function makeHandler() {
  return new AutotaskToolHandler(new AutotaskService(config, logger), logger);
}

function payload(result: { content: Array<{ text: string }> }): any {
  return JSON.parse(result.content[0]!.text);
}

beforeEach(() => _resetZoneUrlCache());
afterEach(() => jest.restoreAllMocks());

describe('schema (issue #354)', () => {
  const def = (n: string) => TOOL_DEFINITIONS.find((t) => t.name === n)!;

  test('autotask_update_ticket exposes resolution with maxLength 32000 and replace semantics', () => {
    const prop = def('autotask_update_ticket').inputSchema.properties.resolution;
    expect(prop.type).toBe('string');
    expect(prop.maxLength).toBe(32000);
    expect(prop.description).toMatch(/REPLACES/);
    expect(prop.description).toMatch(/autotask_get_ticket_details/);
    expect(prop.description).toMatch(/appendToResolution/);
  });

  test('autotask_create_time_entry exposes appendToResolution as boolean', () => {
    const prop = def('autotask_create_time_entry').inputSchema.properties.appendToResolution;
    expect(prop.type).toBe('boolean');
    expect(prop.description).toMatch(/ticket/i);
  });
});

describe('autotask_update_ticket resolution', () => {
  test('passes resolution through to the PATCH body', async () => {
    const fetchMock = mockApi();
    const result = await makeHandler().callTool('autotask_update_ticket', { ticketId: 100, resolution: 'Fixed it' });
    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toEqual(['PATCH /Tickets']);
    expect(bodyOf(fetchMock, 'PATCH /Tickets')).toEqual({ id: 100, resolution: 'Fixed it' });
  });
});

describe('autotask_create_time_entry appendToResolution', () => {
  test('empty resolution: PATCH resolution is exactly summaryNotes, with only id + resolution', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('')] });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toEqual(['GET /Tickets/100', 'POST /TimeEntries', 'GET /Tickets/100', 'PATCH /Tickets']);
    expect(bodyOf(fetchMock, 'PATCH /Tickets')).toEqual({ id: 100, resolution: 'B' });
    const data = payload(result).data;
    expect(data).toMatchObject({ timeEntryId: 4242, resolutionAppended: true, resolutionLength: 1 });
  });

  test('existing resolution: joined with a blank line, "A\\r\\n\\r\\nB"', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('A')] });
    await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });
    expect(bodyOf(fetchMock, 'PATCH /Tickets')).toEqual({ id: 100, resolution: 'A\r\n\r\nB' });
  });

  test('internalNotes are never appended', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('A')] });
    await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });
    expect(bodyOf(fetchMock, 'PATCH /Tickets').resolution).not.toContain('secret internal');
    // ...but the time entry itself still carries them.
    expect(bodyOf(fetchMock, 'POST /TimeEntries').internalNotes).toBe('secret internal');
  });

  test('appendToResolution is stripped from the TimeEntries POST body', async () => {
    const fetchMock = mockApi();
    await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });
    const body = bodyOf(fetchMock, 'POST /TimeEntries');
    expect(body).not.toHaveProperty('appendToResolution');
    expect(body).toMatchObject({ ticketID: 100, summaryNotes: 'B' });
  });

  test.each([
    ['absent', undefined],
    ['false', false],
  ])('appendToResolution %s: plain create, no ticket GET, no PATCH, numeric result', async (_l, flag) => {
    const fetchMock = mockApi();
    const args: Record<string, unknown> = { ...baseArgs };
    if (flag === undefined) delete args.appendToResolution; else args.appendToResolution = flag;
    const result = await makeHandler().callTool('autotask_create_time_entry', args);

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toEqual(['POST /TimeEntries']);
    expect(bodyOf(fetchMock, 'POST /TimeEntries')).not.toHaveProperty('appendToResolution');
    expect(payload(result).data).toBe(4242);
  });

  test('taskID is rejected before any network call', async () => {
    const fetchMock = mockApi();
    const result = await makeHandler().callTool('autotask_create_time_entry', {
      ...baseArgs, ticketID: undefined, taskID: 777,
    });
    expect(result.isError).toBe(true);
    expect(payload(result).error).toMatch(/appendToResolution only applies to ticket time entries/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('Regular Time (no ticketID) is rejected before any network call', async () => {
    const fetchMock = mockApi();
    const result = await makeHandler().callTool('autotask_create_time_entry', {
      ...baseArgs, ticketID: undefined, internalBillingCodeID: 3,
    });
    expect(result.isError).toBe(true);
    expect(payload(result).error).toMatch(/appendToResolution only applies to ticket time entries/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('overflow detected before creating: no time entry, no truncation, error names the numbers', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('x'.repeat(31999))] });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBe(true);
    const error = payload(result).error as string;
    expect(error).toMatch(/current length 31999/);
    expect(error).toMatch(/added 5\b/); // "\r\n\r\n" + "B"
    expect(error).toMatch(/32000/);
    expect(error).toMatch(/NOT created/);
    expect(routes(fetchMock)).toEqual(['GET /Tickets/100']);
  });

  test('overflow only after create (resolution grew between reads): partial success, no PATCH', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('A'), ticketWith('x'.repeat(31999))] });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toEqual(['GET /Tickets/100', 'POST /TimeEntries', 'GET /Tickets/100']);
    const data = payload(result).data;
    expect(data).toMatchObject({ timeEntryId: 4242, timeEntryCreated: true, resolutionAppended: false });
    expect(data.warning).toMatch(/do NOT create it again/);
    expect(data.warning).toMatch(/32000-character limit/);
  });

  test('PATCH failure: partial success with the time entry id, vendor status, and manual recovery steps', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('A')], patch: { status: 500, body: { errors: ['boom'] } } });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toContain('PATCH /Tickets');
    const data = payload(result).data;
    expect(data).toMatchObject({ timeEntryId: 4242, timeEntryCreated: true, resolutionAppended: false });
    expect(data.warning).toMatch(/WAS created/);
    expect(data.warning).toMatch(/HTTP 500/);
    expect(data.warning).toMatch(/autotask_update_ticket/);
    expect(data.warning).toMatch(/autotask_get_ticket_details/);
  });

  test('post-create GET failure: partial success, no PATCH attempted', async () => {
    const fetchMock = mockApi({ ticketGets: [ticketWith('A'), { status: 503, body: {} }] });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).not.toContain('PATCH /Tickets');
    const data = payload(result).data;
    expect(data).toMatchObject({ timeEntryId: 4242, resolutionAppended: false });
    expect(data.warning).toMatch(/re-reading the ticket failed/);
    expect(data.warning).toMatch(/HTTP 503/);
  });

  test('pre-create ticket read failure: error, nothing created', async () => {
    const fetchMock = mockApi({ ticketGets: [{ status: 503, body: {} }] });
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs });

    expect(result.isError).toBe(true);
    expect(payload(result).error).toMatch(/NOT created/);
    expect(routes(fetchMock)).not.toContain('POST /TimeEntries');
  });

  test.each([[''], ['   \n']])('empty/whitespace summaryNotes %j: creates entry, skips append', async (notes) => {
    const fetchMock = mockApi();
    const result = await makeHandler().callTool('autotask_create_time_entry', { ...baseArgs, summaryNotes: notes });

    expect(result.isError).toBeFalsy();
    expect(routes(fetchMock)).toEqual(['POST /TimeEntries']);
    const data = payload(result).data;
    expect(data).toMatchObject({ timeEntryId: 4242, resolutionAppended: false });
    expect(data.reason).toMatch(/summaryNotes is empty/);
  });
});
