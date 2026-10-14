// Regression tests: Autotask rejects a Product(1) quote line without a
// periodType ("When QuoteItem.quoteItemType is set to Product(1) a
// QuoteItem.periodType must be included."), and createQuoteItem() never sent
// one, so no hardware line could be added to a quote. Verified live.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
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

/** Answer GET /Products/{id} with `product`, and every POST with a created id. */
function mockFetch(product: Record<string, unknown> | null): jest.SpyInstance {
  return jest.spyOn(global, 'fetch' as any).mockImplementation(async (_url: any, init: any) => {
    const body = (init as RequestInit).method === 'GET' ? { item: product } : { itemId: 9001 };
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
}

function postedItem(fetchMock: jest.SpyInstance): any {
  const call = fetchMock.mock.calls.find((c: any[]) => (c[1] as RequestInit).method === 'POST');
  return JSON.parse((call![1] as RequestInit).body as string);
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AutotaskService.createQuoteItem() periodType', () => {
  test("a product line takes the product's catalog periodType", async () => {
    const fetchMock = mockFetch({ id: 55, name: 'Annual license', periodType: 5 });
    const service = new AutotaskService(config, logger);

    await expect(service.createQuoteItem({ quoteID: 3836, productID: 55, quantity: 1 })).resolves.toBe(9001);

    expect(postedItem(fetchMock)).toMatchObject({ quoteItemType: 1, productID: 55, periodType: 5 });
  });

  test('a product line falls back to One-Time when the product has no periodType', async () => {
    const fetchMock = mockFetch({ id: 56, name: 'Monitor' });
    const service = new AutotaskService(config, logger);

    await service.createQuoteItem({ quoteID: 3836, productID: 56, quantity: 2 });

    expect(postedItem(fetchMock)).toMatchObject({ quoteItemType: 1, periodType: 1 });
  });

  test('an explicit periodType wins and skips the product lookup', async () => {
    const fetchMock = mockFetch({ id: 55, periodType: 5 });
    const service = new AutotaskService(config, logger);

    await service.createQuoteItem({ quoteID: 3836, productID: 55, quantity: 1, periodType: 2 });

    expect(fetchMock.mock.calls.map((c: any[]) => (c[1] as RequestInit).method)).toEqual(['POST']);
    expect(postedItem(fetchMock)).toMatchObject({ periodType: 2 });
  });

  test('an explicit Product type with no productID still gets One-Time', async () => {
    const fetchMock = mockFetch(null);
    const service = new AutotaskService(config, logger);

    await service.createQuoteItem({ quoteID: 3836, quoteItemType: 1, name: 'Monitor', quantity: 1 });

    expect(postedItem(fetchMock)).toMatchObject({ quoteItemType: 1, periodType: 1 });
  });

  test('non-product lines are sent without a periodType', async () => {
    const fetchMock = mockFetch(null);
    const service = new AutotaskService(config, logger);

    await service.createQuoteItem({ quoteID: 3836, serviceID: 77, quantity: 1 });

    expect(postedItem(fetchMock)).not.toHaveProperty('periodType');
  });
});

test('autotask_create_quote_item exposes periodType', () => {
  const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_quote_item')!;
  expect((tool.inputSchema.properties as Record<string, unknown>).periodType).toBeDefined();
});
