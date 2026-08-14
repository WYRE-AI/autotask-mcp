/**
 * Regression test: searchQuotes filtered by companyId sent `accountId` as
 * the filter field, but the Quotes entity has no account* field at all —
 * its company link is `companyID` (verified against the live
 * entityInformation/fields response). Autotask rejected every such query
 * with HTTP 500 "Unable to find accountId in the Quote Entity", breaking
 * autotask_search_quotes company filtering for every tenant.
 */

import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

const mockLogger = new Logger('error');
const config: McpServerConfig = {
  name: 'test-server',
  version: '1.0.0',
  autotask: {
    username: 'test-username',
    secret: 'test-secret',
    integrationCode: 'test-integration-code',
    apiUrl: 'https://example.autotask.net/atservicesrest/',
  },
};

const ok = (body: any) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as any);

describe('searchQuotes filter field names', () => {
  it('sends companyID (not accountId) when filtering by companyId', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => ok({ items: [], pageDetails: {} }));

    try {
      const service = new AutotaskService(config, mockLogger);
      await service.searchQuotes({ companyId: 42, contactId: 7, opportunityId: 9 });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      const fields = body.filter.map((f: any) => f.field);
      expect(fields).toEqual(['companyID', 'contactID', 'opportunityID']);
      expect(fields).not.toContain('accountId');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
