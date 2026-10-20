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
  const getCi = jest.spyOn(service, 'getConfigurationItem');
  if (ci instanceof Error) getCi.mockRejectedValue(ci);
  else getCi.mockResolvedValue(ci as any);
  return { handler: new AutotaskToolHandler(service, logger), getTicket, getCi };
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
    expect(text).toContain('Contact ID: 311');
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
