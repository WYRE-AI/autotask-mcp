# Migration Guide: Local to Hosted Autotask MCP Server

This guide helps existing local autotask-mcp users migrate to the hosted MCP Gateway deployment.

## Overview

The Autotask MCP server now supports two authentication modes:

1. **Local Mode (env)** - Credentials stored in environment variables (existing behavior)
2. **Gateway Mode (gateway)** - Credentials injected via HTTP headers from the MCP Gateway

## For Local Users (No Changes Required)

If you're running autotask-mcp locally with Claude Desktop or Claude Code, **no changes are required**. Your existing configuration continues to work.

### Existing Local Configuration

Your `~/.claude/settings.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "autotask": {
      "command": "npx",
      "args": ["-y", "autotask-mcp"],
      "env": {
        "AUTOTASK_USERNAME": "your-api-user@example.com",
        "AUTOTASK_SECRET": "your-api-secret",
        "AUTOTASK_INTEGRATION_CODE": "your-integration-code"
      }
    }
  }
}
```

This configuration will continue to work exactly as before.

## Migrating to Hosted MCP Gateway

When the hosted MCP Gateway at `mcp.wyre.ai` becomes available, you can switch to the hosted version for a simpler setup.

### Benefits of Hosted Mode

- **No local credentials** - Credentials stored securely in the gateway
- **OAuth-like flow** - One-time credential entry via web browser
- **Automatic updates** - Always use the latest MCP server version
- **Multi-device support** - Use from any device once authenticated

### Updated Configuration for Hosted Mode

Replace your local configuration with:

```json
{
  "mcpServers": {
    "autotask": {
      "type": "http",
      "url": "https://mcp.wyre.ai/v1/autotask/mcp"
    }
  }
}
```

### First-Time Setup (Hosted)

1. Add the hosted MCP server to your Claude configuration
2. First request triggers OAuth-like authentication flow
3. Browser opens to Wyre credential entry page
4. Enter your Autotask API credentials once
5. Credentials are encrypted and stored securely
6. All subsequent requests use stored credentials

## Running Your Own Gateway Instance

For self-hosted or enterprise deployments, you can run the MCP server in gateway mode.

### Docker Deployment

```bash
# Pull the image
docker pull ghcr.io/wyre-ai/autotask-mcp:latest

# Run in gateway mode (credentials via headers)
docker run -d \
  -p 8080:8080 \
  -e AUTH_MODE=gateway \
  -e MCP_TRANSPORT=http \
  -e LOG_LEVEL=info \
  ghcr.io/wyre-ai/autotask-mcp:latest
```

### Gateway Mode Headers

When running in gateway mode, the MCP server expects credentials in HTTP headers:

| Header | Description |
|--------|-------------|
| `X-API-Key` | Autotask API username (email) |
| `X-API-Secret` | Autotask API secret key |
| `X-Integration-Code` | Autotask integration code |
| `X-API-URL` | (Optional) Custom Autotask API URL |

### Example Gateway Request

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-user@example.com" \
  -H "X-API-Secret: your-api-secret" \
  -H "X-Integration-Code: your-integration-code" \
  -d '{"method": "tools/list"}'
```

## Environment Variables Reference

### Local Mode (AUTH_MODE=env)

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTOTASK_USERNAME` | Yes | Autotask API username |
| `AUTOTASK_SECRET` | Yes | Autotask API secret |
| `AUTOTASK_INTEGRATION_CODE` | Yes | Autotask integration code |
| `AUTOTASK_API_URL` | No | Custom API URL (auto-detected) |

### Gateway Mode (AUTH_MODE=gateway)

| Variable | Description |
|----------|-------------|
| `X_API_KEY` | From `X-API-Key` header |
| `X_API_SECRET` | From `X-API-Secret` header |
| `X_INTEGRATION_CODE` | From `X-Integration-Code` header |
| `X_API_URL` | From `X-API-URL` header |

### Common Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_MODE` | `env` | Authentication mode: `env` or `gateway` |
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio` or `http` |
| `MCP_HTTP_PORT` | `8080` | HTTP port (when transport=http) |
| `MCP_HTTP_HOST` | `0.0.0.0` | HTTP host (when transport=http) |
| `LOG_LEVEL` | `info` | Logging: `error`, `warn`, `info`, `debug` |
| `LOG_FORMAT` | `simple` | Log format: `simple` or `json` |

## Troubleshooting

### Missing Credentials Error (Gateway Mode)

```
401 Unauthorized: Missing credentials
```

Ensure all required headers are present:
- `X-API-Key`
- `X-API-Secret`
- `X-Integration-Code`

### Connection Test

Test connectivity with the health endpoint:

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "transport": "http",
  "authMode": "gateway",
  "timestamp": "2026-02-05T10:00:00.000Z"
}
```

### Credential Validation

Use the `autotask_test_connection` tool to validate credentials:

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-username" \
  -H "X-API-Secret: your-secret" \
  -H "X-Integration-Code: your-code" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "autotask_test_connection",
      "arguments": {}
    },
    "id": 1
  }'
```

## Support

- GitHub Issues: https://github.com/WYRE-AI/autotask-mcp/issues
- Documentation: https://github.com/WYRE-AI/autotask-mcp
