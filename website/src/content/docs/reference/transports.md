---
title: Transport Reference
description: Available transport options for connecting to the MCP server.
---

The Autotask MCP Server supports two transport mechanisms for communicating with MCP clients.

## stdio (Default)

The standard transport for local MCP clients. Communication happens over stdin/stdout using JSON-RPC messages.

### Configuration

```json
{
  "mcpServers": {
    "autotask-mcp": {
      "command": "npx",
      "args": ["-y", "autotask-mcp"],
      "env": {
        "AUTOTASK_USERNAME": "...",
        "AUTOTASK_SECRET": "...",
        "AUTOTASK_INTEGRATION_CODE": "..."
      }
    }
  }
}
```

### When to use

- Claude Desktop or other local MCP clients
- Single-user setups
- Development and testing

## HTTP (Streamable)

An HTTP-based transport that serves the MCP protocol over a web server. Supports multiple concurrent clients.

### Configuration

Set environment variables:

```bash
MCP_TRANSPORT=http
MCP_HTTP_PORT=8080      # Default: 8080
# Honored only when CONDUIT_S2S_SECRET is set. Otherwise the server binds 127.0.0.1.
MCP_HTTP_HOST=0.0.0.0
CONDUIT_S2S_SECRET=     # Required. Empty and known placeholders refuse startup.
```

`/mcp` requires `X-Gateway-S2S: t=<unix seconds>,v1=<hex hmac-sha256 of the ASCII string t=<unix seconds>>`, keyed with `CONDUIT_S2S_SECRET` (300 second skew). `/health` does not.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP protocol endpoint (JSON-RPC) |
| `/health` | GET | Health check |

### Health Check Response

```json
{
  "status": "ok",
  "transport": "http",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### When to use

- Remote or shared deployments
- Multi-client access
- Container/Docker deployments
- Load-balanced environments

### Example: Docker deployment

```bash
docker run -d \
  -e CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  -e AUTOTASK_USERNAME=user@example.com \
  -e AUTOTASK_SECRET=secret \
  -e AUTOTASK_INTEGRATION_CODE=code \
  -e MCP_TRANSPORT=http \
  -e MCP_HTTP_PORT=8080 \
  -p 127.0.0.1:8080:8080 \
  autotask-mcp
```

### Session Management

The HTTP transport uses session IDs to track client connections. Each client receives a unique session ID on first connection, which is included in subsequent requests for continuity.
