-- TRET.AI v0.0.0.4
-- Vektor loads import: staging, loads, import_runs, issues, import_settings
-- Do not apply until go. No Google Sheets. No seed of real Legacy loads.

create table if not exists public.import_settings (
  key text primary key,
  value_int integer null,
  value_text text null,
  note text null,
  updated_at timestamptz not null default now()
);

comment on table public.import_settings is
  'Thresholds for import validation. Never hardcode these in app code.';

insert into public.import_settings (key, value_int, note) values
  ('row_count_drop_block_pct', 50, 'Block if this import fetched fewer than this % of the previous successful run row count'),
  ('default_import_lookback_days', 14, 'Default date range length for Import now')
on conflict (key) do nothing;

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  status text not null,
  range_from date not null,
  range_to date not null,
  rows_fetched integer not null default 0,
  rows_promoted integer not null default 0,
  rows_rejected integer not null default 0,
  rows_updated integer not null default 0,
  error_summary text null,
  meta jsonb null,
  constraint import_runs_status_check check (
    status in ('running', 'success', 'failed', 'blocked')
  )
);

comment on table public.import_runs is
  'One row per manual Import now. No scheduler in v0.0.0.4.';

create table if not exists public.vektor_loads_staging (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid null references public.import_runs (id) on delete set null,
  manifest_id uuid not null,
  order_ids uuid[] not null default '{}',
  raw jsonb not null,
  promote_status text not null default 'pending',
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vektor_loads_staging_promote_check check (
    promote_status in ('pending', 'promoted', 'rejected', 'skipped')
  ),
  constraint vektor_loads_staging_manifest_unique unique (manifest_id)
);

comment on table public.vektor_loads_staging is
  'Raw Vektor manifests. Idempotent on manifest_id. Unmatched trucks stay here.';

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  manifest_id uuid not null,
  order_ids uuid[] not null default '{}',
  load_id text null,
  manifest_friendly_id text null,
  pickup_date date null,
  delivery_date date not null,
  week_start date not null,
  week_end date not null,
  month_key text not null,
  driver_id uuid null,
  driver_name text null,
  broker_id uuid null,
  broker_name text null,
  customer_id uuid null,
  customer_name text null,
  origin_city text null,
  origin_state text null,
  destination_city text null,
  destination_state text null,
  loaded_distance_mi numeric(12, 2) null,
  empty_distance_mi numeric(12, 2) null,
  auto_loaded_distance_mi numeric(12, 2) null,
  auto_empty_distance_mi numeric(12, 2) null,
  deadhead_miles numeric(12, 2) null,
  rate_cents integer not null,
  truck_unit_number text null,
  truck_id uuid null references public.trucks (id) on delete set null,
  vektor_status text not null,
  lineage_root_manifest_id uuid null,
  lineage_parent_manifest_id uuid null,
  lineage_related_manifest_id uuid null,
  lineage_relation text null,
  trip_group_id text null,
  primary_load boolean null,
  import_run_id uuid null references public.import_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loads_manifest_id_unique unique (manifest_id),
  constraint loads_rate_cents_nonneg check (rate_cents >= 0)
);

comment on table public.loads is
  'Promoted delivered loads. Money in integer cents. Week from delivery_date Mon-Sun. Trip Group / Primary Load left empty (OPEN).';

comment on column public.loads.load_id is
  'order friendlyId exactly as Vektor (e.g. TBH--1152). Null when multi-order (OPEN).';

comment on column public.loads.deadhead_miles is
  'Copy of emptyDistance (manual). auto distances stored separately.';

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  rule text not null,
  message text not null,
  ref text null,
  status text not null default 'open',
  import_run_id uuid null references public.import_runs (id) on delete set null,
  manifest_id uuid null,
  created_at timestamptz not null default now(),
  constraint issues_severity_check check (severity in ('Block', 'Warn', 'Info')),
  constraint issues_status_check check (status in ('open', 'resolved', 'ignored'))
);

comment on table public.issues is
  'Minimal import / validation issues inbox.';

create index if not exists loads_delivery_date_idx on public.loads (delivery_date);
create index if not exists loads_week_start_idx on public.loads (week_start);
create index if not exists loads_truck_id_idx on public.loads (truck_id);
create index if not exists issues_status_idx on public.issues (status, created_at desc);

alter table public.import_settings enable row level security;
alter table public.import_runs enable row level security;
alter table public.vektor_loads_staging enable row level security;
alter table public.loads enable row level security;
alter table public.issues enable row level security;

create policy "import_settings_allowed_users_all"
  on public.import_settings for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "import_runs_allowed_users_all"
  on public.import_runs for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "vektor_loads_staging_allowed_users_all"
  on public.vektor_loads_staging for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "loads_allowed_users_all"
  on public.loads for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "issues_allowed_users_all"
  on public.issues for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());
