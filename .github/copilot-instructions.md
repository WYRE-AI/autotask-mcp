# Copilot Code Review Instructions — MCP Server Template

> This file applies to all WYRE MCP servers (autotask-mcp, datto-rmm-mcp, syncro-mcp, halopsa-mcp, ninjaone-mcp, liongard-mcp, connectwise-manage-mcp, connectwise-automate-mcp, itglue-mcp, superops-mcp, atera-mcp, salesbuildr-mcp).

## Review Philosophy
- Only comment when you have HIGH CONFIDENCE (>80%) that an issue exists
- Be concise: one sentence per comment when possible
- Focus on actionable feedback, not observations
- Do not suggest style changes unless they cause bugs or violate existing patterns

## Project Context
- **Stack**: TypeScript (ESM), MCP SDK (`@modelcontextprotocol/sdk`), vendor-specific Node.js client library
- **Transport**: Dual-mode — stdio (local/Claude Desktop) and Streamable HTTP (gateway)
- **Auth modes**: Local (env vars) and Gateway (credentials injected via HTTP headers by the gateway proxy)
- **Tool pattern**: Decision-tree — a navigation tool exposes domains first, then dynamically loads domain-specific tools to avoid overwhelming Claude with 20+ tools at once
- **Packaging**: MCPB bundles (`.mcpb`) for one-click Claude Desktop install, Docker images for gateway deployment
- **CI/CD**: GitHub Actions — CI on push, semantic-release on main, Docker build + MCPB upload on release
- **Testing**: Jest with `ts-jest`

## Priority Areas (Review These)

### Security
- Credentials must NEVER be logged, even at debug level — check `logger.debug()` calls for leaked API keys, tokens, or secrets
- Gateway header parsing (`parseCredentialsFromHeaders`) must validate all required fields before use
- Input validation: tool parameters from Claude must be validated via Zod schemas before hitting vendor APIs
- No hardcoded credentials, API keys, or URLs — everything must come from env vars or gateway headers
- HTTP requests to vendor APIs must use HTTPS only

### Correctness
- Tool handlers must return proper MCP error responses (`McpError` with appropriate `ErrorCode`), never throw unhandled exceptions
- Missing credentials should produce a clear error message, not crash the server (warn and continue pattern)
- Pagination: vendor API calls that return lists must handle pagination correctly (check for `next` tokens / page counts)
- Rate limiting: respect vendor API rate limits — check for 429 responses and surface them clearly
- Resource cleanup: HTTP server must handle SIGINT/SIGTERM gracefully
- Dual-mode: changes must work in both stdio and HTTP transport modes

### Architecture & Patterns
- Tool registration must follow the decision-tree pattern: navigation tool → domain selection → domain-specific tools
- Each tool must have a clear Zod input schema with descriptions — Claude uses these to understand parameters
- Service layer (`*Service` class) handles all vendor API calls; tool handlers should not make HTTP requests directly
- Server instructions (`getServerInstructions()`) must accurately describe available capabilities
- Config loading: `loadEnvironmentConfig()` for env vars, `mergeWithMcpConfig()` for MCP-provided config — don't mix these up
- MCPB `manifest.json`: `user_config` fields must match the env vars the server actually reads
- `.releaserc.json`: commit message templates must use `\n` escape sequences, never literal newlines

### Vendor Client Library Usage
- Use the corresponding `@wyre-ai/node-*` client library for API calls, not raw `fetch`
- Client library methods should handle auth header construction — don't duplicate auth logic in the MCP server
- Error responses from vendor APIs should be mapped to meaningful MCP error messages, not passed through raw

## Do NOT Comment On
- Test file structure or test naming
- Minor type annotations that don't affect correctness
- "Consider adding" suggestions for out-of-scope features
- Import ordering or grouping
- Comments that restate what the code does
- Formatting — that's ESLint's job
