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
