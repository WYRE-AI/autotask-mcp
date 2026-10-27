// WYREAI-584: autotask_get_company returns the full Companies record plus
// best-effort picklist labels (classification, companyType, ...).

import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { TOOL_CATEGORIES, TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
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

const COMPANY = {
  id: 77,
  companyName: 'Acme Pty Ltd',
  companyType: 1,
  classification: 5,
  isActive: true,
  ownerResourceID: 29682001,
  phone: '555-0101',
  address1: '1 Main St',
  city: 'Perth',
  state: 'WA',
  postalCode: '6000',
  userDefinedFields: [{ name: 'Tier', value: 'A' }],
};

const COMPANY_FIELDS = [
  {
    name: 'companyType', dataType: 'integer', isRequired: true, isReadOnly: false, isQueryable: true, isReference: false,
    isPickList: true,
    picklistValues: [
      { value: '1', label: 'Customer', isActive: true },
      { value: '2', label: 'Lead', isActive: true },
    ],
  },
  {
    name: 'classification', dataType: 'integer', isRequired: false, isReadOnly: false, isQueryable: true, isReference: false,
    isPickList: true,
    picklistValues: [
      { value: '4', label: 'Gold', isActive: true },
      { value: '5', label: 'Legacy Platinum', isActive: false },
    ],
  },
  { name: 'companyName', dataType: 'string', isRequired: true, isReadOnly: false, isQueryable: true, isReference: false, isPickList: false },
];

function setup(company: Record<string, unknown> | null, fields: unknown[] | Error = COMPANY_FIELDS) {
  const service = new AutotaskService(mockConfig, logger);
  const getCompany = jest.spyOn(service, 'getCompany').mockResolvedValue(company as any);
  const handler = new AutotaskToolHandler(service, logger);
  (handler as any).getMappingService = async () => ({
    getCompanyName: async () => null,
    getResourceName: async () => null,
  });
  const getFields = jest.spyOn((handler as any).picklistCache, 'getFields');
  if (fields instanceof Error) getFields.mockRejectedValue(fields);
  else getFields.mockResolvedValue(fields as any);
  return { handler, getCompany, getFields };
}

const parse = (r: any) => JSON.parse(r.content[0].text);

describe('WYREAI-584 autotask_get_company', () => {
  it('returns the full entity, not the compact search shape', async () => {
    const { handler, getCompany } = setup(COMPANY);
    const result = await handler.callTool('autotask_get_company', { companyID: 77 });

    expect(result.isError).toBeFalsy();
    expect(getCompany).toHaveBeenCalledWith(77);
    const body = parse(result);
    expect(body.message).toBe('Company 77 retrieved successfully');
    expect(body.data).toMatchObject({
      id: 77,
      companyType: 1,
      classification: 5,
      ownerResourceID: 29682001,
      address1: '1 Main St',
      postalCode: '6000',
      userDefinedFields: [{ name: 'Tier', value: 'A' }],
    });
  });

  it('resolves picklist labels, including inactive values, and keeps raw ids', async () => {
    const { handler } = setup(COMPANY);
    const body = parse(await handler.callTool('autotask_get_company', { companyID: 77 }));

    expect(body.data.picklistLabels).toEqual({ companyType: 'Customer', classification: 'Legacy Platinum' });
    expect(body.data.classification).toBe(5);
    expect(body.data.companyType).toBe(1);
  });

  it('omits values missing from the picklist and null values', async () => {
    const { handler } = setup({ ...COMPANY, companyType: 99, classification: null });
    const body = parse(await handler.callTool('autotask_get_company', { companyID: 77 }));
    expect(body.data.picklistLabels).toBeUndefined();
  });

  it('still succeeds with raw ids and no labels when field info lookup rejects', async () => {
    const { handler } = setup(COMPANY, new Error('field info down'));
    const result = await handler.callTool('autotask_get_company', { companyID: 77 });

    expect(result.isError).toBeFalsy();
    const body = parse(result);
    expect(body.data.classification).toBe(5);
    expect(body.data.companyType).toBe(1);
    expect(body.data.picklistLabels).toBeUndefined();
  });

  it('still succeeds when field info is empty', async () => {
    const { handler } = setup(COMPANY, []);
    const body = parse(await handler.callTool('autotask_get_company', { companyID: 77 }));
    expect(body.data.picklistLabels).toBeUndefined();
    expect(body.data.id).toBe(77);
  });

  it('does not cache an empty field-info result, so the next call retries', async () => {
    const { handler, getFields } = setup(COMPANY, []);
    const clear = jest.spyOn((handler as any).picklistCache, 'clearCache');
    await handler.callTool('autotask_get_company', { companyID: 77 });
    expect(clear).toHaveBeenCalledWith('Companies');

    getFields.mockResolvedValue(COMPANY_FIELDS as any);
    const body = parse(await handler.callTool('autotask_get_company', { companyID: 77 }));
    expect(body.data.picklistLabels).toEqual({ companyType: 'Customer', classification: 'Legacy Platinum' });
  });

  it('returns the raw record without labels when the field-info lookup stalls past the deadline', async () => {
    jest.useFakeTimers();
    try {
      const { handler, getFields } = setup(COMPANY);
      getFields.mockReturnValue(new Promise(() => undefined) as any);
      const pending = handler.callTool('autotask_get_company', { companyID: 77 });
      await jest.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result.isError).toBeFalsy();
      const body = parse(result);
      expect(body.data.classification).toBe(5);
      expect(body.data.picklistLabels).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not add an owner name (out of scope; raw ownerResourceID is kept)', async () => {
    const { handler } = setup(COMPANY);
    const body = parse(await handler.callTool('autotask_get_company', { companyID: 77 }));
    expect(body.data.ownerResourceID).toBe(29682001);
    expect(body.data.ownerResourceName).toBeUndefined();
  });

  it('applies not-found handling and companyId aliasing to nested autotask_execute_tool calls', async () => {
    const { handler, getCompany } = setup(null);
    const result = await handler.callTool('autotask_execute_tool', {
      toolName: 'autotask_get_company',
      arguments: { companyId: 999 },
    });
    expect(getCompany).toHaveBeenLastCalledWith(999);
    expect(result.isError).toBe(true);
    expect(parse(result).error).toMatch(/^No company found with companyI[Dd] 999\. Verify the ID is correct\.$/);
  });

  it('returns the not-found error when the company does not exist', async () => {
    const { handler } = setup(null);
    const result = await handler.callTool('autotask_get_company', { companyID: 999 });

    expect(result.isError).toBe(true);
    expect(parse(result).error).toBe('No company found with companyID 999. Verify the ID is correct.');
  });

  it('supports companyID 0 (root company) and the legacy casings', async () => {
    const { handler, getCompany } = setup({ ...COMPANY, id: 0 });
    const r0 = await handler.callTool('autotask_get_company', { companyID: 0 });
    expect(r0.isError).toBeFalsy();
    expect(getCompany).toHaveBeenLastCalledWith(0);
    expect(parse(r0).message).toBe('Company 0 retrieved successfully');

    await handler.callTool('autotask_get_company', { companyId: 12 });
    expect(getCompany).toHaveBeenLastCalledWith(12);
  });

  it('rejects a missing companyID before calling the service', async () => {
    const { handler, getCompany } = setup(COMPANY);
    const result = await handler.callTool('autotask_get_company', {});
    expect(result.isError).toBe(true);
    expect(getCompany).not.toHaveBeenCalled();
  });

  it('is defined read-only, requires companyID (min 0) and is in the companies category', () => {
    const tool = TOOL_DEFINITIONS.find(t => t.name === 'autotask_get_company');
    expect(tool).toBeDefined();
    expect(tool!.annotations?.readOnlyHint).toBe(true);
    expect(tool!.inputSchema.required).toEqual(['companyID']);
    expect((tool!.inputSchema.properties as any).companyID).toMatchObject({ type: 'number', minimum: 0 });
    expect(TOOL_CATEGORIES.companies.tools).toContain('autotask_get_company');
  });
});
