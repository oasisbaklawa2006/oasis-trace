-- =====================================================================
-- OASIS LABEL STUDIO — LIVE MODE policy add-on (additive, idempotent)
-- Run AFTER db/ols_init.sql. Adds policies that let the publishable anon
-- key read/write `ols_` tables when the app is used without Supabase Auth.
-- Touches ONLY ols_-prefixed tables. Does not alter, drop, or rename any
-- existing object outside of its own named policies.
-- =====================================================================
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename like 'ols\_%' escape '\' loop
    execute format('drop policy if exists "ols_anon_read"   on public.%I', r.tablename);
    execute format('create policy "ols_anon_read"   on public.%I for select to anon using (true)', r.tablename);
    execute format('drop policy if exists "ols_anon_write"  on public.%I', r.tablename);
    execute format('create policy "ols_anon_write"  on public.%I for insert to anon with check (true)', r.tablename);
    execute format('drop policy if exists "ols_anon_update" on public.%I', r.tablename);
    execute format('create policy "ols_anon_update" on public.%I for update to anon using (true) with check (true)', r.tablename);
  end loop;
end $$;
