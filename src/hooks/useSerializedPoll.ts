import { useEffect, useRef } from "react";

/**
 * Poll on an interval without overlapping loads or stale response overwrites.
 */
export function useSerializedPoll(load: () => Promise<void>, intervalMs: number): void {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    let seq = 0;
    let inFlight = false;

    async function run() {
      if (!active || inFlight) return;
      inFlight = true;
      const requestId = ++seq;
      try {
        await loadRef.current();
      } finally {
        if (requestId === seq) inFlight = false;
      }
    }

    void run();
    const timer = setInterval(() => { void run(); }, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [intervalMs]);
}
