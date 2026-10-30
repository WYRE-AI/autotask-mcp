// Unit tests for Autotask zone auto-detection in config.ts

import { resolveAutotaskApiUrl, _resetZoneUrlCache } from '../src/utils/config';
import { isAbortError } from '../src/utils/abort';

describe('resolveAutotaskApiUrl', () => {
  const logger = {
    info: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    _resetZoneUrlCache();
    logger.info.mockReset();
    logger.error.mockReset();
  });

  it('returns the explicit apiUrl without any HTTP call when provided', async () => {
    const fetchMock = jest.fn();
    const result = await resolveAutotaskApiUrl(
      'user@example.com',
      'https://override.example.com/',
      logger,
      fetchMock as any
    );
    expect(result).toBe('https://override.example.com/');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('auto-detects the zone URL from the zoneInformation endpoint and caches it', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        zoneName: 'America East 1',
        url: 'https://webservices2.autotask.net/atservicesrest/',
        webUrl: 'https://ww2.autotask.net'
      })
    });

    const result = await resolveAutotaskApiUrl(
      'api-user@example.com',
      undefined,
      logger,
      fetchMock as any
    );

    expect(result).toBe('https://webservices2.autotask.net/atservicesrest/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('zoneInformation?user=api-user%40example.com');
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('America East 1')
    );

    // Cached: second call should not hit fetch again
    const second = await resolveAutotaskApiUrl(
      'api-user@example.com',
      undefined,
      logger,
      fetchMock as any
    );
    expect(second).toBe('https://webservices2.autotask.net/atservicesrest/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when the zone endpoint returns a non-OK status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    });

    await expect(
      resolveAutotaskApiUrl('missing@example.com', undefined, logger, fetchMock as any)
    ).rejects.toThrow(/HTTP 404/);
    expect(logger.error).toHaveBeenCalled();
    const errMsg = logger.error.mock.calls[0][0] as string;
    expect(errMsg).toContain('AUTOTASK_API_URL');
  });

  it('throws a clear error when the zone endpoint returns malformed JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token');
      }
    });

    await expect(
      resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any)
    ).rejects.toThrow(/malformed response/);
  });

  it('throws a clear error when the zone endpoint returns JSON missing the url field', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ zoneName: 'Mystery' })
    });

    await expect(
      resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any)
    ).rejects.toThrow(/missing url/);
  });

  it('throws when no explicit apiUrl and no username are provided', async () => {
    const fetchMock = jest.fn();
    await expect(
      resolveAutotaskApiUrl(undefined, undefined, logger, fetchMock as any)
    ).rejects.toThrow(/AUTOTASK_USERNAME is not set/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces network errors with a helpful message', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any)
    ).rejects.toThrow(/network error: ECONNREFUSED/);
    expect(logger.error).toHaveBeenCalled();
  });

  describe('abort signal', () => {
    const zoneResponse = {
      ok: true,
      status: 200,
      json: async () => ({ zoneName: 'Z', url: 'https://webservices2.autotask.net/atservicesrest/' })
    };

    it('throws an AbortError without fetching when already aborted, and caches nothing', async () => {
      const fetchMock = jest.fn().mockResolvedValue(zoneResponse);
      const controller = new AbortController();
      controller.abort();
      const err = await resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any, {
        signal: controller.signal
      }).then(() => null, (e) => e);
      expect(isAbortError(err)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();

      await resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws an AbortError mid-fetch without logging an error or writing the cache', async () => {
      const controller = new AbortController();
      const stalledFetch = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            (init!.signal as AbortSignal).addEventListener('abort', () => reject(new Error('fetch aborted')), {
              once: true
            });
          })
      );
      const pending = resolveAutotaskApiUrl('user@example.com', undefined, logger, stalledFetch as any, {
        signal: controller.signal
      }).then(() => null, (e) => e);
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort();
      expect(isAbortError(await pending)).toBe(true);
      expect(logger.error).not.toHaveBeenCalled();

      const fetchMock = jest.fn().mockResolvedValue(zoneResponse);
      await resolveAutotaskApiUrl('user@example.com', undefined, logger, fetchMock as any);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
