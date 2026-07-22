// Regression tests for PR #197 (follow-up to issue #133):
// On some Autotask zone hosts BOTH legs of AutotaskHttpClient.update() fail for
// Contacts — the collection-level `PATCH /Contacts` returns an IIS HTML 404
// (the Zone DE1 behaviour from #133) AND the `PUT /Contacts/{id}` fallback is
// rejected with 405 — so every contact update dies with no workaround through
// the typed tool. Contacts are a child entity of Companies, so
// AutotaskService.updateContact() now retries through the documented child
// route `PATCH /Companies/{companyID}/Contacts`, but ONLY after update() fails
// with 404/405: zones where the standard routes work (most zones, and DE1's
// PUT fallback) keep their existing single- or two-request behaviour.

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

interface MockResponseSpec {
  status: number;
  body?: any;
  text?: string;
}

function res(spec: MockResponseSpec): Response {
  return {
    ok: spec.status >= 200 && spec.status < 300,
    status: spec.status,
    headers: { get: () => null },
    text: async () =>
      spec.text !== undefined ? spec.text : spec.body !== undefined ? JSON.stringify(spec.body) : '',
  } as unknown as Response;
}

/**
 * Route-table fetch mock: match on method + URL pattern. Unmatched requests
 * return a distinctive 599 so a failing test names the unexpected call.
 */
function mockFetchRoutes(
  routes: Array<{ method: string; path: RegExp; response: MockResponseSpec }>
): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockImplementation((...args: any[]) => {
    const url = args[0] as string;
    const init = (args[1] || {}) as RequestInit;
    const match = routes.find(r => r.method === (init.method || 'GET') && r.path.test(url));
    if (!match) {
      return Promise.resolve(res({ status: 599, text: `unexpected request: ${init.method} ${url}` }));
    }
    return Promise.resolve(res(match.response));
  });
}

/** Human-readable "<METHOD> <pathname>" trace of every fetch the code made. */
function calledRoutes(fetchMock: jest.SpyInstance): string[] {
  return fetchMock.mock.calls.map(
    (c: any[]) => `${(c[1] as RequestInit).method} ${new URL(c[0] as string).pathname}`
  );
}

const HTML_404 = {
  status: 404,
  text: '<html><head><title>404 - File or directory not found.</title></head></html>',
};

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AutotaskService.updateContact() child-route fallback (PR #197)', () => {
  test('falls back to PATCH /Companies/{companyID}/Contacts when PATCH returns 404 and PUT returns 405, resolving companyID via getContact', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: HTML_404 },
      { method: 'PUT', path: /\/Contacts\/12345$/, response: { status: 405, body: { errors: ["does not support http method 'PUT'"] } } },
      { method: 'GET', path: /\/Contacts\/12345$/, response: { status: 200, body: { item: { id: 12345, companyID: 777, firstName: 'Old' } } } },
      { method: 'PATCH', path: /\/Companies\/777\/Contacts$/, response: { status: 200, body: { itemId: 12345 } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(service.updateContact(12345, { firstName: 'Jane' })).resolves.toBeUndefined();

    // The fallback is strictly last: both standard legs are attempted first,
    // then the parent lookup, then the child-route PATCH.
    expect(calledRoutes(fetchMock)).toEqual([
      'PATCH /ATServicesRest/v1.0/Contacts',
      'PUT /ATServicesRest/v1.0/Contacts/12345',
      'GET /ATServicesRest/v1.0/Contacts/12345',
      'PATCH /ATServicesRest/v1.0/Companies/777/Contacts',
    ]);
    const childBody = JSON.parse(fetchMock.mock.calls[3][1].body as string);
    expect(childBody).toMatchObject({ id: 12345, firstName: 'Jane' });
  });

  test('skips the getContact lookup when the update payload already carries companyID', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: HTML_404 },
      { method: 'PUT', path: /\/Contacts\/12345$/, response: { status: 405, body: { errors: ["does not support http method 'PUT'"] } } },
      { method: 'PATCH', path: /\/Companies\/777\/Contacts$/, response: { status: 200, body: { itemId: 12345 } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(
      service.updateContact(12345, { companyID: 777, firstName: 'Jane' } as any)
    ).resolves.toBeUndefined();

    expect(calledRoutes(fetchMock)).toEqual([
      'PATCH /ATServicesRest/v1.0/Contacts',
      'PUT /ATServicesRest/v1.0/Contacts/12345',
      'PATCH /ATServicesRest/v1.0/Companies/777/Contacts',
    ]);
  });

  test('treats companyID 0 (the root/MSP company) as a valid parent, not a missing one', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: HTML_404 },
      { method: 'PUT', path: /\/Contacts\/12345$/, response: { status: 405, body: { errors: ["does not support http method 'PUT'"] } } },
      { method: 'PATCH', path: /\/Companies\/0\/Contacts$/, response: { status: 200, body: { itemId: 12345 } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(
      service.updateContact(12345, { companyID: 0, firstName: 'Jane' } as any)
    ).resolves.toBeUndefined();

    expect(calledRoutes(fetchMock)).toContain('PATCH /ATServicesRest/v1.0/Companies/0/Contacts');
  });

  test('healthy zones keep the single-request PATCH /Contacts path — no extra GET, no child route', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: { status: 200, body: { itemId: 12345 } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(service.updateContact(12345, { firstName: 'Jane' })).resolves.toBeUndefined();

    expect(calledRoutes(fetchMock)).toEqual(['PATCH /ATServicesRest/v1.0/Contacts']);
  });

  test('Zone DE1 keeps the #133 PUT fallback — no child route when PUT succeeds', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: HTML_404 },
      { method: 'PUT', path: /\/Contacts\/12345$/, response: { status: 200 } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(service.updateContact(12345, { firstName: 'Jane' })).resolves.toBeUndefined();

    expect(calledRoutes(fetchMock)).toEqual([
      'PATCH /ATServicesRest/v1.0/Contacts',
      'PUT /ATServicesRest/v1.0/Contacts/12345',
    ]);
  });

  test('genuine validation errors (HTTP 400) surface unchanged — no fallback of any kind', async () => {
    const fetchMock = mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: { status: 400, body: { errors: ['Invalid field reference'] } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(service.updateContact(12345, { firstName: 'Jane' })).rejects.toThrow(/HTTP 400/);

    expect(calledRoutes(fetchMock)).toEqual(['PATCH /ATServicesRest/v1.0/Contacts']);
  });

  test('fails with a clear error when the parent companyID cannot be resolved', async () => {
    mockFetchRoutes([
      { method: 'PATCH', path: /v1\.0\/Contacts$/, response: HTML_404 },
      { method: 'PUT', path: /\/Contacts\/12345$/, response: { status: 405, body: { errors: ["does not support http method 'PUT'"] } } },
      // getContact returns null on 404 — e.g. the contact was deleted between calls.
      { method: 'GET', path: /\/Contacts\/12345$/, response: { status: 404, body: { errors: ['Not found'] } } },
    ]);

    const service = new AutotaskService(config, logger);
    await expect(service.updateContact(12345, { firstName: 'Jane' })).rejects.toThrow(
      /unable to resolve parent companyID/
    );
  });
});
