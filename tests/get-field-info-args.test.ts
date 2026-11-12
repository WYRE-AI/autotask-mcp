/**
 * Regression tests for autotask_get_field_info argument handling.
 *
 * Production error observed: "Cannot read properties of undefined (reading
 * 'toLowerCase')" — the handler called a.entityType.toLowerCase() with no
 * guard, so a call missing entityType crashed with a bare TypeError instead
 * of a usable message. Root cause of the miscalls: our own picklist error
 * hints said 'call autotask_get_field_info with entity "TicketNotes" and
 * field "noteType"', teaching LLMs parameter names (entity/field) that don't
 * match the schema (entityType/fieldName). The handler now accepts both
 * spellings and throws a clear error when the entity type is absent.
 */

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';

jest.mock('../src/services/autotask.service');

const logger = new Logger('error');

const FIELDS = [
  { name: 'noteType', dataType: 'integer', isRequired: true, isPickList: true, isQueryable: true, picklistValues: [{ value: '1', label: 'Task Summary' }] },
  { name: 'title', dataType: 'string', isRequired: true, isPickList: false, isQueryable: true },
];

function makeHandler(): AutotaskToolHandler {
  const svc = {
    getFieldInfo: jest.fn().mockResolvedValue(FIELDS),
    // No tenant key keeps the picklist cache instance-local, so tests can't
    // share field info through the cross-request store.
    getPicklistStoreKey: jest.fn().mockReturnValue(null),
  } as unknown as jest.Mocked<AutotaskService>;
  return new AutotaskToolHandler(svc, logger);
}

async function callTool(handler: AutotaskToolHandler, args: Record<string, unknown>) {
  return (handler as any).callTool('autotask_get_field_info', args);
}

describe('autotask_get_field_info argument handling', () => {
  it('returns a clear error (not a TypeError) when entityType is missing', async () => {
    const handler = makeHandler();
    const res = await callTool(handler, {});
    expect(res.isError).toBe(true);
    const text = res.content[0].text as string;
    expect(text).toContain('entityType is required');
    expect(text).not.toContain('toLowerCase');
  });

  it('accepts the documented entityType/fieldName parameters', async () => {
    const handler = makeHandler();
    const res = await callTool(handler, { entityType: 'TicketNotes', fieldName: 'noteType' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('noteType');
  });

  it('accepts entity/field as aliases (the phrasing our own hints used)', async () => {
    const handler = makeHandler();
    const res = await callTool(handler, { entity: 'TicketNotes', field: 'noteType' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('noteType');
  });

  it('still lists all fields when no field name is given', async () => {
    const handler = makeHandler();
    const res = await callTool(handler, { entityType: 'Tickets' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('Found 2 fields');
  });
});

describe('autotask_get_field_info when Autotask fails', () => {
  const failingHandler = (lookup: { fields: unknown[]; unavailable?: { status?: number; rateLimitedUntil?: number } }) => {
    const handler = makeHandler();
    (handler as unknown as { picklistCache: { lookupFields: jest.Mock } }).picklistCache.lookupFields =
      jest.fn().mockResolvedValue(lookup);
    return handler;
  };

  it('returns an error with the vendor status when nothing is cached', async () => {
    const res = await callTool(failingHandler({ fields: [], unavailable: { status: 429 } }), { entityType: 'Tickets' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Could not load field info for Tickets from Autotask (HTTP 429)');
  });

  it('a 429 with nothing cached returns the rate_limited result with the time left', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const res = await callTool(failingHandler({ fields: [], unavailable: { status: 429, rateLimitedUntil: 1_000_000 + 42_000 } }), { entityType: 'Tickets' });
      expect(res.isError).toBe(true);
      const body = JSON.parse(res.content[0].text);
      expect(body.error_type).toBe('rate_limited');
      expect(body.retry_after_seconds).toBe(42);
      expect(body.error).toContain('Could not load field info for Tickets from Autotask (HTTP 429)');
    } finally {
      now.mockRestore();
    }
  });

  it('keeps the failure when the requested field is missing from a stale copy', async () => {
    const res = await callTool(failingHandler({ fields: FIELDS, unavailable: { status: 503 } }), { entityType: 'TicketNotes', fieldName: 'publish' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Field 'publish' is not in the cached field info for TicketNotes, and refreshing it from Autotask failed (HTTP 503)");
  });

  it('says a cached copy was served when a refresh failed', async () => {
    const res = await callTool(failingHandler({ fields: FIELDS, unavailable: { status: 503 } }), { entityType: 'TicketNotes', fieldName: 'noteType' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('noteType');
    expect(res.content[0].text).toContain('cached copy: refreshing from Autotask failed (HTTP 503)');
  });
});

describe('autotask_list_* picklist tools when Autotask fails', () => {
  const handlerWith = (lookup: { values: unknown[]; unavailable?: { status?: number; rateLimitedUntil?: number } }) => {
    const handler = makeHandler();
    (handler as unknown as { picklistCache: { lookupPicklistValues: jest.Mock } }).picklistCache.lookupPicklistValues =
      jest.fn().mockResolvedValue(lookup);
    return handler;
  };
  const list = (handler: AutotaskToolHandler, name: string) =>
    (handler as unknown as { callTool: (n: string, a: object) => Promise<{ isError?: boolean; content: Array<{ text: string }> }> }).callTool(name, {});

  it('returns an error with the vendor status instead of "Found 0" when nothing is cached', async () => {
    const res = await list(handlerWith({ values: [], unavailable: { status: 429 } }), 'autotask_list_queues');
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Could not load queues from Autotask (HTTP 429)');
  });

  it('a 429 with nothing cached returns the rate_limited result', async () => {
    const res = await list(handlerWith({ values: [], unavailable: { status: 429, rateLimitedUntil: Date.now() + 60_000 } }), 'autotask_list_ticket_priorities');
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text);
    expect(body.error_type).toBe('rate_limited');
    expect(body.retry_after_seconds).toBeGreaterThan(0);
  });

  it('notes a cached copy after a failed refresh', async () => {
    const res = await list(handlerWith({ values: [{ value: '1', label: 'New' }], unavailable: { status: 503 } }), 'autotask_list_ticket_statuses');
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('Found 1 ticket statuses (cached copy: refreshing from Autotask failed (HTTP 503))');
  });
});
