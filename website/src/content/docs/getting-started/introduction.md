---
title: Introduction
description: What is the Autotask MCP Server and how does it work?
---

The Autotask MCP Server connects AI assistants (like Claude) to your Kaseya Autotask PSA instance through the [Model Context Protocol](https://modelcontextprotocol.io/).

## How it works

The MCP server acts as a bridge between your AI assistant and the Autotask REST API. When you ask your AI assistant about tickets, companies, or projects, the assistant uses the MCP server's tools to query Autotask and return structured results.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ AI Assistant │────▶│  MCP Server  │────▶│ Autotask API │
│   (Claude)   │◀────│              │◀────│              │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Key Features

- **111 tools** covering companies, contacts, tickets, projects, time entries, notes, attachments, and financial data
- **Automatic ID-to-name mapping** — results include human-readable company and resource names
- **Compact response format** — search results are optimized for AI context windows
- **Pagination support** — handle large result sets efficiently
- **Picklist discovery** — look up valid queue IDs, ticket statuses, and priorities

## Supported Entities

| Entity | Search | Get | Create | Update |
|--------|--------|-----|--------|--------|
| Companies | ✓ | ✓ | ✓ | ✓ |
| Contacts | ✓ | ✓ | ✓ | — |
| Tickets | ✓ | ✓ | ✓ | — |
| Projects | ✓ | ✓ | ✓ | — |
| Tasks | ✓ | — | ✓ | — |
| Time Entries | — | — | ✓ | — |
| Notes (Ticket/Project/Company) | ✓ | ✓ | ✓ | — |
| Attachments | ✓ | ✓ | — | — |
| Configuration Items | ✓ | — | — | — |
| Contracts | ✓ | — | — | — |
| Invoices | ✓ | — | — | — |
| Expense Reports | ✓ | ✓ | ✓ | — |
| Quotes | ✓ | ✓ | ✓ | — |

## Next Steps

- [Install the server](/autotask-mcp/getting-started/installation/)
- [Configure your credentials](/autotask-mcp/getting-started/configuration/)
- [See prompt examples](/autotask-mcp/examples/overview/)
