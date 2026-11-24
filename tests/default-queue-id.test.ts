// AUTOTASK_DEFAULT_QUEUE_ID: autotask_create_ticket uses this queue when the
// caller gives no queueID. An explicit queueID always wins, a malformed value
// is a startup error (never silently ignored), and gateway mode ignores it
// because a queue ID belongs to one tenant.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskMcpServer } from '../src/mcp/server';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';
import {
  _resetZoneUrlCache,
  loadEnvironmentConfig,
  parseDefaultQueueId,
  type EnvironmentConfig,
} from '../src/utils/config';

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

function mockFetchOk(body: unknown): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

function ticketPost(fetchMock: jest.SpyInstance): any {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url).endsWith('/Tickets') && (init as RequestInit)?.method === 'POST'
  );
  expect(call).toBeDefined();
  return JSON.parse((call![1] as RequestInit).body as string);
}

const baseTicket = {
  companyID: 1,
  title: 'Printer offline',
  description: 'The printer is offline',
  status: 1,
  priority: 2,
  dueDateTime: '2026-12-01T05:00:00Z',
};

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseDefaultQueueId', () => {
  test('unset or empty means no default', () => {
    expect(parseDefaultQueueId(undefined)).toBeUndefined();
    expect(parseDefaultQueueId('')).toBeUndefined();
    expect(parseDefaultQueueId('   ')).toBeUndefined();
  });

  test('a positive integer is accepted (surrounding whitespace trimmed)', () => {
    expect(parseDefaultQueueId('12345')).toBe(12345);
    expect(parseDefaultQueueId(' 8 ')).toBe(8);
  });

  test.each(['abc', '0', '-1', '1.5', '1e3', '0x10', '12abc', '+5', '99999999999999999999'])(
    'refuses %p with a clear error',
    (raw) => {
      expect(() => parseDefaultQueueId(raw)).toThrow(/Invalid AUTOTASK_DEFAULT_QUEUE_ID/);
    }
  );
});

describe('loadEnvironmentConfig', () => {
  const saved = process.env.AUTOTASK_DEFAULT_QUEUE_ID;
  afterEach(() => {
    if (saved === undefined) delete process.env.AUTOTASK_DEFAULT_QUEUE_ID;
    else process.env.AUTOTASK_DEFAULT_QUEUE_ID = saved;
  });

  test('reads AUTOTASK_DEFAULT_QUEUE_ID', () => {
    process.env.AUTOTASK_DEFAULT_QUEUE_ID = '12345';
    expect(loadEnvironmentConfig().autotask.defaultQueueId).toBe(12345);
  });

  test('leaves it unset when the variable is absent', () => {
    delete process.env.AUTOTASK_DEFAULT_QUEUE_ID;
    expect(loadEnvironmentConfig().autotask.defaultQueueId).toBeUndefined();
  });

  test('a malformed value stops startup instead of being ignored', () => {
    process.env.AUTOTASK_DEFAULT_QUEUE_ID = 'triage';
    expect(() => loadEnvironmentConfig()).toThrow(/Invalid AUTOTASK_DEFAULT_QUEUE_ID/);
  });
});

describe('autotask_create_ticket with a default queue', () => {
  test('uses the default queue when queueID is omitted', async () => {
    const fetchMock = mockFetchOk({ itemId: 501 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger, false, {
      defaultQueueId: 12345,
    });

    const result = await handler.callTool('autotask_create_ticket', { ...baseTicket });

    expect(result.isError).toBeFalsy();
    expect(ticketPost(fetchMock).queueID).toBe(12345);
    expect(result.content[0].text).toContain('default queue (queueID 12345)');
  });

  test('an explicit queueID always wins', async () => {
    const fetchMock = mockFetchOk({ itemId: 502 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger, false, {
      defaultQueueId: 12345,
    });

    const result = await handler.callTool('autotask_create_ticket', { ...baseTicket, queueID: 8 });

    expect(result.isError).toBeFalsy();
    expect(ticketPost(fetchMock).queueID).toBe(8);
    expect(result.content[0].text).not.toContain('default queue');
  });

  test('an explicit null queueID is passed through, not replaced', async () => {
    const fetchMock = mockFetchOk({ itemId: 503 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger, false, {
      defaultQueueId: 12345,
    });

    await handler.callTool('autotask_create_ticket', { ...baseTicket, queueID: null });

    expect(ticketPost(fetchMock).queueID).toBeNull();
  });

  test('without a default, an omitted queueID stays omitted', async () => {
    const fetchMock = mockFetchOk({ itemId: 504 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger);

    await handler.callTool('autotask_create_ticket', { ...baseTicket });

    expect('queueID' in ticketPost(fetchMock)).toBe(false);
  });

  test('autotask_update_ticket never applies the default', async () => {
    const fetchMock = mockFetchOk({ itemId: 505 });
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger, false, {
      defaultQueueId: 12345,
    });

    await handler.callTool('autotask_update_ticket', { ticketId: 505, title: 'Renamed' });

    const bodies = fetchMock.mock.calls
      .map(([, init]) => (init as RequestInit)?.body)
      .filter((b): b is string => typeof b === 'string');
    expect(bodies.some(b => JSON.parse(b).queueID === 12345)).toBe(false);
  });
});

describe('tool description', () => {
  test('stays static: it never names the configured queue', () => {
    const create = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_ticket')!;
    const desc = (create.inputSchema.properties as any).queueID.description as string;
    expect(desc).toMatch(/configured default queue/);
    expect(desc).not.toMatch(/[0-9]/);
    expect(desc).toMatch(/Pass null/);
  });

  // The null opt-out must be valid against the schema clients see in
  // tools/list, not only when callTool is invoked directly.
  test('the published schema accepts queueID: null and keeps queueID optional', async () => {
    const handler = new AutotaskToolHandler(new AutotaskService(config, logger), logger, false, {
      defaultQueueId: 12345,
    });
    const published = (await handler.listTools()).find(t => t.name === 'autotask_create_ticket')!;
    const queueID = published.inputSchema.properties.queueID;
    expect(queueID.type).toEqual(['number', 'null']);
    expect(published.inputSchema.required ?? []).not.toContain('queueID');

    // Validate with Ajv (the validator the MCP SDK ships), as a
    // schema-validating client would before calling the tool.
    const validate = new AjvJsonSchemaValidator().getValidator(published.inputSchema as any);
    expect(validate({ ...baseTicket, queueID: null }).valid).toBe(true);
    expect(validate({ ...baseTicket, queueID: 12345 }).valid).toBe(true);
    expect(validate({ ...baseTicket }).valid).toBe(true);
    expect(validate({ ...baseTicket, queueID: '12345' }).valid).toBe(false);

    // Same schema with and without a configured default.
    const plain = new AutotaskToolHandler(new AutotaskService(config, logger), logger);
    const unconfigured = (await plain.listTools()).find(t => t.name === 'autotask_create_ticket')!;
    expect(unconfigured.inputSchema).toEqual(published.inputSchema);
  });
});

describe('AutotaskMcpServer wiring', () => {
  function envConfig(mode: 'env' | 'gateway'): EnvironmentConfig {
    return {
      autotask: { ...config.autotask, defaultQueueId: 12345 },
      server: { name: 'test-server', version: '0.0.0' },
      transport: { type: 'stdio', port: 8080, host: '127.0.0.1' },
      logging: { level: 'error', format: 'simple' },
      auth: { mode },
    };
  }

  test('env mode passes the default to the shared and per-request tool handlers', () => {
    const server = new AutotaskMcpServer(config, logger, envConfig('env')) as any;
    expect(server.toolHandler.defaultQueueId).toBe(12345);
    const perRequest = server.buildPerRequestHandlers({ ...config.autotask, impersonationResourceId: 7 });
    expect(perRequest.toolHandler.defaultQueueId).toBe(12345);
  });

  test('gateway mode ignores it (queue IDs are tenant-specific)', () => {
    const server = new AutotaskMcpServer(config, logger, envConfig('gateway')) as any;
    expect(server.toolHandler.defaultQueueId).toBeUndefined();
    const perRequest = server.buildPerRequestHandlers({ ...config.autotask, impersonationResourceId: undefined });
    expect(perRequest.toolHandler.defaultQueueId).toBeUndefined();
  });
});
