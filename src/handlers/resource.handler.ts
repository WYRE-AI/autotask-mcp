// Autotask Resource Handler
// Handles MCP resource requests for read-only access to Autotask data

import { AutotaskService } from '../services/autotask.service.js';
import { Logger } from '../utils/logger.js';
import {
  TICKET_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
  applyBrandInjection,
  resolveBrandFromEnv,
} from './card.builder.js';
import { TICKET_CARD_HTML } from '../generated/ticket-card-html.js';

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

export class AutotaskResourceHandler {
  private autotaskService: AutotaskService;
  private logger: Logger;

  constructor(autotaskService: AutotaskService, logger: Logger) {
    this.autotaskService = autotaskService;
    this.logger = logger;
  }

  /**
   * List all available resources
   */
  async listResources(): Promise<McpResource[]> {
    this.logger.debug('Listing available Autotask resources');

    const resources: McpResource[] = [
      // MCP Apps (SEP-1865) UI surface — the interactive ticket card rendered
      // by hosts for autotask_get_ticket_details results.
      {
        uri: TICKET_CARD_RESOURCE_URI,
        name: 'Autotask Ticket Card',
        description: 'Interactive MCP Apps card rendering an Autotask ticket',
        mimeType: MCP_APP_RESOURCE_MIME
      },

      // Company resources
      {
        uri: 'autotask://companies',
        name: 'All Companies',
        description: 'List of all companies in Autotask',
        mimeType: 'application/json'
      },
      {
        uri: 'autotask://companies/{id}',
        name: 'Company by ID',
        description: 'Get specific company details by ID',
        mimeType: 'application/json'
      },

      // Contact resources
      {
        uri: 'autotask://contacts',
        name: 'All Contacts',
        description: 'List of all contacts in Autotask',
        mimeType: 'application/json'
      },
      {
        uri: 'autotask://contacts/{id}',
        name: 'Contact by ID',
        description: 'Get specific contact details by ID',
        mimeType: 'application/json'
      },

      // Ticket resources
      {
        uri: 'autotask://tickets',
        name: 'All Tickets',
        description: 'List of all tickets in Autotask',
        mimeType: 'application/json'
      },
      {
        uri: 'autotask://tickets/{id}',
        name: 'Ticket by ID',
        description: 'Get specific ticket details by ID',
        mimeType: 'application/json'
      },

      // Time entry resources
      {
        uri: 'autotask://time-entries',
        name: 'Time Entries',
        description: 'List of time entries in Autotask',
        mimeType: 'application/json'
      }
    ];

    this.logger.debug(`Listed ${resources.length} available resources`);
    return resources;
  }

  /**
   * Read a specific resource by URI
   */
  async readResource(uri: string): Promise<McpResourceContent> {
    this.logger.debug(`Reading resource: ${uri}`);

    // The ui:// ticket card is static HTML embedded at build time — no
    // Autotask API access needed (and none possible on e.g. Workers' fs-less
    // runtime, which is why the HTML is embedded rather than read from disk).
    if (uri === TICKET_CARD_RESOURCE_URI) {
      return {
        uri,
        mimeType: MCP_APP_RESOURCE_MIME,
        // Neutral by default; MCP_BRAND_* env vars rebrand at serve time.
        text: applyBrandInjection(TICKET_CARD_HTML, resolveBrandFromEnv())
      };
    }

    // Parse the URI to determine the resource type and ID
    const { resourceType, resourceId } = this.parseUri(uri);

    let data: any;
    let description: string;

    switch (resourceType) {
      case 'companies':
        if (resourceId) {
          data = await this.autotaskService.getCompany(parseInt(resourceId, 10));
          if (!data) {
            throw new Error(`Company with ID ${resourceId} not found`);
          }
          description = `Company: ${data.companyName || 'Unknown'}`;
        } else {
          data = await this.autotaskService.searchCompanies({ pageSize: 100 });
          description = `List of ${data.length} companies`;
        }
        break;

      case 'contacts':
        if (resourceId) {
          data = await this.autotaskService.getContact(parseInt(resourceId, 10));
          if (!data) {
            throw new Error(`Contact with ID ${resourceId} not found`);
          }
          description = `Contact: ${data.firstName} ${data.lastName}`;
        } else {
          data = await this.autotaskService.searchContacts({ pageSize: 100 });
          description = `List of ${data.length} contacts`;
        }
        break;

      case 'tickets':
        if (resourceId) {
          data = await this.autotaskService.getTicket(parseInt(resourceId, 10));
          if (!data) {
            throw new Error(`Ticket with ID ${resourceId} not found`);
          }
          description = `Ticket: ${data.title || data.ticketNumber || 'Unknown'}`;
        } else {
          data = await this.autotaskService.searchTickets({ pageSize: 100 });
          description = `List of ${data.length} tickets`;
        }
        break;

      case 'time-entries':
        data = await this.autotaskService.getTimeEntries({ pageSize: 100 });
        description = `List of ${data.length} time entries`;
        break;

      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }

    const content: McpResourceContent = {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify({
        description,
        uri,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          resourceType,
          resourceId: resourceId || null,
          count: Array.isArray(data) ? data.length : 1
        }
      }, null, 2)
    };

    this.logger.debug(`Successfully read resource: ${uri}`);
    return content;
  }

  /**
   * Parse a resource URI to extract type and ID
   */
  private parseUri(uri: string): { resourceType: string; resourceId?: string } {
    const match = uri.match(/^autotask:\/\/([^/]+)(?:\/(.+))?$/);
    
    if (!match) {
      throw new Error(`Invalid Autotask URI format: ${uri}`);
    }

    const [, resourceType, resourceId] = match;

    // Handle template URIs like "companies/{id}"
    if (resourceId === '{id}') {
      throw new Error(`Template URI not supported for reading: ${uri}. Please provide a specific ID.`);
    }

    return {
      resourceType,
      resourceId
    };
  }

} 