---
title: Installation
description: How to install and set up the Autotask MCP Server.
---

## 1. MCPB Bundle (Claude Desktop)

The simplest method — no terminal, no JSON editing, no Node.js install required.

**Prerequisites:** [Claude Desktop](https://claude.ai/desktop) (macOS or Windows)

**Steps:**

1. Download `autotask-mcp.mcpb` from the [latest release](https://github.com/WYRE-AI/autotask-mcp/releases/latest)
2. Open the file (double-click or drag into Claude Desktop)
3. Enter your Autotask credentials when prompted:
   - **Username** — your API user email
   - **Secret** — your API secret key
   - **Integration Code** — your Autotask integration code

That's it. Claude Desktop handles the rest.

:::tip[Claude Code (CLI)]
If you use Claude Code instead of Claude Desktop, one command does it:

```bash
claude mcp add autotask-mcp \
  -e AUTOTASK_USERNAME=your-user@company.com \
  -e AUTOTASK_SECRET=your-secret \
  -e AUTOTASK_INTEGRATION_CODE=your-code \
  -- npx -y github:WYRE-AI/autotask-mcp
```
:::

---

## 2. Docker

Pull the pre-built image from GitHub Container Registry:

```bash
docker pull ghcr.io/wyre-ai/autotask-mcp:latest
```

### Local (stdio — for Claude Desktop or Claude Code)

Add this to your MCP client config (e.g., `claude_desktop_config.json`):

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
        "ghcr.io/wyre-ai/autotask-mcp:latest",
        "dist/entry.js"
      ]
    }
  }
}
```

### Remote (HTTP Streamable — for server deployments)

```bash
docker run -d \
  --name autotask-mcp \
  -p 8080:8080 \
  -e AUTOTASK_USERNAME="your-user@company.com" \
  -e AUTOTASK_SECRET="your-secret" \
  -e AUTOTASK_INTEGRATION_CODE="your-code" \
  --restart unless-stopped \
  ghcr.io/wyre-ai/autotask-mcp:latest

# Verify
curl http://localhost:8080/health
```

Clients connect to `http://host:8080/mcp` using MCP Streamable HTTP transport.

---

## 3. From Source (Development)

```bash
git clone https://github.com/WYRE-AI/autotask-mcp.git
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

---

## Verify the Installation

After configuring, ask your AI assistant:

> "Test the Autotask connection"

You should receive a confirmation that the connection is working.

## Upgrading

**MCPB Bundle:** Download the latest `.mcpb` file and open it again — Claude Desktop will update in place.

**Docker:** Pull the latest image:

```bash
docker pull ghcr.io/wyre-ai/autotask-mcp:latest
```

**From Source:** Pull and rebuild:

```bash
git pull && npm ci && npm run build
```

## Next Steps

- [Configure credentials and options](/autotask-mcp/getting-started/configuration/)
