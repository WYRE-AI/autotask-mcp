// Read-Only Mode Tests
//
// AUTOTASK_READ_ONLY is a safety gate, so these tests pin the two things that
// make it worth having: that it actually refuses every write, and that
// AUTOTASK_WRITE_ALLOWLIST opens exactly the named tools and nothing more.

jest.mock('autotask-node', () => ({
  AutotaskClient: {
    create: jest.fn().mockRejectedValue(new Error('Mock: Cannot connect to Autotask API'))
  }
}));

import { TOOL_DEFINITIONS } from '../src/handlers/tool.definitions';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { AutotaskService } from '../src/services/autotask.service';
import { Logger } from '../src/utils/logger';
import { WritePolicy, isWriteTool } from '../src/utils/write-policy';
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

const ALL_TOOL_NAMES = TOOL_DEFINITIONS.map(t => t.name);
const WRITE_TOOL_NAMES = ALL_TOOL_NAMES.filter(isWriteTool);

const ORIGINAL_ENV = { ...process.env };

function buildHandler(env: { readOnly?: string; allowlist?: string } = {}): {
  handler: AutotaskToolHandler;
  service: AutotaskService;
} {
  delete process.env.AUTOTASK_READ_ONLY;
  delete process.env.AUTOTASK_WRITE_ALLOWLIST;
  if (env.readOnly !== undefined) process.env.AUTOTASK_READ_ONLY = env.readOnly;
  if (env.allowlist !== undefined) process.env.AUTOTASK_WRITE_ALLOWLIST = env.allowlist;
  const service = new AutotaskService(mockConfig, mockLogger);
  return { handler: new AutotaskToolHandler(service, mockLogger), service };
}

function parse(result: { content: Array<{ text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.restoreAllMocks();
});

describe('WritePolicy - isWriteTool', () => {
  test('matches every create/update/delete tool and nothing else', () => {
    for (const name of ALL_TOOL_NAMES) {
      expect(isWriteTool(name)).toBe(/^autotask_(create|update|delete)_/.test(name));
    }
  });

  test('the server actually ships write tools (guards against a vacuous suite)', () => {
    expect(WRITE_TOOL_NAMES.length).toBeGreaterThan(30);
  });

  test('read tools are not write tools', () => {
    expect(isWriteTool('autotask_search_tickets')).toBe(false);
    expect(isWriteTool('autotask_get_ticket_details')).toBe(false);
    expect(isWriteTool('autotask_list_queues')).toBe(false);
    // Its name says nothing about writing — denyReason handles it by method.
    expect(isWriteTool('autotask_raw_request')).toBe(false);
  });

  // isWriteTool classifies by naming convention, so the gate is only as sound
  // as the convention. This is the test that keeps it sound: every tool must
  // be either verb-prefixed (autotask_{create,update,delete,search,get,list}_*)
  // or listed below as a reviewed exception. A future `autotask_close_ticket`
  // or `autotask_merge_companies` would mutate Autotask while sailing straight
  // past isWriteTool — this fails on it and forces an explicit decision.
  test('no tool escapes classification by being named unconventionally', () => {
    const CONVENTIONAL = /^autotask_(create|update|delete|search|get|list)_/;

    // Reviewed exceptions, each safe for a stated reason:
    const REVIEWED_EXCEPTIONS = [
      'autotask_execute_tool',            // meta: re-checks denyReason on the inner tool
      'autotask_find_duplicate_tickets',  // read-only board scan
      'autotask_raw_request',             // gated by HTTP method in denyReason
      'autotask_router',                  // suggests a tool, calls nothing
      'autotask_test_connection',         // read-only connectivity probe
      'autotask_tickets_awaiting_response', // read-only board scan
    ];

    const unclassified = ALL_TOOL_NAMES.filter(n => !CONVENTIONAL.test(n)).sort();
    expect(unclassified).toEqual(REVIEWED_EXCEPTIONS);
  });
});

describe('WritePolicy - fromEnv', () => {
  test('is off by default', () => {
    expect(WritePolicy.fromEnv({}).readOnly).toBe(false);
  });

  test('accepts "true" and "1"', () => {
    expect(WritePolicy.fromEnv({ AUTOTASK_READ_ONLY: 'true' }).readOnly).toBe(true);
    expect(WritePolicy.fromEnv({ AUTOTASK_READ_ONLY: '1' }).readOnly).toBe(true);
  });

  test('anything else leaves writes enabled', () => {
    expect(WritePolicy.fromEnv({ AUTOTASK_READ_ONLY: 'false' }).readOnly).toBe(false);
    expect(WritePolicy.fromEnv({ AUTOTASK_READ_ONLY: 'yes' }).readOnly).toBe(false);
    expect(WritePolicy.fromEnv({ AUTOTASK_READ_ONLY: '' }).readOnly).toBe(false);
  });

  test('parses the allowlist, trimming and dropping blanks', () => {
    const policy = WritePolicy.fromEnv({
      AUTOTASK_READ_ONLY: 'true',
      AUTOTASK_WRITE_ALLOWLIST: ' autotask_update_ticket , ,autotask_create_ticket_note '
    });
    expect(policy.allowed).toEqual(['autotask_create_ticket_note', 'autotask_update_ticket']);
  });

  test('flags allowlist entries that grant nothing', () => {
    const policy = WritePolicy.fromEnv({
      AUTOTASK_READ_ONLY: 'true',
      AUTOTASK_WRITE_ALLOWLIST: 'autotask_update_ticket,autotask_updat_ticket,autotask_search_tickets'
    });
    expect(policy.ineffective).toEqual(['autotask_search_tickets', 'autotask_updat_ticket']);
  });
});

describe('WritePolicy - blocking', () => {
  test('blocks nothing when read-only is off', () => {
    const policy = new WritePolicy(false);
    for (const name of ALL_TOOL_NAMES) {
      expect(policy.blocks(name)).toBe(false);
      expect(policy.denyReason(name, { method: 'DELETE' })).toBeNull();
    }
  });

  test('blocks every write tool and no read tool when on', () => {
    const policy = new WritePolicy(true);
    for (const name of ALL_TOOL_NAMES) {
      expect(policy.blocks(name)).toBe(isWriteTool(name));
    }
  });

  test('the allowlist opens exactly the named tools and nothing more', () => {
    const policy = new WritePolicy(true, ['autotask_update_ticket']);
    expect(policy.blocks('autotask_update_ticket')).toBe(false);
    expect(policy.denyReason('autotask_update_ticket')).toBeNull();
    for (const name of WRITE_TOOL_NAMES.filter(n => n !== 'autotask_update_ticket')) {
      expect(policy.blocks(name)).toBe(true);
    }
  });

  test('the refusal message names the env vars an operator needs', () => {
    const reason = new WritePolicy(true).denyReason('autotask_create_ticket');
    expect(reason).toContain('AUTOTASK_READ_ONLY');
    expect(reason).toContain('AUTOTASK_WRITE_ALLOWLIST');
  });
});

describe('WritePolicy - autotask_raw_request', () => {
  const policy = new WritePolicy(true);

  test('permits GET (case-insensitive)', () => {
    expect(policy.denyReason('autotask_raw_request', { method: 'GET', path: '/Companies/1' })).toBeNull();
    expect(policy.denyReason('autotask_raw_request', { method: 'get', path: '/Companies/1' })).toBeNull();
  });

  test('refuses every mutating method', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(policy.denyReason('autotask_raw_request', { method, path: '/Companies' })).toContain('read-only mode');
    }
  });

  test('refuses a missing or unknown method rather than assuming a read', () => {
    expect(policy.denyReason('autotask_raw_request', {})).toContain('read-only mode');
    expect(policy.denyReason('autotask_raw_request', { method: 'TRACE' })).toContain('read-only mode');
  });

  test('allowlisting it restores every method', () => {
    const allowed = new WritePolicy(true, ['autotask_raw_request']);
    expect(allowed.denyReason('autotask_raw_request', { method: 'POST' })).toBeNull();
  });
});

describe('Read-only mode - tool listing', () => {
  test('lists every tool when read-only is off', async () => {
    const { handler } = buildHandler();
    const tools = await handler.listTools();
    expect(tools.length).toBe(TOOL_DEFINITIONS.length);
  });

  test('hides every write tool and keeps every read tool when on', async () => {
    const { handler } = buildHandler({ readOnly: 'true' });
    const names = (await handler.listTools()).map(t => t.name);
    expect(names.filter(isWriteTool)).toEqual([]);
    expect(names.length).toBe(ALL_TOOL_NAMES.length - WRITE_TOOL_NAMES.length);
    expect(names).toContain('autotask_search_tickets');
    expect(names).toContain('autotask_list_queues');
  });

  test('the allowlist re-lists exactly the named tool', async () => {
    const { handler } = buildHandler({ readOnly: 'true', allowlist: 'autotask_update_ticket' });
    const names = (await handler.listTools()).map(t => t.name);
    expect(names.filter(isWriteTool)).toEqual(['autotask_update_ticket']);
  });

  test('discovery meta-tools hide blocked write tools too', async () => {
    const { handler } = buildHandler({ readOnly: 'true' });
    const listed = parse(await handler.callTool('autotask_list_category_tools', { category: 'tickets' }));
    expect(listed.data.map((t: any) => t.name).filter(isWriteTool)).toEqual([]);

    const categories = parse(await handler.callTool('autotask_list_categories', {}));
    const tickets = categories.data.find((c: any) => c.name === 'tickets');
    expect(tickets.toolCount).toBeLessThan(
      TOOL_DEFINITIONS.filter(t => t.name.includes('ticket')).length
    );
  });

  test('the intent router marks a suggested write tool as unavailable', async () => {
    const { handler } = buildHandler({ readOnly: 'true' });
    const routed = parse(await handler.callTool('autotask_router', { intent: 'log 2 hours on ticket 12345' }));
    expect(routed.data.suggestedTool).toBe('autotask_create_time_entry');
    expect(routed.data.available).toBe(false);
    expect(routed.data.unavailableReason).toContain('AUTOTASK_READ_ONLY');
  });
});

describe('Read-only mode - dispatch refuses writes', () => {
  test('refuses a write tool without touching the Autotask service', async () => {
    const { handler, service } = buildHandler({ readOnly: 'true' });
    const createSpy = jest.spyOn(service, 'createTicket').mockResolvedValue(1 as any);

    const result = await handler.callTool('autotask_create_ticket', { companyID: 1, title: 'x' });

    expect(result.isError).toBe(true);
    expect(parse(result).error).toContain('AUTOTASK_READ_ONLY');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('refuses every write tool, including ones never listed', async () => {
    const { handler } = buildHandler({ readOnly: 'true' });
    for (const name of WRITE_TOOL_NAMES) {
      const result = await handler.callTool(name, {});
      expect(result.isError).toBe(true);
      expect(parse(result).error).toContain('read-only mode');
    }
  });

  test('still serves read tools', async () => {
    const { handler, service } = buildHandler({ readOnly: 'true' });
    jest.spyOn(service, 'searchTickets').mockResolvedValue([{ id: 1, title: 'open' }] as any);

    const result = await handler.callTool('autotask_search_tickets', { companyID: 7 });

    expect(result.isError).toBeUndefined();
  });

  test('autotask_execute_tool cannot be used to smuggle a write through', async () => {
    const { handler, service } = buildHandler({ readOnly: 'true' });
    const createSpy = jest.spyOn(service, 'createTicket').mockResolvedValue(1 as any);

    const result = await handler.callTool('autotask_execute_tool', {
      toolName: 'autotask_create_ticket',
      arguments: { companyID: 1, title: 'x' }
    });

    expect(result.isError).toBe(true);
    expect(parse(result).error).toContain('read-only mode');
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('autotask_raw_request cannot be used to smuggle a write through', async () => {
    const { handler, service } = buildHandler({ readOnly: 'true' });
    const rawSpy = jest.spyOn(service, 'rawRequest').mockResolvedValue({} as any);

    const post = await handler.callTool('autotask_raw_request', { method: 'POST', path: '/Companies' });
    expect(post.isError).toBe(true);
    expect(rawSpy).not.toHaveBeenCalled();

    const viaExecute = await handler.callTool('autotask_execute_tool', {
      toolName: 'autotask_raw_request',
      arguments: { method: 'DELETE', path: '/Companies/1' }
    });
    expect(viaExecute.isError).toBe(true);
    expect(rawSpy).not.toHaveBeenCalled();

    const get = await handler.callTool('autotask_raw_request', { method: 'GET', path: '/Companies/1' });
    expect(get.isError).toBeUndefined();
    expect(rawSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Read-only mode - allowlist', () => {
  test('an allowlisted write reaches the Autotask service', async () => {
    const { handler, service } = buildHandler({
      readOnly: 'true',
      allowlist: 'autotask_update_ticket'
    });
    const updateSpy = jest.spyOn(service, 'updateTicket').mockResolvedValue(undefined as any);

    const result = await handler.callTool('autotask_update_ticket', { ticketId: 42, status: 5 });

    expect(result.isError).toBeUndefined();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  test('allowlisting one write tool does not open any other', async () => {
    const { handler, service } = buildHandler({
      readOnly: 'true',
      allowlist: 'autotask_update_ticket'
    });
    const createSpy = jest.spyOn(service, 'createTicket').mockResolvedValue(1 as any);

    for (const name of WRITE_TOOL_NAMES.filter(n => n !== 'autotask_update_ticket')) {
      expect((await handler.callTool(name, {})).isError).toBe(true);
    }
    expect(createSpy).not.toHaveBeenCalled();
  });

  test('the allowlist is inert while read-only is off', async () => {
    const { handler } = buildHandler({ allowlist: 'autotask_update_ticket' });
    const names = (await handler.listTools()).map(t => t.name);
    expect(names.length).toBe(TOOL_DEFINITIONS.length);
  });
});
