-- TRET.AI v0.0.0.6
-- Fixed weekly expenses, per-week overrides, management operating expenses,
-- and Monday validation for fee rate versions.
-- Additive. Do not apply until the owner says go.
-- Does not add a check constraint on existing fee_contracts rows (v0.0.0.3 is already live).

create extension if not exists btree_gist;

create type public.fixed_expense_kind as enum (
  'MAINTENANCE_ESCROW_WEEKLY',
  'ELD_FEE',
  'YARD_FEE',
  'GPS_TRACKER',
  'INSURANCE',
  'TRUCK_PAYMENTS',
  'TRAILER_PAYMENTS',
  'TOLL_PASS',
  'PERMITS',
  'MISC'
);

create type public.charged_to as enum ('owner', 'management');

-- Enum-to-text is not immutable, and an exclusion index requires an immutable expression.
create or replace function public.fixed_expense_kind_text(p_kind public.fixed_expense_kind)
returns text
language sql
immutable
set search_path = public
as $$
  select p_kind::text;
$$;

revoke all on function public.fixed_expense_kind_text(public.fixed_expense_kind) from public;
revoke all on function public.fixed_expense_kind_text(public.fixed_expense_kind) from anon;
grant execute on function public.fixed_expense_kind_text(public.fixed_expense_kind) to authenticated;

create table if not exists public.truck_fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  kind public.fixed_expense_kind not null,
  weekly_amount_cents integer not null,
  charged_to public.charged_to not null default 'owner',
  effective_from date not null,
  effective_to date null,
  note text null,
  created_at timestamptz not null default now(),
  constraint truck_fixed_expenses_amount_nonneg check (weekly_amount_cents >= 0),
  constraint truck_fixed_expenses_date_order check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint truck_fixed_expenses_monday check (
    extract(isodow from effective_from) = 1
  ),
  constraint truck_fixed_expenses_no_overlap exclude using gist (
    truck_id with =,
    public.fixed_expense_kind_text(kind) with =,
    daterange(
      effective_from,
      coalesce(effective_to, 'infinity'::date),
      '[]'
    ) with &&
  )
);

comment on table public.truck_fixed_expenses is
  'One effective-dated weekly amount per truck and expense kind. Amounts are integer cents. effective_from is a Monday. Overlaps for the same truck and kind are rejected.';

comment on column public.truck_fixed_expenses.charged_to is
  'Who is charged this weekly amount. Default owner. management means the management company.';

comment on column public.truck_fixed_expenses.effective_to is
  'Inclusive end date. Null means the version is still open. A new version closes the previous open row on the day before the new Monday.';

create unique index if not exists truck_fixed_expenses_one_open_idx
  on public.truck_fixed_expenses (truck_id, kind)
  where effective_to is null;

create index if not exists truck_fixed_expenses_truck_kind_idx
  on public.truck_fixed_expenses (truck_id, kind, effective_from desc);

create table if not exists public.truck_fixed_expense_overrides (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  kind public.fixed_expense_kind not null,
  week_start date not null,
  amount_cents integer not null,
  charged_to public.charged_to not null default 'owner',
  note text null,
  created_at timestamptz not null default now(),
  constraint truck_fixed_expense_overrides_amount_nonneg check (amount_cents >= 0),
  constraint truck_fixed_expense_overrides_monday check (
    extract(isodow from week_start) = 1
  ),
  constraint truck_fixed_expense_overrides_week_unique unique (truck_id, kind, week_start)
);

comment on table public.truck_fixed_expense_overrides is
  'Replaces the effective-dated weekly amount for one truck, kind, and Monday-start week.';

create index if not exists truck_fixed_expense_overrides_truck_week_idx
  on public.truck_fixed_expense_overrides (truck_id, week_start desc);

create table if not exists public.mgmt_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  amount_cents integer not null,
  note text null,
  created_at timestamptz not null default now(),
  constraint mgmt_operating_expenses_amount_nonneg check (amount_cents >= 0),
  constraint mgmt_operating_expenses_category_present check (char_length(trim(category)) > 0),
  constraint mgmt_operating_expenses_category_len check (char_length(category) <= 80)
);

comment on table public.mgmt_operating_expenses is
  'Manual management-company operating costs. Date, category, integer cents, and an optional note. Not a P&L.';

create index if not exists mgmt_operating_expenses_date_idx
  on public.mgmt_operating_expenses (expense_date desc, created_at desc);

alter table public.truck_fixed_expenses enable row level security;
alter table public.truck_fixed_expense_overrides enable row level security;
alter table public.mgmt_operating_expenses enable row level security;

create policy "truck_fixed_expenses_allowed_users_select"
  on public.truck_fixed_expenses
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "truck_fixed_expense_overrides_allowed_users_select"
  on public.truck_fixed_expense_overrides
  for select
  to authenticated
  using ((select public.is_allowed_user()));

create policy "mgmt_operating_expenses_allowed_users_select"
  on public.mgmt_operating_expenses
  for select
  to authenticated
  using ((select public.is_allowed_user()));

-- Widen the audit allow-list. Existing rows stay valid.
alter table public.change_log drop constraint change_log_entity_type_check;
alter table public.change_log add constraint change_log_entity_type_check check (
  entity_type in (
    'truck',
    'fee_contract',
    'truck_fixed_expense',
    'truck_fixed_expense_override',
    'mgmt_operating_expense'
  )
);

create or replace function public.assert_effective_monday(p_date date, p_label text)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_date is null then
    raise exception '% is required', p_label;
  end if;
  if extract(isodow from p_date)::integer <> 1 then
    raise exception '% must be a Monday', p_label;
  end if;
end;
$$;

revoke all on function public.assert_effective_monday(date, text) from public;
revoke all on function public.assert_effective_monday(date, text) from anon;
grant execute on function public.assert_effective_monday(date, text) to authenticated;

-- Fee rate versions: same Monday rule, inside the existing create function.
create or replace function public.create_fee_rate_version(
  p_truck_id uuid,
  p_effective_from date,
  p_note text,
  p_rules jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_class public.truck_class;
  v_prev public.fee_contracts%rowtype;
  v_new_id uuid;
  v_rule jsonb;
  v_kind public.fee_rule_kind;
  v_rate integer;
  v_base integer;
  v_kinds text[] := array[]::text[];
  v_has_management boolean := false;
  v_has_tolson boolean := false;
  v_has_legacy boolean := false;
  v_mgmt_rate integer;
  v_mgmt_base integer;
  v_tolson_rate integer;
  v_tolson_base integer;
  v_legacy_rate integer;
  v_legacy_base integer;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();

  select truck_class into v_class
  from public.trucks
  where id = p_truck_id;

  if not found then
    raise exception 'Truck not found';
  end if;

  if p_effective_from is null then
    raise exception 'Effective-from date is required';
  end if;

  perform public.assert_effective_monday(p_effective_from, 'Effective-from');

  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Rules must be a JSON array';
  end if;

  for v_rule in select * from jsonb_array_elements(p_rules)
  loop
    v_kind := (v_rule ->> 'kind')::public.fee_rule_kind;
    v_rate := (v_rule ->> 'rate_bp')::integer;
    v_base := (v_rule ->> 'base_pct_bp')::integer;

    if v_rate is null or v_base is null then
      raise exception 'Each rule needs rate_bp and base_pct_bp';
    end if;
    if v_rate < 0 or v_rate > 10000 or v_base < 0 or v_base > 10000 then
      raise exception 'rate_bp and base_pct_bp must be between 0 and 10000';
    end if;

    if v_kind::text = any (v_kinds) then
      raise exception 'Each fee kind may appear at most once';
    end if;
    v_kinds := array_append(v_kinds, v_kind::text);

    if v_class = 'legacy_owned' and v_kind in ('MANAGEMENT_FEE', 'LEGACY_RETAINED') then
      raise exception 'Legacy-owned trucks cannot have management or Legacy-retained rules';
    end if;

    if v_class = 'third_party' and v_kind = 'MANAGEMENT_FEE' then
      v_has_management := true;
      v_mgmt_rate := v_rate;
      v_mgmt_base := v_base;
    elsif v_kind = 'TOLSON_PAYABLE' then
      v_has_tolson := true;
      v_tolson_rate := v_rate;
      v_tolson_base := v_base;
    elsif v_kind = 'LEGACY_RETAINED' then
      v_has_legacy := true;
      v_legacy_rate := v_rate;
      v_legacy_base := v_base;
    end if;
  end loop;

  if v_class = 'third_party' then
    if not v_has_management or not v_has_tolson or not v_has_legacy then
      raise exception 'Third-party rate versions need Management, Tolson payable, and Legacy retained';
    end if;
    if v_tolson_base <> v_mgmt_base or v_legacy_base <> v_mgmt_base then
      raise exception 'Tolson and Legacy retained must use the same base as Management';
    end if;
    if v_tolson_rate + v_legacy_rate <> v_mgmt_rate then
      raise exception 'Tolson payable + Legacy retained must equal Management fee';
    end if;
  end if;

  select * into v_prev
  from public.fee_contracts
  where truck_id = p_truck_id
    and effective_to is null
  order by effective_from desc
  limit 1;

  if found then
    if p_effective_from <= v_prev.effective_from then
      raise exception 'New version must start after the open version start date';
    end if;
    v_before := to_jsonb(v_prev);
    update public.fee_contracts
    set effective_to = (p_effective_from - 1)
    where id = v_prev.id;
  else
    v_before := null;
  end if;

  insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
  values (p_truck_id, p_effective_from, null, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_new_id;

  for v_rule in select * from jsonb_array_elements(p_rules)
  loop
    insert into public.fee_rules (contract_id, kind, rate_bp, base_pct_bp)
    values (
      v_new_id,
      (v_rule ->> 'kind')::public.fee_rule_kind,
      (v_rule ->> 'rate_bp')::integer,
      (v_rule ->> 'base_pct_bp')::integer
    );
  end loop;

  select to_jsonb(c) || jsonb_build_object(
    'rules', coalesce(
      (
        select jsonb_agg(to_jsonb(r) order by r.kind)
        from public.fee_rules r
        where r.contract_id = v_new_id
      ),
      '[]'::jsonb
    )
  )
  into v_after
  from public.fee_contracts c
  where c.id = v_new_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('fee_contract', v_new_id, 'create_rate_version', v_actor, v_before, v_after);

  return v_new_id;
end;
$$;

revoke all on function public.create_fee_rate_version(uuid, date, text, jsonb) from public;
revoke all on function public.create_fee_rate_version(uuid, date, text, jsonb) from anon;
grant execute on function public.create_fee_rate_version(uuid, date, text, jsonb) to authenticated;

create or replace function public.create_fixed_expense_version(
  p_truck_id uuid,
  p_kind text,
  p_effective_from date,
  p_weekly_amount_cents integer,
  p_charged_to text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_kind public.fixed_expense_kind;
  v_charged public.charged_to;
  v_prev public.truck_fixed_expenses%rowtype;
  v_new_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();

  if not exists (select 1 from public.trucks where id = p_truck_id) then
    raise exception 'Truck not found';
  end if;

  perform public.assert_effective_monday(p_effective_from, 'Effective-from');

  if p_weekly_amount_cents is null or p_weekly_amount_cents < 0 then
    raise exception 'Weekly amount must be zero or more cents';
  end if;

  begin
    v_kind := p_kind::public.fixed_expense_kind;
  exception
    when invalid_text_representation then
      raise exception 'Unknown expense kind';
  end;

  if p_charged_to is null or trim(p_charged_to) = '' then
    v_charged := 'owner';
  else
    begin
      v_charged := trim(p_charged_to)::public.charged_to;
    exception
      when invalid_text_representation then
        raise exception 'Charged to must be owner or management';
    end;
  end if;

  select * into v_prev
  from public.truck_fixed_expenses
  where truck_id = p_truck_id
    and kind = v_kind
    and effective_to is null
  order by effective_from desc
  limit 1;

  if found then
    if p_effective_from <= v_prev.effective_from then
      raise exception 'New version must start after the open version start date';
    end if;
    v_before := to_jsonb(v_prev);
    update public.truck_fixed_expenses
    set effective_to = (p_effective_from - 1)
    where id = v_prev.id;
  else
    v_before := null;
  end if;

  insert into public.truck_fixed_expenses (
    truck_id,
    kind,
    weekly_amount_cents,
    charged_to,
    effective_from,
    effective_to,
    note
  )
  values (
    p_truck_id,
    v_kind,
    p_weekly_amount_cents,
    v_charged,
    p_effective_from,
    null,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_new_id;

  select to_jsonb(e) into v_after
  from public.truck_fixed_expenses e
  where e.id = v_new_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'truck_fixed_expense',
    v_new_id,
    'create_fixed_expense_version',
    v_actor,
    v_before,
    v_after
  );

  return v_new_id;
exception
  when exclusion_violation then
    raise exception 'That date overlaps an existing version for this expense';
end;
$$;

revoke all on function public.create_fixed_expense_version(uuid, text, date, integer, text, text) from public;
revoke all on function public.create_fixed_expense_version(uuid, text, date, integer, text, text) from anon;
grant execute on function public.create_fixed_expense_version(uuid, text, date, integer, text, text) to authenticated;

create or replace function public.delete_latest_fixed_expense_version(
  p_truck_id uuid,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_kind public.fixed_expense_kind;
  v_latest public.truck_fixed_expenses%rowtype;
  v_prev public.truck_fixed_expenses%rowtype;
  v_before jsonb;
  v_deleted_id uuid;
begin
  v_actor := public.require_allowed_user();

  if public.truck_has_weekly_statements(p_truck_id) then
    raise exception 'Cannot delete an expense version after weekly statements exist';
  end if;

  begin
    v_kind := p_kind::public.fixed_expense_kind;
  exception
    when invalid_text_representation then
      raise exception 'Unknown expense kind';
  end;

  select * into v_latest
  from public.truck_fixed_expenses
  where truck_id = p_truck_id
    and kind = v_kind
  order by effective_from desc
  limit 1;

  if not found then
    raise exception 'No expense version to delete';
  end if;

  v_before := to_jsonb(v_latest);
  v_deleted_id := v_latest.id;

  delete from public.truck_fixed_expenses where id = v_latest.id;

  select * into v_prev
  from public.truck_fixed_expenses
  where truck_id = p_truck_id
    and kind = v_kind
  order by effective_from desc
  limit 1;

  if found and v_prev.effective_to = (v_latest.effective_from - 1) then
    update public.truck_fixed_expenses
    set effective_to = null
    where id = v_prev.id;
  end if;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'truck_fixed_expense',
    v_deleted_id,
    'delete_latest_fixed_expense_version',
    v_actor,
    v_before,
    null
  );

  return v_deleted_id;
end;
$$;

revoke all on function public.delete_latest_fixed_expense_version(uuid, text) from public;
revoke all on function public.delete_latest_fixed_expense_version(uuid, text) from anon;
grant execute on function public.delete_latest_fixed_expense_version(uuid, text) to authenticated;

create or replace function public.upsert_fixed_expense_override(
  p_truck_id uuid,
  p_kind text,
  p_week_start date,
  p_amount_cents integer,
  p_charged_to text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_kind public.fixed_expense_kind;
  v_charged public.charged_to;
  v_existing public.truck_fixed_expense_overrides%rowtype;
  v_new_id uuid;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();

  if not exists (select 1 from public.trucks where id = p_truck_id) then
    raise exception 'Truck not found';
  end if;

  perform public.assert_effective_monday(p_week_start, 'Week start');

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Amount must be zero or more cents';
  end if;

  begin
    v_kind := p_kind::public.fixed_expense_kind;
  exception
    when invalid_text_representation then
      raise exception 'Unknown expense kind';
  end;

  if p_charged_to is null or trim(p_charged_to) = '' then
    v_charged := 'owner';
  else
    begin
      v_charged := trim(p_charged_to)::public.charged_to;
    exception
      when invalid_text_representation then
        raise exception 'Charged to must be owner or management';
    end;
  end if;

  select * into v_existing
  from public.truck_fixed_expense_overrides
  where truck_id = p_truck_id
    and kind = v_kind
    and week_start = p_week_start;

  if found then
    update public.truck_fixed_expense_overrides
    set
      amount_cents = p_amount_cents,
      charged_to = v_charged,
      note = nullif(trim(coalesce(p_note, '')), '')
    where id = v_existing.id
    returning id into v_new_id;
  else
    insert into public.truck_fixed_expense_overrides (
      truck_id,
      kind,
      week_start,
      amount_cents,
      charged_to,
      note
    )
    values (
      p_truck_id,
      v_kind,
      p_week_start,
      p_amount_cents,
      v_charged,
      nullif(trim(coalesce(p_note, '')), '')
    )
    returning id into v_new_id;
  end if;

  select to_jsonb(o) into v_after
  from public.truck_fixed_expense_overrides o
  where o.id = v_new_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'truck_fixed_expense_override',
    v_new_id,
    'upsert_fixed_expense_override',
    v_actor,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    v_after
  );

  return v_new_id;
end;
$$;

revoke all on function public.upsert_fixed_expense_override(uuid, text, date, integer, text, text) from public;
revoke all on function public.upsert_fixed_expense_override(uuid, text, date, integer, text, text) from anon;
grant execute on function public.upsert_fixed_expense_override(uuid, text, date, integer, text, text) to authenticated;

create or replace function public.delete_fixed_expense_override(
  p_truck_id uuid,
  p_kind text,
  p_week_start date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_kind public.fixed_expense_kind;
  v_existing public.truck_fixed_expense_overrides%rowtype;
begin
  v_actor := public.require_allowed_user();

  begin
    v_kind := p_kind::public.fixed_expense_kind;
  exception
    when invalid_text_representation then
      raise exception 'Unknown expense kind';
  end;

  select * into v_existing
  from public.truck_fixed_expense_overrides
  where truck_id = p_truck_id
    and kind = v_kind
    and week_start = p_week_start;

  if not found then
    raise exception 'No override for that week';
  end if;

  delete from public.truck_fixed_expense_overrides where id = v_existing.id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'truck_fixed_expense_override',
    v_existing.id,
    'delete_fixed_expense_override',
    v_actor,
    to_jsonb(v_existing),
    null
  );

  return v_existing.id;
end;
$$;

revoke all on function public.delete_fixed_expense_override(uuid, text, date) from public;
revoke all on function public.delete_fixed_expense_override(uuid, text, date) from anon;
grant execute on function public.delete_fixed_expense_override(uuid, text, date) to authenticated;

create or replace function public.create_mgmt_operating_expense(
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
  v_new_id uuid;
  v_after jsonb;
begin
  v_actor := public.require_allowed_user();

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

  insert into public.mgmt_operating_expenses (expense_date, category, amount_cents, note)
  values (
    p_expense_date,
    v_category,
    p_amount_cents,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_new_id;

  select to_jsonb(e) into v_after
  from public.mgmt_operating_expenses e
  where e.id = v_new_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'mgmt_operating_expense',
    v_new_id,
    'create_mgmt_operating_expense',
    v_actor,
    null,
    v_after
  );

  return v_new_id;
end;
$$;

revoke all on function public.create_mgmt_operating_expense(date, text, integer, text) from public;
revoke all on function public.create_mgmt_operating_expense(date, text, integer, text) from anon;
grant execute on function public.create_mgmt_operating_expense(date, text, integer, text) to authenticated;

create or replace function public.delete_mgmt_operating_expense(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_existing public.mgmt_operating_expenses%rowtype;
begin
  v_actor := public.require_allowed_user();

  select * into v_existing
  from public.mgmt_operating_expenses
  where id = p_id;

  if not found then
    raise exception 'Expense not found';
  end if;

  delete from public.mgmt_operating_expenses where id = p_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'mgmt_operating_expense',
    p_id,
    'delete_mgmt_operating_expense',
    v_actor,
    to_jsonb(v_existing),
    null
  );

  return p_id;
end;
$$;

revoke all on function public.delete_mgmt_operating_expense(uuid) from public;
revoke all on function public.delete_mgmt_operating_expense(uuid) from anon;
grant execute on function public.delete_mgmt_operating_expense(uuid) to authenticated;
