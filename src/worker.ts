import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { Transport } from "@modelcontextprotocol/server";

// Cloudflare Workers entry point for the Autotask MCP Server.
//
// Serves the full MCP server over the Streamable HTTP transport using the SDK's
// Web Standard transport (Request/Response), which runs natively on Workers.
// It reuses the exact same handler wiring as the stdio / Node HTTP entrypoints
// via AutotaskMcpServer.createRequestServer(), so there is no second tool
// implementation to maintain.
//
// The Autotask service layer talks to the REST API through AutotaskHttpClient,
// which uses the built-in global `fetch` only (the autotask-node SDK is NOT on
// the runtime path), so it runs cleanly on workerd with `nodejs_compat`.
//
// Credentials are resolved per request, in order:
// 1. Gateway headers (when AUTH_MODE=gateway):
//    - X-API-Key           (Autotask API username)
//    - X-API-Secret        (Autotask API secret)
//    - X-Integration-Code  (Autotask tracking identifier)
//    - X-API-Url           (optional explicit zone URL)
// 2. Worker secrets / vars (env mode):
//    - AUTOTASK_USERNAME
//    - AUTOTASK_SECRET
//    - AUTOTASK_INTEGRATION_CODE
//    - AUTOTASK_API_URL (optional)
//
// `tools/list` and `initialize` work without credentials; only `tools/call`
// requires them.
import { AutotaskMcpServer } from './mcp/server.js';
import { Logger } from './utils/logger.js';
import {
  getServerVersion,
  parseCredentialsFromHeaders,
  type GatewayCredentials,
} from './utils/config.js';
import type { McpServerConfig } from './types/mcp.js';

export interface Env {
  AUTOTASK_USERNAME?: string;
  AUTOTASK_SECRET?: string;
  AUTOTASK_INTEGRATION_CODE?: string;
  AUTOTASK_API_URL?: string;
  AUTH_MODE?: string;
  LOG_LEVEL?: string;
  LOG_FORMAT?: string;
  LAZY_LOADING?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-API-Key, X-API-Secret, X-Integration-Code, X-API-Url',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Build (once per isolate) the AutotaskMcpServer used as the handler factory.
 *
 * Constructing the class is side-effect-free (it does not open a transport or
 * a socket), so it is safe to memoize for the lifetime of the Worker isolate.
 * Per-request credential isolation happens in `createRequestServer()`.
 */
let appServer: AutotaskMcpServer | undefined;
function getAppServer(env: Env): AutotaskMcpServer {
  if (appServer) return appServer;

  const logger = new Logger(
    (env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
    (env.LOG_FORMAT as 'json' | 'simple') || 'json'
  );

  const autotask: McpServerConfig['autotask'] = {};
  if (env.AUTOTASK_USERNAME) autotask.username = env.AUTOTASK_USERNAME;
  if (env.AUTOTASK_SECRET) autotask.secret = env.AUTOTASK_SECRET;
  if (env.AUTOTASK_INTEGRATION_CODE)
    autotask.integrationCode = env.AUTOTASK_INTEGRATION_CODE;
  if (env.AUTOTASK_API_URL) autotask.apiUrl = env.AUTOTASK_API_URL;

  const config: McpServerConfig = {
    name: 'autotask-mcp',
    version: getServerVersion(),
    autotask,
  };

  appServer = new AutotaskMcpServer(config, logger, {
    autotask,
    server: { name: 'autotask-mcp', version: getServerVersion() },
    transport: { type: 'http', port: 8080, host: '0.0.0.0' },
    logging: {
      level: (env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
      format: (env.LOG_FORMAT as 'json' | 'simple') || 'json',
    },
    auth: { mode: env.AUTH_MODE === 'gateway' ? 'gateway' : 'env' },
    lazyLoading: env.LAZY_LOADING === 'true' || env.LAZY_LOADING === '1',
  });

  return appServer;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Shallow, unauthenticated liveness probe.
    if (url.pathname === '/health' || url.pathname === '/healthz') {
      return json({
        status: 'ok',
        version: getServerVersion(),
        mcpTransport: 'http',
        authMode: env.AUTH_MODE === 'gateway' ? 'gateway' : 'env',
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === '/mcp') {
      const isGatewayMode = (env.AUTH_MODE ?? 'env') === 'gateway';

      let credentials: GatewayCredentials | undefined;
      if (isGatewayMode) {
        const parsed = parseCredentialsFromHeaders(
          Object.fromEntries(request.headers) as Record<
            string,
            string | undefined
          >
        );
        if (!parsed.username || !parsed.secret || !parsed.integrationCode) {
          return json(
            {
              error: 'Missing credentials',
              message:
                'Gateway mode requires X-API-Key, X-API-Secret, and X-Integration-Code headers',
              required: ['X-API-Key', 'X-API-Secret', 'X-Integration-Code'],
              optional: ['X-API-Url'],
            },
            401
          );
        }
        credentials = parsed;
      }

      // Fresh server + transport per request (stateless). The handler factory
      // (AutotaskMcpServer) is memoized per isolate; createRequestServer()
      // produces an isolated server bound to the per-request credentials.
      const server = getAppServer(env).createRequestServer(credentials);
      // Omit `sessionIdGenerator` entirely (rather than passing `undefined`)
      // to satisfy exactOptionalPropertyTypes; an absent generator yields the
      // same stateless behavior.
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      await server.connect(transport as unknown as Transport);

      try {
        const response = await transport.handleRequest(request);
        return withCors(response);
      } finally {
        await transport.close();
        await server.close();
      }
    }

    return json({ error: 'Not found', endpoints: ['/mcp', '/health'] }, 404);
  },
};
