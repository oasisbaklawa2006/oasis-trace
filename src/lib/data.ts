// Data layer for OASIS LABEL STUDIO.
// Tries Supabase first against the live `ols_` tables. On any error
// (missing table, RLS denial, network) it falls back to the local demo
// store so the UI never breaks. Errors are surfaced to a listener so the
// AppShell can flip its mode badge and pages can toast.
import { supabase, supabaseConfigured } from "./supabase";
import { demo } from "./demoStore";

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

/** Probe a known ols_ table to confirm live Supabase access. */
export async function probeLiveMode(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) { setMode("demo", "Supabase env vars missing"); return false; }
  try {
    const { error } = await supabase.from("ols_departments").select("id", { head: true, count: "exact" }).limit(1);
    if (error) { setMode("demo", error.message); return false; }
    setMode("live"); return true;
  } catch (e: any) {
    setMode("demo", e?.message || "Network error"); return false;
  }
}

export async function listTable<T = any>(table: string, opts?: { order?: string; limit?: number }): Promise<T[]> {
  if (supabaseConfigured && supabase) {
    try {
      let q = supabase.from(table).select("*");
      if (opts?.order) q = q.order(opts.order, { ascending: false });
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (!error && data) { setMode("live"); return data as T[]; }
      if (error) setMode("demo", error.message);
    } catch (e: any) { setMode("demo", e?.message); }
  }
  return demo.list<T>(table);
}

export async function insertRow<T = any>(table: string, row: Record<string, any>): Promise<T> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (!error && data) { setMode("live"); return data as T; }
      if (error) { setMode("demo", error.message); console.warn(`[ols] insert ${table} fell back to demo:`, error.message); }
    } catch (e: any) { setMode("demo", e?.message); }
  }
  return demo.insert(table, row) as T;
}

export async function updateRow<T = any>(table: string, id: string, patch: Record<string, any>): Promise<T | undefined> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
      if (!error && data) { setMode("live"); return data as T; }
      if (error) { setMode("demo", error.message); console.warn(`[ols] update ${table} fell back to demo:`, error.message); }
    } catch (e: any) { setMode("demo", e?.message); }
  }
  return demo.update(table, id, patch) as T | undefined;
}

export const sourceLabel = supabaseConfigured ? "Supabase" : "Local demo";
