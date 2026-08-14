/**
 * Regression tests for the per-tenant 429 cooldown gate.
 *
 * Observed in production: after a tenant tripped Autotask's hourly API
 * threshold, an LLM client ignored the "Do NOT retry" error text and
 * re-fired the same calls within seconds — every retry going upstream into
 * the throttled tenant, which can extend the cooldown. The gate remembers
 * the Retry-After deadline per tenant (keyed by lowercased username, shared
 * across gateway-mode per-request client instances) and fails calls fast
 * and locally until it passes.
 */

import { AutotaskHttpClient, AutotaskRateLimitError, _resetRateLimitCooldowns } from '../src/services/autotask-http';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

const makeClient = (username = 'user@example.com') =>
  new AutotaskHttpClient(
    username,
    'secret',
    'integration-code',
    'https://webservices28.autotask.net/ATServicesRest/',
    logger as any
  );

const rateLimited = () =>
  Promise.resolve({
    ok: false,
    status: 429,
    headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '60' : null) },
    text: async () => JSON.stringify({ errors: ['API threshold exceeded'] }),
  } as any);

const success = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ item: { id: 1 } }),
  } as any);

beforeEach(() => {
  _resetRateLimitCooldowns();
  _resetZoneUrlCache();
  Object.values(logger).forEach((m: any) => m.mockReset?.());
});

describe('per-tenant 429 cooldown gate', () => {
  it('fails fast locally (no upstream call) once the tenant has hit a 429', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(rateLimited);

    try {
      await expect(client.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Retry-spam: none of these may reach upstream during the cooldown.
      await expect(client.get('Companies', 1)).rejects.toThrow(/NOT sent upstream/);
      await expect(client.query('Tickets', [])).rejects.toThrow(AutotaskRateLimitError);
      await expect(client.rawRequest('POST', '/TicketHistory/query', {})).rejects.toThrow(AutotaskRateLimitError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('keeps the structured retryAfterSeconds on locally-failed calls', async () => {
    const client = makeClient();
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(rateLimited);

    try {
      await expect(client.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      const err = (await client.get('Companies', 2).catch((e) => e)) as AutotaskRateLimitError;
      expect(err).toBeInstanceOf(AutotaskRateLimitError);
      expect(err.retryAfterSeconds).toBeGreaterThan(0);
      expect(err.retryAfterSeconds).toBeLessThanOrEqual(60);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('shares the cooldown across client instances of the SAME tenant (gateway mode)', async () => {
    const first = makeClient('User@Tenant.com');
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockImplementation(rateLimited);

    try {
      await expect(first.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      // Next request builds a fresh client (as buildPerRequestHandlers does).
      const second = makeClient('user@tenant.com');
      await expect(second.get('Companies', 1)).rejects.toThrow(/NOT sent upstream/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does NOT gate other tenants', async () => {
    const throttled = makeClient('throttled@tenant.com');
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementationOnce(rateLimited)
      .mockImplementation(success);

    try {
      await expect(throttled.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      const healthy = makeClient('healthy@tenant.com');
      await expect(healthy.get('Companies', 1)).resolves.toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('lets requests through again after the cooldown expires', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const client = makeClient();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementationOnce(rateLimited)
      .mockImplementation(success);

    try {
      await expect(client.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      jest.advanceTimersByTime(61_000);
      await expect(client.get('Companies', 1)).resolves.toEqual({ id: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });

  it('caps an oversized Retry-After header at the maximum cooldown', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const client = makeClient();
    const fetchMock = jest
      .spyOn(global, 'fetch' as any)
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? '86400' : null) },
          text: async () => '',
        } as any)
      )
      .mockImplementation(success);

    try {
      await expect(client.get('Companies', 1)).rejects.toThrow(AutotaskRateLimitError);
      // 5 minutes (the cap) + a beat — the 24h header must not still gate us.
      jest.advanceTimersByTime(5 * 60 * 1000 + 1_000);
      await expect(client.get('Companies', 1)).resolves.toEqual({ id: 1 });
    } finally {
      fetchMock.mockRestore();
      jest.useRealTimers();
    }
  });
});
