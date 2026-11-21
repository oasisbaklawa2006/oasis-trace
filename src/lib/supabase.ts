import { createClient, SupabaseClient, type SupportedStorage } from "@supabase/supabase-js";

// `import.meta.env` is absent when this module is loaded by Node tooling
// (the Torch attestation manifest generator), hence the fallback.
const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

/** Single source of truth for "is Supabase configured" (shared with build-time attestation). */
export function isSupabaseConfigured(u: string | undefined, k: string | undefined): boolean {
  return Boolean(u && k);
}

export const supabaseConfigured = isSupabaseConfigured(url, key);

/**
 * Supabase singleton. If env vars are missing the build still works — pages
 * fall back to local demo data and show an offline banner. This keeps Oasis
 * Label Studio fully portable to GitHub / Codex / Cursor / Vercel.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storage: (globalThis as { localStorage?: SupportedStorage }).localStorage },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  return supabase;
}
