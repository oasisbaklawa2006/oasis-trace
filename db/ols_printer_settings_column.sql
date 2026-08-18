-- =====================================================================
-- OASIS LABEL STUDIO — printer settings column (additive, idempotent)
-- Run AFTER db/ols_init.sql.
--
-- Printers.tsx has always read/written a JSON `settings` blob on
-- `ols_printers` (calibration profile: darkness, speed, gap, DPI,
-- thermal/X offsets, preset key -- and now also the print-bridge
-- connection: bridgeUrl/host/port), but ols_init.sql never defined that
-- column. In demo mode this went unnoticed since the local demo store has
-- no schema to enforce; against a real Supabase project, saving a
-- calibration profile fails outright ("column settings does not exist").
--
-- Touches ONLY the ols_printers table. Does not alter, drop, or rename
-- any existing column.
-- =====================================================================
alter table public.ols_printers
  add column if not exists settings jsonb not null default '{}'::jsonb;
