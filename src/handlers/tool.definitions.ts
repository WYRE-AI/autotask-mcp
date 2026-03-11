// Autotask Tool Definitions
// Declarative schema definitions for all MCP tools

import { McpTool } from './tool.handler.js';

export const TOOL_DEFINITIONS: McpTool[] = [
  // Connection testing
  {
    name: 'autotask_test_connection',
    description: 'Test the connection to Autotask API',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  // Company tools
  {
    name: 'autotask_search_companies',
    description: 'Search for companies in Autotask. Returns 25 results per page by default. Use page parameter for more results.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for company name'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 200)',
          minimum: 1,
          maximum: 200
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_company',
    description: 'Create a new company in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        companyName: {
          type: 'string',
          description: 'Company name'
        },
        companyType: {
          type: 'number',
          description: 'Company type ID'
        },
        phone: {
          type: 'string',
          description: 'Company phone number'
        },
        address1: {
          type: 'string',
          description: 'Company address line 1'
        },
        city: {
          type: 'string',
          description: 'Company city'
        },
        state: {
          type: 'string',
          description: 'Company state/province'
        },
        postalCode: {
          type: 'string',
          description: 'Company postal/ZIP code'
        },
        ownerResourceID: {
          type: 'number',
          description: 'Owner resource ID'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the company is active'
        }
      },
      required: ['companyName', 'companyType']
    }
  },
  {
    name: 'autotask_update_company',
    description: 'Update an existing company in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Company ID to update'
        },
        companyName: {
          type: 'string',
          description: 'Company name'
        },
        phone: {
          type: 'string',
          description: 'Company phone number'
        },
        address1: {
          type: 'string',
          description: 'Company address line 1'
        },
        city: {
          type: 'string',
          description: 'Company city'
        },
        state: {
          type: 'string',
          description: 'Company state/province'
        },
        postalCode: {
          type: 'string',
          description: 'Company postal/ZIP code'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the company is active'
        }
      },
      required: ['id']
    }
  },

  // Contact tools
  {
    name: 'autotask_search_contacts',
    description: 'Search for contacts in Autotask. Returns 25 results per page by default. Use page parameter for more results.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for contact name or email'
        },
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        isActive: {
          type: 'number',
          description: 'Filter by active status (1=active, 0=inactive)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 200)',
          minimum: 1,
          maximum: 200
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_contact',
    description: 'Create a new contact in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        companyID: {
          type: 'number',
          description: 'Company ID for the contact'
        },
        firstName: {
          type: 'string',
          description: 'Contact first name'
        },
        lastName: {
          type: 'string',
          description: 'Contact last name'
        },
        emailAddress: {
          type: 'string',
          description: 'Contact email address'
        },
        phone: {
          type: 'string',
          description: 'Contact phone number'
        },
        title: {
          type: 'string',
          description: 'Contact job title'
        }
      },
      required: ['companyID', 'firstName', 'lastName']
    }
  },

  // Ticket tools
  {
    name: 'autotask_search_tickets',
    description: 'Search for tickets in Autotask. Returns 25 results per page by default. Use page parameter for more results. Use get_ticket_details for full data on a specific ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search by ticket number prefix'
        },
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        status: {
          type: 'number',
          description: 'Filter by ticket status ID (omit for all open tickets)'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Filter by assigned resource ID'
        },
        unassigned: {
          type: 'boolean',
          description: 'Set to true to find unassigned tickets'
        },
        createdAfter: {
          type: 'string',
          description: 'Filter tickets created on or after this date (ISO format, e.g. 2026-01-01)'
        },
        createdBefore: {
          type: 'string',
          description: 'Filter tickets created on or before this date (ISO format)'
        },
        lastActivityAfter: {
          type: 'string',
          description: 'Filter tickets with activity on or after this date (ISO format)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_get_ticket_details',
    description: 'Get detailed information for a specific ticket by ID. Use this for full ticket data when needed.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketID: {
          type: 'number',
          description: 'Ticket ID to retrieve'
        },
        fullDetails: {
          type: 'boolean',
          description: 'Whether to return full ticket details (default: false for optimized data)',
          default: false
        }
      },
      required: ['ticketID']
    }
  },
  {
    name: 'autotask_create_ticket',
    description: 'Create a new ticket in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        companyID: {
          type: 'number',
          description: 'Company ID for the ticket'
        },
        title: {
          type: 'string',
          description: 'Ticket title'
        },
        description: {
          type: 'string',
          description: 'Ticket description'
        },
        status: {
          type: 'number',
          description: 'Ticket status ID'
        },
        priority: {
          type: 'number',
          description: 'Ticket priority ID'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Assigned resource ID. If set, assignedResourceRoleID is also required by Autotask.'
        },
        assignedResourceRoleID: {
          type: 'number',
          description: 'Role ID for the assigned resource. Required by Autotask when assignedResourceID is set.'
        },
        contactID: {
          type: 'number',
          description: 'Contact ID for the ticket'
        }
      },
      required: ['companyID', 'title', 'description']
    }
  },

  {
    name: 'autotask_update_ticket',
    description: 'Update an existing ticket in Autotask. Only fields provided will be changed.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ID of the ticket to update'
        },
        title: {
          type: 'string',
          description: 'Ticket title'
        },
        description: {
          type: 'string',
          description: 'Ticket description'
        },
        status: {
          type: 'number',
          description: 'Ticket status ID (use autotask_list_ticket_statuses to find valid IDs)'
        },
        priority: {
          type: 'number',
          description: 'Ticket priority ID (use autotask_list_ticket_priorities to find valid IDs)'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Assigned resource ID. If set, assignedResourceRoleID is also required by Autotask.'
        },
        assignedResourceRoleID: {
          type: 'number',
          description: 'Role ID for the assigned resource. Required by Autotask when assignedResourceID is set.'
        },
        dueDateTime: {
          type: 'string',
          description: 'Due date and time in ISO 8601 format (e.g. 2026-03-15T17:00:00Z)'
        },
        contactID: {
          type: 'number',
          description: 'Contact ID for the ticket'
        }
      },
      required: ['ticketId']
    }
  },

  // Time entry tools
  {
    name: 'autotask_create_time_entry',
    description: 'Create a time entry in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        ticketID: {
          type: 'number',
          description: 'Ticket ID for the time entry'
        },
        taskID: {
          type: 'number',
          description: 'Task ID for the time entry (optional, for project work)'
        },
        resourceID: {
          type: 'number',
          description: 'Resource ID (user) logging the time'
        },
        dateWorked: {
          type: 'string',
          description: 'Date worked (YYYY-MM-DD format)'
        },
        startDateTime: {
          type: 'string',
          description: 'Start date/time (ISO format)'
        },
        endDateTime: {
          type: 'string',
          description: 'End date/time (ISO format)'
        },
        hoursWorked: {
          type: 'number',
          description: 'Number of hours worked'
        },
        summaryNotes: {
          type: 'string',
          description: 'Summary notes for the time entry'
        },
        internalNotes: {
          type: 'string',
          description: 'Internal notes for the time entry'
        }
      },
      required: ['resourceID', 'dateWorked', 'hoursWorked', 'summaryNotes']
    }
  },

  // Project tools
  {
    name: 'autotask_search_projects',
    description: 'Search for projects in Autotask. Returns 25 results per page by default. Use page parameter for more results.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for project name'
        },
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        status: {
          type: 'number',
          description: 'Filter by project status'
        },
        projectLeadResourceID: {
          type: 'number',
          description: 'Filter by project lead resource ID'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_project',
    description: 'Create a new project in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        companyID: {
          type: 'number',
          description: 'Company ID for the project'
        },
        projectName: {
          type: 'string',
          description: 'Project name'
        },
        description: {
          type: 'string',
          description: 'Project description'
        },
        status: {
          type: 'number',
          description: 'Project status (1=New, 2=In Progress, 5=Complete)'
        },
        startDate: {
          type: 'string',
          description: 'Project start date (YYYY-MM-DD)'
        },
        endDate: {
          type: 'string',
          description: 'Project end date (YYYY-MM-DD)'
        },
        projectLeadResourceID: {
          type: 'number',
          description: 'Project manager resource ID'
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours for the project'
        }
      },
      required: ['companyID', 'projectName', 'status']
    }
  },

  // Resource tools
  {
    name: 'autotask_search_resources',
    description: 'Search for resources (users) in Autotask. Returns 25 results per page by default. Use page parameter for more results.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for resource name or email'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        resourceType: {
          type: 'number',
          description: 'Filter by resource type (1=Employee, 2=Contractor, 3=Temporary)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // Ticket Notes tools
  {
    name: 'autotask_get_ticket_note',
    description: 'Get a specific ticket note by ticket ID and note ID',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID'
        },
        noteId: {
          type: 'number',
          description: 'The note ID to retrieve'
        }
      },
      required: ['ticketId', 'noteId']
    }
  },
  {
    name: 'autotask_search_ticket_notes',
    description: 'Search for notes on a specific ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID to search notes for'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['ticketId']
    }
  },
  {
    name: 'autotask_create_ticket_note',
    description: 'Create a new note for a ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID to add the note to'
        },
        title: {
          type: 'string',
          description: 'Note title'
        },
        description: {
          type: 'string',
          description: 'Note content'
        },
        noteType: {
          type: 'number',
          description: 'Note type (1=General, 2=Appointment, 3=Task, 4=Ticket, 5=Project, 6=Opportunity)'
        },
        publish: {
          type: 'number',
          description: 'Publish level (1=Internal Only, 2=All Autotask Users, 3=Everyone)'
        }
      },
      required: ['ticketId', 'description']
    }
  },

  // Project Notes tools
  {
    name: 'autotask_get_project_note',
    description: 'Get a specific project note by project ID and note ID',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'The project ID'
        },
        noteId: {
          type: 'number',
          description: 'The note ID to retrieve'
        }
      },
      required: ['projectId', 'noteId']
    }
  },
  {
    name: 'autotask_search_project_notes',
    description: 'Search for notes on a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'The project ID to search notes for'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['projectId']
    }
  },
  {
    name: 'autotask_create_project_note',
    description: 'Create a new note for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'The project ID to add the note to'
        },
        title: {
          type: 'string',
          description: 'Note title'
        },
        description: {
          type: 'string',
          description: 'Note content'
        },
        noteType: {
          type: 'number',
          description: 'Note type (1=General, 2=Appointment, 3=Task, 4=Ticket, 5=Project, 6=Opportunity)'
        }
      },
      required: ['projectId', 'description']
    }
  },

  // Company Notes tools
  {
    name: 'autotask_get_company_note',
    description: 'Get a specific company note by company ID and note ID',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'The company ID'
        },
        noteId: {
          type: 'number',
          description: 'The note ID to retrieve'
        }
      },
      required: ['companyId', 'noteId']
    }
  },
  {
    name: 'autotask_search_company_notes',
    description: 'Search for notes on a specific company',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'The company ID to search notes for'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['companyId']
    }
  },
  {
    name: 'autotask_create_company_note',
    description: 'Create a new note for a company',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'The company ID to add the note to'
        },
        title: {
          type: 'string',
          description: 'Note title'
        },
        description: {
          type: 'string',
          description: 'Note content'
        },
        actionType: {
          type: 'number',
          description: 'Action type for the note'
        }
      },
      required: ['companyId', 'description']
    }
  },

  // Ticket Attachments tools
  {
    name: 'autotask_get_ticket_attachment',
    description: 'Get a specific ticket attachment by ticket ID and attachment ID',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID'
        },
        attachmentId: {
          type: 'number',
          description: 'The attachment ID to retrieve'
        },
        includeData: {
          type: 'boolean',
          description: 'Whether to include base64 encoded file data (default: false)',
          default: false
        }
      },
      required: ['ticketId', 'attachmentId']
    }
  },
  {
    name: 'autotask_search_ticket_attachments',
    description: 'Search for attachments on a specific ticket',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID to search attachments for'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 10, max: 50)',
          minimum: 1,
          maximum: 50
        }
      },
      required: ['ticketId']
    }
  },

  // Expense Reports tools
  {
    name: 'autotask_get_expense_report',
    description: 'Get a specific expense report by ID',
    inputSchema: {
      type: 'object',
      properties: {
        reportId: {
          type: 'number',
          description: 'The expense report ID to retrieve'
        }
      },
      required: ['reportId']
    }
  },
  {
    name: 'autotask_search_expense_reports',
    description: 'Search for expense reports with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        submitterId: {
          type: 'number',
          description: 'Filter by submitter resource ID'
        },
        status: {
          type: 'number',
          description: 'Filter by status (1=New, 2=Submitted, 3=Approved, 4=Paid, 5=Rejected, 6=InReview)'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_expense_report',
    description: 'Create a new expense report',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Expense report name'
        },
        description: {
          type: 'string',
          description: 'Expense report description'
        },
        submitterId: {
          type: 'number',
          description: 'The resource ID of the submitter'
        },
        weekEndingDate: {
          type: 'string',
          description: 'Week ending date (YYYY-MM-DD format)'
        }
      },
      required: ['name', 'submitterId', 'weekEndingDate']
    }
  },

  // Expense Item tools
  {
    name: 'autotask_create_expense_item',
    description: 'Create an expense item on an existing expense report',
    inputSchema: {
      type: 'object',
      properties: {
        expenseReportId: { type: 'number', description: 'The expense report ID to add the item to' },
        description: { type: 'string', description: 'Line item description' },
        expenseDate: { type: 'string', description: 'Date of expense (YYYY-MM-DD format)' },
        expenseCategory: { type: 'number', description: 'Expense category picklist ID' },
        amount: { type: 'number', description: 'Expense amount' },
        companyId: { type: 'number', description: 'Associated company ID (0 for internal)' },
        haveReceipt: { type: 'boolean', description: 'Whether a receipt is attached' },
        isBillableToCompany: { type: 'boolean', description: 'Whether billable to company' },
        isReimbursable: { type: 'boolean', description: 'Whether this expense is reimbursable' },
        paymentType: { type: 'number', description: 'Payment type picklist ID' }
      },
      required: ['expenseReportId', 'description', 'expenseDate', 'expenseCategory', 'amount']
    }
  },

  // Quotes tools
  {
    name: 'autotask_get_quote',
    description: 'Get a specific quote by ID',
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: {
          type: 'number',
          description: 'The quote ID to retrieve'
        }
      },
      required: ['quoteId']
    }
  },
  {
    name: 'autotask_search_quotes',
    description: 'Search for quotes with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'Filter by company ID'
        },
        contactId: {
          type: 'number',
          description: 'Filter by contact ID'
        },
        opportunityId: {
          type: 'number',
          description: 'Filter by opportunity ID'
        },
        searchTerm: {
          type: 'string',
          description: 'Search term for quote name or description'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_quote',
    description: 'Create a new quote',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Quote name'
        },
        description: {
          type: 'string',
          description: 'Quote description'
        },
        companyId: {
          type: 'number',
          description: 'Company ID for the quote'
        },
        contactId: {
          type: 'number',
          description: 'Contact ID for the quote'
        },
        opportunityId: {
          type: 'number',
          description: 'Associated opportunity ID'
        },
        effectiveDate: {
          type: 'string',
          description: 'Effective date (YYYY-MM-DD format)'
        },
        expirationDate: {
          type: 'string',
          description: 'Expiration date (YYYY-MM-DD format)'
        }
      },
      required: ['companyId']
    }
  },

  // Opportunity tools
  {
    name: 'autotask_get_opportunity',
    description: 'Get a specific opportunity by ID',
    inputSchema: {
      type: 'object',
      properties: {
        opportunityId: {
          type: 'number',
          description: 'The opportunity ID to retrieve'
        }
      },
      required: ['opportunityId']
    }
  },
  {
    name: 'autotask_search_opportunities',
    description: 'Search for opportunities with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'Filter by company ID'
        },
        searchTerm: {
          type: 'string',
          description: 'Search term for opportunity title'
        },
        status: {
          type: 'number',
          description: 'Filter by status'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },

  {
    name: 'autotask_create_opportunity',
    description: 'Create a new sales opportunity in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Opportunity name/title'
        },
        companyId: {
          type: 'number',
          description: 'Company ID for the opportunity'
        },
        ownerResourceId: {
          type: 'number',
          description: 'Owner resource ID (the sales rep or account manager)'
        },
        status: {
          type: 'number',
          description: 'Status: 0=Not Ready To Buy, 1=Active, 2=Lost, 3=Closed, 4=Implemented'
        },
        stage: {
          type: 'number',
          description: 'Stage picklist value ID (use autotask_get_field_info to find valid values)'
        },
        projectedCloseDate: {
          type: 'string',
          description: 'Projected close date (YYYY-MM-DD)'
        },
        startDate: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        probability: {
          type: 'number',
          description: 'Win probability percentage (0-100, default: 50)'
        },
        amount: {
          type: 'number',
          description: 'Revenue amount (default: 0, set useQuoteTotals=true to calculate from quotes)'
        },
        cost: {
          type: 'number',
          description: 'Cost amount (default: 0)'
        },
        useQuoteTotals: {
          type: 'boolean',
          description: 'Whether to calculate totals from linked quotes (default: true)'
        },
        totalAmountMonths: {
          type: 'number',
          description: 'Number of months to calculate totals for (e.g., 12 for annual)'
        },
        contactId: {
          type: 'number',
          description: 'Contact ID for the opportunity'
        },
        description: {
          type: 'string',
          description: 'Opportunity description'
        },
        opportunityCategoryID: {
          type: 'number',
          description: 'Opportunity category picklist value ID'
        }
      },
      required: ['title', 'companyId', 'ownerResourceId', 'status', 'stage', 'projectedCloseDate', 'startDate']
    }
  },

  // Product tools
  {
    name: 'autotask_get_product',
    description: 'Get a specific product by ID',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'number',
          description: 'The product ID to retrieve'
        }
      },
      required: ['productId']
    }
  },
  {
    name: 'autotask_search_products',
    description: 'Search for products with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for product name'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },

  // Service tools
  {
    name: 'autotask_get_service',
    description: 'Get a specific service by ID',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'number',
          description: 'The service ID to retrieve'
        }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'autotask_search_services',
    description: 'Search for services with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for service name'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },

  // Service Bundle tools
  {
    name: 'autotask_get_service_bundle',
    description: 'Get a specific service bundle by ID',
    inputSchema: {
      type: 'object',
      properties: {
        serviceBundleId: {
          type: 'number',
          description: 'The service bundle ID to retrieve'
        }
      },
      required: ['serviceBundleId']
    }
  },
  {
    name: 'autotask_search_service_bundles',
    description: 'Search for service bundles with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for service bundle name'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },

  // Quote Item tools
  {
    name: 'autotask_get_quote_item',
    description: 'Get a specific quote item by ID',
    inputSchema: {
      type: 'object',
      properties: {
        quoteItemId: {
          type: 'number',
          description: 'The quote item ID to retrieve'
        }
      },
      required: ['quoteItemId']
    }
  },
  {
    name: 'autotask_search_quote_items',
    description: 'Search for quote items, typically filtered by quote ID',
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: {
          type: 'number',
          description: 'Filter by quote ID (recommended)'
        },
        searchTerm: {
          type: 'string',
          description: 'Search term for quote item name'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 50, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_quote_item',
    description: 'Create a line item on a quote. Set exactly ONE item reference (serviceID, productID, or serviceBundleID). Required: quoteId, quantity. Defaults: unitDiscount=0, lineDiscount=0, percentageDiscount=0, isOptional=false.',
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: {
          type: 'number',
          description: 'The quote ID to add this item to'
        },
        name: {
          type: 'string',
          description: 'Item name (auto-populated for service/product types)'
        },
        description: {
          type: 'string',
          description: 'Item description'
        },
        quantity: {
          type: 'number',
          description: 'Quantity of the item'
        },
        unitPrice: {
          type: 'number',
          description: 'Unit price for the item'
        },
        unitCost: {
          type: 'number',
          description: 'Unit cost for the item'
        },
        unitDiscount: {
          type: 'number',
          description: 'Per-unit discount amount (default: 0)'
        },
        lineDiscount: {
          type: 'number',
          description: 'Line-level discount amount (default: 0)'
        },
        percentageDiscount: {
          type: 'number',
          description: 'Percentage discount (default: 0)'
        },
        isOptional: {
          type: 'boolean',
          description: 'Whether this is an optional line item (default: false)'
        },
        serviceID: {
          type: 'number',
          description: 'Service ID to link (mutually exclusive with productID/serviceBundleID)'
        },
        productID: {
          type: 'number',
          description: 'Product ID to link (mutually exclusive with serviceID/serviceBundleID)'
        },
        serviceBundleID: {
          type: 'number',
          description: 'Service Bundle ID to link (mutually exclusive with serviceID/productID)'
        },
        sortOrderID: {
          type: 'number',
          description: 'Sort order for display'
        },
        quoteItemType: {
          type: 'number',
          description: 'Quote item type (auto-determined if omitted): 1=Product, 2=Cost, 3=Labor, 4=Expense, 6=Shipping, 11=Service, 12=ServiceBundle'
        }
      },
      required: ['quoteId', 'quantity']
    }
  },
  {
    name: 'autotask_update_quote_item',
    description: 'Update an existing quote item (quantity, price, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        quoteItemId: {
          type: 'number',
          description: 'The quote item ID to update'
        },
        quantity: {
          type: 'number',
          description: 'Updated quantity'
        },
        unitPrice: {
          type: 'number',
          description: 'Updated unit price'
        },
        unitDiscount: {
          type: 'number',
          description: 'Updated per-unit discount'
        },
        lineDiscount: {
          type: 'number',
          description: 'Updated line discount'
        },
        percentageDiscount: {
          type: 'number',
          description: 'Updated percentage discount'
        },
        isOptional: {
          type: 'boolean',
          description: 'Updated optional status'
        },
        sortOrderID: {
          type: 'number',
          description: 'Updated sort order'
        }
      },
      required: ['quoteItemId']
    }
  },
  {
    name: 'autotask_delete_quote_item',
    description: 'Delete a quote item (line item) from a quote',
    inputSchema: {
      type: 'object',
      properties: {
        quoteId: {
          type: 'number',
          description: 'The parent quote ID'
        },
        quoteItemId: {
          type: 'number',
          description: 'The quote item ID to delete'
        }
      },
      required: ['quoteId', 'quoteItemId']
    }
  },

  // Configuration Item tools
  {
    name: 'autotask_search_configuration_items',
    description: 'Search for configuration items in Autotask with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for configuration item name'
        },
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status'
        },
        productID: {
          type: 'number',
          description: 'Filter by product ID'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // Contract tools
  {
    name: 'autotask_search_contracts',
    description: 'Search for contracts in Autotask with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for contract name'
        },
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        status: {
          type: 'number',
          description: 'Filter by contract status (1=In Effect, 3=Terminated)'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // Invoice tools
  {
    name: 'autotask_search_invoices',
    description: 'Search for invoices in Autotask with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        companyID: {
          type: 'number',
          description: 'Filter by company ID'
        },
        invoiceNumber: {
          type: 'string',
          description: 'Filter by invoice number'
        },
        isVoided: {
          type: 'boolean',
          description: 'Filter by voided status'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // Task tools
  {
    name: 'autotask_search_tasks',
    description: 'Search for tasks in Autotask. Returns 25 results per page by default. Use page parameter for more results.',
    inputSchema: {
      type: 'object',
      properties: {
        searchTerm: {
          type: 'string',
          description: 'Search term for task title'
        },
        projectID: {
          type: 'number',
          description: 'Filter by project ID'
        },
        status: {
          type: 'number',
          description: 'Filter by task status (1=New, 2=In Progress, 5=Complete)'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Filter by assigned resource ID'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_task',
    description: 'Create a new task in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        projectID: {
          type: 'number',
          description: 'Project ID for the task'
        },
        title: {
          type: 'string',
          description: 'Task title'
        },
        description: {
          type: 'string',
          description: 'Task description'
        },
        status: {
          type: 'number',
          description: 'Task status (1=New, 2=In Progress, 5=Complete)'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Assigned resource ID'
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours for the task'
        },
        startDateTime: {
          type: 'string',
          description: 'Task start date/time (ISO format)'
        },
        endDateTime: {
          type: 'string',
          description: 'Task end date/time (ISO format)'
        }
      },
      required: ['projectID', 'title', 'status']
    }
  },

  // Picklist / Queue tools
  {
    name: 'autotask_list_queues',
    description: 'List all available ticket queues in Autotask. Use this to find queue IDs for filtering tickets by queue.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'autotask_list_ticket_statuses',
    description: 'List all available ticket statuses in Autotask. Use this to find status values for filtering or creating tickets.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'autotask_list_ticket_priorities',
    description: 'List all available ticket priorities in Autotask. Use this to find priority values for filtering or creating tickets.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'autotask_get_field_info',
    description: 'Get field definitions for an Autotask entity type, including picklist values. Useful for discovering valid values for any picklist field.',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: {
          type: 'string',
          description: 'The Autotask entity type (e.g., "Tickets", "Companies", "Contacts", "Projects")'
        },
        fieldName: {
          type: 'string',
          description: 'Optional: filter to a specific field name'
        }
      },
      required: ['entityType']
    }
  },

  // Billing Items tools (Approve and Post workflow)
  {
    name: 'autotask_search_billing_items',
    description: 'Search for billing items in Autotask. Billing items represent approved and posted billable items from the "Approve and Post" workflow. Returns 25 results per page by default.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'Filter by company ID'
        },
        ticketId: {
          type: 'number',
          description: 'Filter by ticket ID'
        },
        projectId: {
          type: 'number',
          description: 'Filter by project ID'
        },
        contractId: {
          type: 'number',
          description: 'Filter by contract ID'
        },
        invoiceId: {
          type: 'number',
          description: 'Filter by invoice ID'
        },
        postedAfter: {
          type: 'string',
          description: 'Filter items posted on or after this date (ISO format, e.g. 2026-01-01)'
        },
        postedBefore: {
          type: 'string',
          description: 'Filter items posted on or before this date (ISO format)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_get_billing_item',
    description: 'Get detailed information for a specific billing item by ID',
    inputSchema: {
      type: 'object',
      properties: {
        billingItemId: {
          type: 'number',
          description: 'The billing item ID to retrieve'
        }
      },
      required: ['billingItemId']
    }
  },

  // Billing Item Approval Levels tools
  {
    name: 'autotask_search_billing_item_approval_levels',
    description: 'Search for billing item approval levels. These describe multi-level approval records for Autotask time entries, enabling visibility into tiered approval workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        timeEntryId: {
          type: 'number',
          description: 'Filter by time entry ID'
        },
        approvalResourceId: {
          type: 'number',
          description: 'Filter by approver resource ID'
        },
        approvalLevel: {
          type: 'number',
          description: 'Filter by approval level (1, 2, 3, etc.)'
        },
        approvedAfter: {
          type: 'string',
          description: 'Filter approvals on or after this date (ISO format)'
        },
        approvedBefore: {
          type: 'string',
          description: 'Filter approvals on or before this date (ISO format)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // Time Entries search tool
  {
    name: 'autotask_search_time_entries',
    description: 'Search for time entries in Autotask. Returns 25 results per page by default. Time entries can be filtered by resource, ticket, project, task, date range, or approval status. Use approvalStatus="unapproved" to find entries not yet posted.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: {
          type: 'number',
          description: 'Filter by resource (user) ID'
        },
        ticketId: {
          type: 'number',
          description: 'Filter by ticket ID'
        },
        projectId: {
          type: 'number',
          description: 'Filter by project ID'
        },
        taskId: {
          type: 'number',
          description: 'Filter by task ID'
        },
        approvalStatus: {
          type: 'string',
          enum: ['unapproved', 'approved', 'all'],
          description: 'Filter by approval status: "unapproved" = not yet posted (billingApprovalDateTime is null), "approved" = already posted, "all" = no filter (default)'
        },
        billable: {
          type: 'boolean',
          description: 'Filter by billable status (true = billable only, false = non-billable only)'
        },
        dateWorkedAfter: {
          type: 'string',
          description: 'Filter entries worked on or after this date (ISO format, e.g. 2026-01-01)'
        },
        dateWorkedBefore: {
          type: 'string',
          description: 'Filter entries worked on or before this date (ISO format)'
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default: 1)',
          minimum: 1
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 500)',
          minimum: 1,
          maximum: 500
        }
      },
      required: []
    }
  },

  // === Meta-tools for progressive discovery (lazy loading mode) ===
  {
    name: 'autotask_list_categories',
    description: 'List available tool categories. Use this to discover what types of Autotask operations are available before loading specific tools.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'autotask_list_category_tools',
    description: 'List tools in a specific category with full schemas. Use after autotask_list_categories to see available tools and their parameters.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name from autotask_list_categories (e.g., "tickets", "financial", "companies")'
        }
      },
      required: ['category']
    }
  },
  {
    name: 'autotask_execute_tool',
    description: 'Execute any Autotask tool by name. Use after discovering tools via autotask_list_category_tools.',
    inputSchema: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'The tool name to execute (e.g., "autotask_search_tickets")'
        },
        arguments: {
          type: 'object',
          description: 'Arguments to pass to the tool'
        }
      },
      required: ['toolName']
    }
  },
  {
    name: 'autotask_router',
    description: 'Intelligent tool router - describe what you want to do and get the right tool suggestion with pre-filled parameters. Use this when unsure which tool to call.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'Natural language description of what you want to do (e.g., "find tickets for Acme Corp", "log 2 hours on ticket 12345", "create a quote for client")'
        }
      },
      required: ['intent']
    }
  }
];

export const TOOL_CATEGORIES: Record<string, { description: string; tools: string[] }> = {
  utility: {
    description: 'Connection testing and field/picklist discovery',
    tools: ['autotask_test_connection', 'autotask_list_queues', 'autotask_list_ticket_statuses', 'autotask_list_ticket_priorities', 'autotask_get_field_info']
  },
  companies: {
    description: 'Search, create, and update companies',
    tools: ['autotask_search_companies', 'autotask_create_company', 'autotask_update_company']
  },
  contacts: {
    description: 'Search and create contacts',
    tools: ['autotask_search_contacts', 'autotask_create_contact']
  },
  tickets: {
    description: 'Search, create, update tickets and manage ticket notes and attachments',
    tools: ['autotask_search_tickets', 'autotask_get_ticket_details', 'autotask_create_ticket', 'autotask_update_ticket', 'autotask_get_ticket_note', 'autotask_search_ticket_notes', 'autotask_create_ticket_note', 'autotask_get_ticket_attachment', 'autotask_search_ticket_attachments']
  },
  projects: {
    description: 'Search and create projects, tasks, and project notes',
    tools: ['autotask_search_projects', 'autotask_create_project', 'autotask_search_tasks', 'autotask_create_task', 'autotask_get_project_note', 'autotask_search_project_notes', 'autotask_create_project_note']
  },
  time_and_billing: {
    description: 'Time entries, billing items, and expense management',
    tools: ['autotask_create_time_entry', 'autotask_search_time_entries', 'autotask_search_billing_items', 'autotask_get_billing_item', 'autotask_search_billing_item_approval_levels', 'autotask_get_expense_report', 'autotask_search_expense_reports', 'autotask_create_expense_report', 'autotask_create_expense_item']
  },
  financial: {
    description: 'Quotes, quote items, opportunities, invoices, and contracts',
    tools: ['autotask_get_quote', 'autotask_search_quotes', 'autotask_create_quote', 'autotask_get_quote_item', 'autotask_search_quote_items', 'autotask_create_quote_item', 'autotask_update_quote_item', 'autotask_delete_quote_item', 'autotask_get_opportunity', 'autotask_search_opportunities', 'autotask_create_opportunity', 'autotask_search_invoices', 'autotask_search_contracts']
  },
  products_and_services: {
    description: 'Products, services, and service bundles catalog',
    tools: ['autotask_get_product', 'autotask_search_products', 'autotask_get_service', 'autotask_search_services', 'autotask_get_service_bundle', 'autotask_search_service_bundles']
  },
  resources: {
    description: 'Search for Autotask resources (technicians/staff)',
    tools: ['autotask_search_resources']
  },
  configuration_items: {
    description: 'Search configuration items (assets/devices)',
    tools: ['autotask_search_configuration_items']
  },
  company_notes: {
    description: 'Get, search, and create company notes',
    tools: ['autotask_get_company_note', 'autotask_search_company_notes', 'autotask_create_company_note']
  }
};
