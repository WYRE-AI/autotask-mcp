// autotask_update_opportunity: opportunities could be created and read but not
// changed, so a deal's revenue, cost, stage or status could only be corrected
// in the Autotask UI. Opportunities is a top-level entity with canUpdate: true,
// updated via the standard PATCH /Opportunities {id, ...fields} route.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS, TOOL_CATEGORIES } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
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
    // Pre-set apiUrl so baseUrl() resolves without a zone-info network round-trip.
    apiUrl: 'https://webservices2.autotask.net/ATServicesRest/',
  },
};

const tool = () => TOOL_DEFINITIONS.find(t => t.name === 'autotask_update_opportunity');

function setup() {
  const service = new AutotaskService(config, logger);
  const spy = jest.spyOn(service, 'updateOpportunity').mockResolvedValue(undefined);
  const handler = new AutotaskToolHandler(service, logger);
  return { spy, handler };
}

beforeEach(() => {
  _resetZoneUrlCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('autotask_update_opportunity definition', () => {
  test('exists and requires only opportunityId', () => {
    expect(tool()).toBeDefined();
    expect(tool()!.inputSchema.required).toEqual(['opportunityId']);
  });

  test('advertises the per-period revenue and cost fields Autotask derives totals from', () => {
    const props = tool()!.inputSchema.properties as Record<string, any>;
    for (const period of ['onetime', 'monthly', 'quarterly', 'semiannual', 'yearly']) {
      expect(props[`${period}Revenue`].type).toBe('number');
      expect(props[`${period}Cost`].type).toBe('number');
    }
    expect(props.userDefinedFields.type).toBe('array');
  });

  test('is listed in the financial category', () => {
    expect(TOOL_CATEGORIES.financial.tools).toContain('autotask_update_opportunity');
  });
});

describe('autotask_update_opportunity handler', () => {
  test('forwards every advertised field to the service', async () => {
    // Guards against the schema and the handler's allowlist drifting apart:
    // a property advertised but not forwarded would be silently dropped.
    const props = tool()!.inputSchema.properties as Record<string, any>;
    const args: Record<string, any> = { opportunityId: 1001 };
    const expected: Record<string, any> = {};
    for (const [name, schema] of Object.entries(props)) {
      if (name === 'opportunityId') continue;
      const value =
        schema.type === 'number' ? 7 :
        schema.type === 'boolean' ? true :
        schema.type === 'array' ? [{ name: 'Revenue Type', value: 'Hardware' }] :
        'x';
      args[name] = value;
      expected[name] = value;
    }
    const { spy, handler } = setup();
    const result = await handler.callTool('autotask_update_opportunity', args);
    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledWith(1001, expected);
  });

  test('sends only the fields provided, keeping zero values', async () => {
    const { spy, handler } = setup();
    await handler.callTool('autotask_update_opportunity', {
      opportunityId: 42,
      status: 0,
      probability: 0,
      onetimeCost: 0,
    });
    expect(spy).toHaveBeenCalledWith(42, { status: 0, probability: 0, onetimeCost: 0 });
  });

  test('accepts the ownerResourceId/contactId spellings used by create_opportunity', async () => {
    const { spy, handler } = setup();
    await handler.callTool('autotask_update_opportunity', {
      opportunityId: 42,
      ownerResourceId: 2002,
      contactId: 55,
    });
    expect(spy).toHaveBeenCalledWith(42, { ownerResourceID: 2002, contactID: 55 });
  });

  test('does not forward fields outside the writable set', async () => {
    const { spy, handler } = setup();
    await handler.callTool('autotask_update_opportunity', {
      opportunityId: 42,
      title: 'Laptop refresh',
      companyID: 99,
      creatorResourceID: 1,
    });
    expect(spy).toHaveBeenCalledWith(42, { title: 'Laptop refresh' });
  });

  test('errors without calling Autotask when no updatable field is given', async () => {
    const { spy, handler } = setup();
    const result = await handler.callTool('autotask_update_opportunity', { opportunityId: 42 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('no updatable fields');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('AutotaskService.updateOpportunity()', () => {
  test('PATCHes /Opportunities with the id in the body', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ itemId: 1001 }),
    } as unknown as Response);

    const service = new AutotaskService(config, logger);
    await service.updateOpportunity(1001, { onetimeCost: 250, stage: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(`${init.method} ${new URL(url).pathname}`).toBe('PATCH /ATServicesRest/v1.0/Opportunities');
    expect(JSON.parse(init.body as string)).toEqual({ id: 1001, onetimeCost: 250, stage: 3 });
  });
});
