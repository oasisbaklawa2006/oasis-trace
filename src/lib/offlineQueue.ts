// Offline print/audit queue.
//
// When the device drops connectivity, callers can `enqueue()` a print or audit
// payload and continue working. The queue is persisted to localStorage and
// auto-flushed on `online` / interval. Each job carries a free-form `kind`
// and `payload` plus a typed `handler` registered at startup.
//
// This intentionally does NOT block printing — the UI still emits the label
// to the printer (TSPL/ZPL is a local action). Only the *backend write* is
// queued, so the audit trail catches up when connectivity returns.

import { isOnline, subscribeOnline } from "@/lib/data";

export interface QueuedJob {
  id: string;
  kind: string;
  payload: any;
  attempts: number;
  enqueuedAt: number;
  lastError?: string;
}

const KEY = "ols_offline_queue";
const RETRY_MS = 15_000;

type Handler = (payload: any) => Promise<void>;
const handlers = new Map<string, Handler>();
const listeners = new Set<(n: number) => void>();

function load(): QueuedJob[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(jobs: QueuedJob[]) {
  try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* ignore */ }
  listeners.forEach(l => l(jobs.length));
}

export function registerHandler(kind: string, h: Handler) { handlers.set(kind, h); }

export function queueSize(): number { return load().length; }

export function subscribeQueue(l: (n: number) => void): () => void {
  listeners.add(l); l(load().length);
  return () => listeners.delete(l);
}

export function enqueue(kind: string, payload: any) {
  const jobs = load();
  jobs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind, payload, attempts: 0, enqueuedAt: Date.now(),
  });
  save(jobs);
  // Try immediately if online — common case is a transient failure.
  if (isOnline()) void flush();
}

let flushing = false;
export async function flush(): Promise<{ ok: number; failed: number }> {
  if (flushing) return { ok: 0, failed: 0 };
  if (!isOnline()) return { ok: 0, failed: 0 };
  flushing = true;
  let ok = 0, failed = 0;
  try {
    let jobs = load();
    const remaining: QueuedJob[] = [];
    for (const j of jobs) {
      const h = handlers.get(j.kind);
      if (!h) { remaining.push(j); continue; }
      try {
        await h(j.payload);
        ok++;
      } catch (e: any) {
        j.attempts++;
        j.lastError = e?.message || String(e);
        // Drop after 10 attempts to avoid infinite growth
        if (j.attempts < 10) remaining.push(j);
        failed++;
      }
    }
    save(remaining);
  } finally { flushing = false; }
  return { ok, failed };
}

// Auto-flush: on reconnect + every RETRY_MS while there are pending jobs.
if (typeof window !== "undefined") {
  subscribeOnline((on) => { if (on) void flush(); });
  setInterval(() => { if (queueSize() > 0) void flush(); }, RETRY_MS);
}
