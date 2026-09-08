/** Serialize overlapping async work by key (e.g. demo idempotency keys). */
const locks = new Map<string, Promise<unknown>>();

export function withAsyncLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = locks.get(key);
  if (pending) return pending as Promise<T>;
  const run = fn().finally(() => {
    if (locks.get(key) === run) locks.delete(key);
  });
  locks.set(key, run);
  return run;
}

/** @internal Test helper — clears in-flight locks between cases. */
export function clearAsyncLocks(): void {
  locks.clear();
}
