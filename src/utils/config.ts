// Configuration Utility
// Handles loading configuration from environment variables and MCP client arguments
// Supports gateway mode where credentials come via HTTP headers

import { McpServerConfig } from '../types/mcp.js';
import { LogLevel } from './logger.js';
// `resolveJsonModule` is enabled in tsconfig. We read package.json so the
// runtime can report its actual built version in the MCP initialize handshake
// and the /health endpoint. The Dockerfile patches this file's `version` field
// with the release VERSION build arg before `npm run build`, so the published
// image always carries the real release version even though branch protection
// blocks @semantic-release/git from pushing version bumps back to main.
import packageJson from '../../package.json';

/**
 * Resolve the running server version. Single source of truth for both the
 * `serverInfo.version` MCP handshake value and the `/health` response.
 * Priority: explicit override > package.json (patched at Docker build time
 * with the release version) > 'unknown'.
 */
export function getServerVersion(override?: string): string {
  return override || packageJson.version || 'unknown';
}

export type TransportType = 'stdio' | 'http';
export type AuthMode = 'env' | 'gateway';

export interface EnvironmentConfig {
  autotask: {
    username?: string;
    secret?: string;
    integrationCode?: string;
    apiUrl?: string;
  };
  server: {
    name: string;
    version: string;
  };
  transport: {
    type: TransportType;
    port: number;
    host: string;
  };
  logging: {
    level: LogLevel;
    format: 'json' | 'simple';
  };
  auth: {
    mode: AuthMode;
  };
  lazyLoading?: boolean;
}

/**
 * Gateway credentials extracted from HTTP request headers
 * The MCP Gateway injects credentials via these headers:
 * - X-API-Key: Contains the Autotask username
 * - X-API-Secret: Contains the Autotask secret
 * - X-Integration-Code: Contains the Autotask integration code
 */
export interface GatewayCredentials {
  username: string | undefined;
  secret: string | undefined;
  integrationCode: string | undefined;
  apiUrl: string | undefined;
}

/**
 * Extract credentials from gateway-injected environment variables
 * The gateway proxies headers as environment variables:
 * - X-API-Key header -> X_API_KEY env var
 * - X-API-Secret header -> X_API_SECRET env var
 * - X-Integration-Code header -> X_INTEGRATION_CODE env var
 */
export function getCredentialsFromGateway(): GatewayCredentials {
  return {
    username: process.env.X_API_KEY || process.env.AUTOTASK_USERNAME,
    secret: process.env.X_API_SECRET || process.env.AUTOTASK_SECRET,
    integrationCode: process.env.X_INTEGRATION_CODE || process.env.AUTOTASK_INTEGRATION_CODE,
    apiUrl: process.env.X_API_URL || process.env.AUTOTASK_API_URL,
  };
}

/**
 * Parse credentials from HTTP request headers (for per-request credential handling)
 * Header names follow HTTP convention (lowercase with hyphens)
 */
export function parseCredentialsFromHeaders(headers: Record<string, string | string[] | undefined>): GatewayCredentials {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    username: getHeader('x-api-key'),
    secret: getHeader('x-api-secret'),
    integrationCode: getHeader('x-integration-code'),
    apiUrl: getHeader('x-api-url'),
  };
}

/**
 * Load configuration from environment variables
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  // Support both direct env vars and gateway-injected vars
  // Gateway vars (X_API_KEY, etc.) take precedence when in gateway mode
  const authMode = (process.env.AUTH_MODE as AuthMode) || 'env';

  // getCredentialsFromGateway falls back to AUTOTASK_* env vars internally,
  // so it works for both modes. In env mode, use AUTOTASK_* vars directly.
  const creds = authMode === 'gateway'
    ? getCredentialsFromGateway()
    : {
        username: process.env.AUTOTASK_USERNAME,
        secret: process.env.AUTOTASK_SECRET,
        integrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
        apiUrl: process.env.AUTOTASK_API_URL,
      };

  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const autotaskConfig: { username?: string; secret?: string; integrationCode?: string; apiUrl?: string } = {};
  if (creds.username) autotaskConfig.username = creds.username;
  if (creds.secret) autotaskConfig.secret = creds.secret;
  if (creds.integrationCode) autotaskConfig.integrationCode = creds.integrationCode;
  if (creds.apiUrl) autotaskConfig.apiUrl = creds.apiUrl;

  const transportType = (process.env.MCP_TRANSPORT as TransportType) || 'stdio';
  if (transportType !== 'stdio' && transportType !== 'http') {
    throw new Error(`Invalid MCP_TRANSPORT value: "${transportType}". Must be "stdio" or "http".`);
  }

  return {
    autotask: autotaskConfig,
    server: {
      name: process.env.MCP_SERVER_NAME || 'autotask-mcp',
      version: getServerVersion(process.env.MCP_SERVER_VERSION)
    },
    transport: {
      type: transportType,
      port: parseInt(process.env.MCP_HTTP_PORT || '8080', 10),
      host: process.env.MCP_HTTP_HOST || '0.0.0.0'
    },
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'simple'
    },
    auth: {
      mode: authMode
    },
    lazyLoading: process.env.LAZY_LOADING === 'true' || process.env.LAZY_LOADING === '1'
  };
}

/**
 * Merge environment config with MCP client configuration
 */
export function mergeWithMcpConfig(envConfig: EnvironmentConfig, mcpArgs?: Record<string, any>): McpServerConfig {
  // MCP client can override server configuration through arguments
  const serverConfig: McpServerConfig = {
    name: mcpArgs?.name || envConfig.server.name,
    version: mcpArgs?.version || envConfig.server.version,
    autotask: {
      username: mcpArgs?.autotask?.username || envConfig.autotask.username,
      secret: mcpArgs?.autotask?.secret || envConfig.autotask.secret,
      integrationCode: mcpArgs?.autotask?.integrationCode || envConfig.autotask.integrationCode,
      apiUrl: mcpArgs?.autotask?.apiUrl || envConfig.autotask.apiUrl
    }
  };

  return serverConfig;
}

/**
 * In-memory cache of resolved zone URLs keyed by username (lowercased).
 * Populated by resolveAutotaskApiUrl on successful zone info lookup.
 * Never persisted to disk — lifetime == process lifetime.
 */
const zoneUrlCache = new Map<string, string>();

/**
 * Reset the zone URL cache. Intended for tests only.
 */
export function _resetZoneUrlCache(): void {
  zoneUrlCache.clear();
}

/**
 * Minimal logger shape accepted by resolveAutotaskApiUrl so we don't
 * have a hard dep on the Logger class (keeps this pre-auth bootstrap simple).
 */
export interface ZoneResolverLogger {
  info: (msg: string, ...args: any[]) => void;
  error: (msg: string, ...args: any[]) => void;
}

const ZONE_INFO_URL = 'https://webservices.autotask.net/atservicesrest/v1.0/zoneInformation';
const ZONE_DOCS_URL =
  'https://ww1.autotask.net/help/Content/AdminSetup/2ExtensionsIntegrations/APIs/REST/General_Topics/REST_Zones.htm';

/**
 * Resolve the Autotask API base URL.
 *
 * Precedence:
 *   1. If `explicitApiUrl` is set, return it (manual override always wins).
 *   2. Otherwise, if `username` is set, look up the tenant's zone via the
 *      unauthenticated zoneInformation endpoint, cache it, and return it.
 *   3. Otherwise, throw — caller must set AUTOTASK_API_URL manually.
 *
 * Intentionally uses native `fetch` (not the autotask-node SDK) because
 * this is a pre-auth bootstrap: the SDK needs a URL to construct itself.
 */
export async function resolveAutotaskApiUrl(
  username: string | undefined,
  explicitApiUrl: string | undefined,
  logger: ZoneResolverLogger,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (explicitApiUrl) {
    return explicitApiUrl;
  }

  if (!username) {
    throw new Error(
      'Cannot auto-detect Autotask zone: AUTOTASK_USERNAME is not set. ' +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
  }

  const cacheKey = username.toLowerCase();
  const cached = zoneUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const lookupUrl = `${ZONE_INFO_URL}?user=${encodeURIComponent(username)}`;
  let response: Response;
  try {
    response = await fetchImpl(lookupUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `Failed to contact Autotask zone info endpoint: ${message}. ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
    throw new Error(
      `Autotask zone auto-detection failed (network error: ${message}). ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`,
      { cause: err }
    );
  }

  if (!response.ok) {
    logger.error(
      `Autotask zone info endpoint returned HTTP ${response.status} for user ${username}. ` +
        `Verify the username (API user email) is correct, or set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
    throw new Error(
      `Autotask zone auto-detection failed (HTTP ${response.status}). ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
  }

  let body: any;
  try {
    body = await response.json();
  } catch (err) {
    logger.error(
      `Autotask zone info response was not valid JSON. ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
    throw new Error(
      `Autotask zone auto-detection failed (malformed response). ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`,
      { cause: err }
    );
  }

  const url: unknown = body?.url;
  if (typeof url !== 'string' || url.length === 0) {
    logger.error(
      `Autotask zone info response missing "url" field. ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
    throw new Error(
      `Autotask zone auto-detection failed (missing url in response). ` +
        `Set AUTOTASK_API_URL manually — see ${ZONE_DOCS_URL}`
    );
  }

  const zoneName = typeof body?.zoneName === 'string' ? body.zoneName : 'unknown';
  logger.info(`Auto-detected Autotask zone "${zoneName}" for user ${username}: ${url}`);

  zoneUrlCache.set(cacheKey, url);
  return url;
}

/**
 * Get configuration help text
 */
export function getConfigHelp(): string {
  return `
Autotask MCP Server Configuration:

=== Local Mode (default) ===
Required Environment Variables:
  AUTOTASK_USERNAME         - Autotask API username (email)
  AUTOTASK_SECRET          - Autotask API secret key
  AUTOTASK_INTEGRATION_CODE - Autotask integration code

=== Gateway Mode (hosted deployment) ===
When AUTH_MODE=gateway, credentials are injected by the MCP Gateway:
  X_API_KEY                - Autotask API username (from X-API-Key header)
  X_API_SECRET             - Autotask API secret (from X-API-Secret header)
  X_INTEGRATION_CODE       - Autotask integration code (from X-Integration-Code header)

=== Common Options ===
  AUTOTASK_API_URL         - Autotask API base URL (auto-detected if not provided)
  AUTH_MODE                - Authentication mode: env (default), gateway
  MCP_SERVER_NAME          - Server name (default: autotask-mcp)
  MCP_SERVER_VERSION       - Override the reported server version. Defaults to the version baked into the image's package.json at build time. Useful for stamping a custom build identifier.
  MCP_TRANSPORT            - Transport type: stdio, http (default: stdio)
  MCP_HTTP_PORT            - HTTP port when using http transport (default: 8080)
  MCP_HTTP_HOST            - HTTP host when using http transport (default: 0.0.0.0)
  LOG_LEVEL                - Logging level: error, warn, info, debug (default: info)
  LOG_FORMAT               - Log format: simple, json (default: simple)

Example (Local Mode):
  AUTOTASK_USERNAME=api-user@example.com
  AUTOTASK_SECRET=your-secret-key
  AUTOTASK_INTEGRATION_CODE=your-integration-code

Example (Gateway Mode):
  AUTH_MODE=gateway
  MCP_TRANSPORT=http
  # Credentials injected by gateway via X-API-Key, X-API-Secret, X-Integration-Code headers
`.trim();
}
