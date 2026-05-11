// Scan input hook — autofocus recovery, Enter-to-submit, debounced duplicate
// suppression, configurable cooldown between scans, and a torch helper for
// devices with a rear camera (Sunmi / Honeywell / Zebra Android).
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

// ---------- Flashlight / torch helper ----------
//
// Some warehouse Android devices expose `MediaTrackCapabilities.torch`. We
// keep a single shared MediaStream so toggling does not re-prompt the user.
let torchStream: MediaStream | null = null;
let torchOn = false;

export async function isTorchSupported(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const s = torchStream || await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    torchStream = s;
    const track = s.getVideoTracks()[0];
    const caps = (track as any).getCapabilities?.() || {};
    return !!caps.torch;
  } catch { return false; }
}

export async function setTorch(on: boolean): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    if (!torchStream) {
      torchStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    }
    const track = torchStream.getVideoTracks()[0];
    await (track as any).applyConstraints({ advanced: [{ torch: on }] });
    torchOn = on;
    if (!on) {
      // Free the camera when turning off
      torchStream.getTracks().forEach(t => t.stop());
      torchStream = null;
    }
    return true;
  } catch (e) {
    console.warn("[torch] toggle failed", e);
    torchStream?.getTracks().forEach(t => t.stop());
    torchStream = null;
    return false;
  }
}

export function isTorchOn(): boolean { return torchOn; }
