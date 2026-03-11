// Autotask Service Layer
// Wraps the autotask-node client with our specific types and error handling

import { AutotaskClient } from 'autotask-node';
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
  AutotaskBillingItemApprovalLevel
} from '../types/autotask';
import { McpServerConfig } from '../types/mcp';
import { Logger } from '../utils/logger';
import { FieldInfo, PicklistValue } from './picklist.cache';

export class AutotaskService {
  private client: AutotaskClient | null = null;
  private logger: Logger;
  private config: McpServerConfig;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: McpServerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the Autotask client with credentials
   */
  async initialize(): Promise<void> {
    try {
      const { username, secret, integrationCode, apiUrl } = this.config.autotask;
      
      if (!username || !secret || !integrationCode) {
        throw new Error('Missing required Autotask credentials: username, secret, and integrationCode are required');
      }

      this.logger.info('Initializing Autotask client...');
      
      // Only include apiUrl if it's defined
      const authConfig: any = {
        username,
        secret,
        integrationCode,
        // In gateway mode, credentials are validated per-request by the actual
        // API calls. Skipping the /Version connection test avoids a 30s timeout
        // on every tool invocation when running stateless/per-request.
        skipConnectionTest: true,
      };

      if (apiUrl) {
        authConfig.apiUrl = apiUrl;
      }

      this.client = await AutotaskClient.create(authConfig);

      this.logger.info('Autotask client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Autotask client:', error);
      throw error;
    }
  }

  /**
   * Ensure client is initialized (with lazy initialization)
   */
  private async ensureClient(): Promise<AutotaskClient> {
    if (!this.client) {
      await this.ensureInitialized();
    }
    return this.client!;
  }

  /**
   * Ensure the client is initialized, handling concurrent calls
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      // Already initializing, wait for it to complete
      await this.initializationPromise;
      return;
    }

    if (this.client) {
      // Already initialized
      return;
    }

    // Start initialization
    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  // Company operations (using accounts in autotask-node)
  async getCompany(id: number): Promise<AutotaskCompany | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting company with ID: ${id}`);
      const result = await client.accounts.get(id);
      return result.data as AutotaskCompany || null;
    } catch (error) {
      this.logger.error(`Failed to get company ${id}:`, error);
      throw error;
    }
  }

  async searchCompanies(options: AutotaskQueryOptions = {}): Promise<AutotaskCompany[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching companies with options:', options);

      const filters: any[] = [];

      if (options.searchTerm) {
        filters.push({
          op: 'contains',
          field: 'companyName',
          value: options.searchTerm
        });
      }

      if (options.isActive !== undefined) {
        filters.push({
          op: 'eq',
          field: 'isActive',
          value: options.isActive
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 200);
      const queryOptions: any = {
        pageSize,
        ...(options.page && { page: options.page }),
        ...(filters.length > 0 && { filter: filters }),
      };

      const result = await client.accounts.list(queryOptions as any);
      const companies = (result.data as AutotaskCompany[]) || [];

      this.logger.info(`Retrieved ${companies.length} companies (page ${options.page || 1}, pageSize ${pageSize})`);
      return companies;
    } catch (error) {
      this.logger.error('Failed to search companies:', error);
      throw error;
    }
  }

  async createCompany(company: Partial<AutotaskCompany>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating company:', company);
      const result = await client.accounts.create(company as any);
      const companyId = (result.data as any)?.id;
      this.logger.info(`Company created with ID: ${companyId}`);
      return companyId;
    } catch (error) {
      this.logger.error('Failed to create company:', error);
      throw error;
    }
  }

  async updateCompany(id: number, updates: Partial<AutotaskCompany>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating company ${id}:`, updates);
      await client.accounts.update(id, updates as any);
      this.logger.info(`Company ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update company ${id}:`, error);
      throw error;
    }
  }

  // Contact operations
  async getContact(id: number): Promise<AutotaskContact | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting contact with ID: ${id}`);
      const result = await client.contacts.get(id);
      return result.data as AutotaskContact || null;
    } catch (error) {
      this.logger.error(`Failed to get contact ${id}:`, error);
      throw error;
    }
  }

  async searchContacts(options: AutotaskQueryOptions = {}): Promise<AutotaskContact[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching contacts with options:', options);

      const filters: any[] = [];

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
        filters.push({
          op: 'eq',
          field: 'companyID',
          value: options.companyID
        });
      }

      if (options.isActive !== undefined) {
        filters.push({
          op: 'eq',
          field: 'isActive',
          value: options.isActive
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 200);
      const queryOptions: any = {
        pageSize,
        ...(options.page && { page: options.page }),
        ...(filters.length > 0 && { filter: filters }),
      };

      const result = await client.contacts.list(queryOptions as any);
      const contacts = (result.data as AutotaskContact[]) || [];

      this.logger.info(`Retrieved ${contacts.length} contacts (page ${options.page || 1}, pageSize ${pageSize})`);
      return contacts;
    } catch (error) {
      this.logger.error('Failed to search contacts:', error);
      throw error;
    }
  }

  async createContact(contact: Partial<AutotaskContact>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating contact:', contact);
      const result = await client.contacts.create(contact as any);
      const contactId = (result.data as any)?.id;
      this.logger.info(`Contact created with ID: ${contactId}`);
      return contactId;
    } catch (error) {
      this.logger.error('Failed to create contact:', error);
      throw error;
    }
  }

  async updateContact(id: number, updates: Partial<AutotaskContact>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating contact ${id}:`, updates);
      await client.contacts.update(id, updates as any);
      this.logger.info(`Contact ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update contact ${id}:`, error);
      throw error;
    }
  }

  // Ticket operations
  async getTicket(id: number, fullDetails: boolean = false): Promise<AutotaskTicket | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting ticket with ID: ${id}, fullDetails: ${fullDetails}`);
      
      const result = await client.tickets.get(id);
      const ticket = result.data as AutotaskTicket;
      
      if (!ticket) {
        return null;
      }
      
      // Apply optimization unless full details requested
      return fullDetails ? ticket : this.optimizeTicketData(ticket);
    } catch (error) {
      this.logger.error(`Failed to get ticket ${id}:`, error);
      throw error;
    }
  }

  async searchTickets(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskTicket[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching tickets with options:', options);

      const filters: any[] = [];

      if (options.searchTerm) {
        filters.push({
          op: 'beginsWith',
          field: 'ticketNumber',
          value: options.searchTerm
        });
      }

      if (options.status !== undefined) {
        filters.push({
          op: 'eq',
          field: 'status',
          value: options.status
        });
      } else {
        filters.push({
          op: 'ne',
          field: 'status',
          value: 5  // 5 = Complete in Autotask
        });
      }

      if (options.unassigned === true) {
        filters.push({
          op: 'eq',
          field: 'assignedResourceID',
          value: null
        });
      } else if (options.assignedResourceID !== undefined) {
        filters.push({
          op: 'eq',
          field: 'assignedResourceID',
          value: options.assignedResourceID
        });
      }

      if (options.companyId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'companyID',
          value: options.companyId
        });
      }

      // Date filters
      if (options.createdAfter) {
        filters.push({
          op: 'gte',
          field: 'createDate',
          value: options.createdAfter
        });
      }
      if (options.createdBefore) {
        filters.push({
          op: 'lte',
          field: 'createDate',
          value: options.createdBefore
        });
      }
      if (options.lastActivityAfter) {
        filters.push({
          op: 'gte',
          field: 'lastActivityDate',
          value: options.lastActivityAfter
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const queryOptions = {
        filter: filters,
        pageSize,
        ...(options.page && { page: options.page }),
      };

      const result = await client.tickets.list(queryOptions);
      const tickets = (result.data as AutotaskTicket[]) || [];
      const optimizedTickets = tickets.map(ticket => this.optimizeTicketDataAggressive(ticket));

      this.logger.info(`Retrieved ${optimizedTickets.length} tickets (page ${options.page || 1}, pageSize ${pageSize})`);
      return optimizedTickets;
    } catch (error) {
      this.logger.error('Failed to search tickets:', error);
      throw error;
    }
  }

  /**
   * Aggressively optimize ticket data by keeping only essential fields
   * Since the API returns all 76 fields (~2KB per ticket), we need to be very selective
   */
  private optimizeTicketDataAggressive(ticket: AutotaskTicket): AutotaskTicket {
    // Keep only the most essential fields to minimize response size
    const optimized: AutotaskTicket = {};
    
    if (ticket.id !== undefined) optimized.id = ticket.id;
    if (ticket.ticketNumber !== undefined) optimized.ticketNumber = ticket.ticketNumber;
    if (ticket.title !== undefined) optimized.title = ticket.title;
    
    // Handle description with truncation
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
    
    // Handle resolution with truncation
    if (ticket.resolution !== undefined && ticket.resolution !== null) {
      optimized.resolution = ticket.resolution.length > 100
        ? ticket.resolution.substring(0, 100) + '... [truncated - use get_ticket_details for full text]'
        : ticket.resolution;
    }
    
    return optimized;
  }

  /**
   * Optimize ticket data by truncating large text fields and removing unnecessary data
   * This is the less aggressive version used by getTicket
   */
  private optimizeTicketData(ticket: AutotaskTicket): AutotaskTicket {
    const maxDescriptionLength = 500;
    const maxNotesLength = 300;

    return {
      ...ticket,
      // Truncate description if too long
      description: ticket.description && ticket.description.length > maxDescriptionLength
        ? ticket.description.substring(0, maxDescriptionLength) + '... [truncated]'
        : ticket.description,
      
      // Remove or truncate potentially large fields
      resolution: ticket.resolution && ticket.resolution.length > maxNotesLength
        ? ticket.resolution.substring(0, maxNotesLength) + '... [truncated]'
        : ticket.resolution,
        
      // Remove arrays that might contain large amounts of data
      userDefinedFields: [],
      
      // Keep only essential custom fields, truncate if present
      ...(ticket.purchaseOrderNumber && { 
        purchaseOrderNumber: ticket.purchaseOrderNumber.length > 50 
          ? ticket.purchaseOrderNumber.substring(0, 50) + '...' 
          : ticket.purchaseOrderNumber 
      })
    };
  }

  async createTicket(ticket: Partial<AutotaskTicket>): Promise<number> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Creating ticket:', ticket);
      const result = await client.tickets.create(ticket as any);
      const ticketId = (result.data as any)?.id;
      this.logger.info(`Ticket created with ID: ${ticketId}`);
      return ticketId;
    } catch (error) {
      this.logger.error('Failed to create ticket:', error);
      // Extract API-level validation errors from the original axios response so they
      // surface to the caller instead of being swallowed as a generic 500 message.
      const apiErrors: string[] | undefined =
        (error as any)?.originalError?.response?.data?.errors ||
        (error as any)?.response?.data?.errors;
      if (apiErrors && apiErrors.length > 0) {
        throw new Error(`Autotask API error: ${apiErrors.join('; ')}`);
      }
      throw error;
    }
  }

  async updateTicket(id: number, updates: Partial<AutotaskTicket>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating ticket ${id}:`, updates);
      await client.tickets.patch(id, updates as any);
      this.logger.info(`Ticket ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update ticket ${id}:`, error);
      throw error;
    }
  }

  // Time entry operations
  async createTimeEntry(timeEntry: Partial<AutotaskTimeEntry>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating time entry:', timeEntry);
      // autotask-node v2.1.0+ supports parent-child URL for ticket-scoped time entries
      if (timeEntry.ticketID) {
        const response = await (client as any).timeEntries.create(timeEntry.ticketID, timeEntry);
        const timeEntryId = response.data?.id;
        this.logger.info(`Time entry created with ID: ${timeEntryId}`);
        return timeEntryId;
      }
      // For task/project-scoped time entries, use direct axios call
      let endpoint: string;
      if (timeEntry.taskID) {
        endpoint = `/Tasks/${timeEntry.taskID}/TimeEntries`;
      } else if (timeEntry.projectID) {
        endpoint = `/Projects/${timeEntry.projectID}/TimeEntries`;
      } else {
        throw new Error('Time entry must have a ticketID, taskID, or projectID');
      }
      const response = await (client as any).axios.post(endpoint, timeEntry);
      const timeEntryId = response.data?.item?.id || response.data?.id;
      this.logger.info(`Time entry created with ID: ${timeEntryId}`);
      return timeEntryId;
    } catch (error) {
      this.logger.error('Failed to create time entry:', error);
      throw error;
    }
  }

  async getTimeEntries(options: AutotaskQueryOptions = {}): Promise<AutotaskTimeEntry[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Getting time entries with options:', options);
      const result = await client.timeEntries.list(options as any);
      return (result.data as AutotaskTimeEntry[]) || [];
    } catch (error) {
      this.logger.error('Failed to get time entries:', error);
      throw error;
    }
  }

  // Project operations
  async getProject(id: number): Promise<AutotaskProject | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting project with ID: ${id}`);
      const result = await client.projects.get(id);
      return result.data as unknown as AutotaskProject || null;
    } catch (error) {
      this.logger.error(`Failed to get project ${id}:`, error);
      throw error;
    }
  }

  async searchProjects(options: AutotaskQueryOptions = {}): Promise<AutotaskProject[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching projects with options:', options);
      
      // WORKAROUND: The autotask-node library's projects.list() method is broken
      // It uses GET with query params instead of POST with body like the working companies endpoint
      // We'll bypass it and make the correct API call directly
      
      // Prepare search body in the same format as working companies endpoint
      const searchBody: any = {};
      
      // Ensure there's a filter - Autotask API requires a filter
      if (!options.filter || (Array.isArray(options.filter) && options.filter.length === 0) || 
          (!Array.isArray(options.filter) && Object.keys(options.filter).length === 0)) {
        searchBody.filter = [
          {
            "op": "gte",
            "field": "id",
            "value": 0
          }
        ];
      } else {
        // If filter is provided as an object, convert to array format expected by API
        if (!Array.isArray(options.filter)) {
          const filterArray = [];
          for (const [field, value] of Object.entries(options.filter)) {
            filterArray.push({
              "op": "eq",
              "field": field,
              "value": value
            });
          }
          searchBody.filter = filterArray;
        } else {
          searchBody.filter = options.filter;
        }
      }

      // Add other search parameters
      if (options.sort) searchBody.sort = options.sort;
      if (options.page) searchBody.page = options.page;
      if (options.pageSize) searchBody.pageSize = options.pageSize;
      
      // Set default pagination and field limits
      const pageSize = options.pageSize || 25;
      const finalPageSize = pageSize > 100 ? 100 : pageSize;
      searchBody.pageSize = finalPageSize;

      this.logger.debug('Making direct API call to Projects/query with body:', searchBody);

      // Make the correct API call directly using the axios instance from the client
      const response = await (client as any).axios.post('/Projects/query', searchBody);
      
      // Extract projects from response (should be in response.data.items format)
      let projects: AutotaskProject[] = [];
      if (response.data && response.data.items) {
        projects = response.data.items;
      } else if (Array.isArray(response.data)) {
        projects = response.data;
      } else {
        this.logger.warn('Unexpected response format from Projects/query:', response.data);
        projects = [];
      }
      
      // Transform projects to optimize data size
      const optimizedProjects = projects.map(project => this.optimizeProjectData(project));
      
      this.logger.info(`Retrieved ${optimizedProjects.length} projects (optimized for size)`);
      return optimizedProjects;
    } catch (error: any) {
      // Check if it's the same 405 error pattern
      if (error.response && error.response.status === 405) {
        this.logger.warn('Projects endpoint may not support listing via API (405 Method Not Allowed). This is common with some Autotask configurations.');
        return [];
      }
      this.logger.error('Failed to search projects:', error);
      throw error;
    }
  }

  /**
   * Optimize project data by truncating large text fields
   */
  private optimizeProjectData(project: AutotaskProject): AutotaskProject {
    const maxDescriptionLength = 500;

    const optimizedDescription = project.description 
      ? (project.description.length > maxDescriptionLength
          ? project.description.substring(0, maxDescriptionLength) + '... [truncated]'
          : project.description)
      : '';

    return {
      ...project,
      description: optimizedDescription,
      // Remove potentially large arrays
      userDefinedFields: []
    };
  }

  async createProject(project: Partial<AutotaskProject>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating project:', project);
      const result = await client.projects.create(project as any);
      const projectId = (result.data as any)?.id;
      this.logger.info(`Project created with ID: ${projectId}`);
      return projectId;
    } catch (error) {
      this.logger.error('Failed to create project:', error);
      throw error;
    }
  }

  async updateProject(id: number, updates: Partial<AutotaskProject>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating project ${id}:`, updates);
      await client.projects.update(id, updates as any);
      this.logger.info(`Project ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update project ${id}:`, error);
      throw error;
    }
  }

  // Resource operations
  async getResource(id: number): Promise<AutotaskResource | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting resource with ID: ${id}`);
      const result = await client.resources.get(id);
      return result.data as AutotaskResource || null;
    } catch (error) {
      this.logger.error(`Failed to get resource ${id}:`, error);
      throw error;
    }
  }

  async searchResources(options: AutotaskQueryOptions = {}): Promise<AutotaskResource[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching resources with options:', options);

      const filters: any[] = [];

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
      const queryOptions: any = {
        pageSize,
        ...(options.page && { page: options.page }),
        ...(filters.length > 0 && { filter: filters }),
      };

      const result = await client.resources.list(queryOptions as any);
      const resources = (result.data as AutotaskResource[]) || [];

      this.logger.info(`Retrieved ${resources.length} resources (page ${options.page || 1}, pageSize ${pageSize})`);
      return resources;
    } catch (error) {
      this.logger.error('Failed to search resources:', error);
      throw error;
    }
  }

  // Configuration Item operations
  async getConfigurationItem(id: number): Promise<AutotaskConfigurationItem | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting configuration item with ID: ${id}`);
      const result = await client.configurationItems.get(id);
      return result.data as AutotaskConfigurationItem || null;
    } catch (error) {
      this.logger.error(`Failed to get configuration item ${id}:`, error);
      throw error;
    }
  }

  async searchConfigurationItems(options: AutotaskQueryOptions = {}): Promise<AutotaskConfigurationItem[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching configuration items with options:', options);
      const result = await client.configurationItems.list(options as any);
      return (result.data as AutotaskConfigurationItem[]) || [];
    } catch (error) {
      this.logger.error('Failed to search configuration items:', error);
      throw error;
    }
  }

  async createConfigurationItem(configItem: Partial<AutotaskConfigurationItem>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating configuration item:', configItem);
      const result = await client.configurationItems.create(configItem as any);
      const configItemId = (result.data as any)?.id;
      this.logger.info(`Configuration item created with ID: ${configItemId}`);
      return configItemId;
    } catch (error) {
      this.logger.error('Failed to create configuration item:', error);
      throw error;
    }
  }

  async updateConfigurationItem(id: number, updates: Partial<AutotaskConfigurationItem>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating configuration item ${id}:`, updates);
      await client.configurationItems.update(id, updates as any);
      this.logger.info(`Configuration item ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update configuration item ${id}:`, error);
      throw error;
    }
  }

  // Contract operations (read-only for now as they're complex)
  async getContract(id: number): Promise<AutotaskContract | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting contract with ID: ${id}`);
      const result = await client.contracts.get(id);
      return result.data as unknown as AutotaskContract || null;
    } catch (error) {
      this.logger.error(`Failed to get contract ${id}:`, error);
      throw error;
    }
  }

  async searchContracts(options: AutotaskQueryOptions = {}): Promise<AutotaskContract[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching contracts with options:', options);
      const result = await client.contracts.list(options as any);
      return (result.data as unknown as AutotaskContract[]) || [];
    } catch (error) {
      this.logger.error('Failed to search contracts:', error);
      throw error;
    }
  }

  // Invoice operations (read-only)
  async getInvoice(id: number): Promise<AutotaskInvoice | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting invoice with ID: ${id}`);
      const result = await client.invoices.get(id);
      return result.data as AutotaskInvoice || null;
    } catch (error) {
      this.logger.error(`Failed to get invoice ${id}:`, error);
      throw error;
    }
  }

  async searchInvoices(options: AutotaskQueryOptions = {}): Promise<AutotaskInvoice[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching invoices with options:', options);
      const result = await client.invoices.list(options as any);
      return (result.data as AutotaskInvoice[]) || [];
    } catch (error) {
      this.logger.error('Failed to search invoices:', error);
      throw error;
    }
  }

  // Task operations
  async getTask(id: number): Promise<AutotaskTask | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting task with ID: ${id}`);
      const result = await client.tasks.get(id);
      return result.data as unknown as AutotaskTask || null;
    } catch (error) {
      this.logger.error(`Failed to get task ${id}:`, error);
      throw error;
    }
  }

  async searchTasks(options: AutotaskQueryOptions = {}): Promise<AutotaskTask[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching tasks with options:', options);
      
      // Set default pagination
      const optimizedOptions = {
        ...options,
        pageSize: options.pageSize || 25,
        ...(options.pageSize && options.pageSize > 100 && { pageSize: 100 })
      };

      const result = await client.tasks.list(optimizedOptions as any);
      const tasks = (result.data as unknown as AutotaskTask[]) || [];
      
      // Transform tasks to optimize data size
      const optimizedTasks = tasks.map(task => this.optimizeTaskData(task));
      
      this.logger.info(`Retrieved ${optimizedTasks.length} tasks (optimized for size)`);
      return optimizedTasks;
    } catch (error) {
      this.logger.error('Failed to search tasks:', error);
      throw error;
    }
  }

  /**
   * Optimize task data by truncating large text fields
   */
  private optimizeTaskData(task: AutotaskTask): AutotaskTask {
    const maxDescriptionLength = 400;

    const optimizedDescription = task.description 
      ? (task.description.length > maxDescriptionLength
          ? task.description.substring(0, maxDescriptionLength) + '... [truncated]'
          : task.description)
      : '';

    return {
      ...task,
      description: optimizedDescription,
      // Remove potentially large arrays
      userDefinedFields: []
    };
  }

  async createTask(task: Partial<AutotaskTask>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating task:', task);
      const result = await client.tasks.create(task as any);
      const taskId = (result.data as any)?.id;
      this.logger.info(`Task created with ID: ${taskId}`);
      return taskId;
    } catch (error) {
      this.logger.error('Failed to create task:', error);
      throw error;
    }
  }

  async updateTask(id: number, updates: Partial<AutotaskTask>): Promise<void> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Updating task ${id}:`, updates);
      await client.tasks.update(id, updates as any);
      this.logger.info(`Task ${id} updated successfully`);
    } catch (error) {
      this.logger.error(`Failed to update task ${id}:`, error);
      throw error;
    }
  }

  // Utility methods
  async testConnection(): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      // Try to get account with ID 0 as a connection test
      const result = await client.accounts.get(0);
      this.logger.info('Connection test successful:', { hasData: !!result.data, resultType: typeof result });
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  // =====================================================
  // NEW ENTITY METHODS - Phase 1: High-Priority Entities
  // =====================================================

  // Generic note operations
  private async getNote(parentField: string, parentId: number, noteId: number): Promise<any> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting note - ${parentField}: ${parentId}, noteID: ${noteId}`);
      const result = await client.notes.list({
        filter: [
          { field: parentField, op: 'eq', value: parentId },
          { field: 'id', op: 'eq', value: noteId }
        ]
      });
      const notes = (result.data as any[]) || [];
      return notes[0] || null;
    } catch (error) {
      this.logger.error(`Failed to get note ${noteId} for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  private async searchNotes(parentField: string, parentId: number, options: AutotaskQueryOptionsExtended = {}): Promise<any[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Searching notes for ${parentField}=${parentId}:`, options);
      const result = await client.notes.list({
        filter: [{ field: parentField, op: 'eq', value: parentId }],
        pageSize: options.pageSize || 25
      });
      const notes = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${notes.length} notes for ${parentField}=${parentId}`);
      return notes;
    } catch (error) {
      this.logger.error(`Failed to search notes for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  private async createNote(parentField: string, parentId: number, note: Record<string, any>): Promise<number> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Creating note for ${parentField}=${parentId}:`, note);
      // Autotask REST API requires sub-resource URLs (e.g. /Tickets/{id}/Notes) for note creation.
      // The flat /TicketNotes endpoint returns "Resource not found" for valid tickets.
      // Map parentField to the correct sub-resource path and body field name.
      const urlMap: Record<string, { path: string; bodyField: string }> = {
        ticketId:  { path: `Tickets/${parentId}/Notes`,   bodyField: 'ticketID' },
        projectId: { path: `Projects/${parentId}/Notes`,  bodyField: 'projectID' },
        accountId: { path: `Companies/${parentId}/Notes`, bodyField: 'companyID' },
      };
      const mapping = urlMap[parentField];
      if (!mapping) {
        throw new Error(`Unknown parent field for note creation: ${parentField}`);
      }
      const noteData = { ...note, [mapping.bodyField]: parentId };
      const axiosInstance = (client as any).axios;
      const response = await axiosInstance.post(mapping.path, noteData);
      const noteId = response.data?.itemId ?? response.data?.id;
      this.logger.info(`Note created with ID: ${noteId} for ${parentField}=${parentId}`);
      return noteId;
    } catch (error) {
      this.logger.error(`Failed to create note for ${parentField}=${parentId}:`, error);
      throw error;
    }
  }

  // Public note API (thin wrappers preserving existing signatures)
  async getTicketNote(ticketId: number, noteId: number): Promise<AutotaskTicketNote | null> {
    return this.getNote('ticketId', ticketId, noteId);
  }
  async searchTicketNotes(ticketId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskTicketNote[]> {
    return this.searchNotes('ticketId', ticketId, opts);
  }
  async createTicketNote(ticketId: number, note: Partial<AutotaskTicketNote>): Promise<number> {
    return this.createNote('ticketId', ticketId, note);
  }

  async getProjectNote(projectId: number, noteId: number): Promise<AutotaskProjectNote | null> {
    return this.getNote('projectId', projectId, noteId);
  }
  async searchProjectNotes(projectId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskProjectNote[]> {
    return this.searchNotes('projectId', projectId, opts);
  }
  async createProjectNote(projectId: number, note: Partial<AutotaskProjectNote>): Promise<number> {
    return this.createNote('projectId', projectId, note);
  }

  async getCompanyNote(companyId: number, noteId: number): Promise<AutotaskCompanyNote | null> {
    return this.getNote('accountId', companyId, noteId);
  }
  async searchCompanyNotes(companyId: number, opts?: AutotaskQueryOptionsExtended): Promise<AutotaskCompanyNote[]> {
    return this.searchNotes('accountId', companyId, opts);
  }
  async createCompanyNote(companyId: number, note: Partial<AutotaskCompanyNote>): Promise<number> {
    return this.createNote('accountId', companyId, note);
  }

  // Attachment entities - Using the generic attachments endpoint
  async getTicketAttachment(ticketId: number, attachmentId: number, includeData: boolean = false): Promise<AutotaskTicketAttachment | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting ticket attachment - TicketID: ${ticketId}, AttachmentID: ${attachmentId}, includeData: ${includeData}`);
      
      // Search for attachment by parent ID and attachment ID
      const result = await client.attachments.list({
        filter: [
          { field: 'parentId', op: 'eq', value: ticketId },
          { field: 'id', op: 'eq', value: attachmentId }
        ]
      });
      
      const attachments = (result.data as any[]) || [];
      return attachments.length > 0 ? attachments[0] as AutotaskTicketAttachment : null;
    } catch (error) {
      this.logger.error(`Failed to get ticket attachment ${attachmentId} for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async searchTicketAttachments(ticketId: number, options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskTicketAttachment[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Searching ticket attachments for ticket ${ticketId}:`, options);
      
      const optimizedOptions = {
        filter: [
          { field: 'parentId', op: 'eq', value: ticketId }
        ],
        pageSize: options.pageSize || 10
      };

      const result = await client.attachments.list(optimizedOptions);
      const attachments = (result.data as any[]) || [];
      
      this.logger.info(`Retrieved ${attachments.length} ticket attachments`);
      return attachments as AutotaskTicketAttachment[];
    } catch (error) {
      this.logger.error(`Failed to search ticket attachments for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  // Expense entities
  async getExpenseReport(id: number): Promise<AutotaskExpenseReport | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting expense report with ID: ${id}`);
      const result = await client.expenseReports.get(id);
      return result.data as unknown as AutotaskExpenseReport || null;
    } catch (error) {
      this.logger.error(`Failed to get expense report ${id}:`, error);
      throw error;
    }
  }

  async searchExpenseReports(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskExpenseReport[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching expense reports with options:', options);
      
      // Build filter based on provided options
      const filters = [];
      if (options.submitterId) {
        filters.push({ field: 'resourceId', op: 'eq', value: options.submitterId });
      }
      if (options.status) {
        filters.push({ field: 'status', op: 'eq', value: options.status });
      }
      
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };

      const result = await client.expenseReports.list(queryOptions);
      const reports = (result.data as any[]) || [];
      
      this.logger.info(`Retrieved ${reports.length} expense reports`);
      return reports as AutotaskExpenseReport[];
    } catch (error) {
      this.logger.error('Failed to search expense reports:', error);
      throw error;
    }
  }

  async createExpenseReport(report: Partial<AutotaskExpenseReport>): Promise<number> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Creating expense report:', report);
      const result = await client.expenseReports.create(report as any);
      const reportId = (result.data as any)?.id;
      this.logger.info(`Expense report created with ID: ${reportId}`);
      return reportId;
    } catch (error) {
      this.logger.error('Failed to create expense report:', error);
      throw error;
    }
  }

  async getExpenseItem(itemId: number): Promise<AutotaskExpenseItem | null> {
    const client = await this.ensureClient();

    try {
      this.logger.debug(`Getting expense item with ID: ${itemId}`);
      const result = await client.expenseItems.get(itemId);
      return result.data as unknown as AutotaskExpenseItem || null;
    } catch (error) {
      this.logger.error(`Failed to get expense item ${itemId}:`, error);
      throw error;
    }
  }

  async searchExpenseItems(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskExpenseItem[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching expense items with options:', options);

      const filters = [];
      if (options.expenseReportId) {
        filters.push({ field: 'expenseReportID', op: 'eq', value: options.expenseReportId });
      }
      if (options.startDate) {
        filters.push({ field: 'expenseDate', op: 'gte', value: options.startDate });
      }
      if (options.endDate) {
        filters.push({ field: 'expenseDate', op: 'lte', value: options.endDate });
      }

      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };

      const result = await client.expenseItems.list(queryOptions);
      const items = (result.data as any[]) || [];

      this.logger.info(`Retrieved ${items.length} expense items`);
      return items as AutotaskExpenseItem[];
    } catch (error) {
      this.logger.error('Failed to search expense items:', error);
      throw error;
    }
  }

  async createExpenseItem(item: Partial<AutotaskExpenseItem>): Promise<number> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Creating expense item:', item);
      const result = await client.expenseItems.create(item as any);
      const itemId = (result.data as any)?.id;
      this.logger.info(`Expense item created with ID: ${itemId}`);
      return itemId;
    } catch (error) {
      this.logger.error('Failed to create expense item:', error);
      throw error;
    }
  }

  // Quote entity
  async getQuote(id: number): Promise<AutotaskQuote | null> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug(`Getting quote with ID: ${id}`);
      const result = await client.quotes.get(id);
      return result.data as AutotaskQuote || null;
    } catch (error) {
      this.logger.error(`Failed to get quote ${id}:`, error);
      throw error;
    }
  }

  async searchQuotes(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskQuote[]> {
    const client = await this.ensureClient();
    
    try {
      this.logger.debug('Searching quotes with options:', options);
      
      // Build filter based on provided options
      const filters = [];
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

      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };

      const result = await client.quotes.list(queryOptions);
      const quotes = (result.data as any[]) || [];
      
      this.logger.info(`Retrieved ${quotes.length} quotes`);
      return quotes as AutotaskQuote[];
    } catch (error) {
      this.logger.error('Failed to search quotes:', error);
      throw error;
    }
  }

  async createQuote(quote: Partial<AutotaskQuote>): Promise<number> {
    const client = await this.ensureClient();

    try {
      // Autotask API requires billToLocationID, shipToLocationID, soldToLocationID,
      // paymentTerm, paymentType, shippingType for quote creation.
      // Auto-populate location IDs from the company if not provided.
      if (quote.companyID && (!quote.billToLocationID || !quote.shipToLocationID || !quote.soldToLocationID)) {
        try {
          const locResult = await client.companyLocations.list({
            filter: { companyID: quote.companyID },
            pageSize: 10,
          });
          const locations = (locResult.data || []) as any[];
          if (locations.length > 0) {
            // Use the first location as default for all three if not specified
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
      const result = await client.quotes.create(quote as any);
      const quoteId = (result.data as any)?.id;
      this.logger.info(`Quote created with ID: ${quoteId}`);
      return quoteId;
    } catch (error) {
      this.logger.error('Failed to create quote:', error);
      throw error;
    }
  }

  // =====================================================
  // OPPORTUNITIES
  // =====================================================

  async getOpportunity(id: number): Promise<AutotaskOpportunity | null> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting opportunity with ID: ${id}`);
      const result = await client.opportunities.get(id);
      return result.data as AutotaskOpportunity || null;
    } catch (error) {
      this.logger.error(`Failed to get opportunity ${id}:`, error);
      throw error;
    }
  }

  async searchOpportunities(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskOpportunity[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug('Searching opportunities with options:', options);
      const filters = [];
      if (options.companyId) {
        filters.push({ field: 'companyID', op: 'eq', value: options.companyId });
      }
      if (options.searchTerm) {
        filters.push({ field: 'title', op: 'contains', value: options.searchTerm });
      }
      if (options.status !== undefined) {
        filters.push({ field: 'status', op: 'eq', value: options.status });
      }
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };
      const result = await client.opportunities.list(queryOptions);
      const items = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${items.length} opportunities`);
      return items as AutotaskOpportunity[];
    } catch (error) {
      this.logger.error('Failed to search opportunities:', error);
      throw error;
    }
  }

  async createOpportunity(opportunity: Record<string, any>): Promise<number> {
    const client = await this.ensureClient();
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

      const result = await client.opportunities.create(oppData as any);
      const newId = (result.data as any)?.id || (result.data as any)?.itemId;
      this.logger.info(`Created opportunity with ID: ${newId}`);
      return newId;
    } catch (error) {
      this.logger.error('Failed to create opportunity:', error);
      throw error;
    }
  }

  // =====================================================
  // PRODUCTS
  // =====================================================

  async getProduct(id: number): Promise<AutotaskProduct | null> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting product with ID: ${id}`);
      const result = await client.products.get(id);
      return result.data as AutotaskProduct || null;
    } catch (error) {
      this.logger.error(`Failed to get product ${id}:`, error);
      throw error;
    }
  }

  async searchProducts(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskProduct[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug('Searching products with options:', options);
      const filters = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };
      const result = await client.products.list(queryOptions);
      const items = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${items.length} products`);
      return items as AutotaskProduct[];
    } catch (error) {
      this.logger.error('Failed to search products:', error);
      throw error;
    }
  }

  // =====================================================
  // SERVICES
  // =====================================================

  async getService(id: number): Promise<AutotaskServiceEntity | null> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting service with ID: ${id}`);
      const result = await client.services.get(id);
      return result.data as AutotaskServiceEntity || null;
    } catch (error) {
      this.logger.error(`Failed to get service ${id}:`, error);
      throw error;
    }
  }

  async searchServices(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceEntity[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug('Searching services with options:', options);
      const filters = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };
      const result = await client.services.list(queryOptions);
      const items = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${items.length} services`);
      return items as AutotaskServiceEntity[];
    } catch (error) {
      this.logger.error('Failed to search services:', error);
      throw error;
    }
  }

  // =====================================================
  // SERVICE BUNDLES
  // =====================================================

  async getServiceBundle(id: number): Promise<AutotaskServiceBundle | null> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting service bundle with ID: ${id}`);
      const result = await client.serviceBundles.get(id);
      return result.data as AutotaskServiceBundle || null;
    } catch (error) {
      this.logger.error(`Failed to get service bundle ${id}:`, error);
      throw error;
    }
  }

  async searchServiceBundles(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskServiceBundle[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug('Searching service bundles with options:', options);
      const filters = [];
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      if (options.isActive !== undefined) {
        filters.push({ field: 'isActive', op: 'eq', value: options.isActive });
      }
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 25
      };
      const result = await client.serviceBundles.list(queryOptions);
      const items = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${items.length} service bundles`);
      return items as AutotaskServiceBundle[];
    } catch (error) {
      this.logger.error('Failed to search service bundles:', error);
      throw error;
    }
  }

  // =====================================================
  // QUOTE ITEMS
  // =====================================================

  async getQuoteItem(id: number): Promise<AutotaskQuoteItem | null> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Getting quote item with ID: ${id}`);
      const result = await client.quoteItems.get(id);
      return result.data as AutotaskQuoteItem || null;
    } catch (error) {
      this.logger.error(`Failed to get quote item ${id}:`, error);
      throw error;
    }
  }

  async searchQuoteItems(options: AutotaskQueryOptionsExtended & { quoteId?: number } = {}): Promise<AutotaskQuoteItem[]> {
    const client = await this.ensureClient();
    try {
      this.logger.debug('Searching quote items with options:', options);
      const filters = [];
      if (options.quoteId) {
        filters.push({ field: 'quoteID', op: 'eq', value: options.quoteId });
      }
      if (options.searchTerm) {
        filters.push({ field: 'name', op: 'contains', value: options.searchTerm });
      }
      const queryOptions = {
        filter: filters.length > 0 ? filters : [{ field: 'id', op: 'gte', value: 0 }],
        pageSize: options.pageSize || 50
      };
      const result = await client.quoteItems.list(queryOptions);
      const items = (result.data as any[]) || [];
      this.logger.info(`Retrieved ${items.length} quote items`);
      return items as AutotaskQuoteItem[];
    } catch (error) {
      this.logger.error('Failed to search quote items:', error);
      throw error;
    }
  }

  async createQuoteItem(item: Partial<AutotaskQuoteItem>): Promise<number> {
    const client = await this.ensureClient();
    try {
      // Auto-determine quoteItemType based on which ID field is set
      // 1=Product, 2=Cost(charge), 3=Labor, 4=Expense, 6=Shipping, 11=Service, 12=ServiceBundle
      let quoteItemType = item.quoteItemType;
      if (!quoteItemType) {
        if (item.serviceID) quoteItemType = 11;
        else if (item.serviceBundleID) quoteItemType = 12;
        else if (item.productID) quoteItemType = 1;
        else if (item.chargeID) quoteItemType = 2;
        else if (item.laborID) quoteItemType = 3;
        else if (item.expenseID) quoteItemType = 4;
        else if (item.shippingID) quoteItemType = 6;
        else quoteItemType = 2; // default to Cost
      }

      if (!item.quoteID) {
        throw new Error('quoteID is required to create a quote item');
      }

      // Apply defaults for required fields, let explicit item values override
      const quoteItem = {
        unitDiscount: 0,
        lineDiscount: 0,
        percentageDiscount: 0,
        isOptional: false,
        ...item,
        quoteItemType: item.quoteItemType || quoteItemType,
      };
      this.logger.debug('Creating quote item:', quoteItem);
      // QuoteItems is a child entity of Quotes - must use parent URL:
      // POST /Quotes/{quoteId}/QuoteItems
      const result = await client.quoteItems.create(item.quoteID, quoteItem as any);
      const itemId = (result.data as any)?.id;
      this.logger.info(`Quote item created with ID: ${itemId}`);
      return itemId;
    } catch (error) {
      this.logger.error('Failed to create quote item:', error);
      throw error;
    }
  }

  async updateQuoteItem(id: number, item: Partial<AutotaskQuoteItem>): Promise<void> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Updating quote item ${id}:`, item);
      await client.quoteItems.patch(id, item as any);
      this.logger.info(`Quote item ${id} updated`);
    } catch (error) {
      this.logger.error(`Failed to update quote item ${id}:`, error);
      throw error;
    }
  }

  async deleteQuoteItem(quoteId: number, id: number): Promise<void> {
    const client = await this.ensureClient();
    try {
      this.logger.debug(`Deleting quote item ${id} from quote ${quoteId}`);
      await client.quoteItems.delete(quoteId, id);
      this.logger.info(`Quote item ${id} deleted from quote ${quoteId}`);
    } catch (error) {
      this.logger.error(`Failed to delete quote item ${id}:`, error);
      throw error;
    }
  }

  // =====================================================
  // BILLING ITEMS - Approved and Posted billable items
  // =====================================================

  /**
   * Get a specific billing item by ID
   */
  async getBillingItem(id: number): Promise<AutotaskBillingItem | null> {
    const client = await this.ensureClient();

    try {
      this.logger.debug(`Getting billing item with ID: ${id}`);
      const result = await client.billingItems.get(id);
      return result.data as AutotaskBillingItem || null;
    } catch (error) {
      this.logger.error(`Failed to get billing item ${id}:`, error);
      throw error;
    }
  }

  /**
   * Search for billing items with optional filters
   * Billing items represent approved and posted billable items
   */
  async searchBillingItems(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskBillingItem[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching billing items with options:', options);

      const filters: any[] = [];

      // Filter by company
      if (options.companyId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'companyID',
          value: options.companyId
        });
      }

      // Filter by ticket
      if ((options as any).ticketId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'ticketID',
          value: (options as any).ticketId
        });
      }

      // Filter by project
      if ((options as any).projectId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'projectID',
          value: (options as any).projectId
        });
      }

      // Filter by contract
      if ((options as any).contractId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'contractID',
          value: (options as any).contractId
        });
      }

      // Filter by invoice
      if ((options as any).invoiceId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'invoiceID',
          value: (options as any).invoiceId
        });
      }

      // Date range filters for postedDate
      if ((options as any).postedAfter) {
        filters.push({
          op: 'gte',
          field: 'postedDate',
          value: (options as any).postedAfter
        });
      }
      if ((options as any).postedBefore) {
        filters.push({
          op: 'lte',
          field: 'postedDate',
          value: (options as any).postedBefore
        });
      }

      // If no filters provided, use a default to satisfy API requirement
      if (filters.length === 0) {
        filters.push({
          op: 'gte',
          field: 'id',
          value: 0
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const queryOptions = {
        filter: filters,
        pageSize,
        ...(options.page && { page: options.page }),
      };

      const result = await client.billingItems.list(queryOptions);
      const billingItems = (result.data as AutotaskBillingItem[]) || [];

      this.logger.info(`Retrieved ${billingItems.length} billing items (page ${options.page || 1}, pageSize ${pageSize})`);
      return billingItems;
    } catch (error) {
      this.logger.error('Failed to search billing items:', error);
      throw error;
    }
  }

  // =====================================================
  // BILLING ITEM APPROVAL LEVELS - Multi-level approval records
  // =====================================================

  /**
   * Search for billing item approval levels
   * These describe multi-level approval records for Autotask time entries
   */
  async searchBillingItemApprovalLevels(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskBillingItemApprovalLevel[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching billing item approval levels with options:', options);

      const filters: any[] = [];

      // Filter by time entry
      if ((options as any).timeEntryId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'timeEntryID',
          value: (options as any).timeEntryId
        });
      }

      // Filter by approval resource (approver)
      if ((options as any).approvalResourceId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'approvalResourceID',
          value: (options as any).approvalResourceId
        });
      }

      // Filter by approval level
      if ((options as any).approvalLevel !== undefined) {
        filters.push({
          op: 'eq',
          field: 'approvalLevel',
          value: (options as any).approvalLevel
        });
      }

      // Date range filters
      if ((options as any).approvedAfter) {
        filters.push({
          op: 'gte',
          field: 'approvalDateTime',
          value: (options as any).approvedAfter
        });
      }
      if ((options as any).approvedBefore) {
        filters.push({
          op: 'lte',
          field: 'approvalDateTime',
          value: (options as any).approvedBefore
        });
      }

      // If no filters provided, use a default
      if (filters.length === 0) {
        filters.push({
          op: 'gte',
          field: 'id',
          value: 0
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const queryOptions = {
        filter: filters,
        pageSize,
        ...(options.page && { page: options.page }),
      };

      const result = await client.billingItemApprovalLevels.list(queryOptions);
      const approvalLevels = (result.data as AutotaskBillingItemApprovalLevel[]) || [];

      this.logger.info(`Retrieved ${approvalLevels.length} billing item approval levels (page ${options.page || 1}, pageSize ${pageSize})`);
      return approvalLevels;
    } catch (error) {
      this.logger.error('Failed to search billing item approval levels:', error);
      throw error;
    }
  }

  /**
   * Search for time entries with optional filters
   * Exposes the existing getTimeEntries method with more filter options
   */
  async searchTimeEntries(options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskTimeEntry[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug('Searching time entries with options:', options);

      const filters: any[] = [];

      // Filter by resource
      if ((options as any).resourceId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'resourceID',
          value: (options as any).resourceId
        });
      }

      // Filter by ticket
      if ((options as any).ticketId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'ticketID',
          value: (options as any).ticketId
        });
      }

      // Filter by project
      if ((options as any).projectId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'projectID',
          value: (options as any).projectId
        });
      }

      // Filter by task
      if ((options as any).taskId !== undefined) {
        filters.push({
          op: 'eq',
          field: 'taskID',
          value: (options as any).taskId
        });
      }

      // Date range filters
      if ((options as any).dateWorkedAfter) {
        filters.push({
          op: 'gte',
          field: 'dateWorked',
          value: (options as any).dateWorkedAfter
        });
      }
      if ((options as any).dateWorkedBefore) {
        filters.push({
          op: 'lte',
          field: 'dateWorked',
          value: (options as any).dateWorkedBefore
        });
      }

      // Approval status filter - key for finding un-posted entries
      const approvalStatus = (options as any).approvalStatus;
      if (approvalStatus === 'unapproved') {
        // billingApprovalDateTime is null means not yet approved/posted
        filters.push({
          op: 'eq',
          field: 'billingApprovalDateTime',
          value: null
        });
      } else if (approvalStatus === 'approved') {
        // billingApprovalDateTime is not null means already approved/posted
        filters.push({
          op: 'isnotnull',
          field: 'billingApprovalDateTime'
        });
      }
      // 'all' or undefined = no filter

      // Billable status filter
      if ((options as any).billable !== undefined) {
        filters.push({
          op: 'eq',
          field: 'isNonBillable',
          value: !(options as any).billable  // isNonBillable is inverse of billable
        });
      }

      // If no filters provided, use a default
      if (filters.length === 0) {
        filters.push({
          op: 'gte',
          field: 'id',
          value: 0
        });
      }

      const pageSize = Math.min(options.pageSize || 25, 500);
      const queryOptions = {
        filter: filters,
        pageSize,
        ...(options.page && { page: options.page }),
      };

      const result = await client.timeEntries.list(queryOptions);
      const timeEntries = (result.data as AutotaskTimeEntry[]) || [];

      this.logger.info(`Retrieved ${timeEntries.length} time entries (page ${options.page || 1}, pageSize ${pageSize})`);
      return timeEntries;
    } catch (error) {
      this.logger.error('Failed to search time entries:', error);
      throw error;
    }
  }

  // BillingCode and Department entities are not directly available in autotask-node
  // These would need to be implemented via custom API calls or alternative endpoints
  async getBillingCode(_id: number): Promise<AutotaskBillingCode | null> {
    throw new Error('Billing codes API not directly available in autotask-node library');
  }

  async searchBillingCodes(_options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskBillingCode[]> {
    throw new Error('Billing codes API not directly available in autotask-node library');
  }

  async getDepartment(_id: number): Promise<AutotaskDepartment | null> {
    throw new Error('Departments API not directly available in autotask-node library');
  }

  async searchDepartments(_options: AutotaskQueryOptionsExtended = {}): Promise<AutotaskDepartment[]> {
    throw new Error('Departments API not directly available in autotask-node library');
  }

  /**
   * Get field information for an entity type (including picklist values)
   * Calls the Autotask REST API: GET /v1.0/{entityType}/entityInformation/fields
   */
  async getFieldInfo(entityType: string): Promise<FieldInfo[]> {
    const client = await this.ensureClient();

    try {
      this.logger.debug(`Getting field info for entity: ${entityType}`);

      // Access the internal axios instance to call the field info endpoint
      const axios = (client as any).axios;
      if (!axios) {
        throw new Error('Unable to access HTTP client from AutotaskClient');
      }

      const response = await axios.get(`/${entityType}/entityInformation/fields`);
      const data = response.data;

      // The Autotask API returns { fields: [...] }
      const rawFields = data?.fields || data?.items || data || [];

      return rawFields.map((field: any) => ({
        name: field.name,
        dataType: field.dataType,
        length: field.length,
        isRequired: field.isRequired || false,
        isReadOnly: field.isReadOnly || false,
        isQueryable: field.isQueryable || false,
        isReference: field.isReference || false,
        referenceEntityType: field.referenceEntityType,
        isPickList: field.isPickList || false,
        picklistValues: field.picklistValues?.map((pv: any) => ({
          value: String(pv.value),
          label: pv.label || pv.name || String(pv.value),
          isDefaultValue: pv.isDefaultValue || false,
          sortOrder: pv.sortOrder,
          isActive: pv.isActive !== false,
          isSystem: pv.isSystem || false,
          parentValue: pv.parentValue ? String(pv.parentValue) : undefined,
        })) as PicklistValue[] | undefined,
        picklistParentValueField: field.picklistParentValueField,
      }));
    } catch (error) {
      this.logger.error(`Failed to get field info for ${entityType}:`, error);
      throw error;
    }
  }
} 