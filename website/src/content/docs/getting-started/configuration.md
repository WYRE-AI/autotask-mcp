---
title: Configuration
description: Configure credentials, transport, and server options.
---

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `AUTOTASK_USERNAME` | Your API user email address |
| `AUTOTASK_SECRET` | Your API secret key |
| `AUTOTASK_INTEGRATION_CODE` | Your integration code from Autotask |

## Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOTASK_API_URL` | Auto-detected | Override the Autotask API zone URL |
| `MCP_TRANSPORT` | `stdio` | Transport type: `stdio` or `http` |
| `MCP_HTTP_PORT` | `8080` | Port for HTTP transport |
| `MCP_HTTP_HOST` | `0.0.0.0` when `CONDUIT_S2S_SECRET` is set; `127.0.0.1` otherwise | Bind address for HTTP. A configured secret honors this. `MCP_ALLOW_INSECURE_DEV=1` forces `127.0.0.1`. |
| `CONDUIT_S2S_SECRET` | — | Required to start HTTP. Signs `X-Gateway-S2S`. Empty and known placeholders are rejected. |
| `MCP_ALLOW_INSECURE_DEV` | unset | Set to exactly `1` for local HTTP without a usable secret. Skips `X-Gateway-S2S` and listens on `127.0.0.1` only. |
| `LOG_LEVEL` | `info` | Logging level: `error`, `warn`, `info`, `debug` |

## Using a .env File

You can place credentials in a `.env` file in the project root:

```bash
AUTOTASK_USERNAME=api-user@example.com
AUTOTASK_SECRET=your-secret-key-here
AUTOTASK_INTEGRATION_CODE=your-integration-code
LOG_LEVEL=info
```

## Transport Options

### stdio (Default)

The default transport communicates over stdin/stdout. This is the standard mode for MCP clients like Claude Desktop.

### HTTP (Streamable)

For remote or multi-client deployments, use the HTTP transport:

```bash
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" MCP_TRANSPORT=http MCP_HTTP_PORT=8080 node dist/entry.js
```

`/mcp` requires `X-Gateway-S2S: t=<unix seconds>,v1=<hex hmac-sha256 of "t=<unix seconds>">`, keyed with `CONDUIT_S2S_SECRET`. `/health` stays unauthenticated.

This starts an HTTP server with:
- `POST /mcp` — MCP protocol endpoint
- `GET /health` — Health check endpoint

## Getting Autotask API Credentials

1. Log into your Autotask instance as an administrator
2. Navigate to **Admin → Resources (Users)**
3. Create or select an API user
4. Generate an API secret key
5. Note the integration code from **Admin → Extensions & Integrations**

The API user needs appropriate security level permissions for the entities you want to access.
