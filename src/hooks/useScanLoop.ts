// Scan input hook for keyboard-wedge/manual entry — autofocus recovery,
// Enter-to-submit, debounced duplicate suppression, configurable cooldown
// between scans, and optional batch/rapid-pack buffering.
//
// This hook is not currently wired into any screen — GateScan.tsx,
// Cartonization.tsx and FinancePI.tsx each use a simpler inline
// onKeyDown-Enter pattern. It's kept available (not dead code to delete)
// because it materially improves on that pattern — real autofocus
// recovery and duplicate-scan suppression that today rely entirely on
// backend/service-layer idempotency checks — but wiring it into the
// existing, already-tested scan screens was left out of this pass to
// avoid UI regression risk without a way to manually verify hardware
// scanner behavior in this environment. See the Trace forensic audit for
// this decision.
//
// A previous version of this file also exported camera-torch helpers
// (isTorchSupported/setTorch) for a camera-based scanning mode. That mode
// was never built and is explicitly out of scope (keyboard-wedge/manual
// entry is the approved architecture) — removed as genuinely dead code.
import { useCallback, useEffect, useRef, useState } from "react";

export type ScanMode = "single" | "batch" | "rapid-pack";

interface Opts {
  mode?: ScanMode;
  onScan: (value: string) => void | Promise<void>;
  /** Ms within which an identical scan is ignored. */
  dedupMs?: number;
  /** Minimum gap (ms) between any two scans, regardless of value. Useful for
   *  gloves / fast trigger handhelds that double-fire. */
  cooldownMs?: number;
  /** Refocus the input N ms after blur. */
  refocusMs?: number;
}

export function useScanLoop({
  mode = "single",
  onScan,
  dedupMs = 300,
  cooldownMs = 0,
  refocusMs = 100,
}: Opts) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [buffer, setBuffer] = useState<string[]>([]);
  const lastRef = useRef<{ v: string; t: number }>({ v: "", t: 0 });
  const lastScanAt = useRef<number>(0);

  const submit = useCallback(async () => {
    const v = value.trim();
    if (!v) return;
    const now = Date.now();
    if (cooldownMs > 0 && now - lastScanAt.current < cooldownMs) { setValue(""); return; }
    if (lastRef.current.v === v && now - lastRef.current.t < dedupMs) { setValue(""); return; }
    lastRef.current = { v, t: now };
    lastScanAt.current = now;
    if (mode === "batch") {
      setBuffer(b => [...b, v]); setValue("");
    } else {
      await onScan(v); setValue("");
    }
  }, [value, mode, dedupMs, cooldownMs, onScan]);

  const flushBatch = useCallback(async () => {
    const items = buffer.slice();
    setBuffer([]);
    for (const v of items) await onScan(v);
  }, [buffer, onScan]);

  // Autofocus recovery
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onBlur = () => { setTimeout(() => ref.current?.focus(), refocusMs); };
    el.addEventListener("blur", onBlur);
    el.focus();
    return () => el.removeEventListener("blur", onBlur);
  }, [refocusMs]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "batch" && value === "" && buffer.length > 0) flushBatch();
      else submit();
    }
  }

  return { ref, value, setValue, handleKey, submit, buffer, flushBatch };
}
