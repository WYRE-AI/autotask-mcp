// Regression tests for #364 and per-request impersonation on note writes.
//
// #364: AUTOTASK_IMPERSONATION_RESOURCE_ID was parsed by loadEnvironmentConfig()
// but dropped by mergeWithMcpConfig(), so env-mode writes silently ran as the
// API user with no ImpersonationResourceId header.

import { loadEnvironmentConfig, mergeWithMcpConfig } from '../src/utils/config';
import { AutotaskMcpServer } from '../src/mcp/server';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { EnvironmentConfig } from '../src/utils/config';
import type { McpServerConfig } from '../src/types/mcp';

const logger = new Logger('error');

describe('mergeWithMcpConfig keeps impersonationResourceId (#364)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('carries AUTOTASK_IMPERSONATION_RESOURCE_ID through in env mode', () => {
    process.env.AUTH_MODE = 'env';
    process.env.AUTOTASK_USERNAME = 'api-user@example.com';
    process.env.AUTOTASK_SECRET = 'secret';
    process.env.AUTOTASK_INTEGRATION_CODE = 'CODE';
    process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID = '123';
    const merged = mergeWithMcpConfig(loadEnvironmentConfig());
    expect(merged.autotask.impersonationResourceId).toBe(123);
  });

  it('leaves it unset when the env var is absent or invalid, warning on invalid', () => {
    const warn = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env.AUTH_MODE = 'env';
    delete process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID;
    expect(mergeWithMcpConfig(loadEnvironmentConfig()).autotask).not.toHaveProperty('impersonationResourceId');
    process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID = '-4';
    expect(mergeWithMcpConfig(loadEnvironmentConfig()).autotask).not.toHaveProperty('impersonationResourceId');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('-4'));
    warn.mockRestore();
  });

  it('lets an explicit MCP arg override the env value, but ignores an invalid one', () => {
    process.env.AUTH_MODE = 'env';
    process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID = '123';
    const env = loadEnvironmentConfig();
    expect(mergeWithMcpConfig(env, { autotask: { impersonationResourceId: 456 } }).autotask.impersonationResourceId).toBe(456);
    expect(mergeWithMcpConfig(env, { autotask: { impersonationResourceId: 'x' } }).autotask.impersonationResourceId).toBe(123);
  });
});

describe('requestFactory: per-request X-Impersonation-Resource-Id', () => {
  const baseConfig: McpServerConfig = {
    name: 'autotask-mcp',
    version: '0.0.0-test',
    autotask: {
      username: 'env-user@example.com',
      secret: 'env-secret',
      integrationCode: 'ENV',
      impersonationResourceId: 111,
    },
  };

  function envConfig(mode: 'env' | 'gateway'): EnvironmentConfig {
    return {
      autotask: baseConfig.autotask,
      server: { name: 'autotask-mcp', version: '0.0.0-test' },
      transport: { type: 'http', port: 0, host: '127.0.0.1' },
      logging: { level: 'error', format: 'simple' },
      auth: { mode },
      lazyLoading: false,
    };
  }

  function run(
    mode: 'env' | 'gateway',
    headers: Record<string, string>,
    opts?: { allowEnvImpersonationHeader?: boolean },
    log: Logger = logger
  ) {
    const server = new AutotaskMcpServer(baseConfig, log, envConfig(mode));
    const spy = jest
      .spyOn(server, 'createRequestServer')
      .mockReturnValue({} as ReturnType<AutotaskMcpServer['createRequestServer']>);
    const factory = server.requestFactory(opts);
    (factory as (ctx: unknown) => unknown)({ requestInfo: { headers: new Headers(headers) } });
    return spy.mock.calls[0][0];
  }

  it('env mode: header overrides the env default for that request only', () => {
    const creds = run('env', { 'x-impersonation-resource-id': '222' });
    expect(creds).toMatchObject({ username: 'env-user@example.com', impersonationResourceId: 222 });
  });

  it('env mode: no header falls back to the env-configured default handlers', () => {
    expect(run('env', {})).toBeUndefined();
  });

  it('env mode: an invalid header is ignored with a warning rather than forwarded', () => {
    const warnLogger = new Logger('error');
    const warn = jest.spyOn(warnLogger, 'warn').mockImplementation(() => undefined);
    expect(run('env', { 'x-impersonation-resource-id': '12abc' }, undefined, warnLogger)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('12abc'));
  });

  it('env mode: the header is not honored when the transport opts out (Worker)', () => {
    expect(
      run('env', { 'x-impersonation-resource-id': '222' }, { allowEnvImpersonationHeader: false })
    ).toBeUndefined();
  });

  it('gateway mode: uses only the request header, never the env default', () => {
    const tenant = {
      'x-api-key': 'tenant-b@example.com',
      'x-api-secret': 's',
      'x-integration-code': 'B',
    };
    expect(run('gateway', { ...tenant, 'x-impersonation-resource-id': '333' })).toMatchObject({
      username: 'tenant-b@example.com',
      impersonationResourceId: 333,
    });
    // A tenant request without the header must NOT inherit the env resource 111.
    expect(run('gateway', tenant)?.impersonationResourceId).toBeUndefined();
  });
});

describe('note writes carry the ImpersonationResourceId header', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    (global as unknown as { fetch: unknown }).fetch = realFetch;
  });

  async function postHeaders(
    write: (s: AutotaskService) => Promise<unknown>,
    impersonationResourceId?: number
  ) {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ itemId: 42 }),
      text: async () => '{"itemId":42}',
      headers: new Headers(),
    });
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
    const autotask: McpServerConfig['autotask'] = {
      username: 'api-user@example.com',
      secret: 'secret',
      integrationCode: 'CODE',
      apiUrl: 'https://webservices99.autotask.net/ATServicesRest',
    };
    if (impersonationResourceId !== undefined) autotask.impersonationResourceId = impersonationResourceId;
    const service = new AutotaskService({ name: 't', version: '0', autotask }, logger);
    await write(service);
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    return { url: post![0] as string, headers: post![1].headers as Record<string, string> };
  }

  it.each([
    ['ticket note', (s: AutotaskService) => s.createTicketNote(7, { title: 't', description: 'd', noteType: 1, publish: 1 }), /\/Tickets\/7\/Notes$/],
    ['project note', (s: AutotaskService) => s.createProjectNote(8, { title: 't', description: 'd', noteType: 1, publish: 1 }), /\/Projects\/8\/Notes$/],
    ['company note', (s: AutotaskService) => s.createCompanyNote(9, { title: 't', description: 'd', actionType: 1 }), /\/Companies\/9\/Notes$/],
  ])('%s is attributed to the impersonated resource', async (_label, write, urlPattern) => {
    const { url, headers } = await postHeaders(write, 29682886);
    expect(url).toMatch(urlPattern);
    expect(headers.ImpersonationResourceId).toBe('29682886');
  });

  it('omits the header when not impersonating', async () => {
    const { headers } = await postHeaders(
      (s) => s.createTicketNote(7, { title: 't', description: 'd', noteType: 1, publish: 1 })
    );
    expect(headers).not.toHaveProperty('ImpersonationResourceId');
  });
});
