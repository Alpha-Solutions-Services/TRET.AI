-- TRET.AI v0.0.0.31
-- Fee type, management fee, Legacy retained, sheet write queue, and Tolson payments.
-- Not applied until this version is merged. trucks row level security already covers new truck columns.

alter table public.trucks
  add column if not exists fee_model text null,
  add column if not exists management_fee_bp integer null,
  add column if not exists management_fee_effective_from date null,
  add column if not exists tolson_payable_effective_from date null,
  add column if not exists legacy_retained_type text null,
  add column if not exists legacy_retained_value integer null,
  add column if not exists legacy_retained_effective_from date null;

alter table public.trucks drop constraint if exists trucks_fee_model_check;
alter table public.trucks
  add constraint trucks_fee_model_check
  check (fee_model is null or fee_model in ('lease_to_tolson', 'owner_management'));

alter table public.trucks drop constraint if exists trucks_management_fee_bp_check;
alter table public.trucks
  add constraint trucks_management_fee_bp_check
  check (management_fee_bp is null or management_fee_bp between 0 and 10000);

alter table public.trucks drop constraint if exists trucks_legacy_retained_pair;
alter table public.trucks
  add constraint trucks_legacy_retained_pair
  check (
    (legacy_retained_type is null and legacy_retained_value is null)
    or (legacy_retained_type = 'percent_of_gross' and legacy_retained_value between 0 and 10000)
    or (legacy_retained_type = 'fixed_weekly' and legacy_retained_value between 0 and 2147483647)
  );

comment on column public.trucks.fee_model is
  'lease_to_tolson is a 10 percent lease fee to Tolson. owner_management is a 10 percent management fee. Null follows truck class.';

create table if not exists public.sheet_write_queue (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  unit_number text not null,
  kind text not null,
  tab_title text not null,
  column_header text not null,
  week_start date not null,
  a1 text null,
  new_value text not null,
  status text not null default 'queued',
  error text null,
  created_at timestamptz not null default now(),
  approved_at timestamptz null,
  approved_by text null,
  constraint sheet_write_queue_status_check check (status in ('queued', 'approved', 'failed'))
);

comment on table public.sheet_write_queue is
  'Fixed expense edits saved in TRET. The sheet cell changes only after Approve.';

alter table public.sheet_write_queue enable row level security;

create policy "sheet_write_queue_allowed_users_all"
  on public.sheet_write_queue
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

create table if not exists public.tolson_payments (
  id uuid primary key default gen_random_uuid(),
  paid_on date not null,
  week_start date not null,
  amount_cents integer not null,
  note text null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint tolson_payments_amount_nonneg check (amount_cents >= 0),
  constraint tolson_payments_monday check (extract(isodow from week_start) = 1)
);

comment on table public.tolson_payments is
  'Cash paid to Tolson Black Hawk. week_start is the Monday of the week the payment covers. Amounts are integer cents.';

alter table public.tolson_payments enable row level security;

create policy "tolson_payments_allowed_users_all"
  on public.tolson_payments
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
