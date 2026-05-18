// Tests for Autotask 429/threshold handling (#69, #91).
//
// Covers two layers:
//   1. AutotaskHttpClient.request maps HTTP 429 to a typed
//      AutotaskRateLimitError with retryAfterSeconds parsed from the
//      Retry-After header.
//   2. AutotaskToolHandler.callTool converts that typed error into a
//      structured tool-result envelope (error_type: "rate_limited") so
//      LLM clients can stop retrying.

import { AutotaskService } from '../src/services/autotask.service';
import { AutotaskRateLimitError } from '../src/services/autotask-http';
import { AutotaskToolHandler } from '../src/handlers/tool.handler';
import { Logger } from '../src/utils/logger';
import type { McpServerConfig } from '../src/types/mcp';

const mockLogger = new Logger('error');
const configWithUrl: McpServerConfig = {
  name: 'test-server',
  version: '1.0.0',
  autotask: {
    username: 'test-username',
    secret: 'test-secret',
    integrationCode: 'test-integration-code',
    apiUrl: 'https://example.autotask.net/atservicesrest/',
  },
};

// Build a Response-like object that includes headers (the production helper
// in autotask-service.test.ts doesn't support headers, hence this local copy).
function responseWith(status: number, body: any, headers: Record<string, string> = {}): Response {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

describe('Rate limit handling (#69, #91)', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  describe('AutotaskHttpClient → AutotaskRateLimitError', () => {
    test('throws typed error with parsed Retry-After (integer seconds)', async () => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(responseWith(429, { errors: ['IntegrationVendor exceeded the API threshold'] }, {
          'Retry-After': '180',
        }));

      const service = new AutotaskService(configWithUrl, mockLogger);
      // Single call — capture the thrown error to inspect both its type and
      // its `retryAfterSeconds` field. Previous double-call hit the fetch
      // mock twice for no reason.
      const err = await service.searchTickets({}).catch((e) => e);
      expect(err).toBeInstanceOf(AutotaskRateLimitError);
      const rateErr = err as AutotaskRateLimitError;
      expect(rateErr.status).toBe(429);
      expect(rateErr.retryAfterSeconds).toBe(180);
      expect(rateErr.message).toContain('Do NOT retry');
      expect(rateErr.message).toContain('IntegrationVendor exceeded');
    });

    test('falls back to default 60s when Retry-After is missing', async () => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(responseWith(429, { errors: ['Threshold exceeded'] }));

      const service = new AutotaskService(configWithUrl, mockLogger);
      try {
        await service.searchTickets({});
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AutotaskRateLimitError);
        expect((err as AutotaskRateLimitError).retryAfterSeconds).toBe(60);
      }
    });

    test('falls back to default when Retry-After is unparseable garbage', async () => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(responseWith(429, { errors: ['nope'] }, {
          'Retry-After': 'sometime-tomorrow',
        }));

      const service = new AutotaskService(configWithUrl, mockLogger);
      try {
        await service.searchTickets({});
        fail('expected throw');
      } catch (err) {
        expect((err as AutotaskRateLimitError).retryAfterSeconds).toBe(60);
      }
    });

    test('non-429 errors stay as generic Error (no false-positive rate-limit signal)', async () => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(responseWith(500, { errors: ['Boom'] }));

      const service = new AutotaskService(configWithUrl, mockLogger);
      try {
        await service.searchTickets({});
        fail('expected throw');
      } catch (err) {
        expect(err).not.toBeInstanceOf(AutotaskRateLimitError);
        expect((err as Error).message).toContain('HTTP 500');
      }
    });
  });

  describe('AutotaskToolHandler → structured rate_limited tool result', () => {
    test('wraps AutotaskRateLimitError as error_type: rate_limited with retry_after_seconds', async () => {
      fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(responseWith(429, { errors: ['threshold'] }, {
          'Retry-After': '120',
        }));

      const service = new AutotaskService(configWithUrl, mockLogger);
      const handler = new AutotaskToolHandler(service, mockLogger);

      const result = await handler.callTool('autotask_search_tickets', { searchTerm: 'foo' });

      expect(result.isError).toBe(true);
      const text = (result.content[0] as any).text as string;
      const parsed = JSON.parse(text);
      expect(parsed.error_type).toBe('rate_limited');
      expect(parsed.retry_after_seconds).toBe(120);
      expect(parsed.tool).toBe('autotask_search_tickets');
      expect(parsed.instruction).toMatch(/Do not retry/);
    });
  });
});
