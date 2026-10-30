// Caller-cancelled requests: abort frees the tenant slot (in flight or queued)
// and surfaces as an AbortError rather than a generic network error.

import {
  AutotaskHttpClient,
  _resetRateLimitCooldowns,
  _resetTenantSemaphores,
  _setAutotaskSleepForTests,
  isAbortError,
} from '../src/services/autotask-http';
import { _resetZoneUrlCache } from '../src/utils/config';

const logger = { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() };

const previousMaxInflight = process.env.AUTOTASK_MAX_INFLIGHT;
const realFetch = global.fetch;

const makeClient = (username = 'user@example.com') =>
  new AutotaskHttpClient(
    username,
    'secret',
    'integration-code',
    'https://webservices28.autotask.net/ATServicesRest/',
    logger as any
  );

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  _resetRateLimitCooldowns();
  _resetTenantSemaphores();
  _resetZoneUrlCache();
  _setAutotaskSleepForTests(async () => {});
  process.env.AUTOTASK_MAX_INFLIGHT = '1';
});

afterEach(() => {
  global.fetch = realFetch;
  _setAutotaskSleepForTests(null);
  _resetTenantSemaphores();
  _resetRateLimitCooldowns();
  if (previousMaxInflight === undefined) delete process.env.AUTOTASK_MAX_INFLIGHT;
  else process.env.AUTOTASK_MAX_INFLIGHT = previousMaxInflight;
});

describe('abortable requests', () => {
  it('aborts an in-flight call, aborts the fetch signal, and releases the slot', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = jest.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);
      if (signals.length > 1) return Promise.resolve(jsonResponse(200, { fields: [{ name: 'x' }] }));
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    global.fetch = fetchMock as any;

    const client = makeClient();
    const controller = new AbortController();
    const pending = client.fieldInfo('Companies', { signal: controller.signal });
    const settled = pending.then(() => null, (e) => e);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    const err = await settled;
    expect(isAbortError(err)).toBe(true);
    expect(signals[0]?.aborted).toBe(true);

    // MAX_INFLIGHT=1: this only runs if the slot was released.
    await expect(client.fieldInfo('Tickets')).resolves.toEqual({ fields: [{ name: 'x' }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a call queued behind a held slot without calling fetch or consuming a slot', async () => {
    let finishHolder!: (r: Response) => void;
    const fetchMock = jest.fn(() => new Promise<Response>((resolve) => {
      if (fetchMock.mock.calls.length === 1) finishHolder = resolve;
      else resolve(jsonResponse(200, { fields: [] }));
    }));
    global.fetch = fetchMock as any;

    const client = makeClient();
    const holder = client.fieldInfo('Tickets');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const controller = new AbortController();
    const queued = client.fieldInfo('Companies', { signal: controller.signal });
    const queuedSettled = queued.then(() => null, (e) => e);
    await flush();
    controller.abort();
    expect(isAbortError(await queuedSettled)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A later call must queue behind the holder and run once it finishes.
    const after = client.fieldInfo('Contacts');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishHolder(jsonResponse(200, { fields: [] }));
    await holder;
    await expect(after).resolves.toEqual({ fields: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats an abort during the body read as an abort, not an empty success', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => {
        controller.abort();
        throw new Error('body aborted');
      },
    })) as any;
    const err = await makeClient().fieldInfo('Companies', { signal: controller.signal }).then(() => null, (e) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it('rejects an already-aborted signal without calling fetch', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const controller = new AbortController();
    controller.abort();
    const err = await makeClient().fieldInfo('Companies', { signal: controller.signal }).then(() => null, (e) => e);
    expect(isAbortError(err)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('abortable zone resolution', () => {
  const ZONE_LOOKUP = 'zoneInformation';
  const zoneOk = () => ({
    ok: true,
    status: 200,
    json: async () => ({ url: 'https://webservices5.autotask.net/ATServicesRest/', zoneName: 'X' }),
  });
  const makeZoneClient = () =>
    new AutotaskHttpClient('user@example.com', 'secret', 'integration-code', undefined, logger as any);

  /** Zone lookup that only settles when its own init.signal aborts. */
  function stalledZoneFetch(signals: AbortSignal[]) {
    return (init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal;
        signals.push(signal);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
  }

  beforeEach(() => {
    logger.error.mockClear();
  });

  it('aborts a stalled zone lookup promptly and never starts the field-info fetch', async () => {
    const zoneSignals: AbortSignal[] = [];
    const stalled = stalledZoneFetch(zoneSignals);
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (String(url).includes(ZONE_LOOKUP)) return stalled(init);
      return Promise.resolve(jsonResponse(200, { fields: [] }));
    });
    global.fetch = fetchMock as any;

    const controller = new AbortController();
    const settled = makeZoneClient()
      .fieldInfo('Companies', { signal: controller.signal })
      .then(() => null, (e) => e);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    controller.abort();
    expect(isAbortError(await settled)).toBe(true);
    expect(zoneSignals[0]?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('caches nothing after an aborted lookup', async () => {
    const stalled = stalledZoneFetch([]);
    let zoneStalls = true;
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (String(url).includes(ZONE_LOOKUP)) return zoneStalls ? stalled(init) : Promise.resolve(zoneOk() as any);
      return Promise.resolve(jsonResponse(200, { fields: [{ name: 'x' }] }));
    });
    global.fetch = fetchMock as any;

    const controller = new AbortController();
    const first = makeZoneClient()
      .fieldInfo('Companies', { signal: controller.signal })
      .then(() => null, (e) => e);
    await flush();
    controller.abort();
    expect(isAbortError(await first)).toBe(true);

    zoneStalls = false;
    fetchMock.mockClear();
    await expect(makeZoneClient().fieldInfo('Companies')).resolves.toEqual({ fields: [{ name: 'x' }] });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain(ZONE_LOOKUP);
    expect(urls[1]).toContain('https://webservices5.autotask.net/ATServicesRest/v1.0/Companies/entityInformation/fields');
  });

  it('rejects an already-aborted signal without any fetch when the zone is not cached', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const controller = new AbortController();
    controller.abort();
    const err = await makeZoneClient()
      .fieldInfo('Companies', { signal: controller.signal })
      .then(() => null, (e) => e);
    expect(isAbortError(err)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not let one caller's abort affect another caller's concurrent zone lookup", async () => {
    process.env.AUTOTASK_MAX_INFLIGHT = '3';
    const zoneSignals: AbortSignal[] = [];
    const resolvers: Array<() => void> = [];
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (!String(url).includes(ZONE_LOOKUP)) return Promise.resolve(jsonResponse(200, { fields: [{ name: 'y' }] }));
      // The unsignalled caller's zone fetch has no signal at all.
      const signal = init?.signal as AbortSignal | undefined;
      zoneSignals.push(signal as AbortSignal);
      return new Promise<Response>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        resolvers.push(() => resolve(zoneOk() as any));
      });
    });
    global.fetch = fetchMock as any;

    const controller = new AbortController();
    const first = makeZoneClient()
      .fieldInfo('Companies', { signal: controller.signal })
      .then(() => null, (e) => e);
    const second = makeZoneClient().fieldInfo('Tickets');
    await flush();
    expect(zoneSignals).toHaveLength(2);

    controller.abort();
    expect(isAbortError(await first)).toBe(true);
    expect(zoneSignals[1]?.aborted).not.toBe(true);

    resolvers[1]!();
    await expect(second).resolves.toEqual({ fields: [{ name: 'y' }] });
  });
});
