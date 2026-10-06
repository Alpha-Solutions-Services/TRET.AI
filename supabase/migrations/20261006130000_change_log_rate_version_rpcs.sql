-- TRET.AI v0.0.0.3
-- change_log + fee rate version RPCs (single-transaction create / delete latest)
-- Do not apply until go.

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_email text not null,
  before_data jsonb null,
  after_data jsonb null,
  created_at timestamptz not null default now(),
  constraint change_log_entity_type_check check (
    entity_type in ('truck', 'fee_contract')
  )
);

comment on table public.change_log is
  'Audit trail for truck and fee rate changes. before/after stored as JSON.';

create index if not exists change_log_entity_idx
  on public.change_log (entity_type, entity_id, created_at desc);

alter table public.change_log enable row level security;

create policy "change_log_allowed_users_select"
  on public.change_log
  for select
  to authenticated
  using (public.is_allowed_user());

create policy "change_log_allowed_users_insert"
  on public.change_log
  for insert
  to authenticated
  with check (
    public.is_allowed_user()
    and actor_email = public.current_actor_email()
  );

create or replace function public.current_actor_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

revoke all on function public.current_actor_email() from public;
grant execute on function public.current_actor_email() to authenticated;

create or replace function public.require_allowed_user()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := public.current_actor_email();
  if v_email = '' or not public.is_allowed_user() then
    raise exception 'Not allowed';
  end if;
  return v_email;
end;
$$;

revoke all on function public.require_allowed_user() from public;
grant execute on function public.require_allowed_user() to authenticated;

create or replace function public.truck_has_weekly_statements(p_truck_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- weekly_statements does not exist yet; when it does, refuse delete if any rows for the truck.
  if to_regclass('public.weekly_statements') is null then
    return false;
  end if;
  return exists (
    select 1
    from public.weekly_statements ws
    where ws.truck_id = p_truck_id
    limit 1
  );
end;
$$;

revoke all on function public.truck_has_weekly_statements(uuid) from public;
grant execute on function public.truck_has_weekly_statements(uuid) to authenticated;

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
grant execute on function public.create_fee_rate_version(uuid, date, text, jsonb) to authenticated;

create or replace function public.delete_latest_fee_rate_version(p_truck_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_latest public.fee_contracts%rowtype;
  v_prev public.fee_contracts%rowtype;
  v_before jsonb;
  v_deleted_id uuid;
begin
  v_actor := public.require_allowed_user();

  if public.truck_has_weekly_statements(p_truck_id) then
    raise exception 'Cannot delete a rate version after weekly statements exist';
  end if;

  select * into v_latest
  from public.fee_contracts
  where truck_id = p_truck_id
  order by effective_from desc
  limit 1;

  if not found then
    raise exception 'No rate version to delete';
  end if;

  select to_jsonb(c) || jsonb_build_object(
    'rules', coalesce(
      (
        select jsonb_agg(to_jsonb(r) order by r.kind)
        from public.fee_rules r
        where r.contract_id = c.id
      ),
      '[]'::jsonb
    )
  )
  into v_before
  from public.fee_contracts c
  where c.id = v_latest.id;

  v_deleted_id := v_latest.id;

  delete from public.fee_contracts where id = v_latest.id;

  -- If we closed a previous open version when creating latest, reopen it.
  select * into v_prev
  from public.fee_contracts
  where truck_id = p_truck_id
  order by effective_from desc
  limit 1;

  if found and v_prev.effective_to = (v_latest.effective_from - 1) then
    update public.fee_contracts
    set effective_to = null
    where id = v_prev.id;
  end if;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values ('fee_contract', v_deleted_id, 'delete_latest_rate_version', v_actor, v_before, null);

  return v_deleted_id;
end;
$$;

revoke all on function public.delete_latest_fee_rate_version(uuid) from public;
grant execute on function public.delete_latest_fee_rate_version(uuid) to authenticated;
