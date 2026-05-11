// Thin data layer: tries Supabase first, falls back to demoStore on any error
// (missing table, no env, network). Keeps every page resilient and portable.
import { supabase, supabaseConfigured } from "./supabase";
import { demo } from "./demoStore";

export async function listTable<T = any>(table: string, opts?: { order?: string; limit?: number }): Promise<T[]> {
  if (supabaseConfigured && supabase) {
    try {
      let q = supabase.from(table).select("*");
      if (opts?.order) q = q.order(opts.order, { ascending: false });
      if (opts?.limit) q = q.limit(opts.limit);
      const { data, error } = await q;
      if (!error && data) return data as T[];
    } catch {
      // fall through to demo store
    }
  }
  return demo.list<T>(table);
}

export async function insertRow<T = any>(table: string, row: Record<string, any>): Promise<T> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from(table).insert(row).select().single();
      if (!error && data) return data as T;
    } catch {
      // fall through to demo store
    }
  }
  return demo.insert(table, row) as T;
}

export async function updateRow<T = any>(table: string, id: string, patch: Record<string, any>): Promise<T | undefined> {
  if (supabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from(table).update(patch).eq("id", id).select().single();
      if (!error && data) return data as T;
    } catch {
      // fall through to demo store
    }
  }
  return demo.update(table, id, patch) as T | undefined;
}

export const sourceLabel = supabaseConfigured ? "Supabase" : "Local demo";
