-- TRET.AI v0.0.0.7
-- Fuel and tolls import: staging, then fuel_transactions and toll_transactions.
-- Additive. Do not apply until the owner says go.
-- Thresholds live in import_settings. Dev data only.

alter table public.import_runs
  add column if not exists kind text;

update public.import_runs
set kind = 'loads'
where kind is null;

alter table public.import_runs
  alter column kind set default 'loads';

alter table public.import_runs
  alter column kind set not null;

alter table public.import_runs
  drop constraint if exists import_runs_kind_check;

alter table public.import_runs
  add constraint import_runs_kind_check
  check (kind in ('loads', 'fuel', 'tolls'));

comment on column public.import_runs.kind is
  'loads (default), fuel, or tolls. Row-count drop compares the same kind only.';

insert into public.import_settings (key, value_int, note) values
  ('fuel_ppg_min_tenth_cents', 1500, 'OPEN. Minimum discounted price per gallon in tenth-cents. 1500 = $1.50.'),
  ('fuel_ppg_max_tenth_cents', 10000, 'OPEN. Maximum discounted price per gallon in tenth-cents. 10000 = $10.00.'),
  ('fuel_tank_gallons_milli', 300000, 'OPEN. Diesel tank size in milli-gallons. 300000 = 300 gallons.'),
  ('def_tank_gallons_milli', 50000, 'OPEN. DEF tank size in milli-gallons. 50000 = 50 gallons.'),
  ('mpg_min_milli', 2000, 'OPEN. Minimum plausible MPG × 1000. 2000 = 2.000 mpg.'),
  ('mpg_max_milli', 12000, 'OPEN. Maximum plausible MPG × 1000. 12000 = 12.000 mpg.'),
  ('fuel_row_count_drop_block_pct', 50, 'Block the fuel import if fetched rows fall by more than this percent versus the previous successful fuel run.'),
  ('toll_row_count_drop_block_pct', 50, 'Block the toll import if fetched rows fall by more than this percent versus the previous successful toll run.')
on conflict (key) do nothing;

insert into public.import_settings (key, value_text, note) values
  (
    'fuel_csv_column_mapping',
    null,
    'JSON map of fuel field → CSV column. Null = fuel CSV not configured.'
  ),
  (
    'toll_csv_column_mapping',
    null,
    'JSON map of toll field → CSV column. Null = toll CSV not configured.'
  )
on conflict (key) do nothing;

create table if not exists public.vektor_fuel_staging (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid null references public.import_runs (id) on delete set null,
  vektor_transaction_id text not null,
  raw jsonb not null,
  promote_status text not null default 'pending',
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vektor_fuel_staging_promote_check check (
    promote_status in ('pending', 'promoted', 'rejected')
  ),
  constraint vektor_fuel_staging_tx_unique unique (vektor_transaction_id)
);

comment on table public.vektor_fuel_staging is
  'Raw fuel rows. Idempotent on vektor_transaction_id. Unmatched trucks stay here.';

create table if not exists public.vektor_toll_staging (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid null references public.import_runs (id) on delete set null,
  vektor_transaction_id text not null,
  raw jsonb not null,
  promote_status text not null default 'pending',
  reject_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vektor_toll_staging_promote_check check (
    promote_status in ('pending', 'promoted', 'rejected')
  ),
  constraint vektor_toll_staging_tx_unique unique (vektor_transaction_id)
);

comment on table public.vektor_toll_staging is
  'Raw toll rows. Idempotent on vektor_transaction_id. Unmatched trucks stay here.';

create table if not exists public.fuel_transactions (
  id uuid primary key default gen_random_uuid(),
  vektor_transaction_id text not null,
  truck_id uuid null references public.trucks (id) on delete set null,
  unit_number text null,
  transacted_at timestamp without time zone not null,
  transacted_date date not null,
  week_start date not null,
  week_end date not null,
  product text not null,
  card text null,
  gallons_milli integer not null,
  amount_cents integer not null,
  retail_amount_cents integer null,
  import_run_id uuid null references public.import_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_transactions_tx_unique unique (vektor_transaction_id),
  constraint fuel_transactions_product_check check (product in ('diesel', 'def', 'other')),
  constraint fuel_transactions_gallons_nonneg check (gallons_milli >= 0),
  constraint fuel_transactions_amount_nonneg check (amount_cents >= 0),
  constraint fuel_transactions_retail_nonneg check (
    retail_amount_cents is null or retail_amount_cents >= 0
  )
);

comment on table public.fuel_transactions is
  'Promoted fuel. amount_cents is the discounted amount booked. retail_amount_cents is stored for the Truck 3 $1 check. Gallons are milli-gallons.';

comment on column public.fuel_transactions.amount_cents is
  'Discounted amount in integer cents. This is the ledger figure.';

create table if not exists public.toll_transactions (
  id uuid primary key default gen_random_uuid(),
  vektor_transaction_id text not null,
  truck_id uuid null references public.trucks (id) on delete set null,
  vektor_truck_id text null,
  unit_number text null,
  transacted_at timestamp without time zone not null,
  transacted_date date not null,
  week_start date not null,
  week_end date not null,
  amount_cents integer not null,
  card text null,
  location text null,
  import_run_id uuid null references public.import_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint toll_transactions_tx_unique unique (vektor_transaction_id),
  constraint toll_transactions_amount_nonneg check (amount_cents >= 0)
);

comment on table public.toll_transactions is
  'Promoted tolls. Matched by Vektor truck id resolved to trucks.unit_number exactly. Money in integer cents.';

create index if not exists fuel_transactions_week_idx
  on public.fuel_transactions (week_start, unit_number);
create index if not exists toll_transactions_week_idx
  on public.toll_transactions (week_start, unit_number);

alter table public.vektor_fuel_staging enable row level security;
alter table public.vektor_toll_staging enable row level security;
alter table public.fuel_transactions enable row level security;
alter table public.toll_transactions enable row level security;

create policy "vektor_fuel_staging_allowed_users_all"
  on public.vektor_fuel_staging for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "vektor_toll_staging_allowed_users_all"
  on public.vektor_toll_staging for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "fuel_transactions_allowed_users_all"
  on public.fuel_transactions for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "toll_transactions_allowed_users_all"
  on public.toll_transactions for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());
