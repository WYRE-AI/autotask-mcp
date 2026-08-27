// Unit tests for gateway impersonation support.
//
// Autotask drives impersonation with the `ImpersonationResourceId` request
// header. The entity field of the same name is read-only — Autotask populates
// it to record that impersonation happened — so setting it in a request body is
// silently ignored. These tests cover the inbound header parse and the outbound
// header emission.

import { parseCredentialsFromHeaders, parseImpersonationResourceId } from '../src/utils/config';

describe('parseImpersonationResourceId', () => {
  it('accepts a positive integer', () => {
    expect(parseImpersonationResourceId('29682886')).toBe(29682886);
  });

  it('returns undefined when absent', () => {
    expect(parseImpersonationResourceId(undefined)).toBeUndefined();
    expect(parseImpersonationResourceId('')).toBeUndefined();
  });

  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['non-numeric', 'not-a-number'],
    ['fractional', '12.5'],
    ['numeric with suffix', '123abc'],
  ])('rejects %s and degrades to no impersonation', (_label, raw) => {
    expect(parseImpersonationResourceId(raw)).toBeUndefined();
  });

  it('warns via the supplied logger when the value is invalid', () => {
    const warn = jest.fn();
    expect(parseImpersonationResourceId('nope', { warn })).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the value is simply absent', () => {
    const warn = jest.fn();
    expect(parseImpersonationResourceId(undefined, { warn })).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('parseCredentialsFromHeaders: X-Impersonation-Resource-Id', () => {
  const base = {
    'x-api-key': 'api-user@example.com',
    'x-api-secret': 'secret',
    'x-integration-code': 'CODE',
  };

  it('extracts the impersonation resource ID alongside the credentials', () => {
    const creds = parseCredentialsFromHeaders({
      ...base,
      'x-impersonation-resource-id': '29682886',
    });
    expect(creds.impersonationResourceId).toBe(29682886);
    // Existing behaviour must be untouched.
    expect(creds.username).toBe('api-user@example.com');
    expect(creds.secret).toBe('secret');
    expect(creds.integrationCode).toBe('CODE');
  });

  it('leaves it undefined when the header is absent', () => {
    const creds = parseCredentialsFromHeaders(base);
    expect(creds.impersonationResourceId).toBeUndefined();
  });

  it('leaves it undefined when the header is malformed', () => {
    const creds = parseCredentialsFromHeaders({
      ...base,
      'x-impersonation-resource-id': 'bogus',
    });
    expect(creds.impersonationResourceId).toBeUndefined();
  });
});

describe('AutotaskHttpClient: outbound ImpersonationResourceId header', () => {
  // headers() is private, so exercise it the way the class actually uses it:
  // through a real request with fetch stubbed out.
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  async function capturedHeaders(impersonationResourceId?: number): Promise<Record<string, string>> {
    jest.resetModules();
    const { AutotaskHttpClient } = await import('../src/services/autotask-http');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
      text: async () => '{"items":[]}',
    });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;

    const client = new AutotaskHttpClient(
      'api-user@example.com',
      'secret',
      'CODE',
      'https://webservices99.autotask.net/ATServicesRest',
      logger as never,
      impersonationResourceId
    );
    await (client as unknown as { request: (m: string, p: string) => Promise<unknown> }).request('GET', '/Test/1');
    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  }

  it('sends the header when a resource ID is configured', async () => {
    const headers = await capturedHeaders(29682886);
    expect(headers.ImpersonationResourceId).toBe('29682886');
  });

  it('omits the header entirely when no resource ID is configured', async () => {
    const headers = await capturedHeaders(undefined);
    expect(headers).not.toHaveProperty('ImpersonationResourceId');
    // The standard auth headers must still be present.
    expect(headers.UserName).toBe('api-user@example.com');
    expect(headers.ApiIntegrationcode).toBe('CODE');
  });
});

describe('AutotaskHttpClient: error hint when impersonating', () => {
  // Autotask doesn't document a distinct status/body for "impersonation not
  // permitted" specifically, so this can never reliably detect that one
  // cause - it only appends an actionable hint to whatever error Autotask
  // actually returned, on any failing request that had the header set.
  // Deliberately NOT a silent retry-without-impersonation: that would make
  // the call quietly succeed as the shared API user, defeating the audit-
  // attribution point of the feature without the caller ever knowing.
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  async function requestWithStatus(
    impersonationResourceId: number | undefined,
    status: number,
    errorBody: string
  ): Promise<Error> {
    jest.resetModules();
    const { AutotaskHttpClient } = await import('../src/services/autotask-http');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status,
      headers: { get: () => null },
      text: async () => errorBody,
    });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;

    const client = new AutotaskHttpClient(
      'api-user@example.com',
      'secret',
      'CODE',
      'https://webservices99.autotask.net/ATServicesRest',
      logger as never,
      impersonationResourceId
    );
    try {
      await (client as unknown as { request: (m: string, p: string) => Promise<unknown> }).request(
        'GET',
        '/Test/1'
      );
      throw new Error('expected request() to throw');
    } catch (err) {
      return err as Error;
    }
  }

  it('appends an actionable hint, without dropping the original error, when impersonating', async () => {
    const err = await requestWithStatus(29682886, 403, '{"errors":["Forbidden"]}');
    expect(err.message).toContain('Forbidden');
    expect(err.message).toContain('impersonating resource 29682886');
    expect(err.message).toContain('Allow impersonation of resources with this security level');
  });

  it('adds no hint, error text unchanged, when not impersonating', async () => {
    const err = await requestWithStatus(undefined, 403, '{"errors":["Forbidden"]}');
    expect(err.message).toBe('Autotask GET /Test/1 failed: HTTP 403: Forbidden');
    expect(err.message).not.toContain('impersonating');
  });

  it('still surfaces the real error as-is for an unrelated failure while impersonating', async () => {
    const err = await requestWithStatus(29682886, 400, '{"errors":["Invalid field: fooBar"]}');
    expect(err.message).toContain('Invalid field: fooBar');
    expect((err as Error & { status?: number }).status).toBe(400);
  });
});
