---
title: Notes & Attachments
description: Example prompts for adding and searching notes and attachments.
---

## Ticket Notes

### Search notes on a ticket

**Prompt:**
> "Show me the notes on ticket 48231"

**What happens:** The server calls `autotask_search_ticket_notes` with `ticketId: 48231`.

**Expected output:**
```json
{
  "summary": "Found 3 ticket notes (showing 1-3)",
  "items": [
    {
      "id": 55001,
      "title": "Initial Contact",
      "description": "Called the client to confirm the issue. Email server shows high CPU usage.",
      "noteType": 1,
      "createDateTime": "2024-01-15T09:45:00Z",
      "creatorResourceID": 12345,
      "_enhanced": {
        "creatorName": "John Smith"
      }
    },
    {
      "id": 55002,
      "title": "Vendor Escalation",
      "description": "Opened case #12345 with the email hosting vendor. ETA 2 hours.",
      "noteType": 1,
      "createDateTime": "2024-01-15T11:00:00Z",
      "creatorResourceID": 12345,
      "_enhanced": {
        "creatorName": "John Smith"
      }
    }
  ],
  "total": 3
}
```

### Add a note to a ticket

**Prompt:**
> "Add a note to ticket 48231 titled 'Resolution' with description 'Restarted the email service. Issue resolved. Monitoring for recurrence.'"

**What happens:** The server calls `autotask_create_ticket_note` with `ticketId: 48231`, `title: "Resolution"`, and `description: "Restarted the email service. Issue resolved. Monitoring for recurrence."`.

**Expected output:**
```json
{
  "message": "Created ticket note with ID: 55003",
  "data": 55003
}
```

### Get a specific note

**Prompt:**
> "Get note 55001 from ticket 48231"

**What happens:** The server calls `autotask_get_ticket_note` with `ticketId: 48231` and `noteId: 55001`.

---

## Project Notes

### Search project notes

**Prompt:**
> "Show notes for project 5021"

**What happens:** The server calls `autotask_search_project_notes` with `projectId: 5021`.

**Expected output:**
```json
{
  "summary": "Found 2 project notes (showing 1-2)",
  "items": [
    {
      "id": 56001,
      "title": "Kickoff Meeting Notes",
      "description": "Discussed timeline, resources, and milestones. Client approved Phase 1 scope.",
      "createDateTime": "2024-02-01T10:00:00Z"
    }
  ],
  "total": 2
}
```

### Add a note to a project

**Prompt:**
> "Add a note to project 5021 titled 'Status Update' with description 'Phase 1 complete. Moving to Phase 2 next week.'"

**What happens:** The server calls `autotask_create_project_note` with `projectId: 5021`, `title: "Status Update"`, and `description: "Phase 1 complete. Moving to Phase 2 next week."`.

---

## Company Notes

### Search company notes

**Prompt:**
> "Show notes for company 29683451"

**What happens:** The server calls `autotask_search_company_notes` with `companyId: 29683451`.

### Add a note to a company

**Prompt:**
> "Add a company note for 29683451 titled 'Account Review' with description 'Quarterly review scheduled for March 15. Contract renewal discussion needed.'"

**What happens:** The server calls `autotask_create_company_note` with `companyId: 29683451`, `title: "Account Review"`, and `description: "Quarterly review scheduled for March 15. Contract renewal discussion needed."`.

---

## Ticket Attachments

### Search attachments on a ticket

**Prompt:**
> "Show me attachments on ticket 48231"

**What happens:** The server calls `autotask_search_ticket_attachments` with `ticketId: 48231`.

**Expected output:**
```json
{
  "summary": "Found 2 ticket attachments (showing 1-2)",
  "items": [
    {
      "id": 60001,
      "attachmentType": "FILE_ATTACHMENT",
      "fullPath": "screenshot_error.png",
      "title": "Error Screenshot",
      "contentType": "image/png",
      "attachDate": "2024-01-15T09:35:00Z"
    },
    {
      "id": 60002,
      "attachmentType": "FILE_ATTACHMENT",
      "fullPath": "server_logs.txt",
      "title": "Server Logs",
      "contentType": "text/plain",
      "attachDate": "2024-01-15T10:15:00Z"
    }
  ],
  "total": 2
}
```

### Get a specific attachment

**Prompt:**
> "Get attachment 60001 from ticket 48231"

**What happens:** The server calls `autotask_get_ticket_attachment` with `ticketId: 48231` and `attachmentId: 60001`.

## Ticket Note Attachments

A ticket note's `description` can be empty even when the note carries real content — a screenshot,
scanned document, or chart pasted directly into the note in the Autotask UI shows up as an
attachment on the **note**, not on the ticket itself. Use these tools when a note from
`autotask_search_ticket_notes` looks unhelpfully empty.

### Search attachments on a ticket note

**Prompt:**
> "Does note 55001 have any attachments?"

**What happens:** The server calls `autotask_search_ticket_note_attachments` with `ticketNoteId: 55001`.

**Expected output:**
```json
{
  "summary": "Found 1 ticket note attachments (showing 1-1)",
  "items": [
    {
      "id": 61001,
      "attachmentType": "FILE_ATTACHMENT",
      "fullPath": "survey_results.png",
      "title": "Survey Results",
      "contentType": "image/png",
      "attachDate": "2024-01-15T09:35:00Z",
      "ticketNoteID": 55001
    }
  ],
  "total": 1
}
```

### Get a specific note attachment

**Prompt:**
> "Get attachment 61001 from note 55001, and read the image"

**What happens:** The server calls `autotask_get_ticket_note_attachment` with `ticketNoteId: 55001`, `attachmentId: 61001`, and `includeData: true` — returning the base64-encoded file bytes so the model can actually read the pasted screenshot.
