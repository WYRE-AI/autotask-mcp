// Configuration Utility
// Handles loading configuration from environment variables and MCP client arguments
// Supports gateway mode where credentials come via HTTP headers

import { McpServerConfig } from '../types/mcp.js';
import { LogLevel } from './logger.js';

export type TransportType = 'stdio' | 'http';
export type AuthMode = 'env' | 'gateway';

export interface EnvironmentConfig {
  autotask: {
    username?: string;
    secret?: string;
    integrationCode?: string;
    apiUrl?: string;
    impersonateResourceId?: number;
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
  impersonateResourceId: number | undefined;
}

/**
 * Extract credentials from gateway-injected environment variables
 * The gateway proxies headers as environment variables:
 * - X-API-Key header -> X_API_KEY env var
 * - X-API-Secret header -> X_API_SECRET env var
 * - X-Integration-Code header -> X_INTEGRATION_CODE env var
 */
export function getCredentialsFromGateway(): GatewayCredentials {
  const rawResourceId = process.env.X_IMPERSONATE_RESOURCE_ID || process.env.AUTOTASK_IMPERSONATE_RESOURCE_ID;
  return {
    username: process.env.X_API_KEY || process.env.AUTOTASK_USERNAME,
    secret: process.env.X_API_SECRET || process.env.AUTOTASK_SECRET,
    integrationCode: process.env.X_INTEGRATION_CODE || process.env.AUTOTASK_INTEGRATION_CODE,
    apiUrl: process.env.X_API_URL || process.env.AUTOTASK_API_URL,
    impersonateResourceId: rawResourceId ? Number(rawResourceId) : undefined,
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

  const rawResourceId = getHeader('x-impersonate-resource-id');
  return {
    username: getHeader('x-api-key'),
    secret: getHeader('x-api-secret'),
    integrationCode: getHeader('x-integration-code'),
    apiUrl: getHeader('x-api-url'),
    impersonateResourceId: rawResourceId ? Number(rawResourceId) : undefined,
  };
}

/**
 * Load configuration from environment variables
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  const autotaskConfig: { username?: string; secret?: string; integrationCode?: string; apiUrl?: string; impersonateResourceId?: number } = {};

  // Support both direct env vars and gateway-injected vars
  // Gateway vars (X_API_KEY, etc.) take precedence when in gateway mode
  const authMode = (process.env.AUTH_MODE as AuthMode) || 'env';

  if (authMode === 'gateway') {
    // Gateway mode: prefer X_* vars from gateway headers
    const gatewayCreds = getCredentialsFromGateway();
    if (gatewayCreds.username) {
      autotaskConfig.username = gatewayCreds.username;
    }
    if (gatewayCreds.secret) {
      autotaskConfig.secret = gatewayCreds.secret;
    }
    if (gatewayCreds.integrationCode) {
      autotaskConfig.integrationCode = gatewayCreds.integrationCode;
    }
    if (gatewayCreds.apiUrl) {
      autotaskConfig.apiUrl = gatewayCreds.apiUrl;
    }
    if (gatewayCreds.impersonateResourceId) {
      autotaskConfig.impersonateResourceId = gatewayCreds.impersonateResourceId;
    }
  } else {
    // Direct env mode: use AUTOTASK_* vars
    if (process.env.AUTOTASK_USERNAME) {
      autotaskConfig.username = process.env.AUTOTASK_USERNAME;
    }
    if (process.env.AUTOTASK_SECRET) {
      autotaskConfig.secret = process.env.AUTOTASK_SECRET;
    }
    if (process.env.AUTOTASK_INTEGRATION_CODE) {
      autotaskConfig.integrationCode = process.env.AUTOTASK_INTEGRATION_CODE;
    }
    if (process.env.AUTOTASK_API_URL) {
      autotaskConfig.apiUrl = process.env.AUTOTASK_API_URL;
    }
    if (process.env.AUTOTASK_IMPERSONATE_RESOURCE_ID) {
      autotaskConfig.impersonateResourceId = Number(process.env.AUTOTASK_IMPERSONATE_RESOURCE_ID);
    }
  }

  const transportType = (process.env.MCP_TRANSPORT as TransportType) || 'stdio';
  if (transportType !== 'stdio' && transportType !== 'http') {
    throw new Error(`Invalid MCP_TRANSPORT value: "${transportType}". Must be "stdio" or "http".`);
  }

  return {
    autotask: autotaskConfig,
    server: {
      name: process.env.MCP_SERVER_NAME || 'autotask-mcp',
      version: process.env.MCP_SERVER_VERSION || '1.0.0'
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
      apiUrl: mcpArgs?.autotask?.apiUrl || envConfig.autotask.apiUrl,
      impersonateResourceId: mcpArgs?.autotask?.impersonateResourceId || envConfig.autotask.impersonateResourceId
    }
  };

  return serverConfig;
}

/**
 * Validate that all required configuration is present
 */
export function validateConfig(config: McpServerConfig): string[] {
  const errors: string[] = [];

  if (!config.autotask.username) {
    errors.push('AUTOTASK_USERNAME is required');
  }

  if (!config.autotask.secret) {
    errors.push('AUTOTASK_SECRET is required');
  }

  if (!config.autotask.integrationCode) {
    errors.push('AUTOTASK_INTEGRATION_CODE is required');
  }

  if (!config.name) {
    errors.push('Server name is required');
  }

  if (!config.version) {
    errors.push('Server version is required');
  }

  return errors;
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
  AUTOTASK_IMPERSONATE_RESOURCE_ID - Autotask Resource ID to impersonate (optional)
  AUTOTASK_API_URL         - Autotask API base URL (auto-detected if not provided)
  AUTH_MODE                - Authentication mode: env (default), gateway
  MCP_SERVER_NAME          - Server name (default: autotask-mcp)
  MCP_SERVER_VERSION       - Server version (default: 1.0.0)
  MCP_TRANSPORT            - Transport type: stdio, http (default: stdio)
  MCP_HTTP_PORT            - HTTP port when using http transport (default: 8080)
  MCP_HTTP_HOST            - HTTP host when using http transport (default: 0.0.0.0)
  LOG_LEVEL                - Logging level: error, warn, info, debug (default: info)
  LOG_FORMAT               - Log format: simple, json (default: simple)
  LAZY_LOADING             - Enable progressive tool discovery (default: false)

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