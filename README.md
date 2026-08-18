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
2. Apply schema (one time): open Supabase SQL editor and run `db/ols_init.sql`, then `db/ols_printer_settings_column.sql`. Both are **idempotent** and **only touch `ols_`-prefixed objects** — nothing existing is altered, dropped, or renamed.
3. `npm install && npm run dev`

## Printing to a real thermal label printer

TSPL/ZPL commands are generated client-side (`src/lib/printerCommands.ts`) but a
browser cannot open a raw TCP socket to a networked label printer itself. The
**local print bridge** closes that gap:

1. On the machine physically connected to (or on the same LAN as) the printer, run:
   ```
   node scripts/print-bridge.mjs
   ```
   It listens on `http://127.0.0.1:9191` by default (`--port`, `--bind`, or
   `PRINT_BRIDGE_PORT`/`PRINT_BRIDGE_BIND` env vars to change either).
2. In **Printer Management** (`/printers`), open a printer's Calibrate drawer and
   set its **bridge URL**, **host/IP**, and **port** (almost always `9100` for
   TSC/Zebra/XPrinter). Leave host blank to keep using copy-to-clipboard for
   that printer.
3. **Test Print** on that printer's card, and **Send** on the TSPL/ZPL command
   cards in Label Template Library, now go straight to the printer via the
   bridge instead of only copying to clipboard.

The bridge binds to `127.0.0.1` by default — only reachable from the same
machine. Don't bind it to `0.0.0.0` on a shared or untrusted machine, since any
page loaded in that machine's browser can call it.

## Database safety
- All new tables use the `ols_` prefix.
- RLS is enabled on every `ols_` table with simple authenticated-user policies (no recursion, no references to `public.users`).
- Existing Oasis Central / Catalogue tables are treated as **read-only** via nullable text/uuid references.
- The app falls back to a local demo store if env vars are missing, so the build never breaks.

## Portability
No Lovable Cloud dependency. Works on GitHub, Codex, Cursor, Vercel out of the box.
