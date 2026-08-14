---
title: Tools Reference
description: Complete reference for all 39 MCP tools available in the Autotask MCP Server.
---

The Autotask MCP Server exposes 39 tools organized by entity type.

## Connection

| Tool | Description |
|------|-------------|
| `autotask_test_connection` | Test the connection to the Autotask API |

## Companies

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_companies` | Search for companies | `searchTerm`, `isActive`, `page`, `pageSize` |
| `autotask_create_company` | Create a new company | `companyName` (required), `phone`, `companyType` |
| `autotask_update_company` | Update a company | `id` (required), any updatable field |

## Contacts

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_contacts` | Search for contacts | `searchTerm`, `companyID`, `isActive` |
| `autotask_create_contact` | Create a new contact | `firstName`, `lastName`, `companyID` (required) |

## Tickets

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_tickets` | Search for tickets; exact ticket numbers include completed tickets, while broad searches default to open tickets | `searchTerm`, `companyID`, `status`, `priority`, `queueID`, `assignedResourceID` |
| `autotask_get_ticket_details` | Get full ticket details | `ticketId` (required) |
| `autotask_create_ticket` | Create a new ticket | `title`, `companyID` (required), `priority`, `status`, `queueID`, `description` |

## Time Entries

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_create_time_entry` | Log time against a ticket | `ticketID` (required), `hoursWorked` (required), `summaryNotes`, `dateWorked`, `resourceID` |

## Projects

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_projects` | Search for projects | `searchTerm`, `companyID`, `status` |
| `autotask_create_project` | Create a new project | `projectName`, `companyID` (required), `startDate` |

## Resources

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_resources` | Search for resources/technicians | `searchTerm`, `isActive` |

## Ticket Notes

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_get_ticket_note` | Get a specific ticket note | `ticketId`, `noteId` (both required) |
| `autotask_search_ticket_notes` | Search notes on a ticket | `ticketId` (required) |
| `autotask_create_ticket_note` | Add a note to a ticket | `ticketId`, `title`, `description` (all required) |

## Project Notes

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_get_project_note` | Get a specific project note | `projectId`, `noteId` (both required) |
| `autotask_search_project_notes` | Search notes on a project | `projectId` (required) |
| `autotask_create_project_note` | Add a note to a project | `projectId`, `title`, `description` (all required) |

## Company Notes

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_get_company_note` | Get a specific company note | `companyId`, `noteId` (both required) |
| `autotask_search_company_notes` | Search notes on a company | `companyId` (required) |
| `autotask_create_company_note` | Add a note to a company | `companyId`, `title`, `description` (all required) |

## Attachments

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_get_ticket_attachment` | Get a ticket attachment | `ticketId`, `attachmentId` (both required) |
| `autotask_search_ticket_attachments` | Search attachments on a ticket | `ticketId` (required) |

## Financial

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_get_expense_report` | Get an expense report | `id` (required) |
| `autotask_search_expense_reports` | Search expense reports | `submitterID` |
| `autotask_create_expense_report` | Create an expense report | `name`, `submitterID` (required) |
| `autotask_get_quote` | Get a quote | `id` (required) |
| `autotask_search_quotes` | Search quotes | `companyID` |
| `autotask_create_quote` | Create a quote | `name`, `companyID` (required) |
| `autotask_search_contracts` | Search contracts | `companyID` |
| `autotask_search_invoices` | Search invoices | `companyID` |

## Configuration Items

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_configuration_items` | Search configuration items | `searchTerm`, `companyID` |

## Tasks

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `autotask_search_tasks` | Search project tasks | `projectID`, `assignedResourceID` |
| `autotask_create_task` | Create a project task | `title`, `projectID` (required), `assignedResourceID` |

## Picklist Discovery

| Tool | Description |
|------|-------------|
| `autotask_list_queues` | List all available ticket queues |
| `autotask_list_ticket_statuses` | List all ticket status values |
| `autotask_list_ticket_priorities` | List all ticket priority levels |
| `autotask_get_field_info` | Get field definitions for any entity type |

## Response Format

All search tools return a compact response format:

```json
{
  "summary": "Found N items (showing X-Y)",
  "items": [...],
  "total": N,
  "page": 1,
  "pageSize": 25
}
```

Each item includes an `_enhanced` field with resolved human-readable names for company and resource IDs.
