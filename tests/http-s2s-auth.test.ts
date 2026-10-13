/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires a usable CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholders are treated as missing. That flag forces 127.0.0.1.
 * /mcp rejects a missing or invalid X-Gateway-S2S header.
 * AUTH_MODE=gateway rejects requests that omit credential headers and must
 * not fall back to AUTOTASK_* baked into the server config.
 */

import { createHmac } from 'node:crypto';
import { AutotaskMcpServer } from '../src/mcp/server.js';
import { Logger } from '../src/utils/logger.js';
import type { EnvironmentConfig } from '../src/utils/config.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_USERNAME = 'env-user-must-not-be-used@example.com';
const ENV_SECRET = 'env-secret-must-not-be-used';
const ENV_CODE = 'env-integration-code-must-not-be-used';
const PLACEHOLDER = '${user_config.conduit_s2s_secret}';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'AUTOTASK_USERNAME',
  'AUTOTASK_SECRET',
  'AUTOTASK_INTEGRATION_CODE',
] as const;

const savedEnv = new Map<string, string | undefined>();

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const record = (chunk: unknown) => {
    if (typeof chunk === 'string') lines.push(chunk);
    else if (Buffer.isBuffer(chunk)) lines.push(chunk.toString('utf8'));
  };
  // Winston writes stderrLevels through console._stderr.write. Under Jest that
  // stream is not always process.stderr, so spy on whichever object is live.
  const stderrStream = (console as unknown as { _stderr?: NodeJS.WriteStream })._stderr ?? process.stderr;
  const writeSpy = jest.spyOn(stderrStream, 'write').mockImplementation((chunk: string | Uint8Array) => {
    record(chunk);
    return true;
  });
  const logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => {
      writeSpy.mockRestore();
      logSpy.mockRestore();
    },
  };
}

function envConfig(host: string, mode: 'env' | 'gateway'): EnvironmentConfig {
  return {
    autotask: {},
    server: { name: 'autotask-mcp-test', version: '0.0.0-test' },
    transport: { type: 'http', port: 0, host },
    logging: { level: 'info', format: 'simple' },
    auth: { mode },
  };
}

function buildServer(host: string, mode: 'env' | 'gateway' = 'env'): AutotaskMcpServer {
  return new AutotaskMcpServer(
    {
      name: 'autotask-mcp-test',
      version: '0.0.0-test',
      autotask: {
        username: ENV_USERNAME,
        secret: ENV_SECRET,
        integrationCode: ENV_CODE,
      },
    },
    new Logger('info', 'simple'),
    envConfig(host, mode),
  );
}

async function listen(host: string, mode: 'env' | 'gateway' = 'env'): Promise<{
  port: number;
  address: string;
  close: () => Promise<void>;
}> {
  const server = buildServer(host, mode);
  await server.start();
  const bound = server.boundHttpAddress();
  if (!bound) throw new Error('HTTP server did not bind a TCP port');
  return {
    port: bound.port,
    address: bound.address,
    close: () => server.stop(),
  };
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const toolsList = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
  params: {},
});

async function mcpBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const dataLines = text.split('\n').filter((line) => line.startsWith('data:'));
    const last = dataLines[dataLines.length - 1];
    if (!last) return text;
    return JSON.parse(last.slice('data:'.length).trim()) as unknown;
  }
  return text ? JSON.parse(text) as unknown : text;
}

function assertNoSecrets(text: string): void {
  expect(text).not.toContain(S2S_SECRET);
  expect(text).not.toContain(ENV_USERNAME);
  expect(text).not.toContain(ENV_SECRET);
  expect(text).not.toContain(ENV_CODE);
  expect(text).not.toContain(PLACEHOLDER);
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.MCP_HTTP_HOST;
  delete process.env.AUTH_MODE;
  delete process.env.AUTOTASK_USERNAME;
  delete process.env.AUTOTASK_SECRET;
  delete process.env.AUTOTASK_INTEGRATION_CODE;
});

describe('HTTP startup', () => {
  async function expectRefusal(assertLog: (text: string) => void): Promise<void> {
    const logs = captureStderr();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${String(code)}`);
    }) as typeof process.exit);

    try {
      await expect(buildServer('0.0.0.0').start()).rejects.toThrow('process.exit:1');
      expect(exitSpy).toHaveBeenCalledWith(1);
      const text = logs.text();
      assertLog(text);
      assertNoSecrets(text);
    } finally {
      exitSpy.mockRestore();
      logs.restore();
    }
  }

  it('refuses to start when CONDUIT_S2S_SECRET is unset', async () => {
    await expectRefusal((text) => {
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('CWE-306');
    });
  });

  it('refuses to start when CONDUIT_S2S_SECRET is a known placeholder', async () => {
    process.env.CONDUIT_S2S_SECRET = 'changeme';
    await expectRefusal((text) => {
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('known placeholder');
    });
  });

  it('refuses to start when CONDUIT_S2S_SECRET is an unresolved template', async () => {
    process.env.CONDUIT_S2S_SECRET = PLACEHOLDER;
    await expectRefusal((text) => {
      expect(text).toContain('known placeholder');
      expect(text).not.toContain(PLACEHOLDER);
    });
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    await expectRefusal((text) => {
      expect(text).toContain('Refusing to start HTTP transport');
    });
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    const logs = captureStderr();
    let close: (() => Promise<void>) | undefined;
    try {
      const server = await listen('0.0.0.0');
      close = server.close;
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain('is not 127.0.0.1');
      assertNoSecrets(text);
    } finally {
      logs.restore();
      await close?.();
    }
  });

  it('forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is not loopback', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    let close: (() => Promise<void>) | undefined;
    try {
      const server = await listen('10.1.2.3');
      close = server.close;
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('MCP_HTTP_HOST=0.0.0.0 is not 127.0.0.1');
      expect(text).toContain('Binding 127.0.0.1 only');
      assertNoSecrets(text);
    } finally {
      logs.restore();
      await close?.();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const server = await listen('127.0.0.1');
    try {
      expect(server.address).toBe('0.0.0.0');
    } finally {
      await server.close();
    }
  });

  it('keeps the configured host when the secret is set and MCP_HTTP_HOST is unset', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen('0.0.0.0');
    try {
      expect(server.address).toBe('0.0.0.0');
    } finally {
      await server.close();
    }
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.AUTOTASK_USERNAME = ENV_USERNAME;
    process.env.AUTOTASK_SECRET = ENV_SECRET;
    process.env.AUTOTASK_INTEGRATION_CODE = ENV_CODE;
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    const server = await listen('127.0.0.1', 'gateway');
    try {
      const missing = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-api-key': 'header-user',
          'x-api-secret': 'header-secret',
          'x-integration-code': 'header-code',
        }),
        body: toolsList,
      });
      const invalid = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader('wrong-secret'),
          'x-api-key': 'header-user',
          'x-api-secret': 'header-secret',
          'x-integration-code': 'header-code',
        }),
        body: toolsList,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      const missingText = await missing.text();
      const invalidText = await invalid.text();
      expect(missingText).toContain('X-Gateway-S2S');
      expect(invalidText).toContain('X-Gateway-S2S');
      assertNoSecrets(missingText);
      assertNoSecrets(invalidText);
      assertNoSecrets(logs.text());
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const server = await listen('127.0.0.1', 'gateway');
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
        body: toolsList,
      });
      const text = await response.text();

      expect(response.status).toBe(401);
      expect(text).toContain('missing required gateway credentials');
      expect(text).toContain('X-API-Key');
      expect(text).toContain('X-API-Secret');
      expect(text).toContain('X-Integration-Code');
      assertNoSecrets(text);

      const partial = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-api-key': 'header-user',
        }),
        body: toolsList,
      });
      expect(partial.status).toBe(401);
      assertNoSecrets(await partial.text());
    } finally {
      await server.close();
    }
  });

  it('accepts a valid S2S header plus credential headers', async () => {
    const logs = captureStderr();
    const server = await listen('127.0.0.1', 'gateway');
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-api-key': 'header-user',
          'x-api-secret': 'header-secret',
          'x-integration-code': 'header-code',
        }),
        body: toolsList,
      });
      const text = await response.text();
      const body = await mcpBody(new Response(text, { headers: response.headers }));

      expect(response.status).toBe(200);
      const tools = (body as { result?: { tools?: unknown[] } }).result?.tools;
      expect(Array.isArray(tools)).toBe(true);
      expect((tools ?? []).length).toBeGreaterThan(0);
      assertNoSecrets(text);
      assertNoSecrets(logs.text());
    } finally {
      logs.restore();
      await server.close();
    }
  });

  it('serves /health without authentication and without reading credentials', async () => {
    const server = await listen('127.0.0.1', 'gateway');
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      const text = await response.text();
      const body = JSON.parse(text) as { status?: string; authMode?: string };
      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.authMode).toBe('gateway');
      assertNoSecrets(text);
    } finally {
      await server.close();
    }
  });
});
