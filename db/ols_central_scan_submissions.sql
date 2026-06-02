-- =====================================================================
-- OASIS LABEL STUDIO — Additive: Central scan submission audit trail
-- Run manually in Supabase SQL editor. Idempotent. Only new `ols_` objects.
-- =====================================================================

create table if not exists public.ols_central_scan_submissions (
  id uuid primary key default gen_random_uuid(),
  scan_history_id uuid,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'ready_to_submit'
    check (status in ('ready_to_submit','submitted','failed','retry_pending')),
  central_reference text,
  failure_reason text,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ols_central_scan_submissions_idempotency_uniq
  on public.ols_central_scan_submissions (idempotency_key);

create index if not exists ols_central_scan_submissions_status_idx
  on public.ols_central_scan_submissions (status);

drop trigger if exists set_updated_at on public.ols_central_scan_submissions;
create trigger set_updated_at
  before update on public.ols_central_scan_submissions
  for each row execute function public.ols_set_updated_at();

alter table public.ols_central_scan_submissions enable row level security;

drop policy if exists "ols_auth_read" on public.ols_central_scan_submissions;
create policy "ols_auth_read" on public.ols_central_scan_submissions
  for select to authenticated using (true);

drop policy if exists "ols_auth_write" on public.ols_central_scan_submissions;
create policy "ols_auth_write" on public.ols_central_scan_submissions
  for insert to authenticated with check (true);

drop policy if exists "ols_auth_update" on public.ols_central_scan_submissions;
create policy "ols_auth_update" on public.ols_central_scan_submissions
  for update to authenticated using (true) with check (true);

-- Edge function uses service_role for idempotency checks + Central POST.
-- Frontend never receives service_role key.
