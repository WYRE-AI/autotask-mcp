// Batch/composite reads for service-call schedule syncs. A high-volume
// service-call sync was reading one service call at a time (get service call,
// then its tickets, then each ticket's resources, then each ticket), several
// Autotask requests per service call. These tests pin the batched routes and
// filters: `in` lists on the documented Autotask field names, chunked, with
// bounded totals.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import {
  AutotaskService,
  IN_FILTER_CHUNK_SIZE,
  normalizeIdList,
} from '../src/services/autotask.service';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from '../src/handlers/tool.definitions';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';
import { _resetZoneUrlCache } from '../src/utils/config';
import { MappingService, _resetTenantCacheStore } from '../src/utils/mapping.service';

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

type Responder = (path: string, body: any) => unknown;

/**
 * Route-aware fetch mock: answers each request from `responder(path, body)`
 * and records every call so tests can assert routes and filters.
 */
function mockFetch(responder: Responder) {
  const calls: Array<{ method: string; path: string; body: any }> = [];
  const spy = jest.spyOn(global, 'fetch' as any).mockImplementation(async (...args: unknown[]) => {
    const [url, init] = args as [string, RequestInit];
    const path = new URL(url).pathname.replace('/ATServicesRest/v1.0', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init.method as string, path, body });
    // Evaluate the responder here, not inside text(): a throw for an
    // unexpected route must fail the request, not read as an empty body.
    const payload = JSON.stringify(responder(path, body));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => payload,
    } as unknown as Response;
  });
  return { spy, calls };
}

/** Find the `in` filter's values in a query body. */
function inValues(body: any, field: string): number[] | undefined {
  return body?.filter?.find((f: any) => f.op === 'in' && f.field === field)?.value;
}

/** Filter rows by the query's in/eq/gt/gte/lte filters, like Autotask would. */
function applyFilters(rows: any[], body: any): any[] {
  return rows.filter(row => (body?.filter ?? []).every((f: any) => {
    const v = row[f.field];
    if (f.op === 'in') return f.value.includes(v);
    if (f.op === 'eq') return v === f.value;
    if (f.op === 'gt') return v !== undefined && v > f.value;
    if (f.op === 'gte') return v !== undefined && v >= f.value;
    if (f.op === 'lte') return v !== undefined && v <= f.value;
    return true;
  }));
}

const SERVICE_CALLS = [
  { id: 1001, description: 'Morning onsite', status: 1, companyID: 11, startDateTime: '2026-11-20T15:00:00Z', lastModifiedDateTime: '2026-11-19T10:00:00Z' },
  { id: 1002, description: 'Afternoon onsite', status: 1, companyID: 12, startDateTime: '2026-11-20T20:00:00Z', lastModifiedDateTime: '2026-11-19T11:00:00Z' },
];
const LINKS = [
  { id: 501, serviceCallID: 1001, ticketID: 9001 },
  { id: 502, serviceCallID: 1001, ticketID: 9002 },
  { id: 503, serviceCallID: 1002, ticketID: 9003 },
];
const ASSIGNMENTS = [
  { id: 701, serviceCallTicketID: 501, resourceID: 30 },
  { id: 702, serviceCallTicketID: 502, resourceID: 31 },
  { id: 703, serviceCallTicketID: 503, resourceID: 31 },
];
const TICKETS = [
  { id: 9001, ticketNumber: 'T20261120.0001', title: 'Printer down', status: 1, companyID: 11, description: 'long text' },
  { id: 9002, ticketNumber: 'T20261120.0002', title: 'New laptop', status: 8, companyID: 11 },
  { id: 9003, ticketNumber: 'T20261120.0003', title: 'Switch swap', status: 1, companyID: 12 },
];

function scheduleResponder(serviceCalls: Array<Record<string, unknown>> = SERVICE_CALLS): Responder {
  return (path, body) => {
    if (path === '/ServiceCalls/query') return { items: applyFilters(serviceCalls, body), pageDetails: {} };
    if (path === '/ServiceCallTickets/query') return { items: applyFilters(LINKS, body), pageDetails: {} };
    if (path === '/ServiceCallTicketResources/query') return { items: applyFilters(ASSIGNMENTS, body), pageDetails: {} };
    if (path === '/Tickets/query') return { items: applyFilters(TICKETS, body), pageDetails: {} };
    throw new Error(`unexpected route ${path}`);
  };
}

beforeEach(() => {
  _resetZoneUrlCache();
  _resetTenantCacheStore();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('normalizeIdList', () => {
  test('dedupes, accepts numeric strings and rejects junk before any request', () => {
    expect(normalizeIdList([3, 3, '4', 0], 'ids', 10)).toEqual([3, 4, 0]);
    expect(normalizeIdList(undefined, 'ids', 10)).toEqual([]);
    expect(() => normalizeIdList([1.5], 'ids', 10)).toThrow(/integer/);
    expect(() => normalizeIdList([-1], 'ids', 10)).toThrow(/integer/);
    // The error names the position, never the raw value.
    expect(() => normalizeIdList([1, { email: 'someone@example.com' }], 'ticketIDs', 10)).toThrow('ticketIDs[1] must be a non-negative integer ID');
    expect(() => normalizeIdList([1, { email: 'someone@example.com' }], 'ticketIDs', 10)).not.toThrow(/example\.com/);
    expect(() => normalizeIdList(7, 'ids', 10)).toThrow(/array/);
    expect(() => normalizeIdList([1, 2, 3], 'ids', 2)).toThrow(/at most 2/);
  });
});

describe('getServiceCallSchedule', () => {
  test('serviceCallIds: four batched queries, no per-service-call requests', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);

    const schedule = await service.getServiceCallSchedule({ serviceCallIds: [1002, 1001] });

    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual([
      'POST /ServiceCalls/query',
      'POST /ServiceCallTickets/query',
      'POST /ServiceCallTicketResources/query',
      'POST /Tickets/query',
    ]);
    expect(inValues(calls[0].body, 'id')).toEqual([1002, 1001]);
    expect(inValues(calls[1].body, 'serviceCallID')).toEqual([1002, 1001]);
    expect(inValues(calls[2].body, 'serviceCallTicketID')).toEqual([501, 502, 503]);
    expect(inValues(calls[3].body, 'id')).toEqual([9003, 9001, 9002]);
    expect(calls[3].body.IncludeFields).toEqual(expect.arrayContaining(['id', 'ticketNumber', 'title', 'status', 'companyID']));

    // Input order is kept.
    expect(schedule.serviceCalls.map(c => c.id)).toEqual([1002, 1001]);
    const morning = schedule.serviceCalls[1];
    expect(morning.tickets).toEqual([
      {
        serviceCallTicketID: 501,
        ticketID: 9001,
        ticket: { id: 9001, ticketNumber: 'T20261120.0001', title: 'Printer down', status: 1, companyID: 11 },
        resources: [{ serviceCallTicketResourceID: 701, resourceID: 30 }],
      },
      {
        serviceCallTicketID: 502,
        ticketID: 9002,
        ticket: { id: 9002, ticketNumber: 'T20261120.0002', title: 'New laptop', status: 8, companyID: 11 },
        resources: [{ serviceCallTicketResourceID: 702, resourceID: 31 }],
      },
    ]);
    expect(schedule.counts).toEqual({ serviceCalls: 2, tickets: 3, resources: 3 });
    expect(schedule.truncated).toEqual({ serviceCalls: false, tickets: false, resources: false, ticketSummaries: false });
    expect(schedule.missingServiceCallIds).toBeUndefined();
  });

  test('reports requested IDs Autotask did not return', async () => {
    mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({ serviceCallIds: [1001, 4242] });
    expect(schedule.serviceCalls.map(c => c.id)).toEqual([1001]);
    expect(schedule.missingServiceCallIds).toEqual([4242]);
  });

  test('window mode filters on startDateTime / lastModifiedDateTime / status and caps the total', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);

    await service.getServiceCallSchedule({
      startAfter: '2026-11-20T00:00:00Z',
      startBefore: '2026-11-21T00:00:00Z',
      lastModifiedAfter: '2026-11-19T00:00:00Z',
      status: 1,
      maxServiceCalls: 50,
    });

    const first = calls[0];
    expect(first.path).toBe('/ServiceCalls/query');
    expect(first.body.filter).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'status', value: 1 },
      { op: 'gte', field: 'startDateTime', value: '2026-11-20T00:00:00Z' },
      { op: 'lte', field: 'startDateTime', value: '2026-11-21T00:00:00Z' },
      { op: 'gte', field: 'lastModifiedDateTime', value: '2026-11-19T00:00:00Z' },
    ]));
    // One more than the cap, so the response can say "truncated".
    expect(first.body.MaxRecords).toBe(51);
  });

  test('lastModifiedAfter alone is a valid delta window and filters on it', async () => {
    const stale = { id: 999, description: 'Older than the checkpoint', lastModifiedDateTime: '2026-11-18T09:00:00Z' };
    mockFetch(scheduleResponder([stale, ...SERVICE_CALLS]));
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T10:30:00Z', includeTicketSummary: false });
    expect(schedule.serviceCalls.map(c => c.id)).toEqual([1002]);
    expect(schedule.serviceCalls[0].tickets[0]).not.toHaveProperty('ticket');
  });

  test('a truncated window returns a continuation that resumes after the last ID', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: 2000 + i, lastModifiedDateTime: '2026-11-19T12:00:00Z' }));
    const { calls } = mockFetch(scheduleResponder(many));
    const service = new AutotaskService(config, logger);
    const first = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 3 });
    expect(first.serviceCalls.map(c => c.id)).toEqual([2000, 2001, 2002]);
    expect(first.nextAfterServiceCallId).toBe(2002);
    const second = await service.getServiceCallSchedule({
      lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 3, afterServiceCallId: first.nextAfterServiceCallId!,
    });
    const secondQuery = calls.filter(c => c.path === '/ServiceCalls/query')[1];
    expect(secondQuery.body.filter).toEqual(expect.arrayContaining([
      { op: 'gte', field: 'lastModifiedDateTime', value: '2026-11-19T00:00:00Z' },
      { op: 'gt', field: 'id', value: 2002 },
    ]));
    expect(second.serviceCalls.map(c => c.id)).toEqual([2003, 2004]);
    expect(second.nextAfterServiceCallId).toBeUndefined();
    expect(second.truncated.serviceCalls).toBe(false);
  });

  test('an explicit empty serviceCallIds list reads nothing', async () => {
    const { spy } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({ serviceCallIds: [] });
    expect(schedule.serviceCalls).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  test('resourceId: other technicians cannot crowd out a matching call', async () => {
    const calls = Array.from({ length: 3 }, (_, i) => ({ id: 4000 + i, lastModifiedDateTime: '2026-11-19T12:00:00Z' }));
    const links = calls.map((c, i) => ({ id: 6000 + i, serviceCallID: c.id, ticketID: 9001 }));
    // Many assignments to tech 50 on the first two calls; tech 30 only on the last.
    const assignments = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: 8000 + i, serviceCallTicketID: i % 2 === 0 ? 6000 : 6001, resourceID: 50 })),
      { id: 8100, serviceCallTicketID: 6002, resourceID: 30 },
      { id: 8101, serviceCallTicketID: 6002, resourceID: 50 },
    ];
    const { calls: requests } = mockFetch((path, body) => {
      if (path === '/ServiceCalls/query') return { items: applyFilters(calls, body), pageDetails: {} };
      if (path === '/ServiceCallTickets/query') return { items: applyFilters(links, body), pageDetails: {} };
      if (path === '/ServiceCallTicketResources/query') return { items: applyFilters(assignments, body), pageDetails: {} };
      if (path === '/Tickets/query') return { items: applyFilters(TICKETS, body), pageDetails: {} };
      throw new Error(`unexpected route ${path}`);
    });
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', resourceId: 30 });
    expect(schedule.serviceCalls.map(c => c.id)).toEqual([4002]);
    // Both technicians on the kept call are listed.
    expect(schedule.serviceCalls[0].tickets[0].resources.map(r => r.resourceID).sort()).toEqual([30, 50]);
    const resourceQueries = requests.filter(c => c.path === '/ServiceCallTicketResources/query');
    expect(resourceQueries[0].body.filter).toContainEqual({ op: 'eq', field: 'resourceID', value: 30 });
    // The full-assignment read covers only the kept call's link.
    expect(inValues(resourceQueries[1].body, 'serviceCallTicketID')).toEqual([6002]);
  });

  test('blank startAfter falls back to the legacy startDate bound', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await service.searchServiceCalls({ startAfter: '', startDate: '2026-11-20T00:00:00Z' });
    expect(calls[0].body.filter).toEqual([{ op: 'gte', field: 'startDateTime', value: '2026-11-20T00:00:00Z' }]);
  });

  test('includeTicketSummary:false skips the Tickets query', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await service.getServiceCallSchedule({ serviceCallIds: [1001], includeTicketSummary: false });
    expect(calls.map(c => c.path)).not.toContain('/Tickets/query');
  });

  test('resourceId keeps only service calls with a ticket assigned to that resource', async () => {
    mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({
      startAfter: '2026-11-20T00:00:00Z',
      startBefore: '2026-11-21T00:00:00Z',
      resourceId: 30,
    });
    expect(schedule.serviceCalls.map(c => c.id)).toEqual([1001]);
    // The whole service call comes back, including other techs' tickets.
    expect(schedule.serviceCalls[0].tickets).toHaveLength(2);
  });

  test('flags truncation when the window holds more service calls than the cap', async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ id: 2000 + i, startDateTime: '2026-11-20T15:00:00Z', lastModifiedDateTime: '2026-11-19T12:00:00Z' }));
    mockFetch(scheduleResponder(many));
    const service = new AutotaskService(config, logger);
    const schedule = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 3 });
    expect(schedule.serviceCalls).toHaveLength(3);
    expect(schedule.truncated.serviceCalls).toBe(true);
  });

  test('rejects missing input and oversized ID lists without calling Autotask', async () => {
    const { spy } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await expect(service.getServiceCallSchedule({})).rejects.toThrow(/serviceCallIds/);
    await expect(service.getServiceCallSchedule({ startAfter: '2026-11-20T00:00:00Z' })).rejects.toThrow(/startBefore/);
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(service.getServiceCallSchedule({ serviceCallIds: ids })).rejects.toThrow(/at most 50/);
    expect(spy).not.toHaveBeenCalled();
  });

  test('chunks large in-lists so no query exceeds the chunk size', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ id: 3000 + i }));
    const { calls } = mockFetch((path) => {
      if (path === '/ServiceCalls/query') return { items: many, pageDetails: {} };
      if (path === '/ServiceCallTickets/query') return { items: [], pageDetails: {} };
      throw new Error(`unexpected route ${path}`);
    });
    const service = new AutotaskService(config, logger);
    await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 500 });
    const linkQueries = calls.filter(c => c.path === '/ServiceCallTickets/query');
    expect(linkQueries.map(c => inValues(c.body, 'serviceCallID')!.length)).toEqual([IN_FILTER_CHUNK_SIZE, IN_FILTER_CHUNK_SIZE, 50]);
  });
});

describe('searchServiceCalls extensions', () => {
  test('lastModifiedAfter, companyID, startAfter/startBefore map to Autotask fields; pageSize up to 500', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await service.searchServiceCalls({
      companyID: 11,
      startAfter: '2026-11-20T00:00:00Z',
      startBefore: '2026-11-21T00:00:00Z',
      lastModifiedAfter: '2026-11-19T00:00:00Z',
      pageSize: 500,
    });
    expect(calls[0].body.filter).toEqual([
      { op: 'eq', field: 'companyID', value: 11 },
      { op: 'gte', field: 'startDateTime', value: '2026-11-20T00:00:00Z' },
      { op: 'lte', field: 'startDateTime', value: '2026-11-21T00:00:00Z' },
      { op: 'gte', field: 'lastModifiedDateTime', value: '2026-11-19T00:00:00Z' },
    ]);
    expect(calls[0].body.MaxRecords).toBe(500);
  });

  test('pageSize above 500 is clamped; default stays 25', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await service.searchServiceCalls({ pageSize: 5000 });
    await service.searchServiceCalls({});
    expect(calls[0].body.MaxRecords).toBe(500);
    expect(calls[1].body.MaxRecords).toBe(25);
  });

  test('ids[] uses an id in filter', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const items = await service.searchServiceCalls({ ids: [1001, 1002], status: 1 });
    expect(inValues(calls[0].body, 'id')).toEqual([1001, 1002]);
    expect(calls[0].body.filter).toContainEqual({ op: 'eq', field: 'status', value: 1 });
    expect(items).toHaveLength(2);
  });

  test('resourceId filters through ServiceCallTickets -> ServiceCallTicketResources', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const { items, truncated } = await service.searchServiceCallsDetailed({ lastModifiedAfter: '2026-11-19T00:00:00Z', resourceId: 31 });
    expect(items.map(c => c.id)).toEqual([1001, 1002]);
    expect(truncated).toBe(false);
    const resourceQuery = calls.find(c => c.path === '/ServiceCallTicketResources/query')!;
    expect(resourceQuery.body.filter).toContainEqual({ op: 'eq', field: 'resourceID', value: 31 });

    const only30 = await service.searchServiceCalls({ ids: [1001, 1002], resourceId: 30 });
    expect(only30.map(c => c.id)).toEqual([1001]);
  });

  test('resourceId without a window is rejected (unbounded scan)', async () => {
    const { spy } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await expect(service.searchServiceCalls({ resourceId: 30 })).rejects.toThrow(/resourceId needs/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('service call ticket / resource batch filters', () => {
  test('searchServiceCallTickets serviceCallIds[] uses serviceCallID in', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const rows = await service.searchServiceCallTickets({ serviceCallIds: [1001, 1002], pageSize: 500 });
    expect(inValues(calls[0].body, 'serviceCallID')).toEqual([1001, 1002]);
    expect(rows).toHaveLength(3);
  });

  test('searchServiceCallTicketResources serviceCallTicketIds[] uses serviceCallTicketID in', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const rows = await service.searchServiceCallTicketResources({ serviceCallTicketIds: [501, 503], resourceId: 31 });
    expect(inValues(calls[0].body, 'serviceCallTicketID')).toEqual([501, 503]);
    expect(calls[0].body.filter).toContainEqual({ op: 'eq', field: 'resourceID', value: 31 });
    expect(rows.map(r => r.id)).toEqual([703]);
  });

  test('single-ID filters are unchanged', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await service.searchServiceCallTickets({ serviceCallId: 1001 });
    expect(calls[0].body.filter).toEqual([{ op: 'eq', field: 'serviceCallID', value: 1001 }]);
    expect(calls[0].body.MaxRecords).toBe(25);
  });
});

describe('getTicketsByIds', () => {
  test('one Tickets query with id in, input order kept, missing IDs reported', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const { tickets, missingIds } = await service.getTicketsByIds([9003, 9001, 4242]);
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(['POST /Tickets/query']);
    expect(inValues(calls[0].body, 'id')).toEqual([9003, 9001, 4242]);
    expect(tickets.map(t => t.id)).toEqual([9003, 9001]);
    expect(missingIds).toEqual([4242]);
  });

  test('more than 50 IDs is rejected before any request', async () => {
    const { spy } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await expect(service.getTicketsByIds(Array.from({ length: 51 }, (_, i) => i + 1))).rejects.toThrow(/at most 50/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('tool handler wiring', () => {
  function handlerFor(service: AutotaskService) {
    const handler = new AutotaskToolHandler(service, logger);
    (handler as any).getMappingService = async () => ({
      getCompanyName: async (id: number) => (id === 11 ? 'Contoso' : null),
      getResourceName: async (id: number) => (id === 30 ? 'Pat Tech' : null),
      getResourceNames: async (ids: number[]) => new Map(ids.filter(id => id === 30).map(id => [id, 'Pat Tech'])),
    });
    return handler;
  }

  test('autotask_get_service_call_schedule returns tickets and named resources', async () => {
    mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const result = await handlerFor(service).callTool('autotask_get_service_call_schedule', { serviceCallIds: [1001] });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content[0] as any).text);
    expect(payload.message).toMatch(/1 service calls with 2 tickets and 2 resource assignments/);
    const sc = payload.data.serviceCalls[0];
    expect(sc.company).toBe('Contoso');
    expect(sc.tickets[0].resources[0]).toEqual({ serviceCallTicketResourceID: 701, resourceID: 30, resourceName: 'Pat Tech' });
    expect(sc.tickets[1].resources[0]).toEqual({ serviceCallTicketResourceID: 702, resourceID: 31 });
  });

  test('autotask_get_ticket_details ticketIDs[] batch path makes one request', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const result = await handlerFor(service).callTool('autotask_get_ticket_details', { ticketIDs: [9001, 9002, 4242] });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content[0] as any).text);
    expect(payload.data.map((t: any) => t.id)).toEqual([9001, 9002]);
    expect(payload.message).toMatch(/not found: 4242/);
    expect(calls).toHaveLength(1);
  });

  test('autotask_get_ticket_details with neither ticketID nor ticketIDs is an error', async () => {
    mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    const result = await handlerFor(service).callTool('autotask_get_ticket_details', {});
    expect(result.isError).toBe(true);
  });

  test('autotask_search_service_calls passes the new filters through', async () => {
    const { calls } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    await handlerFor(service).callTool('autotask_search_service_calls', { lastModifiedAfter: '2026-11-19T00:00:00Z', companyID: 11 });
    expect(calls[0].body.filter).toEqual(expect.arrayContaining([
      { op: 'eq', field: 'companyID', value: 11 },
      { op: 'gte', field: 'lastModifiedDateTime', value: '2026-11-19T00:00:00Z' },
    ]));
  });
});

describe('tool definitions', () => {
  const byName = new Map(TOOL_DEFINITIONS.map(t => [t.name, t]));

  test('new and extended service-call tools are read-only and categorized', () => {
    for (const name of [
      'autotask_get_service_call_schedule',
      'autotask_search_service_calls',
      'autotask_search_service_call_tickets',
      'autotask_search_service_call_ticket_resources',
    ]) {
      expect((byName.get(name) as any)?.annotations?.readOnlyHint).toBe(true);
    }
    expect(TOOL_CATEGORIES.service_calls.tools).toContain('autotask_get_service_call_schedule');
  });

  test('all new parameters are optional (backward compatible)', () => {
    expect(byName.get('autotask_get_ticket_details')!.inputSchema.required).toEqual([]);
    const props = (name: string) => (byName.get(name)!.inputSchema as any).properties;
    expect(props('autotask_search_service_calls')).toHaveProperty('lastModifiedAfter');
    expect(props('autotask_search_service_calls')).toHaveProperty('resourceId');
    expect(props('autotask_search_service_calls')).toHaveProperty('ids');
    expect(props('autotask_search_service_calls').pageSize.maximum).toBe(500);
    expect(props('autotask_search_service_call_tickets')).toHaveProperty('serviceCallIds');
    expect(props('autotask_search_service_call_ticket_resources')).toHaveProperty('serviceCallTicketIds');
    expect(props('autotask_get_ticket_details').ticketIDs.maxItems).toBe(50);
    expect(byName.get('autotask_search_service_calls')!.inputSchema.required).toEqual([]);
  });
});

describe('CodeRabbit follow-ups', () => {
  test('exact fit across chunks is not reported as truncated; an omitted row is', async () => {
    // 250 service calls -> two link chunks (200 + 50). Each call has 10 links in
    // the first chunk only, so the 2,000-link cap is hit exactly by chunk one.
    const scs = Array.from({ length: 250 }, (_, i) => ({ id: 10000 + i, lastModifiedDateTime: '2026-11-19T12:00:00Z' }));
    const links = scs.slice(0, 200).flatMap((c, i) =>
      Array.from({ length: 10 }, (_, j) => ({ id: 100000 + i * 10 + j, serviceCallID: c.id, ticketID: 1 })));
    const respond = (extra: any[]) => (path: string, body: any) => {
      if (path === '/ServiceCalls/query') return { items: applyFilters(scs, body), pageDetails: {} };
      if (path === '/ServiceCallTickets/query') return { items: applyFilters([...links, ...extra], body), pageDetails: {} };
      if (path === '/ServiceCallTicketResources/query') return { items: [], pageDetails: {} };
      throw new Error(`unexpected route ${path}`);
    };
    const service = new AutotaskService(config, logger);

    mockFetch(respond([]));
    const exact = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 250, includeTicketSummary: false });
    expect(exact.truncated.tickets).toBe(false);
    jest.restoreAllMocks();

    mockFetch(respond([{ id: 999999, serviceCallID: 10249, ticketID: 2 }]));
    const over = await service.getServiceCallSchedule({ lastModifiedAfter: '2026-11-19T00:00:00Z', maxServiceCalls: 250, includeTicketSummary: false });
    expect(over.truncated.tickets).toBe(true);
  });

  test('explicit empty ID lists on the searches read nothing', async () => {
    const { spy } = mockFetch(scheduleResponder());
    const service = new AutotaskService(config, logger);
    expect(await service.searchServiceCalls({ ids: [] })).toEqual([]);
    expect(await service.searchServiceCallTickets({ serviceCallIds: [] })).toEqual([]);
    expect(await service.searchServiceCallTicketResources({ serviceCallTicketIds: [] })).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  test('a truncated resource scan with no matches keeps its warning instead of "not found"', async () => {
    jest.spyOn(AutotaskService.prototype, 'searchServiceCallsDetailed').mockResolvedValue({ items: [], truncated: true });
    const service = new AutotaskService(config, logger);
    const handler = new AutotaskToolHandler(service, logger);
    const result = await handler.callTool('autotask_search_service_calls', { lastModifiedAfter: '2026-11-19T00:00:00Z', resourceId: 30 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content[0] as any).text).message).toMatch(/scan was truncated/);
  });

  test('a failed direct resource lookup is not cached as "Unknown Resource"', async () => {
    const service = new AutotaskService(config, logger);
    const mapping = new MappingService(service, logger);
    (mapping as any).cache.resources.set(1, 'Someone Else');
    (mapping as any).cache.lastUpdated.resources = new Date();
    (mapping as any).cache.lastUpdated.companies = new Date();
    const getResource = jest.spyOn(service, 'getResource')
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 429'), { status: 429 }))
      .mockResolvedValueOnce({ id: 30, firstName: 'Pat', lastName: 'Tech' } as any);
    expect(await mapping.getResourceName(30)).toBeNull();
    expect((mapping as any).cache.resources.has(30)).toBe(false);
    expect(await mapping.getResourceName(30)).toBe('Pat Tech');
    expect(getResource).toHaveBeenCalledTimes(2);
  });

  test('lazy discovery: schedule names technicians with one batched Resources read', async () => {
    const { calls } = mockFetch((path, body) => {
      if (path === '/Resources/query') {
        return { items: applyFilters([{ id: 30, firstName: 'Pat', lastName: 'Tech' }, { id: 31, firstName: 'Sam', lastName: 'Field' }], body), pageDetails: {} };
      }
      if (path.startsWith('/Companies/')) return { item: { id: 11, companyName: 'Contoso' } };
      return scheduleResponder()(path, body);
    });
    const service = new AutotaskService(config, logger);
    const handler = new AutotaskToolHandler(service, logger, true);
    const listed = await handler.callTool('autotask_list_category_tools', { category: 'service_calls' });
    expect((listed.content[0] as any).text).toContain('autotask_get_service_call_schedule');
    const result = await handler.callTool('autotask_execute_tool', {
      toolName: 'autotask_get_service_call_schedule',
      arguments: { serviceCallIds: [1001] },
    });
    expect(result.isError).toBeFalsy();
    const sc = JSON.parse((result.content[0] as any).text).data.serviceCalls[0];
    expect(sc.tickets.map((t: any) => t.resources[0].resourceName)).toEqual(['Pat Tech', 'Sam Field']);
    const resourceReads = calls.filter(c => c.path.startsWith('/Resources'));
    expect(resourceReads).toHaveLength(1);
    expect(inValues(resourceReads[0].body, 'id')).toEqual([30, 31]);
  });

  test('a 200 whose body cannot be read fails the query instead of looking empty', async () => {
    jest.spyOn(global, 'fetch' as any).mockImplementation(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => { throw new Error('socket hang up'); },
    }) as unknown as Response);
    const service = new AutotaskService(config, logger);
    await expect(service.searchServiceCallTickets({ serviceCallId: 1 })).rejects.toThrow(/body could not be read/);
  });

  test('ID array items are declared as non-negative integers', () => {
    const props = (name: string) => (TOOL_DEFINITIONS.find(t => t.name === name)!.inputSchema as any).properties;
    for (const [tool, prop] of [
      ['autotask_get_ticket_details', 'ticketIDs'],
      ['autotask_search_service_calls', 'ids'],
      ['autotask_get_service_call_schedule', 'serviceCallIds'],
      ['autotask_search_service_call_tickets', 'serviceCallIds'],
      ['autotask_search_service_call_ticket_resources', 'serviceCallTicketIds'],
    ]) {
      expect(props(tool)[prop].items).toEqual({ type: 'integer', minimum: 0 });
    }
  });
});
