# OASIS LABEL STUDIO

Production-grade barcode, label, traceability, cartonization, DPL, finance bridge, shipping & gate scan system for **Oasis Baklawa**.

## Stack
React · TypeScript · Tailwind · Supabase JS client · Vite

## Setup
1. Copy `.env.example` to `.env` and fill in your **existing Oasis Baklawa Central** Supabase credentials:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
2. Apply schema (one time): open Supabase SQL editor and run `db/ols_init.sql`. It is **idempotent** and **only creates new objects with the `ols_` prefix** — nothing existing is altered, dropped, or renamed.
3. `bun install && bun run dev`

## Database safety
- All new tables use the `ols_` prefix.
- RLS is enabled on every `ols_` table with simple authenticated-user policies (no recursion, no references to `public.users`).
- Existing Oasis Central / Catalogue tables are treated as **read-only** via nullable text/uuid references.
- The app falls back to a local demo store if env vars are missing, so the build never breaks.

## Portability
No Lovable Cloud dependency. Works on GitHub, Codex, Cursor, Vercel out of the box.
