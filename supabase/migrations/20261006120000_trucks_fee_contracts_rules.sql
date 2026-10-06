-- TRET.AI v0.0.0.2
-- trucks, fee_contracts, fee_rules
-- RLS on. Dev / bootstrap only. No real Legacy data seeded.

create extension if not exists btree_gist;

create type public.truck_class as enum ('legacy_owned', 'third_party');

create type public.fee_rule_kind as enum (
  'DRIVER_PAY',
  'MANAGEMENT_FEE',
  'DISPATCH_FEE',
  'FACTORING_FEE',
  'TOLSON_PAYABLE',
  'LEGACY_RETAINED'
);

create table if not exists public.trucks (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  name text not null,
  truck_class public.truck_class not null,
  owner_name text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint trucks_unit_number_unique unique (unit_number)
);

comment on table public.trucks is
  'Trucks in the fleet. Count is not fixed; add rows as needed.';

create table if not exists public.fee_contracts (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  effective_from date not null,
  effective_to date null,
  note text null,
  constraint fee_contracts_date_order check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint fee_contracts_no_overlap exclude using gist (
    truck_id with =,
    daterange(
      effective_from,
      coalesce(effective_to, 'infinity'::date),
      '[]'
    ) with &&
  )
);

comment on table public.fee_contracts is
  'Dated fee agreement for one truck. Ranges are inclusive. Overlaps for the same truck are rejected.';

comment on column public.fee_contracts.effective_to is
  'Inclusive end date. Null means the contract is still open.';

create table if not exists public.fee_rules (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.fee_contracts (id) on delete cascade,
  kind public.fee_rule_kind not null,
  rate_bp integer not null,
  base_pct_bp integer not null,
  constraint fee_rules_rate_bp_range check (rate_bp >= 0 and rate_bp <= 10000),
  constraint fee_rules_base_pct_bp_range check (base_pct_bp >= 0 and base_pct_bp <= 10000),
  constraint fee_rules_kind_once_per_contract unique (contract_id, kind)
);

comment on table public.fee_rules is
  'One fee line per kind on a contract. rate_bp 550 = 5.5%. base_pct_bp 10000 = 100% of gross; 9500 = 95%. No default on base_pct_bp.';

-- RLS: only signed-in users whose email is in allowed_users
alter table public.trucks enable row level security;
alter table public.fee_contracts enable row level security;
alter table public.fee_rules enable row level security;

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_users au
    where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

create policy "trucks_allowed_users_all"
  on public.trucks
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

create policy "fee_contracts_allowed_users_all"
  on public.fee_contracts
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

create policy "fee_rules_allowed_users_all"
  on public.fee_rules
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
