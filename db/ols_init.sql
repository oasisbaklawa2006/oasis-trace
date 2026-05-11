-- =====================================================================
-- OASIS LABEL STUDIO (OLS) — Safe additive migration
-- Run this manually on the existing Oasis Baklawa Central Supabase project
-- via the Supabase SQL editor. Idempotent. Touches only `ols_` objects.
-- =====================================================================
create extension if not exists "pgcrypto";

create or replace function public.ols_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.ols_profiles_light (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique, full_name text, email text, default_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, kind text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_products_cache (
  id uuid primary key default gen_random_uuid(),
  external_ref text, sku text unique, name text not null, category text,
  default_net_weight numeric, default_gross_weight numeric,
  shelf_life_days int, metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_orders_cache (
  id uuid primary key default gen_random_uuid(),
  external_ref text, order_number text unique not null,
  customer_code text, customer_name text, destination text,
  transport_mode text, status text default 'open',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_printers (
  id uuid primary key default gen_random_uuid(),
  name text not null, model text,
  command_lang text check (command_lang in ('TSPL','ZPL','BROWSER')),
  location text, status text default 'online',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_printer_settings (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.ols_printers(id) on delete cascade,
  darkness int default 8, speed int default 4,
  width_mm numeric default 100, height_mm numeric default 50,
  gap_mm numeric default 3, black_mark_offset_mm numeric default 0,
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_label_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, label_type text not null,
  width_mm numeric not null, height_mm numeric not null,
  barcode_type text default 'CODE128', show_qr boolean default false,
  font_scale numeric default 1.0, fields jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text unique not null,
  product_id uuid references public.ols_products_cache(id),
  department_id uuid references public.ols_departments(id),
  shift text, mfg_date date, shelf_life_days int,
  qc_status text default 'pending', remarks text, created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_production_labels (
  id uuid primary key default gen_random_uuid(),
  label_no text unique not null,
  batch_id uuid references public.ols_production_batches(id),
  product_id uuid references public.ols_products_cache(id),
  department_id uuid references public.ols_departments(id),
  tray_serial text, net_weight numeric, gross_weight numeric,
  mfg_date date, best_before date, qc_status text default 'pending',
  operator_name text, status text default 'active',
  metadata jsonb default '{}'::jsonb, created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_stock_units (
  id uuid primary key default gen_random_uuid(),
  production_label_id uuid unique references public.ols_production_labels(id),
  current_location text default 'store',
  current_status text default 'in_stock',
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  production_label_id uuid references public.ols_production_labels(id),
  from_location text, to_location text, movement_type text,
  reference_no text, user_id uuid, notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_cartons (
  id uuid primary key default gen_random_uuid(),
  carton_no text unique not null, order_ref text,
  customer_code text, customer_name text,
  carton_index int, carton_total int,
  packed_by uuid, packed_at timestamptz,
  gross_weight numeric, net_weight numeric,
  status text not null default 'draft', remarks text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_carton_contents (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid not null references public.ols_cartons(id) on delete cascade,
  production_label_id uuid references public.ols_production_labels(id),
  manual_sku text, manual_qty numeric, manual_reason text,
  added_at timestamptz not null default now()
);
create unique index if not exists ols_carton_contents_active_label_uniq
  on public.ols_carton_contents (production_label_id)
  where production_label_id is not null;
create table if not exists public.ols_dpl_documents (
  id uuid primary key default gen_random_uuid(),
  dpl_no text unique not null, order_ref text,
  customer_name text, destination text, transport_mode text,
  prepared_by uuid, prepared_at timestamptz default now(),
  total_cartons int, total_gross numeric, total_net numeric,
  remarks text, status text default 'open',
  created_at timestamptz not null default now()
);
create table if not exists public.ols_dpl_cartons (
  id uuid primary key default gen_random_uuid(),
  dpl_id uuid not null references public.ols_dpl_documents(id) on delete cascade,
  carton_id uuid not null references public.ols_cartons(id), position int
);
create table if not exists public.ols_finance_pi (
  id uuid primary key default gen_random_uuid(),
  pi_no text unique not null,
  dpl_id uuid references public.ols_dpl_documents(id),
  order_ref text, customer_name text, status text default 'pending',
  cleared_at timestamptz, invoice_ref text,
  tally_invoice_no text, tally_sync_status text,
  eway_bill_no text, eway_status text, created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_finance_pi_cartons (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.ols_finance_pi(id) on delete cascade,
  carton_id uuid not null references public.ols_cartons(id)
);
create table if not exists public.ols_finance_pi_lines (
  id uuid primary key default gen_random_uuid(),
  pi_id uuid not null references public.ols_finance_pi(id) on delete cascade,
  sku text, product_name text, quantity numeric,
  net_weight numeric, gross_weight numeric
);
create table if not exists public.ols_dispatch_document_bundles (
  id uuid primary key default gen_random_uuid(),
  dpl_id uuid references public.ols_dpl_documents(id),
  pi_id uuid references public.ols_finance_pi(id),
  invoice_ref text, eway_ref text, transport_ref text,
  gate_pass_no text, status text default 'open',
  created_at timestamptz not null default now()
);
create table if not exists public.ols_shipping_labels (
  id uuid primary key default gen_random_uuid(),
  shipping_no text unique not null,
  carton_id uuid references public.ols_cartons(id),
  pi_id uuid references public.ols_finance_pi(id),
  consignor text, consignee text, address text, phone text,
  invoice_ref text, eway_ref text, transport_ref text,
  route text, handling_marks text, qr_ref text unique,
  status text default 'printed',
  created_at timestamptz not null default now()
);
create table if not exists public.ols_gate_scans (
  id uuid primary key default gen_random_uuid(),
  qr_ref text, shipping_label_id uuid references public.ols_shipping_labels(id),
  result text check (result in ('green','red')),
  reason text, scanned_by uuid,
  scanned_at timestamptz not null default now()
);
create table if not exists public.ols_print_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.ols_label_templates(id),
  printer_id uuid references public.ols_printers(id),
  command_lang text, command_payload text,
  status text default 'queued', created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_print_logs (
  id uuid primary key default gen_random_uuid(),
  ref_type text, ref_id uuid,
  printer_id uuid references public.ols_printers(id),
  printed_by uuid, is_reprint boolean default false,
  reprint_count int default 0, reason text, success boolean default true,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_scan_history (
  id uuid primary key default gen_random_uuid(),
  scan_value text, scan_context text, user_id uuid, result text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_manual_override_logs (
  id uuid primary key default gen_random_uuid(),
  ref_type text, ref_id uuid, reason text, user_id uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_reprint_requests (
  id uuid primary key default gen_random_uuid(),
  ref_type text, ref_id uuid, reason text, status text default 'pending',
  requested_by uuid, approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.ols_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text, entity_type text, entity_id uuid, user_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.ols_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null, module text not null,
  can_view boolean default false, can_create boolean default false,
  can_edit boolean default false, can_delete boolean default false,
  can_approve boolean default false,
  unique(role, module)
);
create table if not exists public.ols_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, value jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
do $$ declare t text; begin
  for t in select unnest(array[
    'ols_profiles_light','ols_printers','ols_printer_settings','ols_label_templates',
    'ols_production_labels','ols_cartons','ols_finance_pi','ols_reprint_requests','ols_settings'])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.ols_set_updated_at()', t);
  end loop;
end $$;

-- RLS: enable on all ols_ tables; simple authenticated policies for MVP.
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename like 'ols\_%' escape '\' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists "ols_auth_read" on public.%I', r.tablename);
    execute format('create policy "ols_auth_read" on public.%I for select to authenticated using (true)', r.tablename);
    execute format('drop policy if exists "ols_auth_write" on public.%I', r.tablename);
    execute format('create policy "ols_auth_write" on public.%I for insert to authenticated with check (true)', r.tablename);
    execute format('drop policy if exists "ols_auth_update" on public.%I', r.tablename);
    execute format('create policy "ols_auth_update" on public.%I for update to authenticated using (true) with check (true)', r.tablename);
  end loop;
end $$;

-- Demo seed (idempotent)
insert into public.ols_departments (code,name,kind) values
 ('ARAB','Arabic Sweets','production'),('BAKE','Bakery','production'),
 ('CHOC','Chocolate & Confectionery','production'),('FUSI','Fusion Sweets','production'),
 ('NUTS','Savoured Nuts & Mixes','production'),('RGS','Ready Goods Store','store'),
 ('PACK','Packing & Assembly','packing'),('DISP','Dispatch','dispatch'),
 ('FIN','Finance','finance'),('GATE','Security Gate','gate')
on conflict (code) do nothing;

insert into public.ols_products_cache (sku,name,category,default_net_weight,default_gross_weight,shelf_life_days) values
 ('CPB-5000','Cashew Pyramid Baklawa','Arabic Sweets',5.000,5.250,90),
 ('ASB-2000','Assorted Baklawa','Arabic Sweets',2.000,2.180,90),
 ('ALF-1000','Almond Fingers','Arabic Sweets',1.000,1.120,90),
 ('PSB-2000','Pistachio Baklawa','Arabic Sweets',2.000,2.180,90),
 ('KNB-1500','Kunafa Bites','Arabic Sweets',1.500,1.650,60)
on conflict (sku) do nothing;

insert into public.ols_orders_cache (order_number,customer_code,customer_name,destination,transport_mode,status) values
 ('SO-2026-0001','C-1001','Al Manzil Trading','Dubai','Truck','open'),
 ('SO-2026-0002','C-1042','Gulf Sweets LLC','Abu Dhabi','Truck','open')
on conflict (order_number) do nothing;
