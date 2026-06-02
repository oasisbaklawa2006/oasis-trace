/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Set to "true" to show Submit to Central controls (edge function required for live). */
  readonly VITE_CENTRAL_SCAN_SUBMIT_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
