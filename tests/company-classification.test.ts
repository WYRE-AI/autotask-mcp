import { formatCompactResponse } from '../src/utils/response.formatter';
import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';

describe('company classification', () => {
  test('compact company results keep companyType and classification', () => {
    const compact = formatCompactResponse(
      [{ id: 1, companyName: 'Example Co', isActive: true, phone: '0', city: 'X', state: 'Y',
         companyType: 1, classification: 4, address1: 'hidden' }],
      'companies',
      {}
    );
    const item = compact.items[0];
    expect(item.classification).toBe(4);
    expect(item.companyType).toBe(1);
    expect(item.address1).toBeUndefined();
  });

  test('autotask_search_companies accepts a numeric classification filter', () => {
    const def = TOOL_DEFINITIONS.find((t: any) => t.name === 'autotask_search_companies') as any;
    expect(def).toBeDefined();
    expect(def.inputSchema.properties.classification.type).toBe('number');
    expect(def.description).toMatch(/autotask_get_field_info/);
  });
});
