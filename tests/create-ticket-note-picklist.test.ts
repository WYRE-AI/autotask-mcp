// Regression test for issue #126:
// autotask_create_ticket_note must not silently default noteType/publish to
// hardcoded picklist IDs, because those IDs are tenant-specific and the
// previous "1=Internal Only" label was actively wrong for many tenants.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
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

describe('autotask_create_ticket_note picklist safety (issue #126)', () => {
  test('schema requires noteType and publish', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_ticket_note');
    expect(def).toBeDefined();
    const required = (def!.inputSchema as { required: string[] }).required;
    expect(required).toContain('noteType');
    expect(required).toContain('publish');
  });

  test('schema descriptions point to autotask_get_field_info instead of hardcoding labels', () => {
    const def = TOOL_DEFINITIONS.find(t => t.name === 'autotask_create_ticket_note')!;
    const props = (def.inputSchema as { properties: Record<string, { description: string }> }).properties;
    expect(props.noteType.description).toMatch(/autotask_get_field_info/);
    expect(props.publish.description).toMatch(/autotask_get_field_info/);
    // Must not bake in any specific picklist label/ID mapping.
    expect(props.noteType.description).not.toMatch(/1=General/);
    expect(props.publish.description).not.toMatch(/1=Internal Only/);
  });

  test('handler rejects missing noteType with a discovery hint', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, false);
    const result = await handler.callTool('autotask_create_ticket_note', {
      ticketId: 1,
      description: 'test',
      publish: 3
    });
    const text = (result.content?.[0] as { text: string }).text;
    expect(text).toMatch(/noteType/);
    expect(text).toMatch(/autotask_get_field_info/);
  });

  test('handler rejects missing publish with a discovery hint', async () => {
    const service = new AutotaskService(mockConfig, mockLogger);
    const handler = new AutotaskToolHandler(service, mockLogger, false);
    const result = await handler.callTool('autotask_create_ticket_note', {
      ticketId: 1,
      description: 'test',
      noteType: 1
    });
    const text = (result.content?.[0] as { text: string }).text;
    expect(text).toMatch(/publish/);
    expect(text).toMatch(/autotask_get_field_info/);
  });
});
