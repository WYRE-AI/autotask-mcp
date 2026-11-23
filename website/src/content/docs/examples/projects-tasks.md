---
title: Projects & Tasks
description: Example prompts for searching and managing projects and tasks.
---

## Searching Projects

### Find projects by name

**Prompt:**
> "Search for projects with 'migration' in the name"

**What happens:** The server calls `autotask_search_projects` with `searchTerm: "migration"`.

**Expected output:**
```json
{
  "summary": "Found 2 projects (showing 1-2)",
  "items": [
    {
      "id": 5021,
      "projectName": "Cloud Migration Phase 2",
      "status": 1,
      "startDate": "2024-02-01",
      "endDate": "2024-06-30",
      "companyID": 29683451,
      "_enhanced": {
        "companyName": "Northwind Traders"
      }
    },
    {
      "id": 5018,
      "projectName": "Email Migration to Office 365",
      "status": 5,
      "startDate": "2023-09-01",
      "endDate": "2023-12-15",
      "companyID": 29683452,
      "_enhanced": {
        "companyName": "Summit Solutions"
      }
    }
  ],
  "total": 2
}
```

### Find projects for a company

**Prompt:**
> "Show me all projects for company ID 29683451"

**What happens:** The server calls `autotask_search_projects` with `companyID: 29683451`.

---

## Creating Projects

### Create a new project

**Prompt:**
> "Create a project called 'Firewall Upgrade' for company 29683451 starting on 2024-03-01"

**What happens:** The server calls `autotask_create_project` with `projectName: "Firewall Upgrade"`, `companyID: 29683451`, and `startDate: "2024-03-01"`.

**Expected output:**
```json
{
  "message": "Created project with ID: 5025",
  "data": 5025
}
```

---

## Searching Tasks

### Find tasks on a project

**Prompt:**
> "Show me tasks for project ID 5021"

**What happens:** The server calls `autotask_search_tasks` with `projectID: 5021`.

**Expected output:**
```json
{
  "summary": "Found 4 tasks (showing 1-4)",
  "items": [
    {
      "id": 78001,
      "title": "Assess current infrastructure",
      "status": 5,
      "projectID": 5021,
      "assignedResourceID": 12345,
      "_enhanced": {
        "assignedResourceName": "John Smith"
      }
    },
    {
      "id": 78002,
      "title": "Configure cloud environments",
      "status": 1,
      "projectID": 5021,
      "assignedResourceID": 12346,
      "_enhanced": {
        "assignedResourceName": "Jane Doe"
      }
    }
  ],
  "total": 4
}
```

---

## Creating Tasks

### Add a task to a project

**Prompt:**
> "Create a task 'Set up VPN tunnel' on project 5021 assigned to resource 12345"

**What happens:** The server calls `autotask_create_task` with `title: "Set up VPN tunnel"`, `projectID: 5021`, and `assignedResourceID: 12345`.

**Expected output:**
```json
{
  "message": "Created task with ID: 78005",
  "data": 78005
}
```

### Reassign a task and move its end date

**Prompt:**
> "Reassign task 78005 to resource 12345 as Engineer and push its end date to March 20"

**What happens:** The server calls `autotask_update_task` with `taskId: 78005`, `assignedResourceID: 12345`, `assignedResourceRoleName: "Engineer"` and `endDateTime: "2026-03-20T17:00:00Z"`. It reads the task's project, resolves the role name to that resource's role ID, and sends `PATCH /Projects/{projectID}/Tasks`.

**Expected output:**
```json
{
  "message": "Successfully updated task 78005",
  "data": 78005
}
```

---

## Searching Resources

### Find a technician

**Prompt:**
> "Search for resource named Smith"

**What happens:** The server calls `autotask_search_resources` with `searchTerm: "Smith"`.

**Expected output:**
```json
{
  "summary": "Found 2 resources (showing 1-2)",
  "items": [
    {
      "id": 12345,
      "firstName": "John",
      "lastName": "Smith",
      "email": "john.smith@example.com",
      "isActive": true
    },
    {
      "id": 12350,
      "firstName": "Sarah",
      "lastName": "Smithson",
      "email": "sarah.smithson@example.com",
      "isActive": true
    }
  ],
  "total": 2
}
```
