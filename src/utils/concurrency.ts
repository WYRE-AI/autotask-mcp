// Bounded-concurrency async helpers.
//
// Autotask enforces a per-integration concurrent-thread limit (HTTP 429
// "API thread threshold of N threads has been exceeded"). Fanning out one
// API call per result row with an unbounded Promise.allSettled blows that
// limit on broad result sets, so most calls 429 and their data is lost.
// mapWithConcurrency caps how many mappers run at once.

/**
 * Run `fn` over `items` with at most `limit` invocations in flight at once.
 *
 * Behaves like `Promise.allSettled(items.map(fn))` — results are returned in
 * input order and a rejected mapper produces a `{ status: 'rejected' }` entry
 * rather than aborting the batch — but never exceeds `limit` concurrency.
 *
 * @param items Items to map over.
 * @param limit Maximum number of concurrent invocations (coerced to >= 1).
 * @param fn Async mapper, receives the item and its index.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const maxConcurrency = Math.max(1, Math.floor(limit) || 1);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (let index = nextIndex++; index < items.length; index = nextIndex++) {
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(maxConcurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
