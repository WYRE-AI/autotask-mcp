# Autotask MCP Server

[![Build Status](https://github.com/wyre-technology/autotask-mcp/actions/workflows/release.yml/badge.svg)](https://github.com/wyre-technology/autotask-mcp/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/wyre-technology/autotask-mcp/graph/badge.svg)](https://codecov.io/gh/wyre-technology/autotask-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

**Give your AI assistant direct access to Autotask.** Search tickets, create time entries, look up companies, manage projects — all through natural language. No more copy-pasting between browser tabs and chat windows.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Autotask PSA environment. Your AI assistant gets 39 tools covering the operations MSP teams use daily: ticket triage, time logging, company lookups, project management, billing review, and more.

If you run an MSP on Autotask and you're tired of the context-switching tax, this is for you.

> **Part of the [MSP Claude Plugins](https://github.com/wyre-technology/msp-claude-plugins) ecosystem** — a growing suite of AI integrations for the MSP stack including [Datto RMM](https://github.com/wyre-technology/datto-rmm-mcp), [IT Glue](https://github.com/wyre-technology/itglue-mcp), [HaloPSA](https://github.com/wyre-technology/halopsa-mcp), [ConnectWise Automate](https://github.com/wyre-technology/connectwise-automate-mcp), [NinjaOne](https://github.com/wyre-technology/ninjaone-mcp), [Huntress](https://github.com/wyre-technology/huntress-mcp), and more. Built by MSPs, for MSPs.

<a href="https://glama.ai/mcp/servers/@wyre-technology/autotask-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@wyre-technology/autotask-mcp/badge" alt="Autotask MCP server" />
</a>

## One-Click Deployment

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/wyre-technology/autotask-mcp/tree/main)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wyre-technology/autotask-mcp)

## Quick Start

**Claude Desktop** — download, open, done:

1. Download `autotask-mcp.mcpb` from the [latest release](https://github.com/wyre-technology/autotask-mcp/releases/latest)
2. Open the file (double-click or drag into Claude Desktop)
3. Enter your Autotask credentials when prompted (Username, Secret, Integration Code)

No terminal, no JSON editing, no Node.js install required.

**Claude Code (CLI):**

```bash
claude mcp add autotask-mcp \
  -e AUTOTASK_USERNAME=your-user@company.com \
  -e AUTOTASK_SECRET=your-secret \
  -e AUTOTASK_INTEGRATION_CODE=your-code \
  -- npx -y github:wyre-technology/autotask-mcp
```

See [Installation](#installation) for Docker and from-source methods.

## Features

- **🔌 MCP Protocol Compliance**: Full support for MCP resources and tools
- **🛠️ Comprehensive API Coverage**: 39 tools spanning companies, contacts, tickets, projects, billing items, time entries, notes, attachments, and more
- **🔍 Advanced Search**: Powerful search capabilities with filters across all entities
- **📝 CRUD Operations**: Create, read, update operations for core Autotask entities
- **🔄 ID-to-Name Mapping**: Automatic resolution of company and resource IDs to human-readable names
- **⚡ Intelligent Caching**: Smart caching system for improved performance and reduced API calls
- **🔒 Secure Authentication**: Enterprise-grade API security with Autotask credentials
- **🌐 Dual Transport**: Supports both stdio (local) and HTTP Streamable (remote/Docker) transports
- **📦 MCPB Packaging**: One-click installation via MCP Bundle for desktop clients
- **🐳 Docker Ready**: Containerized deployment with HTTP transport and health checks
- **📊 Structured Logging**: Comprehensive logging with configurable levels and formats
- **🧪 Test Coverage**: Comprehensive test suite with 80%+ coverage

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
  - [Gateway Mode](#gateway-mode)
- [Usage](#usage)
- [API Reference](#api-reference)
- [ID-to-Name Mapping](#id-to-name-mapping)
- [HTTP Transport](#http-transport)
- [Docker Deployment](#docker-deployment)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [Development](#development)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Contributors](#contributors)
- [License](#license)

## Installation

### Option 1: MCPB Bundle (Claude Desktop)

The simplest method — no terminal, no JSON editing, no Node.js install required.

1. Download `autotask-mcp.mcpb` from the [latest release](https://github.com/wyre-technology/autotask-mcp/releases/latest)
2. Open the file (double-click or drag into Claude Desktop)
3. Enter your Autotask credentials when prompted (Username, Secret, Integration Code)

For **Claude Code (CLI)**, one command:

```bash
claude mcp add autotask-mcp \
  -e AUTOTASK_USERNAME=your-user@company.com \
  -e AUTOTASK_SECRET=your-secret \
  -e AUTOTASK_INTEGRATION_CODE=your-code \
  -- npx -y github:wyre-technology/autotask-mcp
```

### Option 2: Docker

**Local (stdio — for Claude Desktop or Claude Code):**

```json
{
  "mcpServers": {
    "autotask": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "MCP_TRANSPORT=stdio",
        "-e", "AUTOTASK_USERNAME=your-user@company.com",
        "-e", "AUTOTASK_SECRET=your-secret",
        "-e", "AUTOTASK_INTEGRATION_CODE=your-code",
        "--entrypoint", "node",
        "ghcr.io/wyre-technology/autotask-mcp:latest",
        "dist/entry.js"
      ]
    }
  }
}
```

**Remote (HTTP Streamable — for server deployments):**

```bash
docker run -d \
  --name autotask-mcp \
  -p 8080:8080 \
  -e AUTOTASK_USERNAME="your-user@company.com" \
  -e AUTOTASK_SECRET="your-secret" \
  -e AUTOTASK_INTEGRATION_CODE="your-code" \
  --restart unless-stopped \
  ghcr.io/wyre-technology/autotask-mcp:latest

# Verify
curl http://localhost:8080/health
```

Clients connect to `http://host:8080/mcp` using MCP Streamable HTTP transport.

**Gateway Mode (for MCP Gateway deployments):**

When deploying behind an MCP Gateway that injects credentials via HTTP headers:

```bash
docker run -d \
  --name autotask-mcp \
  -p 8080:8080 \
  -e AUTH_MODE=gateway \
  --restart unless-stopped \
  ghcr.io/wyre-technology/autotask-mcp:latest
```

The gateway injects credentials via headers:
- `X-API-Key`: Autotask username
- `X-API-Secret`: Autotask secret
- `X-Integration-Code`: Autotask integration code

See [Gateway Mode](#gateway-mode) for details.

### Option 3: From Source (Development)

```bash
git clone https://github.com/wyre-technology/autotask-mcp.git
cd autotask-mcp
npm ci && npm run build
```

Then point your MCP client at `dist/entry.js`:

```json
{
  "mcpServers": {
    "autotask": {
      "command": "node",
      "args": ["/path/to/autotask-mcp/dist/entry.js"],
      "env": {
        "AUTOTASK_USERNAME": "your-user@company.com",
        "AUTOTASK_SECRET": "your-secret",
        "AUTOTASK_INTEGRATION_CODE": "your-code"
      }
    }
  }
}
```

### Prerequisites

- Valid Autotask API credentials (API user email, secret, integration code)
- MCP-compatible client (Claude Desktop, Claude Code, etc.)
- Docker (for Option 2) or Node.js 18+ (for Option 3)

## Configuration

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Required Autotask API credentials (Local Mode)
AUTOTASK_USERNAME=your-api-user@example.com
AUTOTASK_SECRET=your-secret-key
AUTOTASK_INTEGRATION_CODE=your-integration-code

# Optional configuration
# AUTOTASK_API_URL is auto-detected from AUTOTASK_USERNAME via Autotask's
# unauthenticated zoneInformation endpoint on first connect. Only set this
# explicitly to override auto-detection (e.g. for an on-prem proxy).
# AUTOTASK_API_URL=https://webservices2.autotask.net/atservicesrest/
MCP_SERVER_NAME=autotask-mcp

# Authentication mode
AUTH_MODE=env               # env (local), gateway (hosted)

# Transport (stdio for local/desktop, http for remote/Docker)
MCP_TRANSPORT=stdio          # stdio, http
MCP_HTTP_PORT=8080           # HTTP transport port (only used when MCP_TRANSPORT=http)
MCP_HTTP_HOST=0.0.0.0        # HTTP transport bind address

# Logging
LOG_LEVEL=info          # error, warn, info, debug
LOG_FORMAT=simple       # simple, json

# Environment
NODE_ENV=production
```

### Gateway Mode

When deployed behind an MCP Gateway (e.g., `mcp.wyre.ai`), the server operates in gateway mode where credentials are injected via HTTP headers on each request.

**Enable Gateway Mode:**

```bash
AUTH_MODE=gateway
MCP_TRANSPORT=http
```

**Expected Headers:**

| Header | Description |
|--------|-------------|
| `X-API-Key` | Autotask API username (email) |
| `X-API-Secret` | Autotask API secret key |
| `X-Integration-Code` | Autotask integration code |
| `X-API-URL` | (Optional) Custom Autotask API URL |

**Health Check Response (Gateway Mode):**

```json
{
  "status": "ok",
  "transport": "http",
  "authMode": "gateway",
  "timestamp": "2026-02-05T10:00:00.000Z"
}
```

For detailed migration instructions, see the [Migration Guide](docs/MIGRATION_GUIDE.md).

💡 **Pro Tip**: Copy the above content to a `.env` file in your project root.

### Autotask API Setup

1. **Create API User**: In Autotask, create a dedicated API user with appropriate permissions
2. **Generate Secret**: Generate an API secret for the user
3. **Integration Code**: Obtain your integration code from Autotask
4. **Permissions**: Ensure the API user has read/write access to required entities

For detailed setup instructions, see the [Autotask API documentation](https://ww3.autotask.net/help/DeveloperHelp/Content/AdminSetup/2ExtensionsIntegrations/APIs/REST/REST_API_Home.htm).

## Usage

### Command Line

```bash
# Start the MCP server (stdio transport, for piping to an MCP client)
node dist/entry.js

# Start with HTTP transport
MCP_TRANSPORT=http node dist/index.js
```

### MCP Client Configuration

See [Installation](#installation) for all setup methods.

## API Reference

### Resources

Resources provide read-only access to Autotask data:

- `autotask://companies` - List all companies
- `autotask://companies/{id}` - Get specific company
- `autotask://contacts` - List all contacts  
- `autotask://contacts/{id}` - Get specific contact
- `autotask://tickets` - List all tickets
- `autotask://tickets/{id}` - Get specific ticket
- `autotask://time-entries` - List time entries

### Tools

The server provides 39 tools for interacting with Autotask:

#### Company Operations
- `autotask_search_companies` - Search companies with filters
- `autotask_create_company` - Create new company
- `autotask_update_company` - Update existing company

#### Contact Operations
- `autotask_search_contacts` - Search contacts with filters
- `autotask_create_contact` - Create new contact

#### Ticket Operations
- `autotask_search_tickets` - Search tickets with filters
- `autotask_get_ticket_details` - Get full ticket details by ID
- `autotask_create_ticket` - Create new ticket

#### Time Entry Operations
- `autotask_create_time_entry` - Log time entry
- `autotask_search_time_entries` - Search time entries with filters (resource, ticket, project, date range)

#### Billing Items (Approve and Post Workflow)
- `autotask_search_billing_items` - Search approved and posted billing items
- `autotask_get_billing_item` - Get specific billing item by ID
- `autotask_search_billing_item_approval_levels` - Search multi-level approval records for time entries

#### Project Operations
- `autotask_search_projects` - Search projects with filters
- `autotask_create_project` - Create new project

#### Resource Operations
- `autotask_search_resources` - Search resources (technicians/users)

#### Note Operations
- `autotask_get_ticket_note` / `autotask_search_ticket_notes` / `autotask_create_ticket_note`
- `autotask_get_project_note` / `autotask_search_project_notes` / `autotask_create_project_note`
- `autotask_get_company_note` / `autotask_search_company_notes` / `autotask_create_company_note`

#### Attachment Operations
- `autotask_get_ticket_attachment` - Get ticket attachment
- `autotask_search_ticket_attachments` - Search ticket attachments

#### Financial Operations
- `autotask_get_expense_report` / `autotask_search_expense_reports` / `autotask_create_expense_report`
- `autotask_get_quote` / `autotask_search_quotes` / `autotask_create_quote`
- `autotask_search_invoices` - Search invoices
- `autotask_search_contracts` - Search contracts

#### Configuration Items
- `autotask_search_configuration_items` - Search configuration items (assets)

#### Task Operations
- `autotask_search_tasks` - Search project tasks
- `autotask_create_task` - Create project task

#### Utility Operations
- `autotask_test_connection` - Test API connectivity

### Example Tool Usage

```javascript
// Search for companies
{
  "name": "autotask_search_companies",
  "arguments": {
    "searchTerm": "Acme Corp",
    "isActive": true,
    "pageSize": 10
  }
}

// Create a new ticket
{
  "name": "autotask_create_ticket",
  "arguments": {
    "companyID": 12345,
    "title": "Server maintenance request",
    "description": "Need to perform monthly server maintenance",
    "priority": 2,
    "status": 1
  }
}
```

## ID-to-Name Mapping

The Autotask MCP server includes intelligent ID-to-name mapping that automatically resolves company and resource IDs to human-readable names, making API responses much more useful for AI assistants and human users.

### Automatic Enhancement

All search and detail tools automatically include an `_enhanced` field with resolved names:

```json
{
  "id": 12345,
  "title": "Sample Ticket",
  "companyID": 678,
  "assignedResourceID": 90,
  "_enhanced": {
    "companyName": "Acme Corporation",
    "assignedResourceName": "John Smith"
  }
}
```

### How It Works

ID-to-name mapping is applied automatically to all search and detail tool results. No additional tools are needed — the `_enhanced` field is added transparently to every response that contains company or resource IDs.

### Performance Features

- **Smart Caching**: Names are cached for 30 minutes to reduce API calls
- **Bulk Operations**: Efficient batch lookups for multiple IDs
- **Graceful Fallback**: Returns "Unknown Company (123)" if lookup fails
- **Parallel Processing**: Multiple mappings resolved simultaneously

### Testing Mapping

Test the mapping functionality:

```bash
npm run test:mapping
```

For detailed mapping documentation, see [docs/mapping.md](docs/mapping.md).

## HTTP Transport

The server supports the MCP Streamable HTTP transport for remote deployments (e.g., Docker, cloud hosting). Set `MCP_TRANSPORT=http` to enable it.

```bash
# Start with HTTP transport
MCP_TRANSPORT=http MCP_HTTP_PORT=8080 node dist/index.js
```

The HTTP transport exposes:
- `POST /mcp` — MCP Streamable HTTP endpoint
- `GET /health` — Health check (returns `{"status":"ok"}`)

Clients must send requests to `/mcp` with `Accept: application/json, text/event-stream` headers per the MCP Streamable HTTP specification.

## Docker Deployment

The Docker image uses HTTP transport by default (port 8080) with a built-in health check.

### Using Pre-built Image from GitHub Container Registry

The Docker image defaults to **HTTP transport** on port 8080 — suitable for remote/server deployments where clients connect over the network.

```bash
# Pull the latest image
docker pull ghcr.io/wyre-technology/autotask-mcp:latest

# Run container with HTTP transport (default)
docker run -d \
  --name autotask-mcp \
  -p 8080:8080 \
  -e AUTOTASK_USERNAME="your-api-user@example.com" \
  -e AUTOTASK_SECRET="your-secret-key" \
  -e AUTOTASK_INTEGRATION_CODE="your-integration-code" \
  --restart unless-stopped \
  ghcr.io/wyre-technology/autotask-mcp:latest

# Verify it's running
curl http://localhost:8080/health
```

For **stdio** usage with Claude Desktop, see [Installation Option 2](#option-2-docker).

### Quick Start (From Source)

```bash
# Clone repository
git clone https://github.com/wyre-technology/autotask-mcp.git
cd autotask-mcp

# Create environment file
cp .env.example .env
# Edit .env with your credentials

# Start with docker-compose
docker compose up -d
```

### Production Deployment

```bash
# Build production image locally
docker build -t autotask-mcp:latest .

# Run container
docker run -d \
  --name autotask-mcp \
  --env-file .env \
  --restart unless-stopped \
  autotask-mcp:latest
```

### Development Mode

```bash
# Start development environment with hot reload
docker compose --profile dev up autotask-mcp-dev
```

## Development

### Setup

```bash
git clone https://github.com/wyre-technology/autotask-mcp.git
cd autotask-mcp
npm install
```

### Available Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint issues
```

### Project Structure

```
autotask-mcp/
├── src/
│   ├── handlers/           # MCP request handlers
│   ├── mcp/               # MCP server implementation
│   ├── services/          # Autotask service layer
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions (config, logger, cache)
│   ├── entry.ts           # Entry point (stdout guard + .env loader)
│   └── index.ts           # Server bootstrap (config, logger, server init)
├── tests/                 # Test files
├── scripts/               # Build and packaging scripts
│   └── pack-mcpb.js       # MCPB bundle creation
├── manifest.json          # MCPB manifest for desktop distribution
├── Dockerfile             # Container definition (HTTP transport)
├── docker-compose.yml     # Multi-service orchestration
└── package.json          # Project configuration
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test -- tests/autotask-service.test.ts
```

### Test Categories

- **Unit Tests**: Service layer and utility functions
- **Integration Tests**: MCP protocol compliance
- **API Tests**: Autotask API integration (requires credentials)

### Coverage Requirements

- Minimum 80% coverage for all metrics
- 100% coverage for critical paths (authentication, data handling)

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTOTASK_USERNAME` | ✅ | - | Autotask API username (email) |
| `AUTOTASK_SECRET` | ✅ | - | Autotask API secret key |
| `AUTOTASK_INTEGRATION_CODE` | ✅ | - | Autotask integration code |
| `AUTOTASK_API_URL` | ❌ | Auto-detected | Autotask API endpoint URL |
| `MCP_SERVER_NAME` | ❌ | `autotask-mcp` | MCP server name |
| `MCP_TRANSPORT` | ❌ | `stdio` | Transport type (`stdio` or `http`) |
| `MCP_HTTP_PORT` | ❌ | `8080` | HTTP transport port |
| `MCP_HTTP_HOST` | ❌ | `0.0.0.0` | HTTP transport bind address |
| `LOG_LEVEL` | ❌ | `info` | Logging level |
| `LOG_FORMAT` | ❌ | `simple` | Log output format |
| `NODE_ENV` | ❌ | `development` | Node.js environment |

### Logging Levels

- `error`: Only error messages
- `warn`: Warnings and errors
- `info`: General information, warnings, and errors
- `debug`: Detailed debugging information

### Log Formats

- `simple`: Human-readable console output
- `json`: Structured JSON output (recommended for production)

## Rate Limits

Autotask enforces per-integration-code API thresholds on a rolling 1-hour window:

- **~10,000 req/hr (soft)** — warning email, sporadic `HTTP 429` responses
- **~20,000 req/hr (hard)** — sustained `HTTP 429` until the window rolls

LLM-driven workflows fan out easily — "status report on all open projects with notes" can issue hundreds of requests across a few minutes. The server tries to make this safer:

- **429 responses are surfaced as structured errors.** Tool results carry `error_type: "rate_limited"` and a `retry_after_seconds` field parsed from Autotask's `Retry-After` header. The error message explicitly tells the LLM **not to retry** and to ask the user to scope the query — this prevents repeated retries from extending the cooldown.
- **Fan-out tool descriptions include rate-limit tips.** Tools that are commonly looped over (`autotask_search_ticket_notes`, `autotask_search_project_notes`, `autotask_search_company_notes`, `autotask_search_time_entries`, `autotask_search_ticket_attachments`) include a hint reminding the LLM to scope the parent record list before iterating.

### Raising the limit

Per-integration thresholds can be increased in Autotask:

1. Autotask Admin → **Resources/Users (HR) → Resources**
2. Edit the dedicated API user → **Workflow Rules → API Tracking Identifier**
3. Adjust the threshold for the integration code your MCP server uses

This is the right answer when a single integration code is shared between Claude/Copilot/etc. and other tooling. For LLM-heavy workloads, dedicate a separate API user (and integration code) so a fan-out from one client doesn't starve others.

### Patterns that help

- **Always scope by date range** when searching notes, time entries, attachments. Even a 30-day window can drop call count by an order of magnitude.
- **Cache parent lookups.** If you're iterating over 100 tickets, fetch the ticket list once and reuse it across follow-up queries; don't re-search per child.
- **Use `autotask_get_field_info`** to discover picklist values once per session rather than refetching them per call.

If you're seeing threshold warnings from Autotask but the server seems fine, the LLM driver is probably issuing fan-out patterns. Tighten the prompt to scope before iterating.

## Troubleshooting

### Common Issues

#### Authentication Errors

```
Error: Missing required Autotask credentials
```
**Solution**: Ensure all required environment variables are set correctly.

#### Connection Timeouts

```
Error: Connection to Autotask API failed
```
**Solutions**:
- Check network connectivity
- Verify API endpoint URL
- Confirm API user has proper permissions

#### Permission Denied

```
Error: User does not have permission to access this resource
```
**Solution**: Review Autotask API user permissions and security level settings.

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
LOG_LEVEL=debug npm start
```

### Health Checks

Test server connectivity:

```bash
# Run test suite
npm run test

# For HTTP transport, check the health endpoint
curl http://localhost:8080/health
# Returns: {"status":"ok"}

# Test API connection with debug logging
LOG_LEVEL=debug npm start
```

### Autotask API Rate Limits

**Problem**: `429 Too Many Requests` or "thread limit exceeded" errors when Claude queries aggressively

Autotask enforces **3 concurrent threads per endpoint per API tracking identifier**. When an LLM issues multiple tool calls simultaneously (e.g., searching tickets, companies, and contacts at once), requests can pile up and hit this limit.

**Built-in mitigation**: The underlying `autotask-node` SDK automatically queues excess requests rather than failing immediately. Requests wait for a slot to free up, so you generally won't see 429 errors — but you may notice slower responses under heavy load.

**Critical for team/multi-user deployments**: If multiple users or the MCP Gateway share the **same API credentials**, they compete for the same 3-thread budget. This can cause noticeable slowdowns and, in severe cases, queued requests that time out.

**Solution — one API key per team**: Create a dedicated Autotask API user per team or integration. Each user has an independent `integrationCode` with its own thread budget:

1. **Admin > Resources (Users) > Resources/Users** → Add Resource
2. Set Security Level to **API User**
3. Note the username, secret, and integration code
4. Set `AUTOTASK_USERNAME`, `AUTOTASK_SECRET`, and `AUTOTASK_INTEGRATION_CODE` per team

```
Support Team  → AUTOTASK_INTEGRATION_CODE=SUPPORT_TEAM_CODE  (3 threads)
Projects Team → AUTOTASK_INTEGRATION_CODE=PROJECTS_TEAM_CODE (3 threads, independent)
```

Additionally, Autotask limits **10,000 total requests per hour** across all integrations hitting your tenant. If you hit this limit, all integrations will start receiving 429s — another reason to use targeted queries with appropriate filters.

### MCP Client Issues

**Problem**: MCP server not appearing in Claude Desktop
**Solutions**:
1. Check configuration file syntax (valid JSON)
2. Verify file path in the configuration
3. Ensure environment variables are set correctly
4. Restart Claude Desktop completely

**Problem**: "Invalid JSON-RPC message: [dotenv@...] injecting env" / Server disconnected
**Cause**: The `autotask-node` library calls `dotenv.config()` at module load time. dotenv v17+ writes status messages via `console.log` to stdout, which corrupts the MCP stdio JSON-RPC channel.
**Solution**: Ensure you're using `dist/entry.js` (not `dist/index.js`) as the entry point. The entry wrapper redirects `console.log` to stderr before any libraries load.

**Problem**: Slow responses
**Solutions**:
1. Check network connectivity to Autotask API
2. Enable debug logging (`LOG_LEVEL=debug`) to identify bottlenecks
3. The server caches company/resource names for 30 minutes automatically

### Security Best Practices

- Store credentials in environment variables, not directly in config files
- Limit Autotask API user permissions to the minimum required
- Rotate API credentials regularly
- For Docker deployments, use secrets management rather than plain environment variables

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Maintain test coverage above 80%
- Use conventional commit messages
- Update documentation for API changes
- Add tests for new features

## License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

### Contributor License Agreement

By submitting a pull request, you agree to the terms of our [Contributor License Agreement](CLA.md). This ensures that contributions can be properly licensed and that you have the right to submit the code.

## Contributors

| Avatar | Name | Contributions |
| --- | --- | --- |
| <a href="https://github.com/asachs01"><img src="https://github.com/asachs01.png" width="60" /></a> | [@asachs01](https://github.com/asachs01) | Maintainer |
| <a href="https://github.com/Baphomet480"><img src="https://github.com/Baphomet480.png" width="60" /></a> | [@Baphomet480](https://github.com/Baphomet480) | CLI bin fix |

## Support

- 📚 [Documentation](https://github.com/wyre-technology/autotask-mcp/wiki)
- 🐛 [Issue Tracker](https://github.com/wyre-technology/autotask-mcp/issues)
- 💬 [Discussions](https://github.com/wyre-technology/autotask-mcp/discussions)

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) by Anthropic
- [Autotask REST API](https://ww3.autotask.net/help/DeveloperHelp/Content/APIs/REST/REST_API_Home.htm) by Kaseya
- [autotask-node](https://www.npmjs.com/package/autotask-node) library

---

Built by [WYRE Technology](https://github.com/wyre-technology) — part of the [MSP Claude Plugins](https://github.com/wyre-technology/msp-claude-plugins) ecosystem 