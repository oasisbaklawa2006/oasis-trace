import { useEffect, useRef } from "react";

/** Serialized poll tick — sync preferred; Promise return is also awaited. */
export type SerializedPollTick = () => void | Promise<void>;

/**
 * Poll on an interval without overlapping loads or stale response overwrites.
 */
export function useSerializedPoll(load: SerializedPollTick, intervalMs: number): void {
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let active = true;
    let seq = 0;
    let inFlight = false;

    const tick = (): void => {
      if (!active || inFlight) return;
      inFlight = true;
      const requestId = ++seq;
      void Promise.resolve(loadRef.current())
        .catch(() => {
          // Contain load failures so kiosk polling continues serialized.
        })
        .finally(() => {
          if (requestId === seq) inFlight = false;
        });
    };

    tick();
    const timer = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);
}
