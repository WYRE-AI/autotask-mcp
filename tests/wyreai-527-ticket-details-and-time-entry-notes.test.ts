// WYREAI-527: the model only sees a tool result's `content` text, never its
// structuredContent. autotask_get_ticket_details used to put just
// "Ticket N: title (priority, status)" in content, hiding the description and
// linked CI; and time entry search dropped internalNotes in compact mode.

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { formatCompactResponse } from '../src/utils/response.formatter';
import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

const logger = new Logger('error');

const mockConfig: McpServerConfig = {
  name: 'test-server',
  version: '1.0.0',
  autotask: {
    username: 'test-username',
    secret: 'test-secret',
    integrationCode: 'test-integration-code',
  },
};

const DESCRIPTION = 'User reports the VPN drops every 10 minutes since the firmware update on the edge firewall.';

function baseTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 48217,
    ticketNumber: 'T20260717.0042',
    title: 'VPN outage - main office',
    description: DESCRIPTION,
    status: 1,
    priority: 2,
    queueID: 8,
    companyID: 0,
    contactID: 311,
    createDate: '2026-07-17T14:02:00Z',
    dueDateTime: '2026-07-18T14:02:00Z',
    configurationItemID: 9001,
    resolution: 'Rolled firewall firmware back to 7.2.4.',
    userDefinedFields: [{ name: 'Site', value: 'HQ' }],
    ...overrides,
  };
}

function setup(ticket: Record<string, unknown>, ci: Record<string, unknown> | Error | null) {
  const service = new AutotaskService(mockConfig, logger);
  const getTicket = jest.spyOn(service, 'getTicket').mockResolvedValue(ticket as any);
  jest.spyOn(service, 'searchTicketNotes').mockResolvedValue([
    { id: 1, title: 'Triage', description: 'Confirmed on two laptops.' },
  ] as any);
  jest.spyOn(service, 'getContact').mockRejectedValue(new Error('Autotask 500'));
  const getCi = jest.spyOn(service, 'getConfigurationItem');
  if (ci instanceof Error) getCi.mockRejectedValue(ci);
  else getCi.mockResolvedValue(ci as any);
  const handler = new AutotaskToolHandler(service, logger);
  // Keep every test offline: no real MappingService cache fill and no real
  // picklist (getFieldInfo) requests through the Autotask client.
  (handler as any).getMappingService = async () => ({
    getCompanyName: async () => null,
    getResourceName: async () => null,
  });
  jest.spyOn((handler as any).picklistCache, 'getPicklistValues').mockResolvedValue([]);
  return { handler, service, getTicket, getCi };
}

describe('WYREAI-527 autotask_get_ticket_details content text', () => {
  it('puts the description, linked CI and key fields in content, not only structuredContent', async () => {
    const { handler, getTicket, getCi } = setup(baseTicket(), {
      id: 9001,
      referenceTitle: 'HQ-FW01',
      referenceNumber: 'CI-0042',
      serialNumber: 'FGT60F123456',
      isActive: true,
    });

    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217, fullDetails: true });

    expect(result.isError).toBeFalsy();
    expect(getTicket).toHaveBeenCalledWith(48217, true);
    expect(getCi).toHaveBeenCalledWith(9001);
    const text = result.content[0].text;
    expect(text).toContain('T20260717.0042');
    expect(text).toContain(DESCRIPTION);
    expect(text).toMatch(/Configuration item: HQ-FW01 \(ID 9001 \| reference CI-0042 \| serial FGT60F123456\)/);
    // Contact lookup failed here, so the ID still comes through.
    expect(text).toContain('Contact: ID 311');
    expect(text).toContain('Due: 2026-07-18T14:02:00Z');
    expect(text).toContain('Rolled firewall firmware back to 7.2.4.');
    expect(text).toContain('Triage: Confirmed on two laptops.');

    // Full record follows, so UDFs and every other fetched field reach the model.
    const json = text.slice(text.indexOf('Full ticket record (JSON):') + 'Full ticket record (JSON):'.length).trim();
    const record = JSON.parse(json);
    expect(record.userDefinedFields).toEqual([{ name: 'Site', value: 'HQ' }]);
    expect(record.configurationItem).toMatchObject({ id: 9001, referenceTitle: 'HQ-FW01' });
    expect(record._card).toBeUndefined();

    // structuredContent still carries the card for MCP Apps hosts.
    const structured = result.structuredContent as { data?: Record<string, any> };
    expect(structured.data?._card).toMatchObject({ id: 48217 });
    expect(structured.data?.configurationItem).toMatchObject({ id: 9001 });
  });

  it('still returns the ticket when the CI lookup fails', async () => {
    const { handler } = setup(baseTicket(), new Error('Autotask 500'));
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Configuration item: ID 9001');
    expect(result.content[0].text).toContain(DESCRIPTION);
  });

  it('warns with the vendor HTTP status when the CI lookup fails, without failing the fetch', async () => {
    const err = Object.assign(new Error('Autotask GET /ConfigurationItems/9001 failed: HTTP 404'), { status: 404 });
    const { handler } = setup(baseTicket(), err);
    const warn = jest.spyOn(logger, 'warn');
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(result.isError).toBeFalsy();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Linked configuration item 9001 lookup failed (HTTP 404)'));
    warn.mockRestore();
  });

  it('still returns readable text, with notes, when no card can be built', async () => {
    // No title/ticketNumber -> buildTicketCard returns null.
    const { handler } = setup(baseTicket({ title: undefined, ticketNumber: undefined }), null);
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Ticket 48217: (no title)');
    expect(text).toContain('Status: #1 | Priority: #2 | Queue: #8');
    expect(text).toContain(DESCRIPTION);
    expect(text).toContain('- Triage: Confirmed on two laptops.');
    expect(text).toContain('Full ticket record (JSON):');
    const structured = result.structuredContent as { data: Record<string, any> };
    expect(structured.data._card).toBeUndefined();
  });

  it('says notes are unavailable (with the HTTP status) when the notes fetch fails, not "none"', async () => {
    const { handler, service } = setup(baseTicket(), null) as any;
    jest.spyOn(service, 'searchTicketNotes').mockRejectedValue(
      Object.assign(new Error('Autotask POST /TicketNotes/query failed: HTTP 503'), { status: 503 }),
    );
    const warn = jest.spyOn(logger, 'warn');
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Recent notes: unavailable (the Autotask notes lookup failed with HTTP 503; the ticket may still have notes)');
    expect(text).not.toContain('Recent notes: none');
    expect(text).toContain(DESCRIPTION);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ticket 48217 notes lookup failed (HTTP 503)'));
    warn.mockRestore();
  });

  it('still says "none" when the notes fetch succeeds with no notes', async () => {
    const { handler, service } = setup(baseTicket(), null) as any;
    jest.spyOn(service, 'searchTicketNotes').mockResolvedValue([]);
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(result.content[0].text).toContain('Recent notes: none');
  });

  it('fetches notes once and shares them with the card', async () => {
    const { handler, service } = setup(baseTicket(), null) as any;
    const notesSpy = jest.spyOn(service, 'searchTicketNotes');
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(notesSpy).toHaveBeenCalledTimes(1);
    const structured = result.structuredContent as { data: Record<string, any> };
    expect(structured.data._card.notes).toEqual([{ title: 'Triage', description: 'Confirmed on two laptops.' }]);
  });

  it('says when no CI is linked and skips the lookup', async () => {
    const { handler, getCi } = setup(baseTicket({ configurationItemID: undefined }), null);
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217 });
    expect(getCi).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('Configuration item: none linked');
  });
});

describe('WYREAI-527 time entry search keeps internalNotes', () => {
  const entry = {
    id: 7,
    resourceID: 29682885,
    ticketID: 48217,
    dateWorked: '2026-10-19T00:00:00Z',
    hoursWorked: 1.5,
    summaryNotes: 'Replaced switch',
    internalNotes: 'Customer declined the extended warranty',
  };

  it('compact formatter keeps internalNotes alongside summaryNotes', () => {
    const compact = formatCompactResponse([entry], 'timeEntries', {});
    expect(compact.items[0]).toMatchObject({
      summaryNotes: 'Replaced switch',
      internalNotes: 'Customer declined the extended warranty',
    });
  });

  it('autotask_search_time_entries returns internalNotes end to end', async () => {
    const service = new AutotaskService(mockConfig, logger);
    jest.spyOn(service, 'searchTimeEntries').mockResolvedValue([entry] as any);
    const handler = new AutotaskToolHandler(service, logger);
    (handler as any).getMappingService = async () => ({
      getCompanyName: async () => null,
      getResourceName: async () => null,
    });

    const result = await handler.callTool('autotask_search_time_entries', { ticketId: 48217 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.items[0].internalNotes).toBe('Customer declined the extended warranty');
    expect(body.items[0].summaryNotes).toBe('Replaced switch');
  });

  it('tool description tells the model internalNotes is returned', () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === 'autotask_search_time_entries');
    expect(tool?.description).toContain('internalNotes');
  });
});

// Net3's trigger: with autotask_create_ticket_note enabled the result carries a
// `_card` with noteDefaults, and the client showed only the one-line summary.
// These run the real getTicket (fullDetails true and false) behind a fake HTTP
// client, with picklists that resolve note defaults, so the card is fully built.
describe('WYREAI-527 note writing enabled (card with noteDefaults)', () => {
  const RAW_TICKET = {
    ...baseTicket(),
    description: DESCRIPTION,
    userDefinedFields: [
      { name: 'Site', value: 'HQ' },
      { name: 'Asset Tag', value: 'NET3-00417' },
      { name: 'Empty UDF', value: null },
    ],
  };

  const PICKLISTS: Record<string, Array<{ value: string; label: string }>> = {
    'Tickets.status': [{ value: '1', label: 'New' }],
    'Tickets.priority': [{ value: '2', label: 'Medium' }],
    'Tickets.queueID': [{ value: '8', label: 'Service Desk' }],
    'TicketNotes.noteType': [{ value: '1', label: 'Task Note' }],
    'TicketNotes.publish': [{ value: '1', label: 'All Autotask Users' }, { value: '2', label: 'Internal Only' }],
  };

  function setupWithCard() {
    const service = new AutotaskService(mockConfig, logger);
    const http = { get: jest.fn(async () => JSON.parse(JSON.stringify(RAW_TICKET))) };
    jest.spyOn(service as any, 'ensureClient').mockResolvedValue(http);
    jest.spyOn(service, 'searchTicketNotes').mockResolvedValue([
      { id: 1, title: 'Triage', description: 'Confirmed on two laptops.' },
      { id: 2, title: 'Vendor', description: 'Opened case with firewall vendor.' },
    ] as any);
    jest.spyOn(service, 'getConfigurationItem').mockResolvedValue({
      id: 9001, referenceTitle: 'HQ-FW01', serialNumber: 'FGT60F123456',
    } as any);
    jest.spyOn(service, 'getContact').mockResolvedValue({
      id: 311, firstName: 'Pat', lastName: 'Jensen', emailAddress: 'pat@example.com',
    } as any);
    const handler = new AutotaskToolHandler(service, logger);
    jest.spyOn((handler as any).picklistCache, 'getPicklistValues')
      .mockImplementation(async (...args: unknown[]) => PICKLISTS[`${args[0]}.${args[1]}`] ?? []);
    (handler as any).getMappingService = async () => ({
      getCompanyName: async () => 'Acme Corp',
      getResourceName: async () => null,
    });
    return handler;
  }

  it.each([true, false])('fullDetails=%s: text carries description, contact, CI, UDFs and notes', async (fullDetails) => {
    const handler = setupWithCard();
    const result = await handler.callTool('autotask_get_ticket_details', { ticketID: 48217, fullDetails });

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { data: Record<string, any> };
    // The exact Net3 shape: card attached, with note-writing defaults.
    expect(structured.data._card.noteDefaults).toEqual({ noteType: 1, publish: 2 });

    const text = result.content[0].text;
    expect(text).toContain('Ticket T20260717.0042: VPN outage - main office');
    expect(text).toContain('Status: New | Priority: Medium | Queue: Service Desk');
    expect(text).toContain(DESCRIPTION);
    expect(text).toContain('Contact: Pat Jensen (ID 311, pat@example.com)');
    expect(text).toContain('Configuration item: HQ-FW01 (ID 9001 | serial FGT60F123456)');
    expect(text).toContain('Custom fields (UDFs, 2 with values):\n- Site: HQ\n- Asset Tag: NET3-00417');
    expect(text).not.toContain('Empty UDF:');
    expect(text).toContain('Recent notes (2');
    expect(text).toContain('- Triage: Confirmed on two laptops.');
    expect(text).toContain('- Vendor: Opened case with firewall vendor.');
    expect(text).toContain('Rolled firewall firmware back to 7.2.4.');
    // Not the old one-liner, and not a bare JSON dump either.
    expect(text.split('\n').length).toBeGreaterThan(10);
    expect(text).toContain('Full ticket record (JSON):');
  });

  it('fullDetails=false keeps non-empty UDFs and caps long values', async () => {
    const service = new AutotaskService(mockConfig, logger);
    const long = 'x'.repeat(500);
    const http = { get: jest.fn(async () => ({ ...RAW_TICKET, userDefinedFields: [{ name: 'Long', value: long }, { name: 'Blank', value: '' }] })) };
    jest.spyOn(service as any, 'ensureClient').mockResolvedValue(http);
    const t = await service.getTicket(48217, false);
    const marker = '... [truncated]';
    expect(t?.userDefinedFields).toEqual([{ name: 'Long', value: 'x'.repeat(200 - marker.length) + marker }]);
    // The cap includes the marker.
    expect(t?.userDefinedFields?.[0].value).toHaveLength(200);
    const full = await service.getTicket(48217, true);
    expect(full?.userDefinedFields).toHaveLength(2);
  });
});
