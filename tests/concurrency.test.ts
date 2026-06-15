/**
 * Unit tests for mapWithConcurrency.
 * Verifies bounded concurrency, input-order results, and per-item error
 * isolation — the properties enhanceItems relies on to stay under Autotask's
 * concurrent-thread limit.
 */

import { mapWithConcurrency } from '../src/utils/concurrency';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('returns fulfilled results in input order', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'fulfilled', value: 20 },
      { status: 'fulfilled', value: 30 },
      { status: 'fulfilled', value: 40 },
    ]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n;
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('runs at the full limit when there is enough work', async () => {
    const gate = deferred();
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 6 }, (_, i) => i);

    const run = mapWithConcurrency(items, 3, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await gate.promise; // hold every started worker open
      inFlight--;
      return n;
    });

    // Let the initial batch start, then release.
    await new Promise((r) => setTimeout(r, 5));
    expect(maxInFlight).toBe(3);
    gate.resolve();
    await run;
  });

  it('isolates rejections without aborting the batch', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles an empty input', async () => {
    expect(await mapWithConcurrency([], 3, async (n) => n)).toEqual([]);
  });

  it('coerces a limit below 1 up to serial execution', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return n;
    });
    expect(maxInFlight).toBe(1);
  });
});
