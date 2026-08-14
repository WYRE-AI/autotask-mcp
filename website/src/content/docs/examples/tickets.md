---
title: Tickets & Support
description: Example prompts for searching, creating, and managing support tickets.
---

## Searching Tickets

### Find open tickets for a company

**Prompt:**
> "Show me open tickets for company ID 29683451"

**What happens:** The server calls `autotask_search_tickets` with `companyID: 29683451` and `status: 1` (New/Open).

**Expected output:**
```json
{
  "summary": "Found 5 tickets (showing 1-5)",
  "items": [
    {
      "id": 48231,
      "ticketNumber": "T20240115.0023",
      "title": "Email server not responding",
      "status": 1,
      "priority": 2,
      "queueID": 29682999,
      "companyID": 29683451,
      "_enhanced": {
        "companyName": "Northwind Traders",
        "assignedResourceName": "John Smith"
      }
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 25
}
```

### Search tickets by keyword

**Prompt:**
> "Find tickets mentioning VPN connectivity"

**What happens:** The server calls `autotask_search_tickets` with `searchTerm: "VPN connectivity"`.

### Find a ticket by its ticket number

**Prompt:**
> "Find ticket T20260804.0026"

**What happens:** An exact ticket-number search uses the ticket number equality filter and searches all statuses, including Complete. Ticket-number prefixes and other broad searches continue to default to open tickets unless a `status` is supplied.

### Filter by priority

**Prompt:**
> "Show me all critical priority tickets"

**What happens:** The server calls `autotask_search_tickets` with `priority: 1` (Critical).

:::tip[Discovering Picklist Values]
Not sure which priority or status ID to use? Ask:
> "List all available ticket priorities"

This calls `autotask_list_ticket_priorities` and returns the valid values for your instance.
:::

### Filter by queue

**Prompt:**
> "Show tickets in the Service Desk queue"

**What happens:** The server first calls `autotask_list_queues` to find the queue ID, then calls `autotask_search_tickets` with the matching `queueID`.

---

## Getting Ticket Details

### View full ticket information

**Prompt:**
> "Show me the details for ticket 48231"

**What happens:** The server calls `autotask_get_ticket_details` with `ticketId: 48231`.

**Expected output:**
```json
{
  "message": "Retrieved ticket details successfully",
  "data": {
    "id": 48231,
    "ticketNumber": "T20240115.0023",
    "title": "Email server not responding",
    "description": "Users report that the email server has been unresponsive since 9am...",
    "status": 1,
    "priority": 2,
    "queueID": 29682999,
    "companyID": 29683451,
    "contactID": 30412,
    "assignedResourceID": 12345,
    "createDate": "2024-01-15T09:30:00Z",
    "lastActivityDate": "2024-01-15T14:22:00Z",
    "_enhanced": {
      "companyName": "Northwind Traders",
      "assignedResourceName": "John Smith",
      "contactName": "Alice Johnson"
    }
  }
}
```

---

## Creating Tickets

### Create a new ticket

**Prompt:**
> "Create a ticket titled 'Printer offline on 3rd floor' for company ID 29683451 with medium priority"

**What happens:** The server calls `autotask_create_ticket` with `title: "Printer offline on 3rd floor"`, `companyID: 29683451`, and `priority: 3`.

**Expected output:**
```json
{
  "message": "Created ticket with ID: 48250",
  "data": 48250
}
```

### Create a ticket with full details

**Prompt:**
> "Create a high priority ticket for company 29683451 titled 'Network switch failure in server room'. Description: 'The core switch in rack A3 is showing amber status lights and intermittent connectivity. Affecting 15 users.' Assign to queue ID 29682999."

**What happens:** The server calls `autotask_create_ticket` with all specified fields.

---

## Discovering Ticket Metadata

### List available queues

**Prompt:**
> "What queues are available in Autotask?"

**What happens:** The server calls `autotask_list_queues`.

**Expected output:**
```json
{
  "message": "Found 5 queues",
  "data": [
    { "value": 29682999, "label": "Service Desk" },
    { "value": 29683000, "label": "Network Operations" },
    { "value": 29683001, "label": "Projects" },
    { "value": 29683002, "label": "Escalation" },
    { "value": 29683003, "label": "Monitoring" }
  ]
}
```

### List ticket statuses

**Prompt:**
> "What ticket statuses are available?"

**What happens:** The server calls `autotask_list_ticket_statuses`.

### List ticket priorities

**Prompt:**
> "Show me the ticket priority levels"

**What happens:** The server calls `autotask_list_ticket_priorities`.
