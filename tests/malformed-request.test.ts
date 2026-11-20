/**
 * Robustness probe for the Node HTTP transport: a request whose Host header or
 * request target cannot be parsed must never throw out of the request listener
 * (which would take the whole process down before auth). Unparseable targets
 * answer 400 and the server keeps serving. Raw sockets are used because fetch()
 * refuses to send these requests. Regression test for WYREAI-741 (reference
 * fix: halopsa-mcp#113).
 */
import { connect } from 'node:net';
import { AutotaskMcpServer } from '../src/mcp/server.js';
import { Logger } from '../src/utils/logger.js';
import type { EnvironmentConfig } from '../src/utils/config.js';

const ENV_KEYS = ['CONDUIT_S2S_SECRET', 'MCP_ALLOW_INSECURE_DEV', 'MCP_HTTP_HOST', 'AUTH_MODE'] as const;
const savedEnv = new Map<string, string | undefined>();
let server: AutotaskMcpServer;
let port: number;

function envConfig(): EnvironmentConfig {
  return {
    autotask: {},
    server: { name: 'autotask-mcp-test', version: '0.0.0-test' },
    transport: { type: 'http', port: 0, host: '127.0.0.1' },
    logging: { level: 'error', format: 'simple' },
    auth: { mode: 'env' },
  };
}

beforeAll(async () => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
  process.env.MCP_ALLOW_INSECURE_DEV = '1';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.AUTH_MODE;
  server = new AutotaskMcpServer(
    {
      name: 'autotask-mcp-test',
      version: '0.0.0-test',
      autotask: { username: 'user@example.com', secret: 'secret', integrationCode: 'code' },
    },
    new Logger('error', 'simple'),
    envConfig(),
  );
  await server.start();
  const bound = server.boundHttpAddress();
  if (!bound) throw new Error('HTTP server did not bind a TCP port');
  port = bound.port;
});

afterAll(async () => {
  await server.stop();
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Send raw HTTP bytes, return the status line and body. */
function rawRequest(payload: string): Promise<{ status: string; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    socket.on('connect', () => socket.write(payload));
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const [head = '', body = ''] = data.split('\r\n\r\n');
      resolve({ status: head.split('\r\n')[0] ?? '', body });
    });
  });
}

const HEALTH = 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n';

describe('malformed requests on the Node HTTP transport (autotask-mcp)', () => {
  it('serves a request with a malformed Host header and keeps running', async () => {
    const res = await rawRequest('GET /health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 200 OK');
    expect((await rawRequest(HEALTH)).status).toBe('HTTP/1.1 200 OK');
  });

  it('answers 400 for an unparseable request target and keeps running', async () => {
    const res = await rawRequest('GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 400 Bad Request');
    expect(res.body).toContain('{"error":"Bad request"}');
    expect((await rawRequest(HEALTH)).status).toBe('HTTP/1.1 200 OK');
  });

  it('serves an HTTP/1.0 request that has no Host header', async () => {
    const res = await rawRequest('GET /health HTTP/1.0\r\n\r\n');
    expect(res.status).toBe('HTTP/1.1 200 OK');
  });
});
