// Cancellable PicklistCache loads: an abort must never be cached as [] and
// must never poison a load other callers are sharing.

import { PicklistCache, FieldInfo } from '../src/services/picklist.cache';

const logger = { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() };

const FIELDS: FieldInfo[] = [
  { name: 'companyType', dataType: 'integer', isRequired: false, isReadOnly: false, isQueryable: true, isReference: false, isPickList: true },
];

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

function abortable(signal?: AbortSignal): Promise<FieldInfo[]> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

describe('PicklistCache signalled loads', () => {
  it('does not cache an aborted load; the next call reloads and caches', async () => {
    const fn = jest.fn((_entity: string, opts?: { signal?: AbortSignal }) => abortable(opts?.signal));
    const cache = new PicklistCache(logger as any, fn);

    const controller = new AbortController();
    const first = cache.getFields('Companies', { signal: controller.signal });
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    fn.mockImplementation(async () => FIELDS);
    await expect(cache.getFields('Companies', { signal: new AbortController().signal })).resolves.toEqual(FIELDS);
    expect(fn).toHaveBeenCalledTimes(2);

    // Cached now: no third fetch.
    await expect(cache.getFields('Companies')).resolves.toEqual(FIELDS);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('an abort does not abort or poison a concurrent unsignalled load', async () => {
    let resolveShared!: (f: FieldInfo[]) => void;
    const fn = jest.fn(
      (_entity: string, _opts?: { signal?: AbortSignal }) =>
        new Promise<FieldInfo[]>((resolve) => {
          resolveShared = resolve;
        })
    );
    const cache = new PicklistCache(logger as any, fn);

    const shared = cache.getFields('Companies'); // unsignalled, registered in `loading`
    const controller = new AbortController();
    const signalled = cache.getFields('Companies', { signal: controller.signal });
    controller.abort();

    resolveShared(FIELDS);
    await expect(shared).resolves.toEqual(FIELDS);
    await expect(signalled).resolves.toEqual(FIELDS); // awaited the shared load
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('keeps swallowing non-abort failures as [] for signalled loads', async () => {
    const fn = jest.fn(async () => {
      throw new Error('boom');
    });
    const cache = new PicklistCache(logger as any, fn);
    await expect(cache.getFields('Companies', { signal: new AbortController().signal })).resolves.toEqual([]);
  });
});
