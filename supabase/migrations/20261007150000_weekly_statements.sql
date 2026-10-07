-- TRET.AI v0.0.0.8
-- Weekly statements and week close. Additive. Do not apply until the owner says go.
-- Money is integer cents. Rates are basis points. Locked weeks are not reopened.

create table if not exists public.weekly_statements (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id),
  unit_number text not null,
  week_start date not null,
  week_end date not null,
  truck_class public.truck_class not null,
  status text not null default 'locked',
  contract_id uuid null references public.fee_contracts (id),
  gross_cents integer not null,
  driver_pay_cents integer not null,
  management_fee_cents integer not null,
  tolson_payable_cents integer not null,
  legacy_retained_cents integer not null,
  dispatch_fee_cents integer not null,
  factoring_fee_cents integer not null,
  fuel_cents integer not null,
  tolls_cents integer not null,
  fixed_owner_cents integer not null,
  fixed_management_cents integer not null,
  net_cents integer not null,
  load_count integer not null,
  loaded_miles_hundredths integer not null,
  deadhead_miles_hundredths integer not null,
  closed_at timestamptz not null default now(),
  constraint weekly_statements_status_locked check (status = 'locked'),
  constraint weekly_statements_monday check (extract(isodow from week_start) = 1),
  constraint weekly_statements_week_bounds check (week_end = week_start + 6),
  constraint weekly_statements_truck_week_unique unique (truck_id, week_start),
  constraint weekly_statements_gross_nonneg check (gross_cents >= 0),
  constraint weekly_statements_driver_nonneg check (driver_pay_cents >= 0),
  constraint weekly_statements_management_nonneg check (management_fee_cents >= 0),
  constraint weekly_statements_tolson_nonneg check (tolson_payable_cents >= 0),
  constraint weekly_statements_legacy_nonneg check (legacy_retained_cents >= 0),
  constraint weekly_statements_dispatch_nonneg check (dispatch_fee_cents >= 0),
  constraint weekly_statements_factoring_nonneg check (factoring_fee_cents >= 0),
  constraint weekly_statements_fuel_nonneg check (fuel_cents >= 0),
  constraint weekly_statements_tolls_nonneg check (tolls_cents >= 0),
  constraint weekly_statements_fixed_owner_nonneg check (fixed_owner_cents >= 0),
  constraint weekly_statements_fixed_mgmt_nonneg check (fixed_management_cents >= 0),
  constraint weekly_statements_loads_nonneg check (load_count >= 0),
  constraint weekly_statements_loaded_miles_nonneg check (loaded_miles_hundredths >= 0),
  constraint weekly_statements_deadhead_nonneg check (deadhead_miles_hundredths >= 0)
);

comment on table public.weekly_statements is
  'Locked per-truck weekly statement. Snapshot in integer cents. Delivery-date week. Not reopened.';

create table if not exists public.weekly_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.weekly_statements (id) on delete cascade,
  line_code text not null,
  label text not null,
  amount_cents integer not null,
  rate_bp integer null,
  base_pct_bp integer null,
  charged_to public.charged_to null,
  owner_visible boolean not null,
  sort_order integer not null,
  constraint weekly_statement_lines_unique unique (statement_id, line_code),
  constraint weekly_statement_lines_amount_nonneg check (amount_cents >= 0),
  constraint weekly_statement_lines_rate_bp check (rate_bp is null or (rate_bp >= 0 and rate_bp <= 10000)),
  constraint weekly_statement_lines_base_bp check (base_pct_bp is null or (base_pct_bp >= 0 and base_pct_bp <= 10000))
);

comment on table public.weekly_statement_lines is
  'Statement lines. owner_visible is false for the internal Tolson and Legacy split on a managed truck.';

create table if not exists public.week_closes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  status text not null default 'locked',
  gross_cents integer not null,
  net_cents integer not null,
  tolson_payable_cents integer not null,
  legacy_retained_cents integer not null,
  dispatch_fee_cents integer not null,
  fuel_cents integer not null,
  tolls_cents integer not null,
  load_count integer not null,
  unit_count integer not null,
  closed_by text not null,
  closed_at timestamptz not null default now(),
  constraint week_closes_status_locked check (status = 'locked'),
  constraint week_closes_monday check (extract(isodow from week_start) = 1),
  constraint week_closes_week_bounds check (week_end = week_start + 6),
  constraint week_closes_gross_nonneg check (gross_cents >= 0),
  constraint week_closes_tolson_nonneg check (tolson_payable_cents >= 0),
  constraint week_closes_legacy_nonneg check (legacy_retained_cents >= 0),
  constraint week_closes_dispatch_nonneg check (dispatch_fee_cents >= 0),
  constraint week_closes_fuel_nonneg check (fuel_cents >= 0),
  constraint week_closes_tolls_nonneg check (tolls_cents >= 0),
  constraint week_closes_loads_nonneg check (load_count >= 0),
  constraint week_closes_units_nonneg check (unit_count >= 0)
);

comment on table public.week_closes is
  'One locked Monday–Sunday week. There is no reopen. Later changes are adjustment rows, which are not in this version.';

create index if not exists weekly_statements_week_idx
  on public.weekly_statements (week_start, unit_number);
create index if not exists weekly_statement_lines_statement_idx
  on public.weekly_statement_lines (statement_id, sort_order);

alter table public.weekly_statements enable row level security;
alter table public.weekly_statement_lines enable row level security;
alter table public.week_closes enable row level security;

create policy "weekly_statements_allowed_users_select"
  on public.weekly_statements
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "weekly_statement_lines_allowed_users_select"
  on public.weekly_statement_lines
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "week_closes_allowed_users_select"
  on public.week_closes
  for select
  to authenticated
  using ((select public.is_allowed_user()));

revoke all on table public.weekly_statements from anon, authenticated;
revoke all on table public.weekly_statement_lines from anon, authenticated;
revoke all on table public.week_closes from anon, authenticated;
grant select on table public.weekly_statements to authenticated;
grant select on table public.weekly_statement_lines to authenticated;
grant select on table public.week_closes to authenticated;

alter table public.change_log drop constraint change_log_entity_type_check;
alter table public.change_log add constraint change_log_entity_type_check check (
  entity_type in (
    'truck',
    'fee_contract',
    'truck_fixed_expense',
    'truck_fixed_expense_override',
    'mgmt_operating_expense',
    'weekly_statement',
    'week_close'
  )
);

create or replace function public.refuse_override_on_locked_week()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_truck uuid;
  v_week date;
begin
  if tg_op = 'DELETE' then
    v_truck := old.truck_id;
    v_week := old.week_start;
  else
    v_truck := new.truck_id;
    v_week := new.week_start;
  end if;

  if exists (
    select 1
    from public.weekly_statements ws
    where ws.truck_id = v_truck
      and ws.week_start = v_week
  ) then
    raise exception 'Cannot change a fixed-expense override for a locked week';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists truck_fixed_expense_overrides_locked_week
  on public.truck_fixed_expense_overrides;
create trigger truck_fixed_expense_overrides_locked_week
  before insert or update or delete on public.truck_fixed_expense_overrides
  for each row
  execute function public.refuse_override_on_locked_week();

create or replace function public.jsonb_cents(p_obj jsonb, p_key text, p_allow_negative boolean)
returns integer
language plpgsql
immutable
set search_path = public
as $$
declare
  v_text text;
  v_int integer;
begin
  if p_obj is null or not jsonb_exists(p_obj, p_key) or jsonb_typeof(p_obj -> p_key) <> 'number' then
    raise exception '% must be an integer number of cents', p_key;
  end if;
  v_text := p_obj ->> p_key;
  if v_text !~ '^-?[0-9]+$' then
    raise exception '% must be an integer number of cents', p_key;
  end if;
  v_int := v_text::integer;
  if not p_allow_negative and v_int < 0 then
    raise exception '% must be zero or more cents', p_key;
  end if;
  return v_int;
end;
$$;

revoke all on function public.jsonb_cents(jsonb, text, boolean) from public;
revoke all on function public.jsonb_cents(jsonb, text, boolean) from anon, authenticated;

create or replace function public.lock_week(p_week_start date, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_week_end date;
  v_item jsonb;
  v_line jsonb;
  v_statement_id uuid;
  v_close_id uuid;
  v_truck public.trucks%rowtype;
  v_class public.truck_class;
  v_gross integer;
  v_driver integer;
  v_management integer;
  v_tolson integer;
  v_legacy integer;
  v_dispatch integer;
  v_factoring integer;
  v_fuel integer;
  v_tolls integer;
  v_fixed_owner integer;
  v_fixed_mgmt integer;
  v_net integer;
  v_deduction integer;
  v_sum_gross integer := 0;
  v_sum_net integer := 0;
  v_sum_tolson integer := 0;
  v_sum_legacy integer := 0;
  v_sum_dispatch integer := 0;
  v_sum_fuel integer := 0;
  v_sum_tolls integer := 0;
  v_sum_loads integer := 0;
  v_count integer := 0;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');
  v_week_end := p_week_start + 6;

  if exists (select 1 from public.week_closes where week_start = p_week_start) then
    raise exception 'Week % is already locked', p_week_start;
  end if;

  if p_payload is null or jsonb_typeof(p_payload -> 'statements') <> 'array' then
    raise exception 'statements must be an array';
  end if;
  if (p_payload ->> 'weekEnd')::date <> v_week_end then
    raise exception 'Week end must be the Sunday of this week';
  end if;
  if jsonb_array_length(p_payload -> 'statements') = 0 then
    raise exception 'Nothing to close for this week';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'statements') as item
    group by item ->> 'truckId'
    having count(*) > 1
  ) then
    raise exception 'A truck appears twice in this week';
  end if;

  for v_item in select value from jsonb_array_elements(p_payload -> 'statements')
  loop
    select * into v_truck from public.trucks where id = (v_item ->> 'truckId')::uuid;
    if not found then
      raise exception 'Truck not found';
    end if;
    if v_truck.unit_number <> v_item ->> 'unitNumber' then
      raise exception 'Unit number does not match the truck';
    end if;

    begin
      v_class := (v_item ->> 'truckClass')::public.truck_class;
    exception
      when invalid_text_representation then
        raise exception 'Unknown truck class';
    end;
    if v_class <> v_truck.truck_class then
      raise exception 'Truck class does not match the truck';
    end if;

    v_gross := public.jsonb_cents(v_item, 'grossCents', false);
    v_driver := public.jsonb_cents(v_item, 'driverPayCents', false);
    v_management := public.jsonb_cents(v_item, 'managementFeeCents', false);
    v_tolson := public.jsonb_cents(v_item, 'tolsonPayableCents', false);
    v_legacy := public.jsonb_cents(v_item, 'legacyRetainedCents', false);
    v_dispatch := public.jsonb_cents(v_item, 'dispatchFeeCents', false);
    v_factoring := public.jsonb_cents(v_item, 'factoringFeeCents', false);
    v_fuel := public.jsonb_cents(v_item, 'fuelCents', false);
    v_tolls := public.jsonb_cents(v_item, 'tollsCents', false);
    v_fixed_owner := public.jsonb_cents(v_item, 'fixedOwnerCents', false);
    v_fixed_mgmt := public.jsonb_cents(v_item, 'fixedManagementCents', false);
    v_net := public.jsonb_cents(v_item, 'netCents', true);

    if v_class = 'third_party' then
      v_deduction := v_management;
    else
      v_deduction := v_tolson;
    end if;
    v_deduction := v_deduction + v_driver + v_dispatch + v_factoring + v_fuel + v_tolls + v_fixed_owner;
    if v_gross - v_deduction <> v_net then
      raise exception 'Statement net does not reconcile for unit %', v_truck.unit_number;
    end if;

    insert into public.weekly_statements (
      truck_id,
      unit_number,
      week_start,
      week_end,
      truck_class,
      status,
      contract_id,
      gross_cents,
      driver_pay_cents,
      management_fee_cents,
      tolson_payable_cents,
      legacy_retained_cents,
      dispatch_fee_cents,
      factoring_fee_cents,
      fuel_cents,
      tolls_cents,
      fixed_owner_cents,
      fixed_management_cents,
      net_cents,
      load_count,
      loaded_miles_hundredths,
      deadhead_miles_hundredths
    )
    values (
      v_truck.id,
      v_truck.unit_number,
      p_week_start,
      v_week_end,
      v_class,
      'locked',
      nullif(v_item ->> 'contractId', '')::uuid,
      v_gross,
      v_driver,
      v_management,
      v_tolson,
      v_legacy,
      v_dispatch,
      v_factoring,
      v_fuel,
      v_tolls,
      v_fixed_owner,
      v_fixed_mgmt,
      v_net,
      (v_item ->> 'loadCount')::integer,
      (v_item ->> 'loadedMilesHundredths')::integer,
      (v_item ->> 'deadheadMilesHundredths')::integer
    )
    returning id into v_statement_id;

    if jsonb_typeof(v_item -> 'lines') <> 'array' then
      raise exception 'Statement lines are required';
    end if;

    for v_line in select value from jsonb_array_elements(v_item -> 'lines')
    loop
      insert into public.weekly_statement_lines (
        statement_id,
        line_code,
        label,
        amount_cents,
        rate_bp,
        base_pct_bp,
        charged_to,
        owner_visible,
        sort_order
      )
      values (
        v_statement_id,
        v_line ->> 'lineCode',
        v_line ->> 'label',
        public.jsonb_cents(v_line, 'amountCents', false),
        case when v_line -> 'rateBp' = 'null'::jsonb or v_line -> 'rateBp' is null then null else (v_line ->> 'rateBp')::integer end,
        case when v_line -> 'basePctBp' = 'null'::jsonb or v_line -> 'basePctBp' is null then null else (v_line ->> 'basePctBp')::integer end,
        case
          when v_line -> 'chargedTo' = 'null'::jsonb or v_line ->> 'chargedTo' is null or v_line ->> 'chargedTo' = '' then null
          else (v_line ->> 'chargedTo')::public.charged_to
        end,
        coalesce((v_line ->> 'ownerVisible')::boolean, false),
        (v_line ->> 'sortOrder')::integer
      );
    end loop;

    insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
    values (
      'weekly_statement',
      v_statement_id,
      'lock_week',
      v_actor,
      null,
      jsonb_build_object('weekStart', p_week_start, 'unitNumber', v_truck.unit_number, 'netCents', v_net)
    );

    v_sum_gross := v_sum_gross + v_gross;
    v_sum_net := v_sum_net + v_net;
    v_sum_tolson := v_sum_tolson + v_tolson;
    v_sum_legacy := v_sum_legacy + v_legacy;
    v_sum_dispatch := v_sum_dispatch + v_dispatch;
    v_sum_fuel := v_sum_fuel + v_fuel;
    v_sum_tolls := v_sum_tolls + v_tolls;
    v_sum_loads := v_sum_loads + (v_item ->> 'loadCount')::integer;
    v_count := v_count + 1;
  end loop;

  if public.jsonb_cents(p_payload -> 'fleet', 'grossCents', false) <> v_sum_gross
    or public.jsonb_cents(p_payload -> 'fleet', 'netCents', true) <> v_sum_net
    or public.jsonb_cents(p_payload -> 'fleet', 'tolsonPayableCents', false) <> v_sum_tolson
    or public.jsonb_cents(p_payload -> 'fleet', 'legacyRetainedCents', false) <> v_sum_legacy
    or public.jsonb_cents(p_payload -> 'fleet', 'dispatchFeeCents', false) <> v_sum_dispatch
    or public.jsonb_cents(p_payload -> 'fleet', 'fuelCents', false) <> v_sum_fuel
    or public.jsonb_cents(p_payload -> 'fleet', 'tollsCents', false) <> v_sum_tolls
  then
    raise exception 'Fleet totals do not match the unit statements';
  end if;

  insert into public.week_closes (
    week_start,
    week_end,
    status,
    gross_cents,
    net_cents,
    tolson_payable_cents,
    legacy_retained_cents,
    dispatch_fee_cents,
    fuel_cents,
    tolls_cents,
    load_count,
    unit_count,
    closed_by
  )
  values (
    p_week_start,
    v_week_end,
    'locked',
    v_sum_gross,
    v_sum_net,
    v_sum_tolson,
    v_sum_legacy,
    v_sum_dispatch,
    v_sum_fuel,
    v_sum_tolls,
    v_sum_loads,
    v_count,
    v_actor
  )
  returning id into v_close_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'week_close',
    v_close_id,
    'lock_week',
    v_actor,
    null,
    jsonb_build_object('weekStart', p_week_start, 'weekEnd', v_week_end, 'unitCount', v_count, 'netCents', v_sum_net)
  );

  return v_close_id;
end;
$$;

revoke all on function public.lock_week(date, jsonb) from public;
revoke all on function public.lock_week(date, jsonb) from anon;
grant execute on function public.lock_week(date, jsonb) to authenticated;

comment on function public.lock_week(date, jsonb) is
  'Lock one Monday week from a reconciled snapshot. Refuses a second lock. No reopen function.';
