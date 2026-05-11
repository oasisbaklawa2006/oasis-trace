-- =====================================================================
-- OASIS LABEL STUDIO — PRODUCTION RLS HARDENING (authenticated-only)
-- =====================================================================
-- !!! DO NOT RUN THIS DURING ACTIVE TESTING !!!
-- Run this script ONLY immediately before production launch, AFTER:
--   1. Supabase Auth login is mandatory in the frontend (AuthGate active).
--   2. All operators have valid Supabase Auth accounts.
--   3. End-to-end workflows have been verified with RLS OFF.
--
-- What this script does:
--   * Enables Row Level Security on every `ols_` table.
--   * Drops any previously created anon (publishable-key) policies.
--   * Grants SELECT / INSERT / UPDATE to the `authenticated` role only.
--   * Does NOT grant DELETE to normal users (deletes must go through a
--     service-role admin tool or future approval workflow).
--   * Touches ONLY tables whose name starts with `ols_`. No existing
--     Oasis Central / Catalogue tables are affected.
--   * Does NOT reference public.users — avoids the classic RLS recursion
--     trap. Authorization is purely "is the caller authenticated?".
--   * Keeps the current frontend working unchanged: every page already
--     uses the Supabase JS client with a logged-in session, so the
--     `authenticated` role policies will permit all current reads/writes.
--
-- Idempotent: safe to re-run. Each policy is dropped before being created.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'ols\_%' escape '\'
  loop
    -- 1. Enable RLS
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('alter table public.%I force row level security',  r.tablename);

    -- 2. Drop any anon policies left over from the testing phase
    execute format('drop policy if exists "ols_anon_read"   on public.%I', r.tablename);
    execute format('drop policy if exists "ols_anon_write"  on public.%I', r.tablename);
    execute format('drop policy if exists "ols_anon_update" on public.%I', r.tablename);
    execute format('drop policy if exists "ols_anon_delete" on public.%I', r.tablename);

    -- 3. Drop and recreate the authenticated-only policies
    execute format('drop policy if exists "ols_auth_read"   on public.%I', r.tablename);
    execute format('drop policy if exists "ols_auth_write"  on public.%I', r.tablename);
    execute format('drop policy if exists "ols_auth_update" on public.%I', r.tablename);
    execute format('drop policy if exists "ols_auth_delete" on public.%I', r.tablename);

    execute format(
      'create policy "ols_auth_read"   on public.%I for select to authenticated using (true)',
      r.tablename
    );
    execute format(
      'create policy "ols_auth_write"  on public.%I for insert to authenticated with check (true)',
      r.tablename
    );
    execute format(
      'create policy "ols_auth_update" on public.%I for update to authenticated using (true) with check (true)',
      r.tablename
    );
    -- 4. NOTE: No DELETE policy is created. Without a permissive DELETE
    --    policy, RLS denies all deletes for the `authenticated` role.
    --    Only the `service_role` key (server-side admin tools) can delete.
  end loop;
end $$;

-- =====================================================================
-- Post-run verification (optional, run manually):
--   select tablename, policyname, cmd, roles
--   from pg_policies
--   where schemaname='public' and tablename like 'ols\_%' escape '\'
--   order by tablename, cmd;
--
-- Expected: every ols_ table has exactly 3 policies
--   ols_auth_read   (SELECT, {authenticated})
--   ols_auth_write  (INSERT, {authenticated})
--   ols_auth_update (UPDATE, {authenticated})
-- and NO ols_anon_* policies remain.
-- =====================================================================
