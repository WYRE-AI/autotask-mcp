// Bulk Ticket Sweep Tests
// Covers autotask_find_duplicate_tickets (and its pure clustering core) and
// autotask_tickets_awaiting_response.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import { findDuplicateClusters, normalizeTitle, titleSimilarity } from '../src/utils/duplicates';
import type { McpServerConfig } from '../src/types/mcp';

const mockConfig: McpServerConfig = {
  name: 'test-server',
  version: '1.0.0',
  autotask: {
    username: 'test-username',
    secret: 'test-secret',
    integrationCode: 'test-integration-code'
  }
};

const mockLogger = new Logger('error');

function buildHandler(): { handler: AutotaskToolHandler; service: AutotaskService } {
  const service = new AutotaskService(mockConfig, mockLogger);
  return { handler: new AutotaskToolHandler(service, mockLogger), service };
}

function parse(result: { content: Array<{ text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

afterEach(() => jest.restoreAllMocks());

describe('normalizeTitle', () => {
  test('strips reply and forward prefixes, however stacked', () => {
    expect(normalizeTitle('RE: FW: Printer jam')).toBe('printer jam');
    expect(normalizeTitle('Automatic reply: Printer jam')).toBe('printer jam');
  });

  test('strips noise tags and ticket numbers but keeps meaningful brackets', () => {
    expect(normalizeTitle('[EXTERNAL] Printer jam T20260708.0004')).toBe('printer jam');
    expect(normalizeTitle('Opportunity Closed:[Quote Q10029]')).toBe('opportunity closed quote q10029');
  });
});

describe('titleSimilarity', () => {
  test('scores identical titles 1 and unrelated titles 0', () => {
    expect(titleSimilarity('printer jam', 'printer jam')).toBe(1);
    expect(titleSimilarity('printer jam', 'vpn outage')).toBe(0);
  });

  test('scores a contained title highly', () => {
    expect(titleSimilarity('printer jam', 'printer jam 3rd floor')).toBeGreaterThan(0.7);
  });
});

describe('findDuplicateClusters', () => {
  const base = { companyID: 10, createDate: '2026-09-01T09:00:00Z' };

  test('clusters a reply-spawned duplicate with its original', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, ticketNumber: 'T20260901.0001', title: 'Printer jam on 3rd floor', assignedResourceID: 100 },
      { ...base, id: 2, ticketNumber: 'T20260901.0002', title: 'RE: Printer jam on 3rd floor', createDate: '2026-09-01T11:00:00Z' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].tickets.map(t => t.id).sort()).toEqual([1, 2]);
    // The assigned ticket is the one to keep.
    expect(clusters[0].recommendedPrimaryId).toBe(1);
    expect(clusters[0].suspectedDuplicateIds).toEqual([2]);
  });

  test('never clusters tickets from different companies', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, companyID: 10, title: 'Printer jam' },
      { ...base, id: 2, companyID: 20, title: 'Printer jam' },
    ]);
    expect(clusters).toEqual([]);
  });

  test('ignores identical titles raised weeks apart (recurring alerts)', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, title: 'Backup failed', createDate: '2026-08-01T02:00:00Z' },
      { ...base, id: 2, title: 'Backup failed', createDate: '2026-09-01T02:00:00Z' },
    ]);
    expect(clusters).toEqual([]);
  });

  test('an explicit ticket-number cross-reference links tickets regardless of age or title', () => {
    const { clusters } = findDuplicateClusters([
      { id: 1, companyID: 10, ticketNumber: 'T20260801.0001', title: 'VPN drops', createDate: '2026-08-01T02:00:00Z' },
      { id: 2, companyID: 10, ticketNumber: 'T20260901.0009', title: 'Duplicate of T20260801.0001', createDate: '2026-09-01T02:00:00Z' },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reasons.join(' ')).toContain('references');
  });

  test('never flags siblings of the same parent ticket as duplicates', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, ticketNumber: 'T20260901.0005.001', title: 'Deploy laptop' },
      { ...base, id: 2, ticketNumber: 'T20260901.0005.002', title: 'Deploy laptop' },
    ]);
    expect(clusters).toEqual([]);
  });

  test('flags a cluster worked by two different engineers', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, title: 'Mailbox full', assignedResourceID: 100 },
      { ...base, id: 2, title: 'RE: Mailbox full', assignedResourceID: 200, createDate: '2026-09-01T10:00:00Z' },
    ]);
    expect(clusters[0].multipleEngineers).toBe(true);
  });

  test('sorts multi-engineer clusters first', () => {
    const { clusters } = findDuplicateClusters([
      { ...base, id: 1, companyID: 10, title: 'Mailbox full' },
      { ...base, id: 2, companyID: 10, title: 'Mailbox full' },
      { ...base, id: 3, companyID: 20, title: 'VPN outage', assignedResourceID: 100 },
      { ...base, id: 4, companyID: 20, title: 'VPN outage', assignedResourceID: 200 },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].multipleEngineers).toBe(true);
    expect(clusters[0].tickets.map(t => t.id).sort()).toEqual([3, 4]);
  });

  test('a higher threshold only keeps near-certain matches', () => {
    const tickets = [
      { ...base, id: 1, title: 'Printer jam 3rd floor' },
      { ...base, id: 2, title: 'Printer jam' },
    ];
    expect(findDuplicateClusters(tickets, { threshold: 0.7 }).clusters).toHaveLength(1);
    expect(findDuplicateClusters(tickets, { threshold: 0.95 }).clusters).toEqual([]);
  });
});

describe('autotask_find_duplicate_tickets', () => {
  test('returns clusters with a recommended primary and consolidation advice', async () => {
    const { handler, service } = buildHandler();
    jest.spyOn(service, 'searchTickets').mockResolvedValue([
      { id: 1, ticketNumber: 'T20260901.0001', title: 'Printer jam', companyID: 10, assignedResourceID: 100, createDate: '2026-09-01T09:00:00Z' },
      { id: 2, ticketNumber: 'T20260901.0002', title: 'RE: Printer jam', companyID: 10, createDate: '2026-09-01T11:00:00Z' },
      { id: 3, ticketNumber: 'T20260901.0003', title: 'VPN outage', companyID: 10, createDate: '2026-09-01T12:00:00Z' },
    ] as any);

    const parsed = parse(await handler.callTool('autotask_find_duplicate_tickets', { queueID: 8 }));

    expect(parsed.data.counts.clusters).toBe(1);
    expect(parsed.data.counts.openTicketsScanned).toBe(3);
    const cluster = parsed.data.duplicateClusters[0];
    expect(cluster.recommendedPrimary.ticketNumber).toBe('T20260901.0001');
    expect(cluster.suspectedDuplicates.map((t: any) => t.ticketNumber)).toEqual(['T20260901.0002']);
    expect(cluster.howToConsolidate).toContain('autotask_update_ticket');
  });

  test('scopes the search by queue and company', async () => {
    const { handler, service } = buildHandler();
    const searchSpy = jest.spyOn(service, 'searchTickets').mockResolvedValue([] as any);

    await handler.callTool('autotask_find_duplicate_tickets', { queueID: 8, companyID: 10 });

    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ queueID: 8, companyID: 10 }));
  });
});

describe('autotask_tickets_awaiting_response', () => {
  const openTicket = {
    id: 1, ticketNumber: 'T20260901.0001', title: 'Printer jam', status: 19, companyID: 10
  };

  function mockBoard(service: AutotaskService, notes: any[], tickets: any[] = [openTicket]) {
    jest.spyOn(service, 'searchTickets').mockResolvedValue(tickets as any);
    jest.spyOn(service, 'searchTicketNotes').mockResolvedValue(notes as any);
  }

  test('flags a ticket whose last substantive note came from a client contact', async () => {
    const { handler, service } = buildHandler();
    mockBoard(service, [
      { id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByResourceID: 100, description: 'Working on it' },
      { id: 2, createDateTime: '2026-09-02T09:00:00Z', createdByContactID: 55, description: 'Still broken, any update?' },
    ]);

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', { queueID: 8 }));

    expect(parsed.data.counts.awaitingResponse).toBe(1);
    const row = parsed.data.awaitingResponse[0];
    expect(row.ticketId).toBe(1);
    expect(row.lastInbound.contactID).toBe(55);
    expect(row.lastInbound.snippet).toContain('Still broken');
  });

  test('does not flag a ticket we already replied to', async () => {
    const { handler, service } = buildHandler();
    mockBoard(service, [
      { id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Still broken?' },
      { id: 2, createDateTime: '2026-09-02T09:00:00Z', createdByResourceID: 100, description: 'Fixed, please confirm' },
    ]);

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', {}));

    expect(parsed.data.counts.awaitingResponse).toBe(0);
    expect(parsed.data.counts.ticketsScanned).toBe(1);
  });

  test('ignores auto-replies and workflow notes when deciding direction', async () => {
    const { handler, service } = buildHandler();
    mockBoard(service, [
      { id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Still broken?' },
      { id: 2, createDateTime: '2026-09-02T09:00:00Z', noteType: 13, createdByResourceID: 100, description: 'Workflow rule fired' },
      { id: 3, createDateTime: '2026-09-03T09:00:00Z', createdByResourceID: 100, title: 'Automatic reply: Printer jam', description: 'I am out of office' },
    ]);

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', {}));

    expect(parsed.data.counts.awaitingResponse).toBe(1);
  });

  test('an internal-only note does not count as replying to the client', async () => {
    const { handler, service } = buildHandler();
    mockBoard(service, [
      { id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Still broken?' },
      { id: 2, createDateTime: '2026-09-02T09:00:00Z', publish: 2, createdByResourceID: 100, description: 'Internal: waiting on vendor' },
    ]);

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', {}));

    expect(parsed.data.counts.awaitingResponse).toBe(1);
  });

  test('statusIds narrows which open tickets are read', async () => {
    const { handler, service } = buildHandler();
    mockBoard(
      service,
      [{ id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Hello' }],
      [openTicket, { ...openTicket, id: 2, status: 8 }]
    );

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', { statusIds: [19] }));

    expect(parsed.data.counts.openTicketsConsidered).toBe(2);
    expect(parsed.data.counts.ticketsScanned).toBe(1);
    expect(parsed.data.statusIds).toEqual([19]);
  });

  test('flags truncation instead of silently scanning a slice', async () => {
    const { handler, service } = buildHandler();
    mockBoard(
      service,
      [{ id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Hello' }],
      [openTicket, { ...openTicket, id: 2 }, { ...openTicket, id: 3 }]
    );

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', { maxTickets: 2 }));

    expect(parsed.data.truncated).toBe(true);
    expect(parsed.data.counts.ticketsScanned).toBe(2);
    expect(parsed.data.counts.candidates).toBe(3);
  });

  test('includeReplied returns the tickets where we answered last', async () => {
    const { handler, service } = buildHandler();
    mockBoard(service, [
      { id: 1, createDateTime: '2026-09-01T09:00:00Z', createdByContactID: 55, description: 'Still broken?' },
      { id: 2, createDateTime: '2026-09-02T09:00:00Z', createdByResourceID: 100, description: 'Fixed' },
    ]);

    const parsed = parse(await handler.callTool('autotask_tickets_awaiting_response', { includeReplied: true }));

    expect(parsed.data.repliedLast).toHaveLength(1);
    expect(parsed.data.repliedLast[0].lastOutboundDate).toBe('2026-09-02T09:00:00Z');
  });
});
