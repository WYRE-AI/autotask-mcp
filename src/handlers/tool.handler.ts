// Autotask Tool Handler
// Handles MCP tool calls for Autotask operations (search, create, update)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { AutotaskService } from '../services/autotask.service.js';
import { PicklistCache, PicklistValue } from '../services/picklist.cache.js';
import { Logger } from '../utils/logger.js';
import { formatCompactResponse, detectEntityType, COMPACT_SEARCH_TOOLS } from '../utils/response.formatter.js';
import { MappingService } from '../utils/mapping.service.js';
import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from './tool.definitions.js';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export class AutotaskToolHandler {
  protected autotaskService: AutotaskService;
  protected logger: Logger;
  protected picklistCache: PicklistCache;
  protected mcpServer: Server | null = null;
  private mappingService: MappingService | null = null;
  private lazyLoading: boolean;

  constructor(autotaskService: AutotaskService, logger: Logger, lazyLoading = false) {
    this.autotaskService = autotaskService;
    this.logger = logger;
    this.lazyLoading = lazyLoading;
    this.picklistCache = new PicklistCache(
      logger,
      (entityType) => this.autotaskService.getFieldInfo(entityType)
    );
  }

  private async getMappingService(): Promise<MappingService> {
    if (!this.mappingService) {
      this.mappingService = await MappingService.getInstance(this.autotaskService, this.logger);
    }
    return this.mappingService;
  }

  /**
   * Enhance items by inlining company/resource names from IDs
   */
  private async enhanceItems(items: any[]): Promise<any[]> {
    try {
      const mappingService = await this.getMappingService();
      const enhanced = await Promise.allSettled(
        items.map(async (item) => {
          const result = { ...item };
          if (item.companyID != null && typeof item.companyID === 'number') {
            try {
              const name = await mappingService.getCompanyName(item.companyID);
              if (name) result.company = name;
            } catch { /* skip */ }
          }
          if (item.assignedResourceID != null && typeof item.assignedResourceID === 'number') {
            try {
              const name = await mappingService.getResourceName(item.assignedResourceID);
              if (name) result.assignedTo = name;
            } catch { /* skip */ }
          }
          if (item.projectLeadResourceID != null && typeof item.projectLeadResourceID === 'number') {
            try {
              const name = await mappingService.getResourceName(item.projectLeadResourceID);
              if (name) result.lead = name;
            } catch { /* skip */ }
          }
          return result;
        })
      );
      return enhanced
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (error) {
      this.logger.debug('Enhancement failed, returning original items:', error);
      return items;
    }
  }

  /**
   * Set the MCP server reference for elicitation support
   */
  setServer(server: Server): void {
    this.mcpServer = server;
  }

  /**
   * Elicit user input for a selection from picklist values.
   * Falls back to returning null if elicitation is not supported by the client.
   */
  protected async elicitSelection(
    message: string,
    fieldName: string,
    options: PicklistValue[]
  ): Promise<string | null> {
    if (!this.mcpServer) return null;

    try {
      const result = await this.mcpServer.elicitInput({
        message,
        requestedSchema: {
          type: 'object' as const,
          properties: {
            [fieldName]: {
              type: 'string' as const,
              title: fieldName,
              description: `Select a ${fieldName}`,
              enum: options.map(o => o.value),
              enumNames: options.map(o => o.label),
            }
          },
          required: [fieldName],
        }
      });

      if (result.action === 'accept' && result.content) {
        return result.content[fieldName] as string;
      }
      return null;
    } catch (error) {
      // Client likely doesn't support elicitation — not an error
      this.logger.debug(`Elicitation not available: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  /**
   * Elicit a date range filter when no filters are provided for ticket search.
   * Returns date filter params or null if elicitation is not available/dismissed.
   * Times out after 5 seconds to avoid blocking in non-interactive environments.
   */
  protected async elicitDateRange(): Promise<Record<string, string> | null> {
    if (!this.mcpServer) return null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('elicitation timeout')), 5000)
      );
      const result = await Promise.race([this.mcpServer.elicitInput({
        message: 'No filters specified. What date range would you like to search?',
        requestedSchema: {
          type: 'object' as const,
          properties: {
            dateRange: {
              type: 'string' as const,
              title: 'Date Range',
              description: 'How far back to search',
              enum: ['today', 'past_week', 'past_month', 'past_quarter', 'all'],
              enumNames: ['Today', 'Past Week', 'Past Month', 'Past Quarter', 'All Time'],
            }
          },
          required: ['dateRange'],
        }
      }), timeoutPromise]);

      if (result.action === 'accept' && result.content) {
        const range = result.content.dateRange as string;
        const now = new Date();
        let createdAfter: string | undefined;

        switch (range) {
          case 'today':
            createdAfter = now.toISOString().split('T')[0];
            break;
          case 'past_week':
            now.setDate(now.getDate() - 7);
            createdAfter = now.toISOString().split('T')[0];
            break;
          case 'past_month':
            now.setMonth(now.getMonth() - 1);
            createdAfter = now.toISOString().split('T')[0];
            break;
          case 'past_quarter':
            now.setMonth(now.getMonth() - 3);
            createdAfter = now.toISOString().split('T')[0];
            break;
          case 'all':
          default:
            return null; // No date filter
        }

        if (createdAfter) {
          return { createdAfter };
        }
      }
      return null;
    } catch (error) {
      this.logger.debug(`Date range elicitation not available: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  /**
   * Elicit a company name and resolve it to a companyId.
   * Returns the selected companyId or null if elicitation is unavailable/dismissed.
   */
  protected async elicitCompanyId(): Promise<number | null> {
    if (!this.mcpServer) return null;

    try {
      // First, ask for the company name
      const nameResult = await this.mcpServer.elicitInput({
        message: 'No company specified. What company is this quote for?',
        requestedSchema: {
          type: 'object' as const,
          properties: {
            companyName: {
              type: 'string' as const,
              title: 'Company Name',
              description: 'Enter the company name to search for',
            }
          },
          required: ['companyName'],
        }
      });

      if (nameResult.action !== 'accept' || !nameResult.content?.companyName) {
        return null;
      }

      const searchTerm = nameResult.content.companyName as string;
      const companies = await this.autotaskService.searchCompanies({ searchTerm });

      if (companies.length === 0) {
        this.logger.debug(`No companies found matching "${searchTerm}"`);
        return null;
      }

      if (companies.length === 1 && companies[0].id) {
        return companies[0].id;
      }

      // Multiple results — let user pick
      const options: PicklistValue[] = companies
        .filter(c => c.id != null)
        .map(c => ({
          value: String(c.id),
          label: c.companyName || `Company #${c.id}`,
        }));

      const selected = await this.elicitSelection(
        `Found ${companies.length} companies matching "${searchTerm}". Which one?`,
        'companyId',
        options
      );

      return selected ? Number(selected) : null;
    } catch (error) {
      this.logger.debug(`Company elicitation not available: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  /**
   * Elicit a service or product selection when creating a quote item without explicit IDs.
   * Searches both services and products by name, presents a combined list.
   * Returns { serviceID, productID } or null.
   */
  protected async elicitItemSelection(
    name: string
  ): Promise<{ serviceID?: number; productID?: number } | null> {
    if (!this.mcpServer) return null;

    try {
      const [services, products] = await Promise.all([
        this.autotaskService.searchServices({ searchTerm: name, isActive: true }),
        this.autotaskService.searchProducts({ searchTerm: name, isActive: true }),
      ]);

      const options: PicklistValue[] = [];

      for (const svc of services) {
        if (svc.id == null) continue;
        const price = svc.unitPrice != null ? ` ($${svc.unitPrice.toFixed(2)})` : '';
        options.push({
          value: `service:${svc.id}`,
          label: `Service: ${svc.name || `#${svc.id}`}${price}`,
        });
      }

      for (const prod of products) {
        if (prod.id == null) continue;
        const price = prod.unitPrice != null ? ` ($${prod.unitPrice.toFixed(2)})` : '';
        options.push({
          value: `product:${prod.id}`,
          label: `Product: ${prod.name || `#${prod.id}`}${price}`,
        });
      }

      if (options.length === 0) return null;

      const selected = await this.elicitSelection(
        `Found ${options.length} services/products matching "${name}". Which one should be used for this quote item?`,
        'itemSelection',
        options
      );

      if (!selected) return null;

      const [type, idStr] = selected.split(':');
      const id = Number(idStr);
      if (type === 'service') return { serviceID: id };
      if (type === 'product') return { productID: id };
      return null;
    } catch (error) {
      this.logger.debug(`Item elicitation not available: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  /**
   * Route a natural-language intent to the best matching tool with pre-filled parameters.
   */
  private routeIntent(rawIntent: string): {
    suggestedTool: string;
    suggestedParams: Record<string, any>;
    description: string;
    requiredParams: string[];
  } {
    // Extract quoted strings from original (preserves case) before lowercasing
    const quotedStrings = rawIntent.match(/["']([^"']+)["']/g)?.map(s => s.slice(1, -1)) || [];
    const intent = rawIntent.toLowerCase();

    // Extract potential IDs from the intent
    const numbers = intent.match(/\b\d+\b/g)?.map(Number) || [];

    // Extract hours pattern (e.g., "2 hours", "1.5 hrs")
    const hoursMatch = intent.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
    const hours = hoursMatch ? parseFloat(hoursMatch[1]) : undefined;

    // Decision tree based on keyword matching
    // Time tracking (check BEFORE tickets — "log hours on ticket" should route here, not to tickets)
    if (/\b(?:hours?|hrs?)\b/.test(intent) && /\b(?:log|enter|add|record|track|create)\b/.test(intent)) {
      const params: Record<string, any> = {};
      if (hours) params.hoursWorked = hours;
      // Look for ticket ID pattern
      const ticketIdMatch = intent.match(/ticket\s*#?\s*(\d+)/i) || intent.match(/on\s+(\d+)/);
      if (ticketIdMatch) params.ticketID = parseInt(ticketIdMatch[1]);
      else if (numbers[0] && !hours) params.ticketID = numbers[0];
      else if (numbers.length > 1) params.ticketID = numbers.find(n => n > 100) || numbers[1]; // larger numbers are likely ticket IDs
      return {
        suggestedTool: 'autotask_create_time_entry',
        suggestedParams: params,
        description: 'Log a time entry',
        requiredParams: [...(!params.ticketID ? ['ticketID'] : []), ...(!params.hoursWorked ? ['hoursWorked'] : [])],
      };
    }

    // Ticket operations
    if (/\b(?:tickets?|issues?|requests?)\b/.test(intent)) {
      if (/\b(?:create|open|new|submit)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (numbers[0]) params.companyId = numbers[0];
        if (quotedStrings[0]) params.title = quotedStrings[0];
        return {
          suggestedTool: 'autotask_create_ticket',
          suggestedParams: params,
          description: 'Create a new service ticket',
          requiredParams: [...(!params.companyId ? ['companyId'] : []), ...(!params.title ? ['title'] : [])],
        };
      }
      if (/\b(?:update|change|modify|edit|assign|reassign|close)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (numbers[0]) params.ticketId = numbers[0];
        return {
          suggestedTool: 'autotask_update_ticket',
          suggestedParams: params,
          description: 'Update an existing ticket',
          requiredParams: !params.ticketId ? ['ticketId'] : [],
        };
      }
      if (/\b(?:details?|info|view|show|get)\b/.test(intent) && numbers[0]) {
        return {
          suggestedTool: 'autotask_get_ticket_details',
          suggestedParams: { ticketID: numbers[0], fullDetails: true },
          description: 'Get full ticket details by ID',
          requiredParams: [],
        };
      }
      if (/\b(?:notes?|comments?)\b/.test(intent)) {
        if (/\b(?:add|create|post)\b/.test(intent)) {
          const params: Record<string, any> = {};
          if (numbers[0]) params.ticketId = numbers[0];
          return {
            suggestedTool: 'autotask_create_ticket_note',
            suggestedParams: params,
            description: 'Add a note to a ticket',
            requiredParams: [...(!params.ticketId ? ['ticketId'] : []), 'title', 'description'],
          };
        }
        const params: Record<string, any> = {};
        if (numbers[0]) params.ticketId = numbers[0];
        return {
          suggestedTool: 'autotask_search_ticket_notes',
          suggestedParams: params,
          description: 'List notes on a ticket',
          requiredParams: !params.ticketId ? ['ticketId'] : [],
        };
      }
      // Default: search tickets
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      else if (/for\s+(\w[\w\s]*?)(?:\.|$|,)/i.test(intent)) {
        const match = intent.match(/for\s+(\w[\w\s]*?)(?:\.|$|,)/i);
        if (match) params.searchTerm = match[1].trim();
      }
      if (numbers[0]) params.companyID = numbers[0];
      return {
        suggestedTool: 'autotask_search_tickets',
        suggestedParams: params,
        description: 'Search for tickets',
        requiredParams: [],
      };
    }

    // Quote operations (check before company — "quote for client" should match quote, not company)
    if (/\b(?:quotes?|proposals?|estimates?)\b/.test(intent)) {
      if (/\b(?:item|line|add.*to)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (numbers[0]) params.quoteId = numbers[0];
        return {
          suggestedTool: 'autotask_create_quote_item',
          suggestedParams: params,
          description: 'Add a line item to a quote',
          requiredParams: [...(!params.quoteId ? ['quoteId'] : []), 'name', 'quantity', 'unitPrice'],
        };
      }
      if (/\b(?:create|new|build)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (quotedStrings[0]) params.name = quotedStrings[0];
        return {
          suggestedTool: 'autotask_create_quote',
          suggestedParams: params,
          description: 'Create a new quote',
          requiredParams: [...(!params.name ? ['name'] : []), 'companyId'],
        };
      }
      const params: Record<string, any> = {};
      if (numbers[0]) params.quoteId = numbers[0];
      return {
        suggestedTool: numbers[0] ? 'autotask_get_quote' : 'autotask_search_quotes',
        suggestedParams: params,
        description: numbers[0] ? 'Get quote details' : 'Search for quotes',
        requiredParams: [],
      };
    }

    // Company operations
    if (/\b(?:company|companies|organization|client|account)\b/.test(intent)) {
      if (/\b(?:create|new|add)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (quotedStrings[0]) params.companyName = quotedStrings[0];
        return {
          suggestedTool: 'autotask_create_company',
          suggestedParams: params,
          description: 'Create a new company',
          requiredParams: !params.companyName ? ['companyName'] : [],
        };
      }
      if (/\b(?:update|edit|modify)\b/.test(intent)) {
        const params: Record<string, any> = {};
        if (numbers[0]) params.id = numbers[0];
        return {
          suggestedTool: 'autotask_update_company',
          suggestedParams: params,
          description: 'Update company details',
          requiredParams: !params.id ? ['id'] : [],
        };
      }
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      return {
        suggestedTool: 'autotask_search_companies',
        suggestedParams: params,
        description: 'Search for companies',
        requiredParams: [],
      };
    }

    // Contact operations
    if (/\b(?:contacts?|person|people)\b/.test(intent)) {
      if (/\b(?:create|new|add)\b/.test(intent)) {
        return {
          suggestedTool: 'autotask_create_contact',
          suggestedParams: {},
          description: 'Create a new contact',
          requiredParams: ['firstName', 'lastName', 'companyID'],
        };
      }
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      return {
        suggestedTool: 'autotask_search_contacts',
        suggestedParams: params,
        description: 'Search for contacts',
        requiredParams: [],
      };
    }

    // Project operations
    if (/\b(?:projects?)\b/.test(intent)) {
      if (/\b(?:create|new)\b/.test(intent)) {
        return {
          suggestedTool: 'autotask_create_project',
          suggestedParams: {},
          description: 'Create a new project',
          requiredParams: ['projectName', 'companyID'],
        };
      }
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      return {
        suggestedTool: 'autotask_search_projects',
        suggestedParams: params,
        description: 'Search for projects',
        requiredParams: [],
      };
    }

    // Resource operations
    if (/\b(?:resource|technician|tech|engineer|staff)\b/.test(intent)) {
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      return {
        suggestedTool: 'autotask_search_resources',
        suggestedParams: params,
        description: 'Search for resources/technicians',
        requiredParams: [],
      };
    }

    // Expense operations
    if (/\b(?:expense|receipt)\b/.test(intent)) {
      if (/\b(?:create|new|submit)\b/.test(intent)) {
        return {
          suggestedTool: 'autotask_create_expense_report',
          suggestedParams: {},
          description: 'Create an expense report',
          requiredParams: ['name', 'submitterId', 'weekEndingDate'],
        };
      }
      return {
        suggestedTool: 'autotask_search_expense_reports',
        suggestedParams: {},
        description: 'Search expense reports',
        requiredParams: [],
      };
    }

    // Configuration items / assets
    if (/\b(?:config|asset|device|hardware|ci)\b/.test(intent)) {
      const params: Record<string, any> = {};
      if (quotedStrings[0]) params.searchTerm = quotedStrings[0];
      return {
        suggestedTool: 'autotask_search_configuration_items',
        suggestedParams: params,
        description: 'Search configuration items/assets',
        requiredParams: [],
      };
    }

    // Product/service catalog
    if (/\b(?:product|service|bundle|catalog)\b/.test(intent)) {
      if (/\b(?:bundle)\b/.test(intent)) {
        return {
          suggestedTool: 'autotask_search_service_bundles',
          suggestedParams: {},
          description: 'Search service bundles',
          requiredParams: [],
        };
      }
      if (/\b(?:service)\b/.test(intent)) {
        return {
          suggestedTool: 'autotask_search_services',
          suggestedParams: {},
          description: 'Search services',
          requiredParams: [],
        };
      }
      return {
        suggestedTool: 'autotask_search_products',
        suggestedParams: {},
        description: 'Search products',
        requiredParams: [],
      };
    }

    // Contract operations
    if (/\b(?:contract|agreement)\b/.test(intent)) {
      return {
        suggestedTool: 'autotask_search_contracts',
        suggestedParams: {},
        description: 'Search contracts',
        requiredParams: [],
      };
    }

    // Invoice operations
    if (/\b(?:invoice|bill|billing)\b/.test(intent)) {
      return {
        suggestedTool: 'autotask_search_invoices',
        suggestedParams: {},
        description: 'Search invoices',
        requiredParams: [],
      };
    }

    // Field info / picklist
    if (/\b(?:field|picklist|dropdown|options)\b/.test(intent)) {
      const entityMatch = intent.match(/(?:for|on|of)\s+(\w+)/i);
      return {
        suggestedTool: 'autotask_get_field_info',
        suggestedParams: entityMatch ? { entityType: entityMatch[1] } : {},
        description: 'Get field definitions and picklist values',
        requiredParams: entityMatch ? [] : ['entityType'],
      };
    }

    // Queue / status / priority lookups
    if (/\b(?:queue|status|statuses|priorit)\b/.test(intent)) {
      if (/\bqueue\b/.test(intent)) return { suggestedTool: 'autotask_list_queues', suggestedParams: {}, description: 'List ticket queues', requiredParams: [] };
      if (/\bstatus\b/.test(intent)) return { suggestedTool: 'autotask_list_ticket_statuses', suggestedParams: {}, description: 'List ticket statuses', requiredParams: [] };
      return { suggestedTool: 'autotask_list_ticket_priorities', suggestedParams: {}, description: 'List ticket priorities', requiredParams: [] };
    }

    // Connection test
    if (/\b(?:test|connect|connection|ping|health)\b/.test(intent)) {
      return {
        suggestedTool: 'autotask_test_connection',
        suggestedParams: {},
        description: 'Test API connection',
        requiredParams: [],
      };
    }

    // Fallback: suggest list_categories
    return {
      suggestedTool: 'autotask_list_categories',
      suggestedParams: {},
      description: 'Could not determine intent. Use autotask_list_categories to discover available tool categories.',
      requiredParams: [],
    };
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<McpTool[]> {
    if (this.lazyLoading) {
      // In lazy loading mode, only expose the 3 meta-tools
      const metaTools = TOOL_DEFINITIONS.filter(t =>
        t.name === 'autotask_list_categories' ||
        t.name === 'autotask_list_category_tools' ||
        t.name === 'autotask_execute_tool' ||
        t.name === 'autotask_router'
      );
      this.logger.debug(`Lazy loading mode: exposing ${metaTools.length} meta-tools (${TOOL_DEFINITIONS.length} total available)`);
      return metaTools;
    }
    this.logger.debug(`Listed ${TOOL_DEFINITIONS.length} available tools`);
    return TOOL_DEFINITIONS;
  }

  /**
   * Dispatch table: maps tool names to handler functions
   */
  private getDispatchTable(): Map<string, (args: any) => Promise<{ result: any; message: string }>> {
    const s = this.autotaskService;
    type H = (args: any) => Promise<{ result: any; message: string }>;
    return new Map<string, H>([
      // Connection
      ['autotask_test_connection', async () => {
        const ok = await s.testConnection();
        return { result: { success: ok }, message: ok ? 'Successfully connected to Autotask API' : 'Connection failed' };
      }],

      // Companies
      ['autotask_search_companies', async (a) => {
        const r = await s.searchCompanies(a); return { result: r, message: `Found ${r.length} companies` };
      }],
      ['autotask_create_company', async (a) => {
        const id = await s.createCompany(a); return { result: id, message: `Successfully created company with ID: ${id}` };
      }],
      ['autotask_update_company', async (a) => {
        await s.updateCompany(a.id, a); return { result: undefined, message: `Successfully updated company ID: ${a.id}` };
      }],

      // Contacts
      ['autotask_search_contacts', async (a) => {
        const r = await s.searchContacts(a); return { result: r, message: `Found ${r.length} contacts` };
      }],
      ['autotask_create_contact', async (a) => {
        const id = await s.createContact(a); return { result: id, message: `Successfully created contact with ID: ${id}` };
      }],

      // Tickets
      ['autotask_search_tickets', async (a) => {
        // Elicitation for zero-filter ticket searches
        const hasFilters = a.searchTerm || a.companyID || a.status !== undefined ||
          a.assignedResourceID || a.unassigned || a.createdAfter || a.createdBefore || a.lastActivityAfter;
        if (!hasFilters && this.mcpServer) {
          const dateChoice = await this.elicitDateRange();
          if (dateChoice) a = { ...a, ...dateChoice };
        }
        const { companyID, ...rest } = a;
        const opts = { ...rest, ...(companyID !== undefined && { companyId: companyID }) };
        const r = await s.searchTickets(opts);
        return { result: r, message: `Found ${r.length} tickets` };
      }],
      ['autotask_get_ticket_details', async (a) => {
        const r = await s.getTicket(a.ticketID, a.fullDetails); return { result: r, message: 'Ticket details retrieved successfully' };
      }],
      ['autotask_create_ticket', async (a) => {
        const id = await s.createTicket(a); return { result: id, message: `Successfully created ticket with ID: ${id}` };
      }],
      ['autotask_update_ticket', async (a) => {
        const { ticketId, ...updates } = a;
        await s.updateTicket(ticketId, updates);
        return { result: ticketId, message: `Successfully updated ticket ${ticketId}` };
      }],

      // Time entries
      ['autotask_create_time_entry', async (a) => {
        const id = await s.createTimeEntry(a); return { result: id, message: `Successfully created time entry with ID: ${id}` };
      }],

      // Projects
      ['autotask_search_projects', async (a) => {
        const r = await s.searchProjects(a); return { result: r, message: `Found ${r.length} projects` };
      }],
      ['autotask_create_project', async (a) => {
        const id = await s.createProject(a); return { result: id, message: `Successfully created project with ID: ${id}` };
      }],

      // Resources
      ['autotask_search_resources', async (a) => {
        const r = await s.searchResources(a); return { result: r, message: `Found ${r.length} resources` };
      }],

      // Configuration Items
      ['autotask_search_configuration_items', async (a) => {
        const r = await s.searchConfigurationItems(a); return { result: r, message: `Found ${r.length} configuration items` };
      }],

      // Contracts
      ['autotask_search_contracts', async (a) => {
        const r = await s.searchContracts(a); return { result: r, message: `Found ${r.length} contracts` };
      }],

      // Invoices
      ['autotask_search_invoices', async (a) => {
        const r = await s.searchInvoices(a); return { result: r, message: `Found ${r.length} invoices` };
      }],

      // Tasks
      ['autotask_search_tasks', async (a) => {
        const r = await s.searchTasks(a); return { result: r, message: `Found ${r.length} tasks` };
      }],
      ['autotask_create_task', async (a) => {
        const id = await s.createTask(a); return { result: id, message: `Successfully created task with ID: ${id}` };
      }],

      // Notes (ticket/project/company)
      ['autotask_get_ticket_note', async (a) => {
        const r = await s.getTicketNote(a.ticketId, a.noteId); return { result: r, message: 'Ticket note retrieved successfully' };
      }],
      ['autotask_search_ticket_notes', async (a) => {
        const r = await s.searchTicketNotes(a.ticketId, { pageSize: a.pageSize }); return { result: r, message: `Found ${r.length} ticket notes` };
      }],
      ['autotask_create_ticket_note', async (a) => {
        const id = await s.createTicketNote(a.ticketId, { title: a.title, description: a.description, noteType: a.noteType, publish: a.publish });
        return { result: id, message: `Successfully created ticket note with ID: ${id}` };
      }],
      ['autotask_get_project_note', async (a) => {
        const r = await s.getProjectNote(a.projectId, a.noteId); return { result: r, message: 'Project note retrieved successfully' };
      }],
      ['autotask_search_project_notes', async (a) => {
        const r = await s.searchProjectNotes(a.projectId, { pageSize: a.pageSize }); return { result: r, message: `Found ${r.length} project notes` };
      }],
      ['autotask_create_project_note', async (a) => {
        const id = await s.createProjectNote(a.projectId, { title: a.title, description: a.description, noteType: a.noteType });
        return { result: id, message: `Successfully created project note with ID: ${id}` };
      }],
      ['autotask_get_company_note', async (a) => {
        const r = await s.getCompanyNote(a.companyId, a.noteId); return { result: r, message: 'Company note retrieved successfully' };
      }],
      ['autotask_search_company_notes', async (a) => {
        const r = await s.searchCompanyNotes(a.companyId, { pageSize: a.pageSize }); return { result: r, message: `Found ${r.length} company notes` };
      }],
      ['autotask_create_company_note', async (a) => {
        const id = await s.createCompanyNote(a.companyId, { title: a.title, description: a.description, actionType: a.actionType });
        return { result: id, message: `Successfully created company note with ID: ${id}` };
      }],

      // Attachments
      ['autotask_get_ticket_attachment', async (a) => {
        const r = await s.getTicketAttachment(a.ticketId, a.attachmentId, a.includeData); return { result: r, message: 'Ticket attachment retrieved successfully' };
      }],
      ['autotask_search_ticket_attachments', async (a) => {
        const r = await s.searchTicketAttachments(a.ticketId, { pageSize: a.pageSize }); return { result: r, message: `Found ${r.length} ticket attachments` };
      }],

      // Expense Reports
      ['autotask_get_expense_report', async (a) => {
        const r = await s.getExpenseReport(a.reportId); return { result: r, message: 'Expense report retrieved successfully' };
      }],
      ['autotask_search_expense_reports', async (a) => {
        const r = await s.searchExpenseReports({ submitterId: a.submitterId, status: a.status, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} expense reports` };
      }],
      ['autotask_create_expense_report', async (a) => {
        const id = await s.createExpenseReport({ name: a.name, description: a.description, submitterID: a.submitterId, weekEnding: a.weekEndingDate || a.weekEnding });
        return { result: id, message: `Successfully created expense report with ID: ${id}` };
      }],

      // Expense Items
      ['autotask_create_expense_item', async (a) => {
        const id = await s.createExpenseItem({ expenseReportID: a.expenseReportId, description: a.description, expenseDate: a.expenseDate, expenseCategory: a.expenseCategory, expenseCurrencyExpenseAmount: a.amount, companyID: a.companyId ?? 0, haveReceipt: a.haveReceipt ?? false, isBillableToCompany: a.isBillableToCompany ?? false, isReimbursable: a.isReimbursable ?? true, paymentType: a.paymentType ?? 10 });
        return { result: id, message: `Successfully created expense item with ID: ${id}` };
      }],

      // Quotes
      ['autotask_get_quote', async (a) => {
        const r = await s.getQuote(a.quoteId); return { result: r, message: 'Quote retrieved successfully' };
      }],
      ['autotask_search_quotes', async (a) => {
        const r = await s.searchQuotes({ companyId: a.companyId, contactId: a.contactId, opportunityId: a.opportunityId, searchTerm: a.searchTerm, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} quotes` };
      }],
      ['autotask_create_quote', async (a) => {
        // Elicit company if not provided
        if (!a.companyId && this.mcpServer) {
          try {
            const companyId = await this.elicitCompanyId();
            if (companyId) a = { ...a, companyId: companyId };
          } catch { /* proceed without company */ }
        }

        // Elicit opportunity if not provided but company is known
        if (!a.opportunityId && a.companyId && this.mcpServer) {
          try {
            const opps = await s.searchOpportunities({ companyId: a.companyId });
            if (opps.length > 0) {
              const options: PicklistValue[] = opps
                .filter(o => o.id != null)
                .map(o => ({
                  value: String(o.id),
                  label: o.title || `Opportunity #${o.id}`,
                }));
              const selected = await this.elicitSelection(
                `Found ${opps.length} opportunities for this company. Which one should the quote be attached to?`,
                'opportunityId',
                options
              );
              if (selected) a = { ...a, opportunityId: Number(selected) };
            }
          } catch { /* proceed without opportunity */ }
        }

        const id = await s.createQuote({ name: a.name, description: a.description, companyID: a.companyId, contactID: a.contactId, opportunityID: a.opportunityId, effectiveDate: a.effectiveDate, expirationDate: a.expirationDate });
        return { result: id, message: `Successfully created quote with ID: ${id}` };
      }],

      // Opportunities
      ['autotask_get_opportunity', async (a) => {
        const r = await s.getOpportunity(a.opportunityId); return { result: r, message: 'Opportunity retrieved successfully' };
      }],
      ['autotask_search_opportunities', async (a) => {
        const r = await s.searchOpportunities({ companyId: a.companyId, searchTerm: a.searchTerm, status: a.status, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} opportunities` };
      }],
      ['autotask_create_opportunity', async (a) => {
        const id = await s.createOpportunity({ title: a.title, companyID: a.companyId, ownerResourceID: a.ownerResourceId, status: a.status, stage: a.stage, projectedCloseDate: a.projectedCloseDate, startDate: a.startDate, probability: a.probability ?? 50, amount: a.amount ?? 0, cost: a.cost ?? 0, useQuoteTotals: a.useQuoteTotals ?? true, totalAmountMonths: a.totalAmountMonths, contactID: a.contactId, description: a.description, opportunityCategoryID: a.opportunityCategoryID });
        return { result: id, message: `Successfully created opportunity with ID: ${id}` };
      }],

      // Products
      ['autotask_get_product', async (a) => {
        const r = await s.getProduct(a.productId); return { result: r, message: 'Product retrieved successfully' };
      }],
      ['autotask_search_products', async (a) => {
        const r = await s.searchProducts({ searchTerm: a.searchTerm, isActive: a.isActive, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} products` };
      }],

      // Services
      ['autotask_get_service', async (a) => {
        const r = await s.getService(a.serviceId); return { result: r, message: 'Service retrieved successfully' };
      }],
      ['autotask_search_services', async (a) => {
        const r = await s.searchServices({ searchTerm: a.searchTerm, isActive: a.isActive, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} services` };
      }],

      // Service Bundles
      ['autotask_get_service_bundle', async (a) => {
        const r = await s.getServiceBundle(a.serviceBundleId); return { result: r, message: 'Service bundle retrieved successfully' };
      }],
      ['autotask_search_service_bundles', async (a) => {
        const r = await s.searchServiceBundles({ searchTerm: a.searchTerm, isActive: a.isActive, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} service bundles` };
      }],

      // Quote Items
      ['autotask_get_quote_item', async (a) => {
        const r = await s.getQuoteItem(a.quoteItemId); return { result: r, message: 'Quote item retrieved successfully' };
      }],
      ['autotask_search_quote_items', async (a) => {
        const r = await s.searchQuoteItems({ quoteId: a.quoteId, searchTerm: a.searchTerm, pageSize: a.pageSize });
        return { result: r, message: `Found ${r.length} quote items` };
      }],
      ['autotask_create_quote_item', async (a) => {
        // Elicit service/product selection when no ID is provided but name is available
        if (!a.serviceID && !a.productID && !a.serviceBundleID && a.name && this.mcpServer) {
          try {
            const itemChoice = await this.elicitItemSelection(a.name);
            if (itemChoice) a = { ...a, ...itemChoice };
          } catch { /* proceed as cost-type item */ }
        }

        const id = await s.createQuoteItem({ quoteID: a.quoteId, name: a.name, description: a.description, quantity: a.quantity, unitPrice: a.unitPrice, unitCost: a.unitCost, unitDiscount: a.unitDiscount, lineDiscount: a.lineDiscount, percentageDiscount: a.percentageDiscount, isOptional: a.isOptional, serviceID: a.serviceID, productID: a.productID, serviceBundleID: a.serviceBundleID, sortOrderID: a.sortOrderID, quoteItemType: a.quoteItemType });
        return { result: id, message: `Successfully created quote item with ID: ${id}` };
      }],
      ['autotask_update_quote_item', async (a) => {
        await s.updateQuoteItem(a.quoteItemId, { quantity: a.quantity, unitPrice: a.unitPrice, unitDiscount: a.unitDiscount, lineDiscount: a.lineDiscount, percentageDiscount: a.percentageDiscount, isOptional: a.isOptional, sortOrderID: a.sortOrderID });
        return { result: true, message: `Quote item ${a.quoteItemId} updated successfully` };
      }],
      ['autotask_delete_quote_item', async (a) => {
        await s.deleteQuoteItem(a.quoteId, a.quoteItemId); return { result: true, message: `Quote item ${a.quoteItemId} deleted successfully` };
      }],

      // Picklist tools
      ['autotask_list_queues', async () => {
        const queues = await this.picklistCache.getQueues();
        return { result: queues.map(q => ({ id: q.value, name: q.label, isActive: q.isActive })), message: `Found ${queues.length} queues` };
      }],
      ['autotask_list_ticket_statuses', async () => {
        const statuses = await this.picklistCache.getTicketStatuses();
        return { result: statuses.map(s => ({ id: s.value, name: s.label, isActive: s.isActive })), message: `Found ${statuses.length} ticket statuses` };
      }],
      ['autotask_list_ticket_priorities', async () => {
        const priorities = await this.picklistCache.getTicketPriorities();
        return { result: priorities.map(p => ({ id: p.value, name: p.label, isActive: p.isActive })), message: `Found ${priorities.length} ticket priorities` };
      }],
      ['autotask_get_field_info', async (a) => {
        const fields = await this.picklistCache.getFields(a.entityType);
        if (a.fieldName) {
          const field = fields.find(f => f.name.toLowerCase() === a.fieldName.toLowerCase());
          return { result: field || null, message: field ? `Field info for ${a.entityType}.${a.fieldName}` : `Field '${a.fieldName}' not found on ${a.entityType}` };
        }
        const summary = fields.map(f => ({ name: f.name, dataType: f.dataType, isRequired: f.isRequired, isPickList: f.isPickList, isQueryable: f.isQueryable, picklistValueCount: f.picklistValues?.length || 0 }));
        return { result: summary, message: `Found ${fields.length} fields for ${a.entityType}` };
      }],

      // Billing Items (Approve and Post workflow)
      ['autotask_search_billing_items', async (a) => {
        const r = await s.searchBillingItems({
          companyId: a.companyId,
          ticketId: a.ticketId,
          projectId: a.projectId,
          contractId: a.contractId,
          invoiceId: a.invoiceId,
          postedAfter: a.postedAfter,
          postedBefore: a.postedBefore,
          page: a.page,
          pageSize: a.pageSize
        } as any);
        return { result: r, message: `Found ${r.length} billing items` };
      }],
      ['autotask_get_billing_item', async (a) => {
        const r = await s.getBillingItem(a.billingItemId);
        return { result: r, message: 'Billing item retrieved successfully' };
      }],

      // Billing Item Approval Levels
      ['autotask_search_billing_item_approval_levels', async (a) => {
        const r = await s.searchBillingItemApprovalLevels({
          timeEntryId: a.timeEntryId,
          approvalResourceId: a.approvalResourceId,
          approvalLevel: a.approvalLevel,
          approvedAfter: a.approvedAfter,
          approvedBefore: a.approvedBefore,
          page: a.page,
          pageSize: a.pageSize
        } as any);
        return { result: r, message: `Found ${r.length} billing item approval levels` };
      }],

      // Time Entries
      ['autotask_search_time_entries', async (a) => {
        const r = await s.searchTimeEntries({
          resourceId: a.resourceId,
          ticketId: a.ticketId,
          projectId: a.projectId,
          taskId: a.taskId,
          approvalStatus: a.approvalStatus,
          billable: a.billable,
          dateWorkedAfter: a.dateWorkedAfter,
          dateWorkedBefore: a.dateWorkedBefore,
          page: a.page,
          pageSize: a.pageSize
        } as any);
        return { result: r, message: `Found ${r.length} time entries` };
      }],

      // Meta-tools for progressive discovery
      ['autotask_list_categories', async () => {
        const categories = Object.entries(TOOL_CATEGORIES).map(([name, cat]) => ({
          name,
          description: cat.description,
          toolCount: cat.tools.length,
        }));
        return { result: categories, message: `Found ${categories.length} tool categories with ${Object.values(TOOL_CATEGORIES).reduce((sum, c) => sum + c.tools.length, 0)} total tools` };
      }],
      ['autotask_list_category_tools', async (a) => {
        const category = TOOL_CATEGORIES[a.category];
        if (!category) {
          const available = Object.keys(TOOL_CATEGORIES).join(', ');
          throw new Error(`Unknown category "${a.category}". Available: ${available}`);
        }
        const tools = TOOL_DEFINITIONS.filter(t => category.tools.includes(t.name));
        return { result: tools, message: `Found ${tools.length} tools in "${a.category}" category` };
      }],
      ['autotask_execute_tool', async (a) => {
        const toolName = a.toolName;
        const toolArgs = a.arguments || {};
        const handler = this.getDispatchTable().get(toolName);
        if (!handler) throw new Error(`Unknown tool: ${toolName}`);
        // Prevent recursive meta-tool calls
        if (toolName === 'autotask_execute_tool') throw new Error('Cannot recursively execute autotask_execute_tool');
        return handler(toolArgs);
      }],

      // Intent-based router
      ['autotask_router', async (a) => {
        const rawIntent = a.intent || '';
        const suggestion = this.routeIntent(rawIntent);
        return { result: suggestion, message: `Suggested tool: ${suggestion.suggestedTool}` };
      }],
    ]);
  }

  /**
   * Call a tool with the given arguments
   */
  async callTool(name: string, args: Record<string, any>): Promise<McpToolResult> {
    this.logger.debug(`Calling tool: ${name}`, args);

    try {
      const handler = this.getDispatchTable().get(name);
      if (!handler) throw new Error(`Unknown tool: ${name}`);

      const { result, message } = await handler(args);

      // Format and enhance response
      let responseText: string;
      if (COMPACT_SEARCH_TOOLS.has(name) && Array.isArray(result)) {
        const entityType = detectEntityType(name);
        if (entityType) {
          const compact = formatCompactResponse(result, entityType, {
            page: args.page,
            pageSize: args.pageSize,
          });
          compact.items = await this.enhanceItems(compact.items);
          responseText = JSON.stringify(compact);
        } else {
          const enhanced = await this.enhanceItems(result);
          responseText = JSON.stringify({ message, data: enhanced });
        }
      } else if (Array.isArray(result)) {
        const enhanced = await this.enhanceItems(result);
        responseText = JSON.stringify({ message, data: enhanced });
      } else if (result && typeof result === 'object' && !Array.isArray(result)) {
        const enhanced = await this.enhanceItems([result]);
        responseText = JSON.stringify({ message, data: enhanced[0] || result });
      } else {
        responseText = JSON.stringify({ message, data: result });
      }

      this.logger.debug(`Successfully executed tool: ${name}`);
      return { content: [{ type: 'text', text: responseText }] };

    } catch (error) {
      this.logger.error(`Tool execution failed for ${name}:`, error);
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', tool: name }) }],
        isError: true
      };
    }
  }
} 