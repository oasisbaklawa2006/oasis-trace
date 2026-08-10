// Data layer for OASIS LABEL STUDIO.
// Reads: tries Supabase first. On error (missing table, RLS denial, network),
// falls back to local demo store so the UI never breaks.
// Writes: when Supabase env vars are configured, hard-fails on write error
// instead of silently falling back to localStorage. This prevents silent data
// loss in production. Explicit demo mode (no env vars) continues using demo
// store unchanged. Adds: timeout, retry-on-network, friendly duplicate
// handling, online/offline detection.
import { supabase, supabaseConfigured } from "./supabase";
import { demo } from "./demoStore";
import { errorMessage } from "./utils";

type DataError = { message?: string; code?: string };

type ModeListener = (mode: "live" | "demo", lastError?: string) => void;
const listeners = new Set<ModeListener>();
let currentMode: "live" | "demo" | "unknown" = "unknown";
let lastError: string | undefined;

function setMode(mode: "live" | "demo", err?: string) {
  if (mode !== currentMode || err !== lastError) {
    currentMode = mode;
    lastError = err;
    listeners.forEach(l => l(mode, err));
  }
}

export function subscribeMode(l: ModeListener): () => void {
  listeners.add(l);
  if (currentMode !== "unknown") l(currentMode, lastError);
  return () => listeners.delete(l);
}

export function getMode() { return currentMode; }
export function getLastError() { return lastError; }

// ---------- Online/offline ----------
type OnlineListener = (online: boolean) => void;
const onlineListeners = new Set<OnlineListener>();
if (typeof window !== "undefined") {
  window.addEventListener("online", () => onlineListeners.forEach(l => l(true)));
  window.addEventListener("offline", () => onlineListeners.forEach(l => l(false)));
}
export function subscribeOnline(l: OnlineListener): () => void {
  onlineListeners.add(l);
  if (typeof navigator !== "undefined") l(navigator.onLine);
  return () => onlineListeners.delete(l);
}
export function isOnline() { return typeof navigator === "undefined" ? true : navigator.onLine; }

// ---------- Helpers ----------
const TIMEOUT_MS = 10_000;
function withTimeout<T>(p: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Supabase request timeout")), ms);
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= attempts; i++) {
    try { return await fn(); } catch (e: unknown) {
      lastErr = e;
      const msg = errorMessage(e, "").toLowerCase();
      const transient = msg.includes("timeout") || msg.includes("network") || msg.includes("fetch");
      if (!transient || i === attempts) break;
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Returns true if a Supabase error is a unique-constraint violation. */
export function isDuplicateError(err: unknown): boolean {
  const e = err as DataError | undefined;
  return e?.code === "23505" || /duplicate key value/i.test(e?.message || "");
}

/** Probe a known ols_ table to confirm live Supabase access. */
export async function probeLiveMode(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) { setMode("demo", "Supabase env vars missing"); return false; }
  try {
    const { error } = await withTimeout(
      supabase.from("ols_departments").select("id", { head: true, count: "exact" }).limit(1)
    );
    if (error) { setMode("demo", error.message); return false; }
    setMode("live"); return true;
  } catch (e: unknown) {
    setMode("demo", errorMessage(e, "Network error")); return false;
  }
}

export async function listTable<T = unknown>(table: string, opts?: { order?: string; limit?: number }): Promise<T[]> {
  if (supabaseConfigured && supabase) {
    try {
      const data = await withRetry(async () => {
        let q = supabase!.from(table).select("*");
        if (opts?.order) q = q.order(opts.order, { ascending: false });
        if (opts?.limit) q = q.limit(opts.limit);
        const { data, error } = await withTimeout(q);
        if (error) throw error;
        return data as T[];
      });
      setMode("live");
      return data;
    } catch (e: unknown) { setMode("demo", errorMessage(e)); }
  }
  return demo.list<T>(table);
}

export async function insertRow<T = unknown>(table: string, row: object): Promise<T> {
  if (supabaseConfigured && supabase) {
    try {
      const data = await withRetry(async () => {
        const { data, error } = await withTimeout(supabase!.from(table).insert(row).select().single());
        if (error) throw error;
        return data as T;
      });
      setMode("live");
      return data;
    } catch (e: unknown) {
      if (isDuplicateError(e)) {
        // Surface a clean error so callers can show a friendly toast.
        const err = new Error("Duplicate entry blocked") as Error & { code: string };
        err.code = "23505";
        throw err;
      }
      // Live mode is configured but the write failed: hard error instead of
      // silent fallback. Deliberately do NOT call setMode("demo", ...) here —
      // no data was written to (or served from) the local demo store, so
      // flipping the app-wide badge to "Demo Fallback Mode" would misrepresent
      // a blocked write as a silent fallback, which is exactly what this
      // hard-fail path exists to prevent (see file header comment above).
      console.error(`[ols] insert ${table} failed in live mode:`, errorMessage(e));
      throw new Error(`Cannot save to database: ${errorMessage(e)}. Check Supabase connection.`);
    }
  }
  return demo.insert(table, row) as T;
}

export async function updateRow<T = unknown>(table: string, id: string, patch: object): Promise<T | undefined> {
  if (supabaseConfigured && supabase) {
    try {
      const data = await withRetry(async () => {
        const { data, error } = await withTimeout(supabase!.from(table).update(patch).eq("id", id).select().single());
        if (error) throw error;
        return data as T;
      });
      setMode("live");
      return data;
    } catch (e: unknown) {
      // Live mode is configured but the write failed: hard error instead of
      // silent fallback. Deliberately do NOT call setMode("demo", ...) here —
      // see the matching comment in insertRow() above.
      console.error(`[ols] update ${table} failed in live mode:`, errorMessage(e));
      throw new Error(`Cannot save to database: ${errorMessage(e)}. Check Supabase connection.`);
    }
  }
  return demo.update(table, id, patch) as T | undefined;
}

/** Invoke a governed Core RPC. Live mode fails closed; demo mode is unsupported. */
export async function invokeTraceMutation<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Governed Trace mutations require a configured Supabase backend.");
  }
  try {
    return await withRetry(async () => {
      const { data, error } = await withTimeout(supabase!.rpc(fn, args));
      if (error) throw error;
      setMode("live");
      return data as T;
    });
  } catch (e: unknown) {
    console.error(`[ols] RPC ${fn} failed:`, errorMessage(e));
    throw new Error(`Trace operation rejected: ${errorMessage(e)}.`);
  }
}

export const sourceLabel = supabaseConfigured ? "Supabase" : "Local demo";
