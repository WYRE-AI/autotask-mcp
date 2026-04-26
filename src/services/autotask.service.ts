// Autotask Service Layer
// Talks to the Autotask REST API via AutotaskHttpClient (native fetch).
//
// This file used to wrap the autotask-node SDK. The SDK gets multiple URL
// shapes wrong (PATCH /{Entity}/{id} → 405, several GETs → 404, list()
// silently drops filters), so we now bypass it entirely. Zero new runtime
// deps — only Node 18+ built-in `fetch` via AutotaskHttpClient.

import { resolveAutotaskApiUrl } from '../utils/config';
import { AutotaskHttpClient, QueryFilter } from './autotask-http';
import {
  AutotaskCompany,
  AutotaskContact,
  AutotaskTicket,
  AutotaskTimeEntry,
  AutotaskProject,
  AutotaskResource,
  AutotaskConfigurationItem,
  AutotaskContract,
  AutotaskInvoice,
  AutotaskTask,
  AutotaskQueryOptions,
  AutotaskTicketNote,
  AutotaskProjectNote,
  AutotaskCompanyNote,
  AutotaskTicketAttachment,
  AutotaskTicketChecklistItem,
  AutotaskTicketAttachmentCreateRequest,
  AutotaskExpenseReport,
  AutotaskExpenseItem,
  AutotaskQuote,
  AutotaskQuoteItem,
  AutotaskOpportunity,
  AutotaskProduct,
  AutotaskServiceEntity,
  AutotaskServiceBundle,
  AutotaskBillingCode,
  AutotaskDepartment,
  AutotaskQueryOptionsExtended,
  AutotaskBillingItem,
  AutotaskBillingItemApprovalLevel,
  AutotaskTicketCharge,
  AutotaskServiceCall,
  AutotaskServiceCallTicket,
  AutotaskServiceCallTicketResource,
  AutotaskPhase
} from '../types/autotask';
import { McpServerConfig } from '../types/mcp';
import { Logger } from '../utils/logger';
import { FieldInfo, PicklistValue } from './picklist.cache';

/**
 * Default "match all" filter required by Autotask for unconstrained queries.
 */
const MATCH_ALL: QueryFilter[] = [{ op: 'gte', field: 'id', value: 0 }];

export class AutotaskService {
  private http: AutotaskHttpClient | null = null;
  private logger: Logger;
  private config: McpServerConfig;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: McpServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the Autotask HTTP client with credentials.
   *
   * We only validate credentials here — the zone-resolved URL is fetched
   * lazily inside AutotaskHttpClient on the first actual request, so the
   * server starts cleanly even if the zone info endpoint is unreachable.
   */
  async initialize(): Promise<void> {
    try {
      const { username, secret, integrationCode, apiUrl } = this.config.autotask;

      if (!username || !secret || !integrationCode) {
        throw new Error('Missing required Autotask credentials: username, secret, and integrationCode are required');
      }

      this.logger.info('Initializing Autotask HTTP client...');
      this.http = new AutotaskHttpClient(username, secret, integrationCode, apiUrl, this.logger);
      this.logger.info('Autotask HTTP client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Autotask HTTP client:', error);
      throw error;
    }
  }

  /**
   * Ensure HTTP client is initialized (with lazy initialization).
   */
  private async ensureClient(): Promise<AutotaskHttpClient> {
    if (!this.http) {
      await this.ensureInitialized();
    }
    return this.http!;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }
    if (this.http) return;
    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  // =====================================================
  // Companies (Autotask entity: Companies)
  // =====================================================

  async getCompany(id: number): Promise<AutotaskCompany | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting company with ID: ${id}`);
      return await http.get<AutotaskCompany>('Companies', id);
    } catch (error) {
      this.logger.error(`Failed to get company ${id}:`, error);
      throw error;
    }
  }

  async searchCompanies(options: AutotaskQueryOptions = {}): Promise<AutotaskCompany[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching companies with options:', options);

      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({ op: 'contains', field: 'companyName', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ op: 'eq', field: 'isActive', value: options.isActive });
      }

      const pageSize = Math.min(options.pageSize || 25, 200);
      const companies = await http.query<AutotaskCompany>(
        'Companies',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );

      this.logger.info(`Retrieved ${companies.length} companies (pageSize ${pageSize})`);
      return companies;
    } catch (error) {
      this.logger.error('Failed to search companies:', error);
      throw error;
    }
  }

  async createCompany(company: Partial<AutotaskCompany>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating company:', company);
      const id = await http.create('Companies', company);
      this.logger.info(`Company created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create company:', error);
      throw error;
    }
  }

  async updateCompany(id: number, updates: Partial<AutotaskCompany>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating company ${id}:`, updates);
      await http.update('Companies', id, updates as Record<string, any>);
      this.logger.info(`Company ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update company ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Contacts
  // =====================================================

  async getContact(id: number): Promise<AutotaskContact | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting contact with ID: ${id}`);
      return await http.get<AutotaskContact>('Contacts', id);
    } catch (error) {
      this.logger.error(`Failed to get contact ${id}:`, error);
      throw error;
    }
  }

  async searchContacts(options: AutotaskQueryOptions = {}): Promise<AutotaskContact[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching contacts with options:', options);

      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({
          op: 'or',
          items: [
            { op: 'contains', field: 'firstName', value: options.searchTerm },
            { op: 'contains', field: 'lastName', value: options.searchTerm },
            { op: 'contains', field: 'emailAddress', value: options.searchTerm }
          ]
        });
      }
      if (options.companyID !== undefined) {
        filters.push({ op: 'eq', field: 'companyID', value: options.companyID });
      }
      if (options.isActive !== undefined) {
        filters.push({ op: 'eq', field: 'isActive', value: options.isActive });
      }

      const pageSize = Math.min(options.pageSize || 25, 200);
      const contacts = await http.query<AutotaskContact>(
        'Contacts',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );

      this.logger.info(`Retrieved ${contacts.length} contacts (pageSize ${pageSize})`);
      return contacts;
    } catch (error) {
      this.logger.error('Failed to search contacts:', error);
      throw error;
    }
  }

  async createContact(contact: Partial<AutotaskContact>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating contact:', contact);
      const id = await http.create('Contacts', contact);
      this.logger.info(`Contact created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create contact:', error);
      throw error;
    }
  }

  async updateContact(id: number, updates: Partial<AutotaskContact>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating contact ${id}:`, updates);
      await http.update('Contacts', id, updates as Record<string, any>);
      this.logger.info(`Contact ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update contact ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Tickets
  // =====================================================

  async getTicket(id: number, fullDetails: boolean = false): Promise<AutotaskTicket | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting ticket with ID: ${id}, fullDetails: ${fullDetails}`);
      const ticket = await http.get<AutotaskTicket>('Tickets', id);
      if (!ticket) return null;
      return fullDetails ? ticket : this.optimizeTicketData(ticket);
    } catch (error) {
      this.logger.error(`Failed to get ticket ${id}:`, error);
      throw error;
    }
  }

  async searchTickets(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskTicket[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching tickets with options:', options);

      const filters: QueryFilter[] = [];

      if (options.searchTerm) {
        filters.push({ op: 'beginsWith', field: 'ticketNumber', value: options.searchTerm });
      }

      if (options.status !== undefined) {
        filters.push({ op: 'eq', field: 'status', value: options.status });
      } else {
        filters.push({ op: 'ne', field: 'status', value: 5 }); // 5 = Complete
      }

      if (options.unassigned === true) {
        filters.push({ op: 'eq', field: 'assignedResourceID', value: null });
      } else if (options.assignedResourceID !== undefined) {
        filters.push({ op: 'eq', field: 'assignedResourceID', value: options.assignedResourceID });
      }

      if (options.companyId !== undefined) {
        filters.push({ op: 'eq', field: 'companyID', value: options.companyId });
      }

      if (options.createdAfter) {
        filters.push({ op: 'gte', field: 'createDate', value: options.createdAfter });
      }
      if (options.createdBefore) {
        filters.push({ op: 'lte', field: 'createDate', value: options.createdBefore });
      }
      if (options.lastActivityAfter) {
        filters.push({ op: 'gte', field: 'lastActivityDate', value: options.lastActivityAfter });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const tickets = await http.query<AutotaskTicket>('Tickets', filters, { maxRecords: pageSize });
      const optimized = tickets.map(t => this.optimizeTicketDataAggressive(t));

      this.logger.info(`Retrieved ${optimized.length} tickets (pageSize ${pageSize})`);
      return optimized;
    } catch (error) {
      this.logger.error('Failed to search tickets:', error);
      throw error;
    }
  }

  private optimizeTicketDataAggressive(ticket: AutotaskTicket): AutotaskTicket {
    const optimized: AutotaskTicket = {};
    if (ticket.id !== undefined) optimized.id = ticket.id;
    if (ticket.ticketNumber !== undefined) optimized.ticketNumber = ticket.ticketNumber;
    if (ticket.title !== undefined) optimized.title = ticket.title;
    if (ticket.description !== undefined && ticket.description !== null) {
      optimized.description = ticket.description.length > 200
        ? ticket.description.substring(0, 200) + '... [truncated - use get_ticket_details for full text]'
        : ticket.description;
    }
    if (ticket.status !== undefined) optimized.status = ticket.status;
    if (ticket.priority !== undefined) optimized.priority = ticket.priority;
    if (ticket.companyID !== undefined) optimized.companyID = ticket.companyID;
    if (ticket.contactID !== undefined) optimized.contactID = ticket.contactID;
    if (ticket.assignedResourceID !== undefined) optimized.assignedResourceID = ticket.assignedResourceID;
    if (ticket.createDate !== undefined) optimized.createDate = ticket.createDate;
    if (ticket.lastActivityDate !== undefined) optimized.lastActivityDate = ticket.lastActivityDate;
    if (ticket.dueDateTime !== undefined) optimized.dueDateTime = ticket.dueDateTime;
    if (ticket.completedDate !== undefined) optimized.completedDate = ticket.completedDate;
    if (ticket.estimatedHours !== undefined) optimized.estimatedHours = ticket.estimatedHours;
    if (ticket.ticketType !== undefined) optimized.ticketType = ticket.ticketType;
    if (ticket.source !== undefined) optimized.source = ticket.source;
    if (ticket.issueType !== undefined) optimized.issueType = ticket.issueType;
    if (ticket.subIssueType !== undefined) optimized.subIssueType = ticket.subIssueType;
    if (ticket.resolution !== undefined && ticket.resolution !== null) {
      optimized.resolution = ticket.resolution.length > 100
        ? ticket.resolution.substring(0, 100) + '... [truncated - use get_ticket_details for full text]'
        : ticket.resolution;
    }
    return optimized;
  }

  private optimizeTicketData(ticket: AutotaskTicket): AutotaskTicket {
    const maxDescriptionLength = 500;
    const maxNotesLength = 300;
    return {
      ...ticket,
      description: ticket.description && ticket.description.length > maxDescriptionLength
        ? ticket.description.substring(0, maxDescriptionLength) + '... [truncated]'
        : ticket.description,
      resolution: ticket.resolution && ticket.resolution.length > maxNotesLength
        ? ticket.resolution.substring(0, maxNotesLength) + '... [truncated]'
        : ticket.resolution,
      userDefinedFields: [],
      ...(ticket.purchaseOrderNumber && {
        purchaseOrderNumber: ticket.purchaseOrderNumber.length > 50
          ? ticket.purchaseOrderNumber.substring(0, 50) + '...'
          : ticket.purchaseOrderNumber
      })
    };
  }

  async createTicket(ticket: Partial<AutotaskTicket>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating ticket:', ticket);
      const id = await http.create('Tickets', ticket);
      this.logger.info(`Ticket created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create ticket:', error);
      throw error;
    }
  }

  async updateTicket(id: number, updates: Partial<AutotaskTicket>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating ticket ${id}:`, updates);
      await http.update('Tickets', id, updates as Record<string, any>);
      this.logger.info(`Ticket ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update ticket ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Ticket Charges (child of Tickets for create/delete)
  // =====================================================

  async getTicketCharge(id: number): Promise<AutotaskTicketCharge | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting ticket charge with ID: ${id}`);
      return await http.get<AutotaskTicketCharge>('TicketCharges', id);
    } catch (error) {
      this.logger.error(`Failed to get ticket charge ${id}:`, error);
      throw error;
    }
  }

  async searchTicketCharges(options: AutotaskQueryOptionsExtended & { ticketId?: number } = {}): Promise<AutotaskTicketCharge[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching ticket charges with options:', options);
      const filters: QueryFilter[] = [];
      if (options.ticketId) {
        filters.push({ op: 'eq', field: 'ticketID', value: options.ticketId });
      }
      const pageSize = options.pageSize || (filters.length > 0 ? 25 : 10);
      return await http.query<AutotaskTicketCharge>(
        'TicketCharges',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
    } catch (error) {
      this.logger.error('Failed to search ticket charges:', error);
      throw error;
    }
  }

  async createTicketCharge(charge: Partial<AutotaskTicketCharge>): Promise<number> {
    const http = await this.ensureClient();
    try {
      if (!charge.ticketID) {
        throw new Error('ticketID is required to create a ticket charge');
      }
      this.logger.debug('Creating ticket charge:', charge);
      // TicketCharges is a child entity — create via parent URL.
      const id = await http.childCreate('Tickets', charge.ticketID, 'Charges', charge);
      this.logger.info(`Ticket charge created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create ticket charge:', error);
      throw error;
    }
  }

  async updateTicketCharge(id: number, updates: Partial<AutotaskTicketCharge>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating ticket charge ${id}:`, updates);
      await http.update('TicketCharges', id, updates as Record<string, any>);
      this.logger.info(`Ticket charge ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update ticket charge ${id}:`, error);
      throw error;
    }
  }

  async deleteTicketCharge(ticketId: number, chargeId: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting ticket charge ${chargeId} from ticket ${ticketId}`);
      await http.childDelete('Tickets', ticketId, 'Charges', chargeId);
      this.logger.info(`Ticket charge ${chargeId} deleted successfully`);
    } catch (error) {
      this.logger.error(`Failed to delete ticket charge ${chargeId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Time Entries
  // =====================================================

  async createTimeEntry(timeEntry: Partial<AutotaskTimeEntry>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating time entry:', timeEntry);

      // Ticket-scoped
      if (timeEntry.ticketID) {
        const id = await http.childCreate('Tickets', timeEntry.ticketID, 'TimeEntries', timeEntry);
        this.logger.info(`Time entry created with ID: ${id}`);
        return id;
      }
      // Task-scoped
      if (timeEntry.taskID) {
        const id = await http.childCreate('Tasks', timeEntry.taskID, 'TimeEntries', timeEntry);
        this.logger.info(`Time entry created with ID: ${id}`);
        return id;
      }
      // Project-scoped
      if (timeEntry.projectID) {
        const id = await http.childCreate('Projects', timeEntry.projectID, 'TimeEntries', timeEntry);
        this.logger.info(`Time entry created with ID: ${id}`);
        return id;
      }
      // Regular (no parent — meetings, admin, etc.)
      // Autotask accepts a POST /TimeEntries with no parent for regular entries.
      const id = await http.create('TimeEntries', timeEntry);
      this.logger.info(`Regular time entry created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create time entry:', error);
      throw error;
    }
  }

  async getTimeEntries(options: AutotaskQueryOptions = {}): Promise<AutotaskTimeEntry[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Getting time entries with options:', options);
      const pageSize = Math.min(options.pageSize || 25, 500);
      const filter: QueryFilter[] =
        Array.isArray(options.filter) && options.filter.length > 0
          ? (options.filter as QueryFilter[])
          : MATCH_ALL;
      return await http.query<AutotaskTimeEntry>('TimeEntries', filter, { maxRecords: pageSize });
    } catch (error) {
      this.logger.error('Failed to get time entries:', error);
      throw error;
    }
  }

  /**
   * Resolve a resource by full/partial name via POST /Resources/query.
   * Returns the first match, or null.
   */
  async resolveResourceByName(name: string): Promise<{ id: number; firstName: string; lastName: string } | null> {
    const http = await this.ensureClient();
    try {
      // Try an exact concat match first: firstName + ' ' + lastName.
      const parts = name.trim().split(/\s+/);
      const first = parts[0];
      const last = parts.slice(1).join(' ') || undefined;

      const filters: QueryFilter[] = [{ op: 'eq', field: 'isActive', value: true }];
      if (first && last) {
        filters.push({
          op: 'and',
          items: [
            { op: 'contains', field: 'firstName', value: first },
            { op: 'contains', field: 'lastName', value: last }
          ]
        });
      } else {
        filters.push({
          op: 'or',
          items: [
            { op: 'contains', field: 'firstName', value: first },
            { op: 'contains', field: 'lastName', value: first },
            { op: 'contains', field: 'email', value: first }
          ]
        });
      }

      const results = await http.query<{ id: number; firstName: string; lastName: string }>(
        'Resources',
        filters,
        { maxRecords: 5 }
      );
      return results[0] || null;
    } catch (error) {
      this.logger.error(`Failed to resolve resource "${name}":`, error);
      throw error;
    }
  }

  /**
   * Return the list of internal (non-customer-facing) billing code names.
   * Queries BillingCodes with useType = 1 (Internal Allocation Code).
   */
  async getInternalBillingCodeNames(): Promise<string[]> {
    const http = await this.ensureClient();
    try {
      const codes = await http.query<{ name: string }>(
        'BillingCodes',
        [
          { op: 'eq', field: 'useType', value: 1 },
          { op: 'eq', field: 'isActive', value: true }
        ],
        { maxRecords: 500 }
      );
      return codes.map(bc => bc.name).filter((n): n is string => typeof n === 'string');
    } catch (error) {
      this.logger.error('Failed to get internal billing codes:', error);
      throw error;
    }
  }

  async resolveInternalBillingCodeByName(name: string): Promise<{ id: number; name: string } | null> {
    const http = await this.ensureClient();
    try {
      const results = await http.query<{ id: number; name: string }>(
        'BillingCodes',
        [
          { op: 'eq', field: 'useType', value: 1 },
          { op: 'eq', field: 'isActive', value: true },
          { op: 'eq', field: 'name', value: name }
        ],
        { maxRecords: 5 }
      );
      return results[0] || null;
    } catch (error) {
      this.logger.error(`Failed to resolve billing code "${name}":`, error);
      throw error;
    }
  }

  // =====================================================
  // Projects
  // =====================================================

  async getProject(id: number): Promise<AutotaskProject | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting project with ID: ${id}`);
      return await http.get<AutotaskProject>('Projects', id);
    } catch (error) {
      this.logger.error(`Failed to get project ${id}:`, error);
      throw error;
    }
  }

  async searchProjects(options: AutotaskQueryOptions = {}): Promise<AutotaskProject[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching projects with options:', options);
      const filters: QueryFilter[] = [];

      if ((options as any).companyID !== undefined) {
        filters.push({ op: 'eq', field: 'companyID', value: (options as any).companyID });
      }
      if ((options as any).status !== undefined) {
        filters.push({ op: 'eq', field: 'status', value: (options as any).status });
      }
      if ((options as any).projectLeadResourceID !== undefined) {
        filters.push({ op: 'eq', field: 'projectLeadResourceID', value: (options as any).projectLeadResourceID });
      }
      if ((options as any).searchTerm) {
        filters.push({ op: 'contains', field: 'projectName', value: (options as any).searchTerm });
      }

      if (options.filter) {
        if (Array.isArray(options.filter) && options.filter.length > 0) {
          filters.push(...(options.filter as QueryFilter[]));
        } else if (!Array.isArray(options.filter)) {
          for (const [field, value] of Object.entries(options.filter)) {
            filters.push({ op: 'eq', field, value });
          }
        }
      }

      const pageSize = Math.min(options.pageSize || 25, 100);
      const projects = await http.query<AutotaskProject>(
        'Projects',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      const optimized = projects.map(p => this.optimizeProjectData(p));
      this.logger.info(`Retrieved ${optimized.length} projects`);
      return optimized;
    } catch (error) {
      this.logger.error('Failed to search projects:', error);
      throw error;
    }
  }

  private optimizeProjectData(project: AutotaskProject): AutotaskProject {
    const maxDescriptionLength = 500;
    const optimizedDescription = project.description
      ? (project.description.length > maxDescriptionLength
          ? project.description.substring(0, maxDescriptionLength) + '... [truncated]'
          : project.description)
      : '';
    return { ...project, description: optimizedDescription, userDefinedFields: [] };
  }

  async createProject(project: Partial<AutotaskProject>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating project:', project);
      const id = await http.create('Projects', project);
      this.logger.info(`Project created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create project:', error);
      throw error;
    }
  }

  async updateProject(id: number, updates: Partial<AutotaskProject>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating project ${id}:`, updates);
      await http.update('Projects', id, updates as Record<string, any>);
      this.logger.info(`Project ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update project ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Resources
  // =====================================================

  async getResource(id: number): Promise<AutotaskResource | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting resource with ID: ${id}`);
      return await http.get<AutotaskResource>('Resources', id);
    } catch (error) {
      this.logger.error(`Failed to get resource ${id}:`, error);
      throw error;
    }
  }

  async searchResources(options: AutotaskQueryOptions = {}): Promise<AutotaskResource[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching resources with options:', options);
      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({
          op: 'or',
          items: [
            { op: 'contains', field: 'email', value: options.searchTerm },
            { op: 'contains', field: 'firstName', value: options.searchTerm },
            { op: 'contains', field: 'lastName', value: options.searchTerm }
          ]
        });
      }
      const pageSize = Math.min(options.pageSize || 25, 500);
      const resources = await http.query<AutotaskResource>(
        'Resources',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${resources.length} resources`);
      return resources;
    } catch (error) {
      this.logger.error('Failed to search resources:', error);
      throw error;
    }
  }

  // =====================================================
  // Configuration Items
  // =====================================================

  async getConfigurationItem(id: number): Promise<AutotaskConfigurationItem | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting configuration item with ID: ${id}`);
      return await http.get<AutotaskConfigurationItem>('ConfigurationItems', id);
    } catch (error) {
      this.logger.error(`Failed to get configuration item ${id}:`, error);
      throw error;
    }
  }

  async searchConfigurationItems(options: AutotaskQueryOptions = {}): Promise<AutotaskConfigurationItem[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching configuration items with options:', options);
      const pageSize = Math.min(options.pageSize || 25, 500);
      const filter: QueryFilter[] =
        Array.isArray(options.filter) && options.filter.length > 0
          ? (options.filter as QueryFilter[])
          : MATCH_ALL;
      return await http.query<AutotaskConfigurationItem>('ConfigurationItems', filter, { maxRecords: pageSize });
    } catch (error) {
      this.logger.error('Failed to search configuration items:', error);
      throw error;
    }
  }

  async createConfigurationItem(configItem: Partial<AutotaskConfigurationItem>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating configuration item:', configItem);
      const id = await http.create('ConfigurationItems', configItem);
      this.logger.info(`Configuration item created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create configuration item:', error);
      throw error;
    }
  }

  async updateConfigurationItem(id: number, updates: Partial<AutotaskConfigurationItem>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating configuration item ${id}:`, updates);
      await http.update('ConfigurationItems', id, updates as Record<string, any>);
      this.logger.info(`Configuration item ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update configuration item ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Contracts (read-only)
  // =====================================================

  async getContract(id: number): Promise<AutotaskContract | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting contract with ID: ${id}`);
      return await http.get<AutotaskContract>('Contracts', id);
    } catch (error) {
      this.logger.error(`Failed to get contract ${id}:`, error);
      throw error;
    }
  }

  async searchContracts(options: AutotaskQueryOptions = {}): Promise<AutotaskContract[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching contracts with options:', options);
      const pageSize = Math.min(options.pageSize || 25, 500);
      const filter: QueryFilter[] =
        Array.isArray(options.filter) && options.filter.length > 0
          ? (options.filter as QueryFilter[])
          : MATCH_ALL;
      return await http.query<AutotaskContract>('Contracts', filter, { maxRecords: pageSize });
    } catch (error) {
      this.logger.error('Failed to search contracts:', error);
      throw error;
    }
  }

  // =====================================================
  // Contracts (write) and ContractServices CRUD
  // =====================================================

  async createContract(contract: Partial<AutotaskContract>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating contract:', contract);
      const id = await http.create('Contracts', contract);
      this.logger.info(`Contract created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create contract:', error);
      throw error;
    }
  }

  async updateContract(id: number, updates: Partial<AutotaskContract>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating contract ${id}:`, updates);
      await http.update('Contracts', id, updates as Record<string, any>);
      this.logger.info(`Contract ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update contract ${id}:`, error);
      throw error;
    }
  }

  async createContractService(cs: Record<string, any>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating contract service:', cs);
      const id = await http.create('ContractServices', cs);
      this.logger.info(`ContractService created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create contract service:', error);
      throw error;
    }
  }

  async updateContractService(id: number, updates: Record<string, any>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating contract service ${id}:`, updates);
      await http.update('ContractServices', id, updates);
      this.logger.info(`ContractService ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update contract service ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Invoices
  // =====================================================

  async getInvoice(id: number): Promise<AutotaskInvoice | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting invoice with ID: ${id}`);
      return await http.get<AutotaskInvoice>('Invoices', id);
    } catch (error) {
      this.logger.error(`Failed to get invoice ${id}:`, error);
      throw error;
    }
  }

  async searchInvoices(options: AutotaskQueryOptions = {}): Promise<AutotaskInvoice[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching invoices with options:', options);
      const pageSize = Math.min(options.pageSize || 25, 500);
      const filter: QueryFilter[] =
        Array.isArray(options.filter) && options.filter.length > 0
          ? (options.filter as QueryFilter[])
          : MATCH_ALL;
      return await http.query<AutotaskInvoice>('Invoices', filter, { maxRecords: pageSize });
    } catch (error) {
      this.logger.error('Failed to search invoices:', error);
      throw error;
    }
  }

  /**
   * Get an invoice with its line items composed from BillingItems.
   *
   * The Autotask REST API supports `includeItemsAndExpenses=true` on the GET
   * /Invoices/{id} endpoint, but since our shared HTTP helper doesn't pass
   * query params, we use the simpler approach: fetch the invoice, then fetch
   * BillingItems filtered by invoiceID. The result shape is identical.
   */
  async getInvoiceDetails(id: number): Promise<AutotaskInvoice | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting invoice details with ID: ${id}`);
      const invoice = await http.get<AutotaskInvoice>('Invoices', id);
      if (!invoice) return null;

      let lineItems: AutotaskBillingItem[] = [];
      try {
        lineItems = await http.query<AutotaskBillingItem>(
          'BillingItems',
          [{ op: 'eq', field: 'invoiceID', value: id }],
          { maxRecords: 500 }
        );
      } catch (biErr) {
        this.logger.warn(
          `Failed to fetch line items for invoice ${id}: ${(biErr as Error).message}`
        );
      }

      return { ...invoice, lineItems };
    } catch (error) {
      this.logger.error(`Failed to get invoice details ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Tasks
  // =====================================================

  async getTask(id: number): Promise<AutotaskTask | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting task with ID: ${id}`);
      return await http.get<AutotaskTask>('Tasks', id);
    } catch (error) {
      this.logger.error(`Failed to get task ${id}:`, error);
      throw error;
    }
  }

  async searchTasks(options: AutotaskQueryOptions = {}): Promise<AutotaskTask[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching tasks with options:', options);
      const pageSize = Math.min(options.pageSize || 25, 100);
      const filter: QueryFilter[] =
        Array.isArray(options.filter) && options.filter.length > 0
          ? (options.filter as QueryFilter[])
          : MATCH_ALL;
      const tasks = await http.query<AutotaskTask>('Tasks', filter, { maxRecords: pageSize });
      const optimized = tasks.map(t => this.optimizeTaskData(t));
      this.logger.info(`Retrieved ${optimized.length} tasks`);
      return optimized;
    } catch (error) {
      this.logger.error('Failed to search tasks:', error);
      throw error;
    }
  }

  private optimizeTaskData(task: AutotaskTask): AutotaskTask {
    const maxDescriptionLength = 400;
    const optimizedDescription = task.description
      ? (task.description.length > maxDescriptionLength
          ? task.description.substring(0, maxDescriptionLength) + '... [truncated]'
          : task.description)
      : '';
    return { ...task, description: optimizedDescription, userDefinedFields: [] };
  }

  async createTask(task: Partial<AutotaskTask>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating task:', task);
      if (!task.projectID) {
        throw new Error('projectID is required to create a task');
      }
      // Tasks are created via POST /Projects/{projectID}/Tasks
      const id = await http.childCreate('Projects', task.projectID, 'Tasks', task);
      this.logger.info(`Task created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create task:', error);
      throw error;
    }
  }

  async updateTask(id: number, updates: Partial<AutotaskTask>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating task ${id}:`, updates);
      if (!updates.projectID) {
        throw new Error('projectID is required to update a task');
      }
      // Update via PATCH on the collection endpoint: /Projects/{projectID}/Tasks
      // with the task ID in the body.
      await http.childUpdate('Projects', updates.projectID, 'Tasks', id, updates as Record<string, any>);
      this.logger.info(`Task ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update task ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Phases
  // =====================================================

  async createPhase(phase: Partial<AutotaskPhase>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating phase:', phase);
      if (!phase.projectID) {
        throw new Error('projectID is required to create a phase');
      }
      const id = await http.childCreate('Projects', phase.projectID, 'Phases', phase);
      this.logger.info(`Phase created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create phase:', error);
      throw error;
    }
  }

  async searchPhases(projectID: number, options: AutotaskQueryOptions = {}): Promise<AutotaskPhase[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Searching phases for project ${projectID}:`, options);
      const phases = await http.childQuery<AutotaskPhase>(
        'Projects',
        projectID,
        'Phases',
        MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${phases.length} phases for project ${projectID}`);
      return phases;
    } catch (error) {
      this.logger.error(`Failed to search phases for project ${projectID}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Utility
  // =====================================================

  async testConnection(): Promise<boolean> {
    try {
      const http = await this.ensureClient();
      // Cheap probe: query Companies with a trivial filter.
      await http.query<AutotaskCompany>('Companies', MATCH_ALL, { maxRecords: 1 });
      this.logger.info('Connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  // =====================================================
  // Notes (child of Tickets / Projects / Companies)
  // =====================================================

  /**
   * Parent entity mapping for note operations.
   */
  private noteParent(parentField: string): { parent: string; bodyField: string } {
    const map: Record<string, { parent: string; bodyField: string }> = {
      ticketId:  { parent: 'Tickets',   bodyField: 'ticketID' },
      projectId: { parent: 'Projects',  bodyField: 'projectID' },
      accountId: { parent: 'Companies', bodyField: 'companyID' },
    };
    const m = map[parentField];
    if (!m) throw new Error(`Unknown parent field for note operation: ${parentField}`);
    return m;
  }

  private async getNoteImpl(parentField: string, parentId: number, noteId: number): Promise<any> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting note - ${parentField}: ${parentId}, noteID: ${noteId}`);
      const { parent } = this.noteParent(parentField);
      return await http.childGet<any>(parent, parentId, 'Notes', noteId);
    } catch (error) {
      this.logger.error(`Failed to get note ${noteId} for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  private async searchNotesImpl(
    parentField: string,
    parentId: number,
    options: AutotaskQueryOptionsExtended = {}
  ): Promise<any[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Searching notes for ${parentField}=${parentId}:`, options);
      const { parent } = this.noteParent(parentField);
      const notes = await http.childQuery<any>(
        parent,
        parentId,
        'Notes',
        MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${notes.length} notes for ${parentField}=${parentId}`);
      return notes;
    } catch (error) {
      this.logger.error(`Failed to search notes for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  private async createNoteImpl(
    parentField: string,
    parentId: number,
    note: Record<string, any>
  ): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Creating note for ${parentField}=${parentId}:`, note);
      const { parent, bodyField } = this.noteParent(parentField);
      const noteData = { ...note, [bodyField]: parentId };
      const id = await http.childCreate(parent, parentId, 'Notes', noteData);
      this.logger.info(`Note created with ID: ${id} for ${parentField}=${parentId}`);
      return id;
    } catch (error) {
      this.logger.error(`Failed to create note for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  async getTicketNote(ticketId: number, noteId: number): Promise<AutotaskTicketNote | null> {
    return this.getNoteImpl('ticketId', ticketId, noteId);
  }
  async searchTicketNotes(ticketId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskTicketNote[]> {
    return this.searchNotesImpl('ticketId', ticketId, opts);
  }
  async createTicketNote(ticketId: number, note: Partial<AutotaskTicketNote>): Promise<number> {
    return this.createNoteImpl('ticketId', ticketId, note as Record<string, any>);
  }

  async getProjectNote(projectId: number, noteId: number): Promise<AutotaskProjectNote | null> {
    return this.getNoteImpl('projectId', projectId, noteId);
  }
  async searchProjectNotes(projectId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskProjectNote[]> {
    return this.searchNotesImpl('projectId', projectId, opts);
  }
  async createProjectNote(projectId: number, note: Partial<AutotaskProjectNote>): Promise<number> {
    return this.createNoteImpl('projectId', projectId, note as Record<string, any>);
  }

  async getCompanyNote(companyId: number, noteId: number): Promise<AutotaskCompanyNote | null> {
    return this.getNoteImpl('accountId', companyId, noteId);
  }
  async searchCompanyNotes(companyId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskCompanyNote[]> {
    return this.searchNotesImpl('accountId', companyId, opts);
  }
  async createCompanyNote(companyId: number, note: Partial<AutotaskCompanyNote>): Promise<number> {
    return this.createNoteImpl('accountId', companyId, note as Record<string, any>);
  }

  // =====================================================
  // Ticket Checklist Items (child of Tickets)
  // =====================================================

  async searchTicketChecklistItems(ticketId: number): Promise<AutotaskTicketChecklistItem[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Listing checklist items for ticket ${ticketId}`);
      const items = await http.childQuery<AutotaskTicketChecklistItem>(
        'Tickets',
        ticketId,
        'ChecklistItems',
        MATCH_ALL,
        { maxRecords: 500 }
      );
      this.logger.info(`Retrieved ${items.length} checklist items for ticket ${ticketId}`);
      return items;
    } catch (error) {
      this.logger.error(`Failed to list checklist items for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async createTicketChecklistItem(
    ticketId: number,
    data: Partial<AutotaskTicketChecklistItem>
  ): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Creating checklist item on ticket ${ticketId}:`, data);
      const body = { ...data, ticketID: ticketId };
      const id = await http.childCreate('Tickets', ticketId, 'ChecklistItems', body);
      this.logger.info(`Checklist item created with ID ${id} on ticket ${ticketId}`);
      return id;
    } catch (error) {
      this.logger.error(`Failed to create checklist item on ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async updateTicketChecklistItem(
    ticketId: number,
    itemId: number,
    data: Partial<AutotaskTicketChecklistItem>
  ): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating checklist item ${itemId} on ticket ${ticketId}:`, data);
      const body = { ...data, ticketID: ticketId } as Record<string, any>;
      await http.childUpdate('Tickets', ticketId, 'ChecklistItems', itemId, body);
      this.logger.info(`Checklist item ${itemId} updated on ticket ${ticketId}`);
    } catch (error) {
      this.logger.error(`Failed to update checklist item ${itemId} on ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async deleteTicketChecklistItem(ticketId: number, itemId: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting checklist item ${itemId} from ticket ${ticketId}`);
      await http.childDelete('Tickets', ticketId, 'ChecklistItems', itemId);
      this.logger.info(`Checklist item ${itemId} deleted from ticket ${ticketId}`);
    } catch (error) {
      this.logger.error(`Failed to delete checklist item ${itemId} from ticket ${ticketId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Ticket Attachments (child of Tickets)
  // =====================================================

  async getTicketAttachment(
    ticketId: number,
    attachmentId: number,
    includeData: boolean = false
  ): Promise<AutotaskTicketAttachment | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(
        `Getting ticket attachment - TicketID: ${ticketId}, AttachmentID: ${attachmentId}, includeData: ${includeData}`
      );
      return await http.childGet<AutotaskTicketAttachment>('Tickets', ticketId, 'Attachments', attachmentId);
    } catch (error) {
      this.logger.error(`Failed to get ticket attachment ${attachmentId} for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async searchTicketAttachments(
    ticketId: number,
    options: AutotaskQueryOptionsExtended = {}
  ): Promise<AutotaskTicketAttachment[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Searching ticket attachments for ticket ${ticketId}:`, options);
      const attachments = await http.childQuery<AutotaskTicketAttachment>(
        'Tickets',
        ticketId,
        'Attachments',
        MATCH_ALL,
        { maxRecords: options.pageSize || 10 }
      );
      this.logger.info(`Retrieved ${attachments.length} ticket attachments`);
      return attachments;
    } catch (error) {
      this.logger.error(`Failed to search ticket attachments for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async createTicketAttachment(
    ticketId: number,
    data: AutotaskTicketAttachmentCreateRequest
  ): Promise<number> {
    const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB

    if (!data || typeof data.data !== 'string' || data.data.length === 0) {
      throw new Error('createTicketAttachment: `data` (base64-encoded file content) is required');
    }
    if (!data.title) {
      throw new Error('createTicketAttachment: `title` is required');
    }

    let decodedLength: number;
    try {
      const buf = Buffer.from(data.data, 'base64');
      if (buf.toString('base64').replace(/=+$/, '') !== data.data.replace(/\s+/g, '').replace(/=+$/, '')) {
        throw new Error('invalid base64');
      }
      decodedLength = buf.length;
    } catch {
      throw new Error('createTicketAttachment: `data` is not valid base64-encoded content');
    }

    if (decodedLength === 0) {
      throw new Error('createTicketAttachment: decoded attachment is empty');
    }
    if (decodedLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `createTicketAttachment: attachment is ${decodedLength} bytes which exceeds the Autotask 3MB (${MAX_ATTACHMENT_BYTES} byte) limit for ticket attachments`
      );
    }

    const http = await this.ensureClient();

    const payload = {
      title: data.title,
      fullPath: data.fullPath || data.title,
      data: data.data,
      attachmentType: data.attachmentType || 'FILE_ATTACHMENT',
      contentType: data.contentType,
      publish: data.publish ?? 1,
      parentId: ticketId,
      parentType: 4 // Ticket
    };

    try {
      this.logger.info(
        `Creating ticket attachment - ticketId=${ticketId} title="${data.title}" bytes=${decodedLength}`
      );
      const id = await http.childCreate('Tickets', ticketId, 'Attachments', payload);
      this.logger.info(`Ticket attachment created with ID: ${id} for ticket ${ticketId}`);
      return id;
    } catch (error) {
      this.logger.error(`Failed to create ticket attachment for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Expense Reports / Items
  // =====================================================

  async getExpenseReport(id: number): Promise<AutotaskExpenseReport | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting expense report with ID: ${id}`);
      return await http.get<AutotaskExpenseReport>('ExpenseReports', id);
    } catch (error) {
      this.logger.error(`Failed to get expense report ${id}:`, error);
      throw error;
    }
  }

  async searchExpenseReports(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskExpenseReport[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching expense reports with options:', options);
      const filters: QueryFilter[] = [];
      if (options.submitterId) {
        filters.push({ field: 'resourceId', op: 'eq', value: options.submitterId });
      }
      if (options.status) {
        filters.push({ field: 'status', op: 'eq', value: options.status });
      }
      const reports = await http.query<AutotaskExpenseReport>(
        'ExpenseReports',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${reports.length} expense reports`);
      return reports;
    } catch (error) {
      this.logger.error('Failed to search expense reports:', error);
      throw error;
    }
  }

  async createExpenseReport(report: Partial<AutotaskExpenseReport>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating expense report:', report);
      const id = await http.create('ExpenseReports', report);
      this.logger.info(`Expense report created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create expense report:', error);
      throw error;
    }
  }

  async getExpenseItem(itemId: number): Promise<AutotaskExpenseItem | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting expense item with ID: ${itemId}`);
      return await http.get<AutotaskExpenseItem>('ExpenseItems', itemId);
    } catch (error) {
      this.logger.error(`Failed to get expense item ${itemId}:`, error);
      throw error;
    }
  }

  async searchExpenseItems(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskExpenseItem[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching expense items with options:', options);
      const filters: QueryFilter[] = [];
      if (options.expenseReportId) {
        filters.push({ field: 'expenseReportID', op: 'eq', value: options.expenseReportId });
      }
      if (options.startDate) {
        filters.push({ field: 'expenseDate', op: 'gte', value: options.startDate });
      }
      if (options.endDate) {
        filters.push({ field: 'expenseDate', op: 'lte', value: options.endDate });
      }
      const items = await http.query<AutotaskExpenseItem>(
        'ExpenseItems',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${items.length} expense items`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search expense items:', error);
      throw error;
    }
  }

  async createExpenseItem(item: Partial<AutotaskExpenseItem>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating expense item:', item);
      const id = await http.create('ExpenseItems', item);
      this.logger.info(`Expense item created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create expense item:', error);
      throw error;
    }
  }

  // =====================================================
  // Quotes
  // =====================================================

  async getQuote(id: number): Promise<AutotaskQuote | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting quote with ID: ${id}`);
      return await http.get<AutotaskQuote>('Quotes', id);
    } catch (error) {
      this.logger.error(`Failed to get quote ${id}:`, error);
      throw error;
    }
  }

  async searchQuotes(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskQuote[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching quotes with options:', options);
      const filters: QueryFilter[] = [];
      if (options.companyId) {
        filters.push({ field: 'accountId', op: 'eq', value: options.companyId });
      }
      if (options.contactId) {
        filters.push({ field: 'contactId', op: 'eq', value: options.contactId });
      }
      if (options.opportunityId) {
        filters.push({ field: 'opportunityId', op: 'eq', value: options.opportunityId });
      }
      if (options.searchTerm) {
        filters.push({ field: 'description', op: 'contains', value: options.searchTerm });
      }
      const quotes = await http.query<AutotaskQuote>(
        'Quotes',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${quotes.length} quotes`);
      return quotes;
    } catch (error) {
      this.logger.error('Failed to search quotes:', error);
      throw error;
    }
  }

  async createQuote(quote: Partial<AutotaskQuote>): Promise<number> {
    const http = await this.ensureClient();
    try {
      // Autotask requires location IDs on the quote. Auto-populate from the
      // company's first location if the caller didn't supply them.
      if (
        quote.companyID &&
        (!quote.billToLocationID || !quote.shipToLocationID || !quote.soldToLocationID)
      ) {
        try {
          const locations = await http.query<{ id: number }>(
            'CompanyLocations',
            [{ op: 'eq', field: 'companyID', value: quote.companyID }],
            { maxRecords: 10 }
          );
          if (locations.length > 0) {
            const defaultLocationId = locations[0].id;
            if (!quote.billToLocationID) quote.billToLocationID = defaultLocationId;
            if (!quote.shipToLocationID) quote.shipToLocationID = defaultLocationId;
            if (!quote.soldToLocationID) quote.soldToLocationID = defaultLocationId;
          }
        } catch (locError) {
          this.logger.warn('Could not auto-populate location IDs for quote:', locError);
        }
      }

      this.logger.debug('Creating quote:', quote);
      const id = await http.create('Quotes', quote);
      this.logger.info(`Quote created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create quote:', error);
      throw error;
    }
  }

  // =====================================================
  // Opportunities
  // =====================================================

  async getOpportunity(id: number): Promise<AutotaskOpportunity | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting opportunity with ID: ${id}`);
      return await http.get<AutotaskOpportunity>('Opportunities', id);
    } catch (error) {
      this.logger.error(`Failed to get opportunity ${id}:`, error);
      throw error;
    }
  }

  async searchOpportunities(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskOpportunity[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching opportunities with options:', options);
      const filters: QueryFilter[] = [];
      if (options.companyId) {
        filters.push({ field: 'companyID', op: 'eq', value: options.companyId });
      }
      if (options.searchTerm) {
        filters.push({ field: 'title', op: 'contains', value: options.searchTerm });
      }
      if (options.status !== undefined) {
        filters.push({ field: 'status', op: 'eq', value: options.status });
      }
      const items = await http.query<AutotaskOpportunity>(
        'Opportunities',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${items.length} opportunities`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search opportunities:', error);
      throw error;
    }
  }

  async createOpportunity(opportunity: Record<string, any>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating opportunity:', opportunity);
      const oppData: Record<string, any> = {
        title: opportunity.title,
        companyID: opportunity.companyID,
        ownerResourceID: opportunity.ownerResourceID,
        status: opportunity.status,
        stage: opportunity.stage,
        projectedCloseDate: opportunity.projectedCloseDate,
        startDate: opportunity.startDate,
        probability: opportunity.probability ?? 50,
        amount: opportunity.amount ?? 0,
        cost: opportunity.cost ?? 0,
        useQuoteTotals: opportunity.useQuoteTotals ?? true,
      };
      if (opportunity.totalAmountMonths) oppData.totalAmountMonths = opportunity.totalAmountMonths;
      if (opportunity.contactID) oppData.contactID = opportunity.contactID;
      if (opportunity.description) oppData.description = opportunity.description;
      if (opportunity.opportunityCategoryID) oppData.opportunityCategoryID = opportunity.opportunityCategoryID;

      const id = await http.create('Opportunities', oppData);
      this.logger.info(`Created opportunity with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create opportunity:', error);
      throw error;
    }
  }

  // =====================================================
  // Products / Services / Service Bundles (read)
  // =====================================================

  async getProduct(id: number): Promise<AutotaskProduct | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting product with ID: ${id}`);
      return await http.get<AutotaskProduct>('Products', id);
    } catch (error) {
      this.logger.error(`Failed to get product ${id}:`, error);
      throw error;
    }
  }

  async searchProducts(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskProduct[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching products with options:', options);
      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const items = await http.query<AutotaskProduct>(
        'Products',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${items.length} products`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search products:', error);
      throw error;
    }
  }

  async getService(id: number): Promise<AutotaskServiceEntity | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting service with ID: ${id}`);
      return await http.get<AutotaskServiceEntity>('Services', id);
    } catch (error) {
      this.logger.error(`Failed to get service ${id}:`, error);
      throw error;
    }
  }

  async searchServices(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceEntity[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching services with options:', options);
      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const items = await http.query<AutotaskServiceEntity>(
        'Services',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${items.length} services`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search services:', error);
      throw error;
    }
  }

  async getServiceBundle(id: number): Promise<AutotaskServiceBundle | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting service bundle with ID: ${id}`);
      return await http.get<AutotaskServiceBundle>('ServiceBundles', id);
    } catch (error) {
      this.logger.error(`Failed to get service bundle ${id}:`, error);
      throw error;
    }
  }

  async searchServiceBundles(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceBundle[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching service bundles with options:', options);
      const filters: QueryFilter[] = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const items = await http.query<AutotaskServiceBundle>(
        'ServiceBundles',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 25 }
      );
      this.logger.info(`Retrieved ${items.length} service bundles`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search service bundles:', error);
      throw error;
    }
  }

  // =====================================================
  // Quote Items (child of Quotes for create/delete)
  // =====================================================

  async getQuoteItem(id: number): Promise<AutotaskQuoteItem | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting quote item with ID: ${id}`);
      return await http.get<AutotaskQuoteItem>('QuoteItems', id);
    } catch (error) {
      this.logger.error(`Failed to get quote item ${id}:`, error);
      throw error;
    }
  }

  async searchQuoteItems(options: AutotaskQueryOptionsExtended & { quoteId?: number } = {}): Promise<AutotaskQuoteItem[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching quote items with options:', options);
      const filters: QueryFilter[] = [];
      if (options.quoteId) {
        filters.push({ field: 'quoteID', op: 'eq', value: options.quoteId });
      }
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      const items = await http.query<AutotaskQuoteItem>(
        'QuoteItems',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: options.pageSize || 50 }
      );
      this.logger.info(`Retrieved ${items.length} quote items`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search quote items:', error);
      throw error;
    }
  }

  async createQuoteItem(item: Partial<AutotaskQuoteItem>): Promise<number> {
    const http = await this.ensureClient();
    try {
      // Auto-determine quoteItemType based on which ID field is set.
      let quoteItemType = item.quoteItemType;
      if (!quoteItemType) {
        if (item.serviceID) quoteItemType = 11;
        else if (item.serviceBundleID) quoteItemType = 12;
        else if (item.productID) quoteItemType = 1;
        else if (item.chargeID) quoteItemType = 2;
        else if (item.laborID) quoteItemType = 3;
        else if (item.expenseID) quoteItemType = 4;
        else if (item.shippingID) quoteItemType = 6;
        else quoteItemType = 2;
      }

      if (!item.quoteID) {
        throw new Error('quoteID is required to create a quote item');
      }

      const quoteItem = {
        unitDiscount: 0,
        lineDiscount: 0,
        percentageDiscount: 0,
        isOptional: false,
        ...item,
        quoteItemType: item.quoteItemType || quoteItemType,
      };
      this.logger.debug('Creating quote item:', quoteItem);
      // QuoteItems are child of Quotes: POST /Quotes/{quoteId}/Items
      const id = await http.childCreate('Quotes', item.quoteID, 'Items', quoteItem);
      this.logger.info(`Quote item created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create quote item:', error);
      throw error;
    }
  }

  async updateQuoteItem(id: number, item: Partial<AutotaskQuoteItem>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating quote item ${id}:`, item);
      await http.update('QuoteItems', id, item as Record<string, any>);
      this.logger.info(`Quote item ${id} updated`);
    } catch (error) {
      this.logger.error(`Failed to update quote item ${id}:`, error);
      throw error;
    }
  }

  async deleteQuoteItem(quoteId: number, id: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting quote item ${id} from quote ${quoteId}`);
      await http.childDelete('Quotes', quoteId, 'Items', id);
      this.logger.info(`Quote item ${id} deleted from quote ${quoteId}`);
    } catch (error) {
      this.logger.error(`Failed to delete quote item ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Billing Items
  // =====================================================

  async getBillingItem(id: number): Promise<AutotaskBillingItem | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting billing item with ID: ${id}`);
      return await http.get<AutotaskBillingItem>('BillingItems', id);
    } catch (error) {
      this.logger.error(`Failed to get billing item ${id}:`, error);
      throw error;
    }
  }

  async searchBillingItems(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskBillingItem[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching billing items with options:', options);
      const filters: QueryFilter[] = [];

      if (options.companyId !== undefined) {
        filters.push({ op: 'eq', field: 'companyID', value: options.companyId });
      }
      if ((options as any).ticketId !== undefined) {
        filters.push({ op: 'eq', field: 'ticketID', value: (options as any).ticketId });
      }
      if ((options as any).projectId !== undefined) {
        filters.push({ op: 'eq', field: 'projectID', value: (options as any).projectId });
      }
      if ((options as any).contractId !== undefined) {
        filters.push({ op: 'eq', field: 'contractID', value: (options as any).contractId });
      }
      if ((options as any).invoiceId !== undefined) {
        filters.push({ op: 'eq', field: 'invoiceID', value: (options as any).invoiceId });
      }
      if ((options as any).isInvoiced !== undefined) {
        filters.push({ op: (options as any).isInvoiced ? 'exist' : 'notExist', field: 'invoiceID' });
      }
      if ((options as any).dateFrom) {
        filters.push({ op: 'gte', field: 'itemDate', value: (options as any).dateFrom });
      }
      if ((options as any).dateTo) {
        filters.push({ op: 'lte', field: 'itemDate', value: (options as any).dateTo });
      }
      if ((options as any).postedAfter) {
        filters.push({ op: 'gte', field: 'postedDate', value: (options as any).postedAfter });
      }
      if ((options as any).postedBefore) {
        filters.push({ op: 'lte', field: 'postedDate', value: (options as any).postedBefore });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const items = await http.query<AutotaskBillingItem>(
        'BillingItems',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} billing items`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search billing items:', error);
      throw error;
    }
  }

  async searchBillingItemApprovalLevels(
    options: AutotaskQueryOptionsExtended = {}
  ): Promise<AutotaskBillingItemApprovalLevel[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching billing item approval levels with options:', options);
      const filters: QueryFilter[] = [];
      if ((options as any).timeEntryId !== undefined) {
        filters.push({ op: 'eq', field: 'timeEntryID', value: (options as any).timeEntryId });
      }
      if ((options as any).approvalResourceId !== undefined) {
        filters.push({ op: 'eq', field: 'approvalResourceID', value: (options as any).approvalResourceId });
      }
      if ((options as any).approvalLevel !== undefined) {
        filters.push({ op: 'eq', field: 'approvalLevel', value: (options as any).approvalLevel });
      }
      if ((options as any).approvedAfter) {
        filters.push({ op: 'gte', field: 'approvalDateTime', value: (options as any).approvedAfter });
      }
      if ((options as any).approvedBefore) {
        filters.push({ op: 'lte', field: 'approvalDateTime', value: (options as any).approvedBefore });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const items = await http.query<AutotaskBillingItemApprovalLevel>(
        'BillingItemApprovalLevels',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} billing item approval levels`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search billing item approval levels:', error);
      throw error;
    }
  }

  async searchTimeEntries(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskTimeEntry[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching time entries with options:', options);
      const filters: QueryFilter[] = [];

      if ((options as any).resourceId !== undefined) {
        filters.push({ op: 'eq', field: 'resourceID', value: (options as any).resourceId });
      }
      if ((options as any).ticketId !== undefined) {
        filters.push({ op: 'eq', field: 'ticketID', value: (options as any).ticketId });
      }
      if ((options as any).projectId !== undefined) {
        filters.push({ op: 'eq', field: 'projectID', value: (options as any).projectId });
      }
      if ((options as any).taskId !== undefined) {
        filters.push({ op: 'eq', field: 'taskID', value: (options as any).taskId });
      }
      if ((options as any).dateWorkedAfter) {
        filters.push({ op: 'gte', field: 'dateWorked', value: (options as any).dateWorkedAfter });
      }
      if ((options as any).dateWorkedBefore) {
        filters.push({ op: 'lte', field: 'dateWorked', value: (options as any).dateWorkedBefore });
      }

      const approvalStatus = (options as any).approvalStatus;
      if (approvalStatus === 'unapproved') {
        filters.push({ op: 'eq', field: 'billingApprovalDateTime', value: null });
      } else if (approvalStatus === 'approved') {
        filters.push({ op: 'isnotnull', field: 'billingApprovalDateTime' });
      }

      if ((options as any).billable !== undefined) {
        filters.push({ op: 'eq', field: 'isNonBillable', value: !(options as any).billable });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const items = await http.query<AutotaskTimeEntry>(
        'TimeEntries',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} time entries`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search time entries:', error);
      throw error;
    }
  }

  // =====================================================
  // Service Calls
  // =====================================================

  async getServiceCall(id: number): Promise<AutotaskServiceCall | null> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting service call with ID: ${id}`);
      return await http.get<AutotaskServiceCall>('ServiceCalls', id);
    } catch (error) {
      this.logger.error(`Failed to get service call ${id}:`, error);
      throw error;
    }
  }

  async searchServiceCalls(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceCall[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching service calls with options:', options);
      const filters: QueryFilter[] = [];
      if (options.status !== undefined) {
        filters.push({ op: 'eq', field: 'status', value: options.status });
      }
      if (options.startDate) {
        filters.push({ op: 'gte', field: 'startDateTime', value: options.startDate });
      }
      if (options.endDate) {
        filters.push({ op: 'lte', field: 'endDateTime', value: options.endDate });
      }
      const pageSize = Math.min(options.pageSize || 25, 200);
      const items = await http.query<AutotaskServiceCall>(
        'ServiceCalls',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} service calls`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search service calls:', error);
      throw error;
    }
  }

  async createServiceCall(data: Partial<AutotaskServiceCall>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating service call:', data);
      const id = await http.create('ServiceCalls', data);
      this.logger.info(`Service call created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create service call:', error);
      throw error;
    }
  }

  async updateServiceCall(id: number, updates: Partial<AutotaskServiceCall>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating service call ${id}:`, updates);
      await http.update('ServiceCalls', id, updates as Record<string, any>);
      this.logger.info(`Service call ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update service call ${id}:`, error);
      throw error;
    }
  }

  async deleteServiceCall(id: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting service call ${id}`);
      await http.delete('ServiceCalls', id);
      this.logger.info(`Service call ${id} deleted`);
    } catch (error) {
      this.logger.error(`Failed to delete service call ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Service Call Tickets / Resources
  // =====================================================

  async searchServiceCallTickets(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceCallTicket[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching service call tickets with options:', options);
      const filters: QueryFilter[] = [];
      if ((options as any).serviceCallId !== undefined) {
        filters.push({ op: 'eq', field: 'serviceCallID', value: (options as any).serviceCallId });
      }
      if ((options as any).ticketId !== undefined) {
        filters.push({ op: 'eq', field: 'ticketID', value: (options as any).ticketId });
      }
      const pageSize = Math.min(options.pageSize || 25, 200);
      const items = await http.query<AutotaskServiceCallTicket>(
        'ServiceCallTickets',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} service call tickets`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search service call tickets:', error);
      throw error;
    }
  }

  async createServiceCallTicket(data: Partial<AutotaskServiceCallTicket>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating service call ticket:', data);
      const id = await http.create('ServiceCallTickets', data);
      this.logger.info(`Service call ticket created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create service call ticket:', error);
      throw error;
    }
  }

  async deleteServiceCallTicket(id: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting service call ticket ${id}`);
      await http.delete('ServiceCallTickets', id);
      this.logger.info(`Service call ticket ${id} deleted`);
    } catch (error) {
      this.logger.error(`Failed to delete service call ticket ${id}:`, error);
      throw error;
    }
  }

  async searchServiceCallTicketResources(
    options: AutotaskQueryOptionsExtended = {}
  ): Promise<AutotaskServiceCallTicketResource[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Searching service call ticket resources with options:', options);
      const filters: QueryFilter[] = [];
      if ((options as any).serviceCallTicketId !== undefined) {
        filters.push({ op: 'eq', field: 'serviceCallTicketID', value: (options as any).serviceCallTicketId });
      }
      if ((options as any).resourceId !== undefined) {
        filters.push({ op: 'eq', field: 'resourceID', value: (options as any).resourceId });
      }
      const pageSize = Math.min(options.pageSize || 25, 200);
      const items = await http.query<AutotaskServiceCallTicketResource>(
        'ServiceCallTicketResources',
        filters.length > 0 ? filters : MATCH_ALL,
        { maxRecords: pageSize }
      );
      this.logger.info(`Retrieved ${items.length} service call ticket resources`);
      return items;
    } catch (error) {
      this.logger.error('Failed to search service call ticket resources:', error);
      throw error;
    }
  }

  async createServiceCallTicketResource(data: Partial<AutotaskServiceCallTicketResource>): Promise<number> {
    const http = await this.ensureClient();
    try {
      this.logger.debug('Creating service call ticket resource:', data);
      const id = await http.create('ServiceCallTicketResources', data);
      this.logger.info(`Service call ticket resource created with ID: ${id}`);
      return id;
    } catch (error) {
      this.logger.error('Failed to create service call ticket resource:', error);
      throw error;
    }
  }

  async deleteServiceCallTicketResource(id: number): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Deleting service call ticket resource ${id}`);
      await http.delete('ServiceCallTicketResources', id);
      this.logger.info(`Service call ticket resource ${id} deleted`);
    } catch (error) {
      this.logger.error(`Failed to delete service call ticket resource ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Billing Codes / Departments (read-only helpers)
  // =====================================================

  async getBillingCode(id: number): Promise<AutotaskBillingCode | null> {
    const http = await this.ensureClient();
    try {
      return await http.get<AutotaskBillingCode>('BillingCodes', id);
    } catch (error) {
      this.logger.error(`Failed to get billing code ${id}:`, error);
      throw error;
    }
  }

  async searchBillingCodes(_options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskBillingCode[]> {
    const http = await this.ensureClient();
    try {
      return await http.query<AutotaskBillingCode>(
        'BillingCodes',
        [{ op: 'eq', field: 'isActive', value: true }],
        { maxRecords: 500 }
      );
    } catch (error) {
      this.logger.error('Failed to search billing codes:', error);
      throw error;
    }
  }

  async getDepartment(_id: number): Promise<AutotaskDepartment | null> {
    throw new Error('Departments API not directly available in Autotask REST');
  }

  async searchDepartments(_options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskDepartment[]> {
    throw new Error('Departments API not directly available in Autotask REST');
  }

  // =====================================================
  // Field info / picklists
  // =====================================================

  async getFieldInfo(entityType: string): Promise<FieldInfo[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting field info for entity: ${entityType}`);
      const { fields: rawFields } = await http.fieldInfo(entityType);
      return rawFields.map((field: any): FieldInfo => ({
        name: field.name,
        dataType: field.dataType,
        length: field.length,
        isRequired: field.isRequired || false,
        isReadOnly: field.isReadOnly || false,
        isQueryable: field.isQueryable || false,
        isReference: field.isReference || false,
        referenceEntityType: field.referenceEntityType,
        isPickList: field.isPickList || false,
        picklistValues: field.picklistValues?.map((pv: any): PicklistValue => {
          const out: PicklistValue = {
            value: String(pv.value),
            label: pv.label || pv.name || String(pv.value),
            isDefaultValue: pv.isDefaultValue || false,
            sortOrder: pv.sortOrder,
            isActive: pv.isActive !== false,
            isSystem: pv.isSystem || false,
          };
          if (pv.parentValue) out.parentValue = String(pv.parentValue);
          return out;
        }),
        picklistParentValueField: field.picklistParentValueField,
      }));
    } catch (error) {
      this.logger.error(`Failed to get field info for ${entityType}:`, error);
      throw error;
    }
  }

  // =====================================================
  // Company Site Configurations
  // =====================================================

  async getCompanySiteConfigurations(companyId: number): Promise<any[]> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Getting company site configurations for company ID: ${companyId}`);
      return await http.query<any>(
        'CompanySiteConfigurations',
        [{ op: 'eq', field: 'companyID', value: companyId }],
        { maxRecords: 100 }
      );
    } catch (error) {
      this.logger.error(`Failed to get company site configurations for company ${companyId}:`, error);
      throw error;
    }
  }

  async updateCompanySiteConfiguration(id: number, updates: Record<string, any>): Promise<void> {
    const http = await this.ensureClient();
    try {
      this.logger.debug(`Updating company site configuration ${id}:`, updates);
      await http.update('CompanySiteConfigurations', id, updates);
      this.logger.info(`Company site configuration ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update company site configuration ${id}:`, error);
      throw error;
    }
  }
}

// resolveAutotaskApiUrl kept referenced to avoid unused-import warnings
// for tooling that may not see usage inside AutotaskHttpClient (it's used
// there). This re-export is harmless.
export { resolveAutotaskApiUrl };
