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
    description: 'Update an existing company in Autotask. Field names match the Autotask REST API exactly (camelCase, capital ID suffixes where applicable). Note: Autotask uses invoiceTemplateID for payment terms (e.g. 103=Due on Receipt, 104=NET 30) — there is NO `paymentTerm` field on the Companies entity. Billing address fields (billingAddress1/billToCity/billToState/billToZipCode/billToCountryID/billToAttention/billToAddressToUse) are SEPARATE from the regular address fields (address1/city/state/postalCode/countryID) — set both pairs when needed.',
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
          description: 'Company address line 1 (the regular address, distinct from billingAddress1 used for invoices)'
        },
        address2: {
          type: 'string',
          description: 'Company address line 2'
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
        countryID: {
          type: 'number',
          description: 'Country ID (e.g. 237 for United States)'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the company is active'
        },
        webAddress: {
          type: 'string',
          description: 'Company website URL (Autotask field name is webAddress, not website)'
        },
        // ---- Billing-to fields (used for Invoice Settings; SEPARATE from regular address) ----
        billingAddress1: {
          type: 'string',
          description: 'Billing address line 1 (used for Invoice Settings — separate from address1)'
        },
        billingAddress2: {
          type: 'string',
          description: 'Billing address line 2'
        },
        billToAttention: {
          type: 'string',
          description: 'Bill-to attention name'
        },
        billToAddressToUse: {
          type: 'number',
          description: 'Address-to-use flag (1 = use bill-to fields explicitly)'
        },
        billToCity: {
          type: 'string',
          description: 'Bill-to city'
        },
        billToState: {
          type: 'string',
          description: 'Bill-to state/province'
        },
        billToZipCode: {
          type: 'string',
          description: 'Bill-to ZIP/postal code'
        },
        billToCountryID: {
          type: 'number',
          description: 'Bill-to country ID'
        },
        billToCompanyLocationID: {
          type: 'number',
          description: 'Bill-to company location ID'
        },
        // ---- Tax / invoice settings ----
        taxRegionID: {
          type: 'number',
          description: 'Tax region ID (capital ID suffix per Autotask convention)'
        },
        invoiceTemplateID: {
          type: 'number',
          description: 'Invoice template ID applied to this company. Acts as the payment-terms selector (e.g. 103=Due on Receipt, 104=NET 30).'
        },
        invoiceMethod: {
          type: 'number',
          description: 'Invoice delivery method picklist ID (e.g. 2=Email)'
        },
        invoiceEmailMessageID: {
          type: 'number',
          description: 'Default email-message template ID used when invoicing this company'
        },
        taxID: {
          type: 'string',
          description: 'Tax registration / FEIN / VAT identifier string'
        },
        isTaxExempt: {
          type: 'boolean',
          description: 'Whether the company is tax-exempt. Note: Autotask field name is `isTaxExempt` — not `taxExempt`.'
        },
        // ---- Quote / PO templates ----
        quoteEmailMessageID: {
          type: 'number',
          description: 'Default email-message template ID used when sending quotes'
        },
        quoteTemplateID: {
          type: 'number',
          description: 'Default quote template ID for this company'
        },
        purchaseOrderTemplateID: {
          type: 'number',
          description: 'Default purchase-order template ID for this company'
        },
        // ---- Ownership / classification ----
        ownerResourceID: {
          type: 'number',
          description: 'Resource ID of the account owner'
        },
        classification: {
          type: 'number',
          description: 'Company classification picklist ID'
        },
        companyType: {
          type: 'number',
          description: 'Company type picklist ID (e.g. Customer, Prospect, Vendor)'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'autotask_get_company_site_configuration',
    description: 'Get the site configuration record(s) for a company in Autotask. Site configurations contain tenant-defined fields used to track per-company configuration data. Call this first to discover which fields are available before calling autotask_update_company_site_configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'The company ID whose site configuration records should be returned'
        }
      },
      required: ['companyId']
    }
  },
  {
    name: 'autotask_update_company_site_configuration',
    description: 'Update fields on a company site configuration record. The set of available fields is tenant-defined, so callers should first call autotask_get_company_site_configuration to discover the available field names and current values for the company. Pass the site configuration record id (not the company id) along with an updates object containing the fields to change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The company site configuration record ID to update (obtained from autotask_get_company_site_configuration).'
        },
        updates: {
          type: 'object',
          description: 'Object containing the site configuration fields to update. Field names are tenant-specific.',
          additionalProperties: true
        }
      },
      required: ['id', 'updates']
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
  {
    name: 'autotask_update_contact',
    description: 'Update an existing contact in Autotask. Pass only the fields you want to change; all non-id fields are optional. Field names match the Autotask REST API exactly.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'Contact ID to update'
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
          description: 'Primary email address'
        },
        phone: {
          type: 'string',
          description: 'Primary phone number'
        },
        title: {
          type: 'string',
          description: 'Job title'
        },
        isActive: {
          type: 'boolean',
          description: 'Whether the contact is active'
        },
        mobilePhone: {
          type: 'string',
          description: 'Mobile phone number'
        },
        addressLine: {
          type: 'string',
          description: 'Address line (primary)'
        },
        addressLine1: {
          type: 'string',
          description: 'Address line 1 (secondary)'
        },
        city: {
          type: 'string',
          description: 'City'
        },
        state: {
          type: 'string',
          description: 'State/province'
        },
        zipCode: {
          type: 'string',
          description: 'Postal/ZIP code'
        },
        countryID: {
          type: 'number',
          description: 'Country ID (Autotask Countries entity)'
        },
        primaryContact: {
          type: 'boolean',
          description: 'Whether this contact is the primary contact for their company'
        }
      },
      required: ['id']
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
        contactID: {
          type: 'number',
          description: 'Filter by primary contact ID — returns only tickets where contactID matches'
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
        },
        queueID: {
          type: 'number',
          description: 'Queue ID to route the ticket to. Use autotask_list_queues to discover valid IDs.'
        },
        ticketCategory: {
          type: 'number',
          description: 'Ticket category ID (picklist). Use autotask_get_field_info with entity "Tickets" and field "ticketCategory" to discover valid values.'
        },
        ticketType: {
          type: 'number',
          description: 'Ticket type ID (picklist, e.g. Service Request, Incident, Problem, Change).'
        },
        issueType: {
          type: 'number',
          description: 'First-level issue type ID (picklist). Required context for subIssueType. Use autotask_get_field_info (entity "Tickets", field "issueType") to discover valid values.'
        },
        subIssueType: {
          type: 'number',
          description: 'Sub issue type ID (picklist). Must be valid for the selected issueType. Use autotask_get_field_info (entity "Tickets", field "subIssueType") to discover valid values.'
        },
        source: {
          type: 'number',
          description: 'Ticket source ID (picklist, e.g. Phone, Email, Portal). Use autotask_get_field_info (entity "Tickets", field "source") to discover valid values.'
        },
        billingCodeID: {
          type: 'number',
          description: 'Work type / billing code ID used for billing this ticket.'
        },
        serviceLevelAgreementID: {
          type: 'number',
          description: 'Service Level Agreement (SLA) ID to apply to the ticket.'
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours of work for the ticket.'
        },
        projectID: {
          type: 'number',
          description: 'Project ID to associate the ticket with. Links the ticket to an existing project.'
        },
        ticketAdditionalContacts: {
          type: 'array',
          items: { type: 'number' },
          description: 'Additional contact IDs to associate with the ticket (beyond the primary contactID).'
        },
        resolution: {
          type: 'string',
          description: 'Ticket-level resolution text. This is the Resolution field on the ticket itself, NOT a ticket note.'
        },
        userDefinedFields: {
          type: 'array',
          description: 'User-defined (custom) fields for the ticket, as an array of { name, value } objects matching the Autotask REST API shape.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'UDF name' },
              value: { type: 'string', description: 'UDF value (stringified)' }
            },
            required: ['name', 'value']
          }
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

  // Ticket Charge tools
  {
    name: 'autotask_get_ticket_charge',
    description: 'Get a specific ticket charge by ID',
    inputSchema: {
      type: 'object',
      properties: {
        chargeId: {
          type: 'number',
          description: 'The ticket charge ID to retrieve'
        }
      },
      required: ['chargeId']
    }
  },
  {
    name: 'autotask_search_ticket_charges',
    description: 'Search for charges on a specific ticket. Charges represent materials, costs, or expenses billed against a ticket. Providing ticketId is strongly recommended — unfiltered queries are expensive and capped at 10 results.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'Filter by ticket ID (recommended)'
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
    name: 'autotask_create_ticket_charge',
    description: 'Create a charge (material, cost, or expense) on a ticket. Used to bill clients for parts, travel, or other non-labor costs.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketID: {
          type: 'number',
          description: 'Ticket ID to add the charge to'
        },
        name: {
          type: 'string',
          description: 'Charge name/title'
        },
        description: {
          type: 'string',
          description: 'Charge description'
        },
        chargeType: {
          type: 'number',
          description: 'Charge type picklist ID (use autotask_get_field_info with entityType "TicketCharges" to find valid values)'
        },
        unitQuantity: {
          type: 'number',
          description: 'Quantity of units'
        },
        unitPrice: {
          type: 'number',
          description: 'Price per unit'
        },
        unitCost: {
          type: 'number',
          description: 'Cost per unit'
        },
        datePurchased: {
          type: 'string',
          description: 'Date the charge was incurred (YYYY-MM-DD format)'
        },
        productID: {
          type: 'number',
          description: 'Associated product ID (optional)'
        },
        billingCodeID: {
          type: 'number',
          description: 'Billing code ID for categorization'
        },
        billableToAccount: {
          type: 'boolean',
          description: 'Whether this charge is billable to the client (default: true)'
        },
        status: {
          type: 'number',
          description: 'Charge status picklist ID'
        }
      },
      required: ['ticketID', 'name', 'chargeType']
    }
  },
  {
    name: 'autotask_update_ticket_charge',
    description: 'Update an existing ticket charge. Only fields provided will be changed.',
    inputSchema: {
      type: 'object',
      properties: {
        chargeId: {
          type: 'number',
          description: 'The charge ID to update'
        },
        name: {
          type: 'string',
          description: 'Updated charge name'
        },
        description: {
          type: 'string',
          description: 'Updated description'
        },
        unitQuantity: {
          type: 'number',
          description: 'Updated quantity'
        },
        unitPrice: {
          type: 'number',
          description: 'Updated unit price'
        },
        unitCost: {
          type: 'number',
          description: 'Updated unit cost'
        },
        billableToAccount: {
          type: 'boolean',
          description: 'Updated billable status'
        },
        status: {
          type: 'number',
          description: 'Updated status'
        }
      },
      required: ['chargeId']
    }
  },
  {
    name: 'autotask_delete_ticket_charge',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a ticket charge ' +
      'record and all associated billing data. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete ticket charge (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The parent ticket ID'
        },
        chargeId: {
          type: 'number',
          description: 'The charge ID to delete'
        }
      },
      required: ['ticketId', 'chargeId']
    }
  },

  // Time entry tools
  {
    name: 'autotask_create_time_entry',
    description: 'Create a time entry in Autotask. Can be tied to a ticket, task, or project, OR created as "Regular Time" (no parent) for meetings, admin work, etc. For Regular Time, specify a category like "Internal Meeting", "Office Management", "Training", etc.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketID: {
          type: 'number',
          description: 'Ticket ID for the time entry (omit for Regular Time)'
        },
        taskID: {
          type: 'number',
          description: 'Task ID for the time entry (for project work, omit for Regular Time)'
        },
        projectID: {
          type: 'number',
          description: 'Project ID for the time entry (omit for Regular Time)'
        },
        resourceID: {
          type: 'number',
          description: 'Resource ID (user) logging the time. Can be omitted if resourceName is provided.'
        },
        resourceName: {
          type: 'string',
          description: 'Name of the resource/user (e.g., "Will Spence"). Will be resolved to a resourceID automatically. Use this instead of resourceID for convenience.'
        },
        category: {
          type: 'string',
          description: 'Category name for Regular Time entries (e.g., "Internal Meeting", "Office Management", "Training", "Research", "HR/Recruiting", "Travel Time", "Holiday", "PTO"). Required for Regular Time entries (when no ticket/task/project is specified).'
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
      required: ['dateWorked', 'hoursWorked', 'summaryNotes']
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
        },
        projectType: {
          type: 'number',
          description: 'Project type (2=Proposal, 3=Template, 4=Internal, 5=Client, 8=Baseline). Required.'
        }
      },
      required: ['companyID', 'projectName', 'status', 'projectType']
    }
  },
  {
    name: 'autotask_update_project',
    description: 'Update an existing project in Autotask. Only the fields you provide will be updated. Common use case: set status=5 to mark a project Complete.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'number',
          description: 'The ID of the project to update'
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
          description: 'Project status (1=New, 2=In Progress, 5=Complete). Set to 5 to mark the project complete.'
        },
        departmentID: {
          type: 'number',
          description: 'Department ID owning the project'
        },
        assignedResourceID: {
          type: 'number',
          description: 'Primary assigned resource (project manager) ID. Note: Autotask may also require assignedResourceRoleID to be set alongside this field.'
        },
        assignedResourceRoleID: {
          type: 'number',
          description: 'Role ID for the assigned resource. Required by Autotask when assignedResourceID is provided.'
        },
        projectLeadResourceID: {
          type: 'number',
          description: 'Project lead resource ID'
        },
        startDateTime: {
          type: 'string',
          description: 'Project start date/time (ISO 8601)'
        },
        endDateTime: {
          type: 'string',
          description: 'Project end date/time (ISO 8601)'
        },
        estimatedTime: {
          type: 'number',
          description: 'Estimated time for the project, in hours'
        },
        userDefinedFields: {
          type: 'array',
          description: 'User-defined field values to set on the project (Autotask REST-native shape)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'UDF name' },
              value: { type: 'string', description: 'UDF value' }
            },
            required: ['name', 'value']
          }
        }
      },
      required: ['projectId']
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

  // Ticket Checklist Items tools (sub-resource of Tickets)
  {
    name: 'autotask_search_ticket_checklist_items',
    description: 'List all checklist items on a ticket, including their completion status. Checklist items are a sub-resource of a ticket and cannot be queried without a ticket ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID whose checklist items should be listed'
        }
      },
      required: ['ticketId']
    }
  },
  {
    name: 'autotask_create_ticket_checklist_item',
    description: 'Add a new checklist item to a ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID to add the checklist item to'
        },
        itemName: {
          type: 'string',
          description: 'The checklist item text'
        },
        position: {
          type: 'number',
          description: 'Optional ordering position for the item'
        },
        isCompleted: {
          type: 'boolean',
          description: 'Whether the item starts in the completed state (default: false)'
        }
      },
      required: ['ticketId', 'itemName']
    }
  },
  {
    name: 'autotask_update_ticket_checklist_item',
    description: 'Update a checklist item on a ticket — edit text, mark complete/incomplete, or change position.',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The parent ticket ID'
        },
        itemId: {
          type: 'number',
          description: 'The checklist item ID to update'
        },
        itemName: {
          type: 'string',
          description: 'New text for the checklist item'
        },
        isCompleted: {
          type: 'boolean',
          description: 'Mark the item complete (true) or incomplete (false)'
        },
        position: {
          type: 'number',
          description: 'New ordering position for the item'
        }
      },
      required: ['ticketId', 'itemId']
    }
  },
  {
    name: 'autotask_delete_ticket_checklist_item',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a checklist item ' +
      'from a ticket. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete ticket checklist item (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The parent ticket ID'
        },
        itemId: {
          type: 'number',
          description: 'The checklist item ID to delete'
        }
      },
      required: ['ticketId', 'itemId']
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
        },
        publish: {
          type: 'number',
          description: 'Publish visibility (1=All Autotask Users, 2=Internal Project Team, 3=Project Team). Defaults to 1.'
        },
        isAnnouncement: {
          type: 'boolean',
          description: 'Whether this note is an announcement. Defaults to false.'
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
  {
    name: 'autotask_create_ticket_attachment',
    description:
      'Upload a file attachment to an existing ticket. The file content must be passed as a base64-encoded string in the `data` field (MCP is JSON-RPC, so binary bytes must be base64-encoded). Autotask enforces a 3 MB hard limit on ticket attachments; this tool validates the decoded size before calling the API and returns a clear error if the limit is exceeded. Example: { ticketId: 12345, title: "screenshot.png", data: "iVBORw0KGgoAAAANSUhEUgAA..." }',
    inputSchema: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The ticket ID to attach the file to'
        },
        title: {
          type: 'string',
          description: 'Display title for the attachment (typically the filename, e.g. "screenshot.png")'
        },
        data: {
          type: 'string',
          description:
            'Base64-encoded file content. Maximum decoded size: 3 MB (Autotask ticket attachment limit). Example: read a file and pass its base64 representation here.'
        },
        fullPath: {
          type: 'string',
          description: 'Original filename including any path. Defaults to `title` if not provided.'
        },
        contentType: {
          type: 'string',
          description: 'MIME type of the file (e.g. "image/png", "application/pdf"). Optional.'
        },
        publish: {
          type: 'number',
          description: 'Visibility: 1 = All Autotask Users (default), 2 = Internal Users Only',
          default: 1
        }
      },
      required: ['ticketId', 'title', 'data']
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
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a quote item ' +
      '(line item) from a quote. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete quote item (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
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
  {
    name: 'autotask_get_invoice_details',
    description: 'Get a single Autotask invoice with its nested line items (billing items posted to the invoice). Use for finance workflows that need to see exactly what an invoice contains.',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: {
          type: 'number',
          description: 'The invoice ID to fetch'
        }
      },
      required: ['invoiceId']
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
        taskType: {
          type: 'number',
          description: 'Task type (1=FixedWork, 2=FixedDuration). Defaults to 1.'
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

  // Phase tools
  {
    name: 'autotask_list_phases',
    description: 'List phases for a project in Autotask',
    inputSchema: {
      type: 'object',
      properties: {
        projectID: {
          type: 'number',
          description: 'Project ID to list phases for'
        },
        pageSize: {
          type: 'number',
          description: 'Results per page (default: 25, max: 100)',
          minimum: 1,
          maximum: 100
        }
      },
      required: ['projectID']
    }
  },
  {
    name: 'autotask_create_phase',
    description: 'Create a new phase in an Autotask project',
    inputSchema: {
      type: 'object',
      properties: {
        projectID: {
          type: 'number',
          description: 'Project ID for the phase'
        },
        title: {
          type: 'string',
          description: 'Phase title'
        },
        description: {
          type: 'string',
          description: 'Phase description'
        },
        startDate: {
          type: 'string',
          description: 'Phase start date (ISO format)'
        },
        dueDate: {
          type: 'string',
          description: 'Phase due date (ISO format)'
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours for the phase'
        }
      },
      required: ['projectID', 'title']
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
          description: 'The Autotask entity type (e.g., "Tickets", "Companies", "Contacts", "Projects", "ProjectTasks", "TicketNotes"). Note: project tasks use "ProjectTasks" (or "Tasks" which auto-maps). See Autotask REST API entity names.'
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
        isInvoiced: {
          type: 'boolean',
          description: 'If true, only return billing items that have been attached to an invoice (invoiceID is set). If false, only return items that have not yet been invoiced. Answers "what has and hasn\'t been invoiced yet".'
        },
        dateFrom: {
          type: 'string',
          description: 'Filter billing items with itemDate on or after this date (ISO format, e.g. 2026-01-01)'
        },
        dateTo: {
          type: 'string',
          description: 'Filter billing items with itemDate on or before this date (ISO format)'
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
  },

  // Service Call tools
  {
    name: 'autotask_get_service_call',
    description: 'Get a specific service call by ID',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallId: {
          type: 'number',
          description: 'The service call ID to retrieve'
        }
      },
      required: ['serviceCallId']
    }
  },
  {
    name: 'autotask_search_service_calls',
    description: 'Search for service calls in Autotask. Filter by company, status, or date range.',
    inputSchema: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'Filter by company ID'
        },
        status: {
          type: 'number',
          description: 'Filter by status picklist ID (use autotask_get_field_info with entityType "ServiceCalls" to find valid values)'
        },
        startAfter: {
          type: 'string',
          description: 'Filter service calls starting on or after this date/time (ISO 8601 format)'
        },
        startBefore: {
          type: 'string',
          description: 'Filter service calls starting on or before this date/time (ISO 8601 format)'
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
    name: 'autotask_create_service_call',
    description: 'Create a new service call in Autotask. Service calls are used to schedule and plan work on tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the service call'
        },
        status: {
          type: 'number',
          description: 'Status picklist ID (use autotask_get_field_info with entityType "ServiceCalls" to find valid values)'
        },
        startDateTime: {
          type: 'string',
          description: 'Scheduled start date/time (ISO 8601 format, e.g. 2026-03-22T09:00:00Z)'
        },
        endDateTime: {
          type: 'string',
          description: 'Scheduled end date/time (ISO 8601 format)'
        },
        companyID: {
          type: 'number',
          description: 'Company ID this service call is for'
        },
        companyLocationID: {
          type: 'number',
          description: 'Company location ID (optional)'
        },
        complete: {
          type: 'boolean',
          description: 'Whether this service call is complete (default: false)'
        }
      },
      required: ['description', 'startDateTime', 'endDateTime']
    }
  },
  {
    name: 'autotask_update_service_call',
    description: 'Update an existing service call. Use this to change status, times, or description. To complete/close a service call, set complete: true or update the status.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallId: {
          type: 'number',
          description: 'The service call ID to update'
        },
        description: {
          type: 'string',
          description: 'Updated description'
        },
        status: {
          type: 'number',
          description: 'Updated status picklist ID'
        },
        startDateTime: {
          type: 'string',
          description: 'Updated start date/time (ISO 8601 format)'
        },
        endDateTime: {
          type: 'string',
          description: 'Updated end date/time (ISO 8601 format)'
        },
        complete: {
          type: 'boolean',
          description: 'Set to true to mark the service call as complete/closed'
        }
      },
      required: ['serviceCallId']
    }
  },
  {
    name: 'autotask_delete_service_call',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a service call ' +
      'and all associated data. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete service call (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallId: {
          type: 'number',
          description: 'The service call ID to delete'
        }
      },
      required: ['serviceCallId']
    }
  },

  // ServiceCallTicket tools
  {
    name: 'autotask_search_service_call_tickets',
    description: 'Search for ticket associations on service calls. Use this to find which tickets are linked to a service call, or which service calls contain a specific ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallId: {
          type: 'number',
          description: 'Filter by service call ID'
        },
        ticketId: {
          type: 'number',
          description: 'Filter by ticket ID'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_service_call_ticket',
    description: 'Link a ticket to a service call. This associates the ticket with the service call for scheduling purposes.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallID: {
          type: 'number',
          description: 'The service call ID to link the ticket to'
        },
        ticketID: {
          type: 'number',
          description: 'The ticket ID to link to the service call'
        }
      },
      required: ['serviceCallID', 'ticketID']
    }
  },
  {
    name: 'autotask_delete_service_call_ticket',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently removes a ticket ' +
      'association from a service call. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete service call ticket association (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallTicketId: {
          type: 'number',
          description: 'The service call ticket record ID to delete'
        }
      },
      required: ['serviceCallTicketId']
    }
  },

  // ServiceCallTicketResource tools
  {
    name: 'autotask_search_service_call_ticket_resources',
    description: 'Search for resource (technician) assignments on service call tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallTicketId: {
          type: 'number',
          description: 'Filter by service call ticket ID'
        },
        resourceId: {
          type: 'number',
          description: 'Filter by resource (technician) ID'
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default: 25)',
          minimum: 1,
          maximum: 100
        }
      },
      required: []
    }
  },
  {
    name: 'autotask_create_service_call_ticket_resource',
    description: 'Assign a resource (technician) to a service call ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallTicketID: {
          type: 'number',
          description: 'The service call ticket ID to assign the resource to'
        },
        resourceID: {
          type: 'number',
          description: 'The resource (technician) ID to assign'
        },
        roleID: {
          type: 'number',
          description: 'The role ID for the resource on this service call (optional)'
        }
      },
      required: ['serviceCallTicketID', 'resourceID']
    }
  },
  {
    name: 'autotask_delete_service_call_ticket_resource',
    description:
      '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently removes a resource ' +
      'assignment from a service call ticket. This action cannot be undone. ' +
      'Confirm with the user before invoking.',
    annotations: {
      title: 'Delete service call ticket resource assignment (irreversible)',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        serviceCallTicketResourceId: {
          type: 'number',
          description: 'The service call ticket resource record ID to delete'
        }
      },
      required: ['serviceCallTicketResourceId']
    }
  },

  // Contracts (write) and ContractServices CRUD
  {
    name: 'autotask_create_contract',
    description: 'Create a new Contract in Autotask. Field names match the Autotask REST API exactly. status: 1=In Effect, 0=Inactive. Dates are ISO format (YYYY-MM-DD).',
    inputSchema: {
      type: 'object',
      properties: {
        companyID: { type: 'number', description: 'Company ID the contract is associated with' },
        contractName: { type: 'string', description: 'Contract name' },
        contractType: { type: 'number', description: 'Contract type picklist ID' },
        contractCategory: { type: 'number', description: 'Contract category picklist ID' },
        startDate: { type: 'string', description: 'Contract start date (ISO YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Contract end date (ISO YYYY-MM-DD)' },
        contactID: { type: 'number', description: 'Primary contact ID for the contract' },
        contractNumber: { type: 'string', description: 'External-facing contract number' },
        contractPeriodType: { type: 'number', description: 'Period type picklist ID' },
        description: { type: 'string', description: 'Contract description / notes' },
        estimatedCost: { type: 'number', description: 'Estimated cost' },
        estimatedHours: { type: 'number', description: 'Estimated hours' },
        estimatedRevenue: { type: 'number', description: 'Estimated revenue' },
        setupFee: { type: 'number', description: 'Setup fee amount' },
        overageBillingRate: { type: 'number', description: 'Overage billing rate' },
        serviceLevelAgreementID: { type: 'number', description: 'SLA ID' },
        purchaseOrderNumber: { type: 'string', description: 'Customer purchase order number' },
        opportunityID: { type: 'number', description: 'Originating opportunity ID' },
        billingPreference: { type: 'number', description: 'Billing preference picklist ID' },
        billToCompanyID: { type: 'number', description: 'Bill-to company ID' },
        billToCompanyContactID: { type: 'number', description: 'Bill-to contact ID' },
        exclusionContractID: { type: 'number', description: 'Exclusion contract ID' },
        isDefaultContract: { type: 'boolean', description: 'Whether this is the default contract for the company' },
        internalCurrencySetupFee: { type: 'number', description: 'Setup fee in internal currency' },
        internalCurrencyOverageBillingRate: { type: 'number', description: 'Overage rate in internal currency' },
        organizationalLevelAssociationID: { type: 'number', description: 'Org level association ID' },
        contractExclusionSetID: { type: 'number', description: 'Contract exclusion set ID' },
        renewedContractID: { type: 'number', description: 'ID of the contract this renewed' },
        setupFeeBillingCodeID: { type: 'number', description: 'Billing code ID for the setup fee' },
        status: { type: 'number', description: 'Contract status (1=In Effect, 0=Inactive)' },
        timeReportingRequiresStartAndStopTimes: { type: 'number', description: 'Whether time entries require start/stop times' }
      },
      required: ['companyID', 'contractName', 'contractType', 'contractCategory', 'startDate', 'endDate']
    }
  },
  {
    name: 'autotask_update_contract',
    description: 'Update an existing Contract in Autotask (PATCH). Pass only fields you want to change; everything except id is optional. status: 1=In Effect, 0=Inactive.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Contract ID to update' },
        companyID: { type: 'number', description: 'Company ID' },
        contractName: { type: 'string', description: 'Contract name' },
        contractType: { type: 'number', description: 'Contract type picklist ID' },
        contractCategory: { type: 'number', description: 'Contract category picklist ID' },
        startDate: { type: 'string', description: 'Contract start date (ISO YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'Contract end date (ISO YYYY-MM-DD)' },
        contactID: { type: 'number', description: 'Primary contact ID' },
        contractNumber: { type: 'string', description: 'External-facing contract number' },
        contractPeriodType: { type: 'number', description: 'Period type picklist ID' },
        description: { type: 'string', description: 'Contract description / notes' },
        estimatedCost: { type: 'number', description: 'Estimated cost' },
        estimatedHours: { type: 'number', description: 'Estimated hours' },
        estimatedRevenue: { type: 'number', description: 'Estimated revenue' },
        setupFee: { type: 'number', description: 'Setup fee amount' },
        overageBillingRate: { type: 'number', description: 'Overage billing rate' },
        serviceLevelAgreementID: { type: 'number', description: 'SLA ID' },
        purchaseOrderNumber: { type: 'string', description: 'Customer purchase order number' },
        opportunityID: { type: 'number', description: 'Originating opportunity ID' },
        billingPreference: { type: 'number', description: 'Billing preference picklist ID' },
        billToCompanyID: { type: 'number', description: 'Bill-to company ID' },
        billToCompanyContactID: { type: 'number', description: 'Bill-to contact ID' },
        exclusionContractID: { type: 'number', description: 'Exclusion contract ID' },
        isDefaultContract: { type: 'boolean', description: 'Whether this is the default contract for the company' },
        internalCurrencySetupFee: { type: 'number', description: 'Setup fee in internal currency' },
        internalCurrencyOverageBillingRate: { type: 'number', description: 'Overage rate in internal currency' },
        organizationalLevelAssociationID: { type: 'number', description: 'Org level association ID' },
        contractExclusionSetID: { type: 'number', description: 'Contract exclusion set ID' },
        renewedContractID: { type: 'number', description: 'ID of the contract this renewed' },
        setupFeeBillingCodeID: { type: 'number', description: 'Billing code ID for the setup fee' },
        status: { type: 'number', description: 'Contract status (1=In Effect, 0=Inactive)' },
        timeReportingRequiresStartAndStopTimes: { type: 'number', description: 'Whether time entries require start/stop times' }
      },
      required: ['id']
    }
  },
  {
    name: 'autotask_create_contract_service',
    description: 'Add a ContractService (service line item) to an existing Contract.',
    inputSchema: {
      type: 'object',
      properties: {
        contractID: { type: 'number', description: 'Parent Contract ID' },
        serviceID: { type: 'number', description: 'Service catalog ID being attached to the contract' },
        unitPrice: { type: 'number', description: 'Unit price for the service line' },
        unitCost: { type: 'number', description: 'Unit cost for the service line' },
        quoteItemID: { type: 'number', description: 'Originating quote item ID, if any' },
        internalCurrencyUnitPrice: { type: 'number', description: 'Unit price in internal currency' },
        adjustedPrice: { type: 'number', description: 'Adjusted price' },
        invoiceDescription: { type: 'string', description: 'Override invoice description for this line' }
      },
      required: ['contractID', 'serviceID', 'unitPrice']
    }
  },
  {
    name: 'autotask_update_contract_service',
    description: 'Update an existing ContractService line on a Contract. Pass only fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ContractService record ID to update' },
        contractID: { type: 'number', description: 'Parent Contract ID' },
        serviceID: { type: 'number', description: 'Service catalog ID' },
        unitPrice: { type: 'number', description: 'Unit price for the service line' },
        unitCost: { type: 'number', description: 'Unit cost for the service line' },
        quoteItemID: { type: 'number', description: 'Originating quote item ID' },
        internalCurrencyUnitPrice: { type: 'number', description: 'Unit price in internal currency' },
        adjustedPrice: { type: 'number', description: 'Adjusted price' },
        invoiceDescription: { type: 'string', description: 'Override invoice description for this line' }
      },
      required: ['id', 'contractID']
    }
  },
  {
    name: 'autotask_raw_request',
    description: 'Escape hatch for Autotask REST endpoints not yet wrapped by a typed tool. Use sparingly — typed tools are preferred for safety. The existing Content-Type, Accept, ApiIntegrationcode, UserName, Secret headers are added automatically. The path is resolved against the zone-resolved base URL (https://webservices<N>.autotask.net/ATServicesRest/v1.0). Pass queryParams as a flat object of string/number/boolean values; they will be URL-encoded and appended to the path.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PATCH', 'DELETE'],
          description: 'HTTP method'
        },
        path: {
          type: 'string',
          description: 'Path under the Autotask REST v1.0 base (e.g. "/Companies/175" or "/Companies/query")'
        },
        body: {
          type: 'object',
          description: 'Optional JSON body for POST/PATCH requests',
          additionalProperties: true
        },
        queryParams: {
          type: 'object',
          description: 'Optional flat key-value query parameters (e.g. { includeFields: "id,name" })',
          additionalProperties: true
        }
      },
      required: ['method', 'path']
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
    tools: ['autotask_search_companies', 'autotask_create_company', 'autotask_update_company', 'autotask_get_company_site_configuration', 'autotask_update_company_site_configuration']
  },
  contacts: {
    description: 'Search and create contacts',
    tools: ['autotask_search_contacts', 'autotask_create_contact']
  },
  tickets: {
    description: 'Search, create, update tickets and manage ticket notes, attachments, and charges',
    tools: ['autotask_search_tickets', 'autotask_get_ticket_details', 'autotask_create_ticket', 'autotask_update_ticket', 'autotask_get_ticket_note', 'autotask_search_ticket_notes', 'autotask_create_ticket_note', 'autotask_get_ticket_attachment', 'autotask_search_ticket_attachments', 'autotask_create_ticket_attachment', 'autotask_get_ticket_charge', 'autotask_search_ticket_charges', 'autotask_create_ticket_charge', 'autotask_update_ticket_charge', 'autotask_delete_ticket_charge']
  },
  projects: {
    description: 'Search and create projects, tasks, phases, and project notes',
    tools: ['autotask_search_projects', 'autotask_create_project', 'autotask_search_tasks', 'autotask_create_task', 'autotask_list_phases', 'autotask_create_phase', 'autotask_get_project_note', 'autotask_search_project_notes', 'autotask_create_project_note']
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
  },
  service_calls: {
    description: 'Service call dispatching, ticket linking, and resource assignments',
    tools: ['autotask_search_service_calls', 'autotask_get_service_call', 'autotask_create_service_call', 'autotask_update_service_call', 'autotask_delete_service_call', 'autotask_search_service_call_tickets', 'autotask_create_service_call_ticket', 'autotask_delete_service_call_ticket', 'autotask_search_service_call_ticket_resources', 'autotask_create_service_call_ticket_resource', 'autotask_delete_service_call_ticket_resource']
  }
};
