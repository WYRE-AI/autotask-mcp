// Regression tests for issue #133:
// Contact updates were completely broken on Autotask Zone 18 / DE1 because the
// collection-level `PATCH /{Entity}` route returns an IIS HTML 404 there, while
// item-level `PATCH /{Entity}/{id}` is rejected with 405. The fix adds a PUT
// fallback to AutotaskHttpClient.update(), exposes userDefinedFields on
// autotask_update_contact, and allows PUT through the rawRequest escape hatch.

import { AutotaskHttpClient } from '../src/services/autotask-http';
import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

// Pre-set apiUrl so baseUrl() resolves without a network round-trip.
const makeClient = () =>
  new AutotaskHttpClient(
    'user@example.com',
    'secret',
    'integration-code',
    'https://webservices18.autotask.net/ATServicesRest/',
    logger as any
  );

beforeEach(() => {
  _resetZoneUrlCache();
  Object.values(logger).forEach((m: any) => m.mockReset?.());
});

describe('Bug 1: AutotaskHttpClient.update() PUT fallback for Zone 18 (issue #133)', () => {
  test('falls back to PUT /{Entity}/{id} when collection-level PATCH returns 404', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((...args: any[]) => {
      const init = args[1] as RequestInit;
      if (init.method === 'PATCH') {
        // Zone 18 returns an IIS HTML 404 for collection-level PATCH.
        return Promise.resolve({
          ok: false,
          status: 404,
          headers: { get: () => null },
          text: async () => '<html><head><title>404 - File or directory not found.</title></head></html>',
        } as any);
      }
      // PUT /{Entity}/{id} is universally supported — 200 with empty body.
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: async () => '' } as any);
    });

    try {
      await expect(client.update('Contacts', 12345, { firstName: 'Jane' })).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const patchUrl = fetchMock.mock.calls[0][0] as string;
      const putCall = fetchMock.mock.calls[1];
      const putUrl = putCall[0] as string;
      const putInit = putCall[1] as RequestInit;

      // First attempt: collection-level PATCH /Contacts.
      expect(patchUrl).toMatch(/\/Contacts$/);
      // Fallback: item-level PUT /Contacts/12345 with the fields in the body.
      expect(putInit.method).toBe('PUT');
      expect(putUrl).toMatch(/\/Contacts\/12345$/);
      expect(JSON.parse(putInit.body as string)).toMatchObject({ firstName: 'Jane' });
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('does NOT fall back to PUT on non-404 errors (e.g. 400)', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation((...args: any[]) => {
      const init = args[1] as RequestInit;
      if (init.method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 400,
          headers: { get: () => null },
          // A 400 whose body coincidentally contains "404" must not trigger a PUT.
          text: async () => JSON.stringify({ errors: ['Invalid field reference 404'] }),
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, text: async () => '' } as any);
    });

    try {
      await expect(client.update('Contacts', 12345, { firstName: 'Jane' })).rejects.toThrow(/HTTP 400/);
      // Only the PATCH was attempted — no fallback PUT.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('uses PATCH only (no PUT) when collection-level PATCH succeeds', async () => {
    const client = makeClient();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, text: async () => '' } as any);

    try {
      await client.update('Contacts', 12345, { firstName: 'Jane' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('Bug 2: autotask_update_contact exposes userDefinedFields (issue #133)', () => {
  test('schema includes a userDefinedFields array of {name, value} objects', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_contact');
    expect(def).toBeDefined();
    const props = (def!.inputSchema as { properties: Record<string, any> }).properties;
    expect(props.userDefinedFields).toBeDefined();
    expect(props.userDefinedFields.type).toBe('array');
    expect(props.userDefinedFields.items.type).toBe('object');
    expect(props.userDefinedFields.items.required).toEqual(['name', 'value']);
    expect(Object.keys(props.userDefinedFields.items.properties)).toEqual(
      expect.arrayContaining(['name', 'value'])
    );
  });
});

describe('Bug 3: rawRequest allows PUT (issue #133)', () => {
  test('autotask_raw_request schema advertises PUT in its method enum', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_raw_request');
    expect(def).toBeDefined();
    const methodEnum = (def!.inputSchema as { properties: Record<string, any> }).properties.method.enum;
    // The advertised enum must match what the runtime actually accepts, or the
    // LLM never learns PUT is reachable through the escape hatch.
    expect(methodEnum).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']));
  });

  test('PUT is an allowed rawRequest method and dispatches to the zone host', async () => {
    const client = makeClient();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockResolvedValue({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ ok: true }) } as any);

    try {
      await expect(
        client.rawRequest<any>('PUT', '/Contacts/12345', { firstName: 'Jane' })
      ).resolves.toEqual({ ok: true });
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.method).toBe('PUT');
    } finally {
      fetchMock.mockRestore();
    }
  });
});
