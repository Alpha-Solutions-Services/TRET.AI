-- TRET.AI v0.0.0.20
-- Org default management fee, per-truck week overrides, and per-load fee overrides.
-- Also lets staff edit a portal operating expense.
-- Do not apply until the owner says go.

create table public.legacy_org_settings (
  id uuid primary key default gen_random_uuid(),
  management_fee_bp integer not null default 1000,
  singleton boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint legacy_org_settings_singleton_check check (singleton),
  constraint legacy_org_settings_singleton_unique unique (singleton),
  constraint legacy_org_settings_fee_bp_range check (management_fee_bp between 0 and 10000)
);

comment on table public.legacy_org_settings is
  'One row. management_fee_bp is the org management_fee_percent setting. 10 percent is 1000 basis points.';

insert into public.legacy_org_settings (management_fee_bp) values (1000);

create table public.legacy_truck_week_fees (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  unit_key text not null,
  week_start date not null,
  fee_bp integer not null,
  updated_at timestamptz not null default now(),
  constraint legacy_truck_week_fees_unit_present check (char_length(trim(unit_number)) > 0),
  constraint legacy_truck_week_fees_unit_key_present check (char_length(trim(unit_key)) > 0),
  constraint legacy_truck_week_fees_fee_bp_range check (fee_bp between 0 and 10000),
  constraint legacy_truck_week_fees_unique unique (unit_key, week_start)
);

comment on table public.legacy_truck_week_fees is
  'Management fee percent for one truck and one Monday week. Applies to loads that have no saved load fee.';

create table public.legacy_load_fees (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  unit_key text not null,
  load_id text not null,
  load_key text not null,
  week_start date not null,
  fee_cents integer,
  fee_bp integer,
  updated_at timestamptz not null default now(),
  constraint legacy_load_fees_unit_present check (char_length(trim(unit_number)) > 0),
  constraint legacy_load_fees_unit_key_present check (char_length(trim(unit_key)) > 0),
  constraint legacy_load_fees_load_present check (char_length(trim(load_id)) > 0),
  constraint legacy_load_fees_load_key_present check (char_length(trim(load_key)) > 0),
  constraint legacy_load_fees_fee_cents_nonneg check (fee_cents is null or fee_cents >= 0),
  constraint legacy_load_fees_fee_bp_range check (fee_bp is null or (fee_bp between 0 and 10000)),
  constraint legacy_load_fees_has_value check (fee_cents is not null or fee_bp is not null),
  constraint legacy_load_fees_unique unique (unit_key, load_key, week_start)
);

comment on table public.legacy_load_fees is
  'Saved management fee for one load in one Monday week. fee_cents wins when set. Otherwise fee_bp is applied to the sheet rate.';

create index legacy_truck_week_fees_week_idx on public.legacy_truck_week_fees (week_start);
create index legacy_load_fees_week_idx on public.legacy_load_fees (week_start);

alter table public.legacy_org_settings enable row level security;
alter table public.legacy_truck_week_fees enable row level security;
alter table public.legacy_load_fees enable row level security;

create policy "legacy_org_settings_allowed_users_select"
  on public.legacy_org_settings
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "legacy_truck_week_fees_allowed_users_select"
  on public.legacy_truck_week_fees
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "legacy_load_fees_allowed_users_select"
  on public.legacy_load_fees
  for select
  to authenticated
  using ((select public.is_allowed_user()));

revoke all on table public.legacy_org_settings from anon, authenticated;
revoke all on table public.legacy_truck_week_fees from anon, authenticated;
revoke all on table public.legacy_load_fees from anon, authenticated;
grant select on table public.legacy_org_settings to authenticated;
grant select on table public.legacy_truck_week_fees to authenticated;
grant select on table public.legacy_load_fees to authenticated;

alter table public.change_log drop constraint change_log_entity_type_check;
alter table public.change_log add constraint change_log_entity_type_check check (
  entity_type in (
    'truck',
    'fee_contract',
    'truck_fixed_expense',
    'truck_fixed_expense_override',
    'mgmt_operating_expense',
    'weekly_statement',
    'week_close',
    'issue',
    'legacy_org_settings',
    'legacy_truck_week_fee',
    'legacy_load_fee'
  )
);

create or replace function public.set_legacy_management_fee_bp(p_fee_bp integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();
  if p_fee_bp is null or p_fee_bp < 0 or p_fee_bp > 10000 then
    raise exception 'Management fee percent is out of range';
  end if;

  select id, to_jsonb(s) into v_id, v_before
  from public.legacy_org_settings s
  where s.singleton = true
  limit 1;

  if v_id is null then
    insert into public.legacy_org_settings (management_fee_bp)
    values (p_fee_bp)
    returning id into v_id;
  else
    update public.legacy_org_settings
    set management_fee_bp = p_fee_bp,
        updated_at = now()
    where id = v_id;
  end if;

  select to_jsonb(s) into v_after
  from public.legacy_org_settings s
  where s.id = v_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('legacy_org_settings', v_id, 'set_legacy_management_fee_bp', v_actor, v_before, v_after);

  return v_id;
end;
$$;

revoke all on function public.set_legacy_management_fee_bp(integer) from public;
revoke all on function public.set_legacy_management_fee_bp(integer) from anon;
grant execute on function public.set_legacy_management_fee_bp(integer) to authenticated;

create or replace function public.upsert_legacy_truck_week_fee(
  p_unit_number text,
  p_unit_key text,
  p_week_start date,
  p_fee_bp integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_unit_number text;
  v_unit_key text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');
  v_unit_number := trim(coalesce(p_unit_number, ''));
  v_unit_key := trim(coalesce(p_unit_key, ''));
  if v_unit_number = '' or v_unit_key = '' then
    raise exception 'Unit is required';
  end if;
  if p_fee_bp is null or p_fee_bp < 0 or p_fee_bp > 10000 then
    raise exception 'Management fee percent is out of range';
  end if;

  select id, to_jsonb(f) into v_id, v_before
  from public.legacy_truck_week_fees f
  where f.unit_key = v_unit_key
    and f.week_start = p_week_start;

  if v_id is null then
    insert into public.legacy_truck_week_fees (unit_number, unit_key, week_start, fee_bp)
    values (v_unit_number, v_unit_key, p_week_start, p_fee_bp)
    returning id into v_id;
  else
    update public.legacy_truck_week_fees
    set unit_number = v_unit_number,
        fee_bp = p_fee_bp,
        updated_at = now()
    where id = v_id;
  end if;

  select to_jsonb(f) into v_after
  from public.legacy_truck_week_fees f
  where f.id = v_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('legacy_truck_week_fee', v_id, 'upsert_legacy_truck_week_fee', v_actor, v_before, v_after);

  return v_id;
end;
$$;

revoke all on function public.upsert_legacy_truck_week_fee(text, text, date, integer) from public;
revoke all on function public.upsert_legacy_truck_week_fee(text, text, date, integer) from anon;
grant execute on function public.upsert_legacy_truck_week_fee(text, text, date, integer) to authenticated;

create or replace function public.delete_legacy_truck_week_fee(
  p_unit_key text,
  p_week_start date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_existing public.legacy_truck_week_fees%rowtype;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');

  select * into v_existing
  from public.legacy_truck_week_fees
  where unit_key = trim(coalesce(p_unit_key, ''))
    and week_start = p_week_start;

  if v_existing.id is null then
    raise exception 'Truck week fee was not found';
  end if;

  delete from public.legacy_truck_week_fees where id = v_existing.id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'legacy_truck_week_fee',
    v_existing.id,
    'delete_legacy_truck_week_fee',
    v_actor,
    to_jsonb(v_existing),
    null
  );

  return v_existing.id;
end;
$$;

revoke all on function public.delete_legacy_truck_week_fee(text, date) from public;
revoke all on function public.delete_legacy_truck_week_fee(text, date) from anon;
grant execute on function public.delete_legacy_truck_week_fee(text, date) to authenticated;

create or replace function public.upsert_legacy_load_fee(
  p_unit_number text,
  p_unit_key text,
  p_load_id text,
  p_load_key text,
  p_week_start date,
  p_fee_cents integer,
  p_fee_bp integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_unit_number text;
  v_unit_key text;
  v_load_id text;
  v_load_key text;
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');
  v_unit_number := trim(coalesce(p_unit_number, ''));
  v_unit_key := trim(coalesce(p_unit_key, ''));
  v_load_id := trim(coalesce(p_load_id, ''));
  v_load_key := trim(coalesce(p_load_key, ''));
  if v_unit_number = '' or v_unit_key = '' then
    raise exception 'Unit is required';
  end if;
  if v_load_id = '' or v_load_key = '' then
    raise exception 'Load is required';
  end if;
  if p_fee_cents is null and p_fee_bp is null then
    raise exception 'Enter a fee amount or a percent';
  end if;
  if p_fee_cents is not null and p_fee_cents < 0 then
    raise exception 'Fee amount must be zero or more cents';
  end if;
  if p_fee_bp is not null and (p_fee_bp < 0 or p_fee_bp > 10000) then
    raise exception 'Management fee percent is out of range';
  end if;

  select id, to_jsonb(f) into v_id, v_before
  from public.legacy_load_fees f
  where f.unit_key = v_unit_key
    and f.load_key = v_load_key
    and f.week_start = p_week_start;

  if v_id is null then
    insert into public.legacy_load_fees (
      unit_number, unit_key, load_id, load_key, week_start, fee_cents, fee_bp
    )
    values (
      v_unit_number, v_unit_key, v_load_id, v_load_key, p_week_start, p_fee_cents, p_fee_bp
    )
    returning id into v_id;
  else
    update public.legacy_load_fees
    set unit_number = v_unit_number,
        load_id = v_load_id,
        fee_cents = p_fee_cents,
        fee_bp = p_fee_bp,
        updated_at = now()
    where id = v_id;
  end if;

  select to_jsonb(f) into v_after
  from public.legacy_load_fees f
  where f.id = v_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('legacy_load_fee', v_id, 'upsert_legacy_load_fee', v_actor, v_before, v_after);

  return v_id;
end;
$$;

revoke all on function public.upsert_legacy_load_fee(text, text, text, text, date, integer, integer) from public;
revoke all on function public.upsert_legacy_load_fee(text, text, text, text, date, integer, integer) from anon;
grant execute on function public.upsert_legacy_load_fee(text, text, text, text, date, integer, integer) to authenticated;

create or replace function public.delete_legacy_load_fee(
  p_unit_key text,
  p_load_key text,
  p_week_start date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_existing public.legacy_load_fees%rowtype;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');

  select * into v_existing
  from public.legacy_load_fees
  where unit_key = trim(coalesce(p_unit_key, ''))
    and load_key = trim(coalesce(p_load_key, ''))
    and week_start = p_week_start;

  if v_existing.id is null then
    raise exception 'Load fee was not found';
  end if;

  delete from public.legacy_load_fees where id = v_existing.id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'legacy_load_fee',
    v_existing.id,
    'delete_legacy_load_fee',
    v_actor,
    to_jsonb(v_existing),
    null
  );

  return v_existing.id;
end;
$$;

revoke all on function public.delete_legacy_load_fee(text, text, date) from public;
revoke all on function public.delete_legacy_load_fee(text, text, date) from anon;
grant execute on function public.delete_legacy_load_fee(text, text, date) to authenticated;

create or replace function public.seed_legacy_load_fees(p_week_start date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_count integer := 0;
  v_row jsonb;
  v_unit_number text;
  v_unit_key text;
  v_load_id text;
  v_load_key text;
  v_fee_bp integer;
  v_new_id uuid;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();
  perform public.assert_effective_monday(p_week_start, 'Week start');
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows are required';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_unit_number := trim(coalesce(v_row->>'unit_number', ''));
    v_unit_key := trim(coalesce(v_row->>'unit_key', ''));
    v_load_id := trim(coalesce(v_row->>'load_id', ''));
    v_load_key := trim(coalesce(v_row->>'load_key', ''));
    if v_unit_number = '' or v_unit_key = '' or v_load_id = '' or v_load_key = '' then
      raise exception 'Each fee row needs a unit and a load';
    end if;
    begin
      v_fee_bp := (v_row->>'fee_bp')::integer;
    exception
      when others then
        raise exception 'Management fee percent is out of range';
    end;
    if v_fee_bp is null or v_fee_bp < 0 or v_fee_bp > 10000 then
      raise exception 'Management fee percent is out of range';
    end if;

    v_new_id := null;
    insert into public.legacy_load_fees (unit_number, unit_key, load_id, load_key, week_start, fee_bp)
    values (v_unit_number, v_unit_key, v_load_id, v_load_key, p_week_start, v_fee_bp)
    on conflict (unit_key, load_key, week_start) do nothing
    returning id into v_new_id;

    if v_new_id is not null then
      v_count := v_count + 1;
      select to_jsonb(f) into v_after
      from public.legacy_load_fees f
      where f.id = v_new_id;
      insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
      values ('legacy_load_fee', v_new_id, 'seed_legacy_load_fee', v_actor, null, v_after);
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.seed_legacy_load_fees(date, jsonb) from public;
revoke all on function public.seed_legacy_load_fees(date, jsonb) from anon;
grant execute on function public.seed_legacy_load_fees(date, jsonb) to authenticated;

create or replace function public.update_mgmt_operating_expense(
  p_id uuid,
  p_expense_date date,
  p_category text,
  p_amount_cents integer,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_category text;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();
  if p_id is null then
    raise exception 'Expense is required';
  end if;
  if p_expense_date is null then
    raise exception 'Date is required';
  end if;
  v_category := trim(coalesce(p_category, ''));
  if v_category = '' then
    raise exception 'Category is required';
  end if;
  if char_length(v_category) > 80 then
    raise exception 'Category must be 80 characters or fewer';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Amount must be zero or more cents';
  end if;

  select to_jsonb(e) into v_before
  from public.mgmt_operating_expenses e
  where e.id = p_id;

  if v_before is null then
    raise exception 'Expense was not found';
  end if;

  update public.mgmt_operating_expenses
  set expense_date = p_expense_date,
      category = v_category,
      amount_cents = p_amount_cents,
      note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id;

  select to_jsonb(e) into v_after
  from public.mgmt_operating_expenses e
  where e.id = p_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('mgmt_operating_expense', p_id, 'update_mgmt_operating_expense', v_actor, v_before, v_after);

  return p_id;
end;
$$;

revoke all on function public.update_mgmt_operating_expense(uuid, date, text, integer, text) from public;
revoke all on function public.update_mgmt_operating_expense(uuid, date, text, integer, text) from anon;
grant execute on function public.update_mgmt_operating_expense(uuid, date, text, integer, text) to authenticated;
