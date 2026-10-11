-- TRET.AI v0.0.0.34
-- Two fee lines, both a percent of weekly gross.
-- Legacy fee and Tolson lease fee. The management fee total is their sum.
-- Not applied from this branch. The owner applies it.
-- trucks already has row level security. These columns are covered by that policy.

alter table public.trucks
  add column if not exists legacy_fee_bp integer null,
  add column if not exists tolson_lease_fee_bp integer null,
  add column if not exists fee_lines_effective_from date null;

alter table public.trucks drop constraint if exists trucks_legacy_fee_bp_check;
alter table public.trucks
  add constraint trucks_legacy_fee_bp_check
  check (legacy_fee_bp is null or legacy_fee_bp between 0 and 10000);

alter table public.trucks drop constraint if exists trucks_tolson_lease_fee_bp_check;
alter table public.trucks
  add constraint trucks_tolson_lease_fee_bp_check
  check (tolson_lease_fee_bp is null or tolson_lease_fee_bp between 0 and 10000);

comment on column public.trucks.legacy_fee_bp is
  'Legacy fee in basis points of weekly gross. 1000 is 10 percent. Null uses the truck seed.';

comment on column public.trucks.tolson_lease_fee_bp is
  'Tolson lease fee in basis points of weekly gross. 800 is 8 percent. 1000 is 10 percent. Null uses the truck seed.';

comment on column public.trucks.fee_lines_effective_from is
  'Monday the two fee lines start. Week 41 starts 2026-10-05.';

-- Units 1 and 2: Legacy 0, Tolson 10. Unit 3: Legacy 10, Tolson 0.
-- Units 4 to 10: Legacy 10, Tolson 8. Matches 1, 01, and similar forms.
-- Does not change sheet links or dollar amounts. Skips a truck that already has both percents.
update public.trucks
set
  legacy_fee_bp = case
    when ltrim(regexp_replace(unit_number, '\D', '', 'g'), '0') in ('1', '2') then 0
    else 1000
  end,
  tolson_lease_fee_bp = case
    when ltrim(regexp_replace(unit_number, '\D', '', 'g'), '0') in ('1', '2') then 1000
    when ltrim(regexp_replace(unit_number, '\D', '', 'g'), '0') = '3' then 0
    else 800
  end,
  fee_lines_effective_from = date '2026-10-05'
where ltrim(regexp_replace(unit_number, '\D', '', 'g'), '0') in ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')
  and legacy_fee_bp is null
  and tolson_lease_fee_bp is null;
