// Regression tests for CORS preflight handling on the HTTP transport.
// Claude.ai custom connectors make a browser OPTIONS preflight before POSTing
// to /mcp; without CORS headers the preflight fails and the connector reports
// "Couldn't reach the MCP server."

import { AutotaskMcpServer } from '../src/mcp/server.js';
import { Logger } from '../src/utils/logger.js';
import type { EnvironmentConfig } from '../src/utils/config.js';
import type { McpServerConfig } from '../src/types/mcp.js';

function buildEnvConfig(port: number): EnvironmentConfig {
  return {
    autotask: {},
    server: { name: 'autotask-mcp-test', version: '0.0.0-test' },
    transport: { type: 'http', port, host: '127.0.0.1' },
    logging: { level: 'error', format: 'simple' },
    auth: { mode: 'env' },
  };
}

function buildMcpConfig(): McpServerConfig {
  return {
    name: 'autotask-mcp-test',
    version: '0.0.0-test',
    autotask: { username: '', secret: '', integrationCode: '' },
  } as McpServerConfig;
}

// Pick a high port unlikely to collide; Jest runs workers serially within a file.
function pickPort(): number {
  return 39000 + Math.floor(Math.random() * 1000);
}

describe('HTTP transport CORS preflight', () => {
  let server: AutotaskMcpServer;
  let port: number;
  let savedSecret: string | undefined;
  let savedInsecure: string | undefined;

  beforeEach(async () => {
    savedSecret = process.env.CONDUIT_S2S_SECRET;
    savedInsecure = process.env.MCP_ALLOW_INSECURE_DEV;
    // Local loopback test. HTTP now refuses to listen without a usable
    // CONDUIT_S2S_SECRET unless this flag is exactly "1".
    delete process.env.CONDUIT_S2S_SECRET;
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    port = pickPort();
    const logger = new Logger('error', 'simple');
    server = new AutotaskMcpServer(buildMcpConfig(), logger, buildEnvConfig(port));
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    if (savedSecret === undefined) delete process.env.CONDUIT_S2S_SECRET;
    else process.env.CONDUIT_S2S_SECRET = savedSecret;
    if (savedInsecure === undefined) delete process.env.MCP_ALLOW_INSECURE_DEV;
    else process.env.MCP_ALLOW_INSECURE_DEV = savedInsecure;
  });

  it('responds 204 with CORS headers to OPTIONS /mcp from claude.ai origin', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://claude.ai',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, mcp-session-id',
      },
    });

    expect(res.status).toBe(204);

    const allowOrigin = res.headers.get('access-control-allow-origin');
    expect(allowOrigin === '*' || allowOrigin === 'https://claude.ai').toBe(true);

    const allowMethods = (res.headers.get('access-control-allow-methods') || '').toUpperCase();
    expect(allowMethods).toContain('POST');
    expect(allowMethods).toContain('OPTIONS');

    const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    expect(allowHeaders).toContain('content-type');
  });

  it('includes CORS headers on POST /mcp responses', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Origin: 'https://claude.ai',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'cors-test', version: '0.0.0' },
        },
      }),
    });

    // Regardless of the JSON-RPC payload outcome, the CORS header must be present
    // so the browser surfaces the response to the client.
    const allowOrigin = res.headers.get('access-control-allow-origin');
    expect(allowOrigin === '*' || allowOrigin === 'https://claude.ai').toBe(true);
  });

  it('does not break /health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; mcpTransport: string };
    expect(body.status).toBe('ok');
    expect(body.mcpTransport).toBe('http');
  });
});
