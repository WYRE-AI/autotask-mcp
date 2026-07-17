// MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
// performs to render the ticket card:
//   1. renderable tools advertise the UI resource via _meta
//   2. the ui:// resource lists and reads back as profile=mcp-app HTML
//   3. buildTicketCard normalizes an enhanced ticket into the card payload
//      the iframe renders from, with tenant-safe note defaults

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { AutotaskResourceHandler } from '../src/handlers/resource.handler';
import {
  buildTicketCard,
  applyBrandInjection,
  resolveBrandFromEnv,
  TICKET_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from '../src/handlers/card.builder';
import { TICKET_CARD_HTML } from '../src/generated/ticket-card-html';
import { Logger } from '../src/utils/logger';

const logger = new Logger('error');

const RENDERABLE_TOOLS = ['autotask_get_ticket_details', 'autotask_create_ticket_note'];

describe('MCP Apps ticket card', () => {
  describe('tool _meta advertisement', () => {
    it.each(RENDERABLE_TOOLS)('%s links the card via _meta', (name) => {
      const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.['ui/resourceUri']).toBe(TICKET_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        TICKET_CARD_RESOURCE_URI,
      );
    });

    it('no other tools carry UI metadata', () => {
      const others = TOOL_DEFINITIONS.filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name),
      );
      expect(others).toEqual([]);
    });
  });

  describe('ui:// resource', () => {
    const handler = new AutotaskResourceHandler({} as never, logger);

    it('is listed with the MCP Apps MIME type', async () => {
      const resources = await handler.listResources();
      const card = resources.find((r) => r.uri === TICKET_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it('reads back as profile=mcp-app HTML containing the card app', async () => {
      const content = await handler.readResource(TICKET_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      expect(content.text).toBe(TICKET_CARD_HTML);
      expect(content.text).toContain('card__bar');
      expect(content.text).toContain('BRAND_INJECT');
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./ticket-card.ts"');
    });

    it('default bundle is brand-neutral (published server — no baked-in identity)', () => {
      expect(TICKET_CARD_HTML).not.toMatch(/WYRE/i);
      expect(TICKET_CARD_HTML).not.toContain('fonts.googleapis.com');
    });
  });

  describe('brand injection', () => {
    it('replaces the BRAND_INJECT marker with a window.__BRAND__ script', () => {
      const out = applyBrandInjection(TICKET_CARD_HTML, { name: 'Acme MSP', primaryColor: '#123456' });
      expect(out).not.toContain('BRAND_INJECT');
      expect(out).toContain('window.__BRAND__={"name":"Acme MSP","primaryColor":"#123456"}');
    });

    it('serves the HTML unchanged when no brand is configured', () => {
      expect(applyBrandInjection(TICKET_CARD_HTML, {})).toBe(TICKET_CARD_HTML);
    });

    it('escapes "<" so brand values cannot break out of the script element', () => {
      const out = applyBrandInjection(TICKET_CARD_HTML, { name: '</script><script>alert(1)' });
      expect(out).not.toContain('</script><script>alert(1)');
      expect(out).toContain('\\u003c/script>');
    });

    it('resolveBrandFromEnv maps MCP_BRAND_* vars and ignores everything else', () => {
      expect(
        resolveBrandFromEnv({
          MCP_BRAND_NAME: 'Acme MSP',
          MCP_BRAND_PRIMARY_COLOR: '#123456',
          UNRELATED: 'x',
        }),
      ).toEqual({ name: 'Acme MSP', primaryColor: '#123456' });
      expect(resolveBrandFromEnv({})).toEqual({});
    });
  });

  describe('buildTicketCard', () => {
    const picklists = {
      getPicklistValues: jest.fn(async (entity: string, field: string) => {
        const table: Record<string, Array<{ value: string; label: string }>> = {
          'Tickets.status': [{ value: '1', label: 'New' }],
          'Tickets.priority': [{ value: '2', label: 'High' }],
          'Tickets.queueID': [{ value: '8', label: 'Service Desk' }],
          'TicketNotes.noteType': [{ value: '3', label: 'Task Notes' }],
          'TicketNotes.publish': [
            { value: '1', label: 'All Autotask Users (Internal)' },
            { value: '2', label: 'Client Portal' },
          ],
        };
        return table[`${entity}.${field}`] ?? [];
      }),
    };
    const service = {
      searchTicketNotes: jest.fn(async () => [
        { title: 'Triage', description: 'Assigned to network team' },
      ]),
    };

    const enhancedTicket = {
      id: 48217,
      ticketNumber: 'T20260717.0042',
      title: 'VPN outage — main office',
      status: 1,
      priority: 2,
      queueID: 8,
      company: 'Acme Corp',
      assignedTo: 'Dana Ruiz',
      createDate: '2026-07-17T09:00:00Z',
      dueDateTime: '2026-07-18T17:00:00Z',
      estimatedHours: 4,
    };

    it('normalizes labels, names, and notes into the card payload', async () => {
      const card = await buildTicketCard(
        enhancedTicket,
        picklists as never,
        service as never,
        logger,
      );
      expect(card).toMatchObject({
        id: 48217,
        ticketNumber: 'T20260717.0042',
        title: 'VPN outage — main office',
        status: 'New',
        priority: 'High',
        queue: 'Service Desk',
        company: 'Acme Corp',
        assignedTo: 'Dana Ruiz',
        estimatedHours: 4,
        notes: [{ title: 'Triage', description: 'Assigned to network team' }],
      });
    });

    it('resolves internal-only note defaults for the add-note round-trip', async () => {
      const card = await buildTicketCard(
        enhancedTicket,
        picklists as never,
        service as never,
        logger,
      );
      expect(card?.noteDefaults).toEqual({ noteType: 3, publish: 1 });
    });

    it('omits note defaults when no internal publish option exists (fail-safe)', async () => {
      const noInternal = {
        getPicklistValues: jest.fn(async (entity: string, field: string) =>
          entity === 'TicketNotes' && field === 'publish'
            ? [{ value: '2', label: 'Client Portal' }]
            : picklists.getPicklistValues(entity, field),
        ),
      };
      const card = await buildTicketCard(
        enhancedTicket,
        noInternal as never,
        service as never,
        logger,
      );
      expect(card?.noteDefaults).toBeUndefined();
    });

    it('returns null for payloads that are not a ticket', async () => {
      const card = await buildTicketCard(
        { id: 1, name: 'not a ticket' },
        picklists as never,
        service as never,
        logger,
      );
      expect(card).toBeNull();
    });

    it('survives picklist and note failures (card is best-effort)', async () => {
      const failing = {
        getPicklistValues: jest.fn(async () => {
          throw new Error('Autotask 500');
        }),
      };
      const failingService = {
        searchTicketNotes: jest.fn(async () => {
          throw new Error('Autotask 500');
        }),
      };
      const card = await buildTicketCard(
        enhancedTicket,
        failing as never,
        failingService as never,
        logger,
      );
      expect(card).toMatchObject({ id: 48217, notes: [] });
      expect(card?.status).toBeUndefined();
      expect(card?.noteDefaults).toBeUndefined();
    });
  });
});
