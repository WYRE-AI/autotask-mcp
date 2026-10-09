// Autotask REST never matches `{ op: 'eq', value: null }` — against the same
// population, `eq null` on assignedResourceID counted 0 rows while `notExist`
// counted thousands — and it has no `isnotnull` operator at all (unknown
// operators are silently dropped, so the clause filtered nothing). Empty /
// non-empty field checks must use `notExist` / `exist`.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = new Logger('error');

const config: McpServerConfig = {
  name: 'test-server',
  version: '0.0.0',
  autotask: {
    username: 'user@example.com',
    secret: 'secret',
    integrationCode: 'integration-code',
    apiUrl: 'https://webservices2.autotask.net/ATServicesRest/',
  },
};

/** Answer every request with an empty page and return the filter sent to `{entity}/query`. */
function captureFilter(entity: string): () => any[] {
  const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ items: [], pageDetails: { count: 0 } }),
  } as unknown as Response);
  return () => {
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(`/${entity}/query`));
    expect(call).toBeDefined();
    return JSON.parse((call![1] as RequestInit).body as string).filter;
  };
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchTickets unassigned', () => {
  test('uses notExist on assignedResourceID, with the default open-ticket status filter', async () => {
    const filter = captureFilter('Tickets');
    await new AutotaskService(config, logger).searchTickets({ unassigned: true });

    expect(filter()).toEqual(expect.arrayContaining([
      { op: 'notExist', field: 'assignedResourceID' },
      { op: 'noteq', field: 'status', value: 5 },
    ]));
    expect(JSON.stringify(filter())).not.toContain('null');
  });

  test('keeps an explicit status and wins over assignedResourceID', async () => {
    const filter = captureFilter('Tickets');
    await new AutotaskService(config, logger).searchTickets({ unassigned: true, status: 1, assignedResourceID: 12345 });

    expect(filter()).toEqual(expect.arrayContaining([
      { op: 'notExist', field: 'assignedResourceID' },
      { op: 'eq', field: 'status', value: 1 },
    ]));
    expect(filter().filter((f: any) => f.field === 'assignedResourceID')).toHaveLength(1);
  });
});

describe('searchTimeEntries approvalStatus', () => {
  test('unapproved uses notExist on billingApprovalDateTime', async () => {
    const filter = captureFilter('TimeEntries');
    await new AutotaskService(config, logger).searchTimeEntries({ ticketId: 12345, approvalStatus: 'unapproved' } as any);

    expect(filter()).toContainEqual({ op: 'notExist', field: 'billingApprovalDateTime' });
  });

  test('approved uses exist on billingApprovalDateTime', async () => {
    const filter = captureFilter('TimeEntries');
    await new AutotaskService(config, logger).searchTimeEntries({ ticketId: 12345, approvalStatus: 'approved' } as any);

    expect(filter()).toContainEqual({ op: 'exist', field: 'billingApprovalDateTime' });
  });
});
