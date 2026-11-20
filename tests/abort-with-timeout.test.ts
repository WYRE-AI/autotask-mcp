// withTimeout manual fallback (Node < 20.3, no AbortSignal.any): listeners on
// the losing source must be removed once either source aborts.

import { withTimeout } from '../src/utils/abort';

describe('withTimeout fallback listener cleanup', () => {
  const realAny = (AbortSignal as any).any;
  beforeEach(() => {
    (AbortSignal as any).any = undefined;
  });
  afterEach(() => {
    (AbortSignal as any).any = realAny;
  });

  it('removes both listeners when the caller aborts, and propagates the reason', () => {
    const caller = new AbortController();
    const timeout = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const removeCaller = jest.spyOn(caller.signal, 'removeEventListener');
    const removeTimeout = jest.spyOn(timeout.signal, 'removeEventListener');

    const linked = withTimeout(caller.signal, 1000);
    const reason = new Error('caller gone');
    caller.abort(reason);

    expect(linked.aborted).toBe(true);
    expect(linked.reason).toBe(reason);
    expect(removeCaller).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(removeTimeout).toHaveBeenCalledWith('abort', expect.any(Function));
    jest.restoreAllMocks();
  });

  it('removes both listeners when the timeout fires first', () => {
    const caller = new AbortController();
    const timeout = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const removeCaller = jest.spyOn(caller.signal, 'removeEventListener');

    const linked = withTimeout(caller.signal, 1000);
    timeout.abort();

    expect(linked.aborted).toBe(true);
    expect(removeCaller).toHaveBeenCalledWith('abort', expect.any(Function));
    jest.restoreAllMocks();
  });

  it('returns an already-aborted signal without registering listeners', () => {
    const caller = new AbortController();
    caller.abort(new Error('early'));
    const add = jest.spyOn(caller.signal, 'addEventListener');
    expect(withTimeout(caller.signal, 1000).aborted).toBe(true);
    expect(add).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
