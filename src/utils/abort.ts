// Shared abort helpers. Kept free of service imports so config.ts can use them
// without a circular dependency on autotask-http.

/** Error with name 'AbortError', the shape raised for a caller-cancelled operation. */
export function abortError(message: string): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/** True when `err` is the AbortError raised for a caller-cancelled operation. */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Caller signal combined with a timeout. AbortSignal.any is
 * Node >= 20.3; engines allows 20.0, so fall back to a manual link there.
 */
export function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof any === 'function') return any.call(AbortSignal, [signal, timeout]);
  const linked = new AbortController();
  if (signal.aborted) {
    linked.abort(signal.reason);
    return linked.signal;
  }
  const onCaller = (): void => {
    cleanup();
    linked.abort(signal.reason);
  };
  const onTimeout = (): void => {
    cleanup();
    linked.abort(timeout.reason);
  };
  const cleanup = (): void => {
    signal.removeEventListener('abort', onCaller);
    timeout.removeEventListener('abort', onTimeout);
  };
  signal.addEventListener('abort', onCaller, { once: true });
  timeout.addEventListener('abort', onTimeout, { once: true });
  return linked.signal;
}
