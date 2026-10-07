-- TRET.AI v0.0.0.26
-- Canonical load ids (TBH--1192), sheet compare decisions, and QuickBooks file expenses.
-- Do not apply until the owner says go.
-- A row is renamed only when no other row on the same truck (or the same fee week) already uses that match key.
-- Hand entered TBH--118x and TBH--119x rows therefore block a second TBH1192 from being renamed into them.

create or replace function public.tret_load_match_key(p_load_id text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_load_id, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.tret_canonical_load_id(p_load_id text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  m text[];
begin
  v := btrim(coalesce(p_load_id, ''));
  if v = '' then
    return v;
  end if;
  m := regexp_match(v, '^([A-Za-z]+)-*([0-9]+)$');
  if m is null then
    return v;
  end if;
  return upper(m[1]) || '--' || m[2];
end;
$$;

create or replace function public.tret_unit_key(p_unit text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(regexp_replace(regexp_replace(coalesce(p_unit, ''), '[^0-9]', '', 'g'), '^0+', ''), ''),
    lower(btrim(coalesce(p_unit, '')))
  );
$$;

revoke all on function public.tret_load_match_key(text) from public, anon;
revoke all on function public.tret_canonical_load_id(text) from public, anon;
revoke all on function public.tret_unit_key(text) from public, anon;
grant execute on function public.tret_load_match_key(text) to authenticated;
grant execute on function public.tret_canonical_load_id(text) to authenticated;
grant execute on function public.tret_unit_key(text) to authenticated;

alter table public.loads
  add column if not exists source_manifest_ref text,
  add column if not exists pickup_date_kind text,
  add column if not exists delivery_date_kind text;

alter table public.loads drop constraint if exists loads_pickup_date_kind_check;
alter table public.loads
  add constraint loads_pickup_date_kind_check
  check (pickup_date_kind is null or pickup_date_kind in ('order', 'manifest'));

alter table public.loads drop constraint if exists loads_delivery_date_kind_check;
alter table public.loads
  add constraint loads_delivery_date_kind_check
  check (delivery_date_kind is null or delivery_date_kind in ('order', 'manifest'));

update public.loads as target
set load_id = public.tret_canonical_load_id(target.load_id)
where target.load_id is not null
  and target.load_id is distinct from public.tret_canonical_load_id(target.load_id)
  and not exists (
    select 1
    from public.loads as other
    where other.id <> target.id
      and public.tret_load_match_key(other.load_id) = public.tret_load_match_key(target.load_id)
      and public.tret_unit_key(other.truck_unit_number) = public.tret_unit_key(target.truck_unit_number)
  );

update public.legacy_load_fees as target
set
  load_id = public.tret_canonical_load_id(target.load_id),
  load_key = public.tret_load_match_key(target.load_id)
where target.load_id is distinct from public.tret_canonical_load_id(target.load_id)
  and not exists (
    select 1
    from public.legacy_load_fees as other
    where other.id <> target.id
      and other.unit_key = target.unit_key
      and other.week_start = target.week_start
      and (
        other.load_key = public.tret_load_match_key(target.load_id)
        or public.tret_load_match_key(other.load_id) = public.tret_load_match_key(target.load_id)
      )
  );

create or replace function public.is_admin_user()
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
      and lower(au.role) in ('owner', 'admin')
  );
$$;

revoke all on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated;

create table if not exists public.load_field_decisions (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  load_id text not null,
  load_key text not null,
  field text not null,
  choice text not null,
  note text not null,
  previous_value text null,
  new_value text null,
  actor_email text not null,
  created_at timestamptz not null default now(),
  constraint load_field_decisions_field_check check (
    field in ('rate', 'delivery_date', 'pickup_date', 'loaded_miles', 'deadhead', 'driver', 'presence')
  ),
  constraint load_field_decisions_choice_check check (
    choice in ('use_sheet', 'use_vektor', 'write_sheet')
  ),
  constraint load_field_decisions_note_check check (char_length(btrim(note)) between 3 and 200)
);

comment on table public.load_field_decisions is
  'Admin choices on Sheet vs Vektor. Each row is one field, one note, and the old and new values.';

create index if not exists load_field_decisions_lookup_idx
  on public.load_field_decisions (load_key, unit_number, created_at desc);

alter table public.load_field_decisions enable row level security;

drop policy if exists load_field_decisions_select on public.load_field_decisions;
create policy load_field_decisions_select
  on public.load_field_decisions
  for select
  to authenticated
  using (public.is_allowed_user());

drop policy if exists load_field_decisions_insert on public.load_field_decisions;
create policy load_field_decisions_insert
  on public.load_field_decisions
  for insert
  to authenticated
  with check (public.is_admin_user() and actor_email = public.current_actor_email());

revoke all on table public.load_field_decisions from anon, authenticated;
grant select, insert on table public.load_field_decisions to authenticated;

create table if not exists public.load_field_acceptances (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  load_key text not null,
  field text not null,
  accepted_value text not null,
  updated_at timestamptz not null default now(),
  constraint load_field_acceptances_field_check check (
    field in ('rate', 'delivery_date', 'pickup_date', 'loaded_miles', 'deadhead', 'driver', 'presence')
  ),
  constraint load_field_acceptances_unique unique (unit_number, load_key, field)
);

comment on table public.load_field_acceptances is
  'Fields an admin accepted from Vektor so Sheet vs Vektor stops highlighting them.';

alter table public.load_field_acceptances enable row level security;

drop policy if exists load_field_acceptances_select on public.load_field_acceptances;
create policy load_field_acceptances_select
  on public.load_field_acceptances
  for select
  to authenticated
  using (public.is_allowed_user());

drop policy if exists load_field_acceptances_admin_write on public.load_field_acceptances;
create policy load_field_acceptances_admin_write
  on public.load_field_acceptances
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

revoke all on table public.load_field_acceptances from anon, authenticated;
grant select, insert, update, delete on table public.load_field_acceptances to authenticated;

alter table public.change_log drop constraint if exists change_log_entity_type_check;
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
    'legacy_load_fee',
    'load'
  )
);

alter table public.mgmt_operating_expenses
  add column if not exists qbo_source_id text null;

create unique index if not exists mgmt_operating_expenses_qbo_source_id_idx
  on public.mgmt_operating_expenses (qbo_source_id)
  where qbo_source_id is not null;

create or replace function public.import_quickbooks_file_expense(
  p_expense_date date,
  p_category text,
  p_amount_cents integer,
  p_note text,
  p_qbo_source_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_category text;
  v_existing_id uuid;
  v_new_id uuid;
  v_after jsonb;
begin
  v_actor := public.require_admin_user();

  if p_expense_date is null then
    raise exception 'Date is required';
  end if;

  v_category := trim(coalesce(p_category, ''));
  if v_category not in (
    'Vektor Fee',
    'Sintra AI',
    'Quickbooks',
    'Job Post',
    'Accountant Salary',
    'MVR',
    'Drug Test',
    'Spare Expense 1',
    'Spare Expense 2',
    'Spare Expense 3',
    'Spare Expense 4',
    'Spare Expense 5'
  ) then
    raise exception 'Category is not a portal expense category';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Amount must be more than zero cents';
  end if;

  if p_qbo_source_id is null or p_qbo_source_id !~ '^csv:[a-f0-9]{64}$' then
    raise exception 'File row id is not valid';
  end if;

  select id into v_existing_id
  from public.mgmt_operating_expenses
  where qbo_source_id = p_qbo_source_id;

  if v_existing_id is not null then
    return jsonb_build_object('id', v_existing_id, 'inserted', false);
  end if;

  insert into public.mgmt_operating_expenses (
    expense_date,
    category,
    amount_cents,
    note,
    qbo_source_id
  )
  values (
    p_expense_date,
    v_category,
    p_amount_cents,
    nullif(trim(coalesce(p_note, '')), ''),
    p_qbo_source_id
  )
  returning id into v_new_id;

  select to_jsonb(e) into v_after
  from public.mgmt_operating_expenses e
  where e.id = v_new_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'mgmt_operating_expense',
    v_new_id,
    'import_quickbooks_file_expense',
    v_actor,
    null,
    v_after
  );

  return jsonb_build_object('id', v_new_id, 'inserted', true);
exception
  when unique_violation then
    select id into v_existing_id
    from public.mgmt_operating_expenses
    where qbo_source_id = p_qbo_source_id;
    return jsonb_build_object('id', v_existing_id, 'inserted', false);
end;
$$;

revoke all on function public.import_quickbooks_file_expense(date, text, integer, text, text) from public, anon;
grant execute on function public.import_quickbooks_file_expense(date, text, integer, text, text) to authenticated;
