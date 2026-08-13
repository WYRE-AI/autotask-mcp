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
