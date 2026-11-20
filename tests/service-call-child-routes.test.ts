// Regression tests: ServiceCallTickets and ServiceCallTicketResources are child
// entities in the Autotask REST API, so creates and deletes must use the parent
// routes. The flat POST /ServiceCallTickets returned an IIS HTML 404, so linking
// a ticket to a service call (and assigning a tech) could never succeed.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

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

/** Answer every request with one canned body. */
function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

/** Answer requests in order with the given bodies. */
function mockFetchSequence(...bodies: unknown[]): jest.SpyInstance {
  const spy = jest.spyOn(global, 'fetch' as any);
  for (const body of bodies) {
    spy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    } as unknown as Response);
  }
  return spy;
}

/**
 * Human-readable "<METHOD> <pathname>" trace of every fetch the code made, so a
 * failing assertion names the exact URL that was requested.
 */
function calledRoutes(fetchMock: jest.SpyInstance): string[] {
  return fetchMock.mock.calls.map(
    (c: any[]) => `${(c[1] as RequestInit).method} ${new URL(c[0] as string).pathname}`
  );
}

function firstRequestBody(fetchMock: jest.SpyInstance): any {
  return JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Service call child-entity routes (#366)', () => {
  test('createServiceCallTicket POSTs to /ServiceCalls/{id}/Tickets', async () => {
    const fetchMock = mockFetchOk({ itemId: 501 });
    const service = new AutotaskService(config, logger);

    await expect(
      service.createServiceCallTicket({ serviceCallID: 86611, ticketID: 399684 })
    ).resolves.toBe(501);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/ServiceCalls/86611/Tickets']);
    expect(firstRequestBody(fetchMock)).toMatchObject({ serviceCallID: 86611, ticketID: 399684 });
  });

  test('createServiceCallTicket rejects a missing serviceCallID without calling Autotask', async () => {
    const fetchMock = mockFetchOk({ itemId: 1 });
    const service = new AutotaskService(config, logger);

    await expect(service.createServiceCallTicket({ ticketID: 399684 })).rejects.toThrow(/serviceCallID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('createServiceCallTicketResource POSTs to /ServiceCallTickets/{id}/Resources', async () => {
    const fetchMock = mockFetchOk({ itemId: 702 });
    const service = new AutotaskService(config, logger);

    await expect(
      service.createServiceCallTicketResource({ serviceCallTicketID: 501, resourceID: 29682973 })
    ).resolves.toBe(702);

    expect(calledRoutes(fetchMock)).toEqual(['POST /ATServicesRest/v1.0/ServiceCallTickets/501/Resources']);
  });

  test('deleteServiceCallTicket resolves the parent, then DELETEs the child route', async () => {
    const fetchMock = mockFetchSequence({ items: [{ id: 501, serviceCallID: 86611, ticketID: 399684 }] }, {});
    const service = new AutotaskService(config, logger);

    await service.deleteServiceCallTicket(501);

    expect(calledRoutes(fetchMock)).toEqual([
      'POST /ATServicesRest/v1.0/ServiceCallTickets/query',
      'DELETE /ATServicesRest/v1.0/ServiceCalls/86611/Tickets/501',
    ]);
  });

  test('deleteServiceCallTicketResource resolves the parent, then DELETEs the child route', async () => {
    const fetchMock = mockFetchSequence({ items: [{ id: 702, serviceCallTicketID: 501, resourceID: 1 }] }, {});
    const service = new AutotaskService(config, logger);

    await service.deleteServiceCallTicketResource(702);

    expect(calledRoutes(fetchMock)).toEqual([
      'POST /ATServicesRest/v1.0/ServiceCallTicketResources/query',
      'DELETE /ATServicesRest/v1.0/ServiceCallTickets/501/Resources/702',
    ]);
  });
});
