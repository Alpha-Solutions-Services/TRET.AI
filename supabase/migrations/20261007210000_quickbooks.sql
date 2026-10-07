-- TRET.AI v0.0.0.25
-- QuickBooks Online for the Legacy Inc company. One company. Do not apply until the owner says go.
-- Token tables: Row Level Security on, no policies, privileges revoked. Ciphertext only through the functions below.
-- Mapping, posting accounts, and push history: Row Level Security on, admin policies (role owner or admin).
-- Tokens are encrypted in the app with QUICKBOOKS_TOKEN_ENCRYPTION_KEY before these functions see them.

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

create or replace function public.require_admin_user()
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
  if v_email = '' or not public.is_admin_user() then
    raise exception 'Not an admin';
  end if;
  return v_email;
end;
$$;

revoke all on function public.require_admin_user() from public, anon;
grant execute on function public.require_admin_user() to authenticated;

create table if not exists public.quickbooks_connection (
  id integer primary key default 1,
  realm_id text null,
  access_token_enc text null,
  refresh_token_enc text null,
  expires_at timestamptz null,
  refresh_expires_at timestamptz null,
  environment text null,
  connection_status text not null default 'needs_sign_in',
  refresh_locked_until timestamptz null,
  updated_at timestamptz not null default now(),
  constraint quickbooks_connection_singleton check (id = 1),
  constraint quickbooks_connection_status_check check (
    connection_status in ('connected', 'needs_sign_in')
  ),
  constraint quickbooks_connection_environment_check check (
    environment is null or environment in ('sandbox', 'production')
  )
);

comment on table public.quickbooks_connection is
  'One QuickBooks company (Legacy Inc). realm_id, access token, and refresh token. Tokens are ciphertext. No client access.';

insert into public.quickbooks_connection (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.quickbooks_oauth_pending (
  state text primary key,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.quickbooks_oauth_pending is
  'One-time OAuth state for Connect QuickBooks. Deleted when the callback is consumed.';

alter table public.quickbooks_connection enable row level security;
alter table public.quickbooks_oauth_pending enable row level security;

revoke all on table public.quickbooks_connection from public, anon, authenticated;
revoke all on table public.quickbooks_oauth_pending from public, anon, authenticated;

create or replace function public.quickbooks_public_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.quickbooks_connection%rowtype;
begin
  perform public.require_admin_user();
  select * into v_row from public.quickbooks_connection where id = 1;
  return jsonb_build_object(
    'connection_status', v_row.connection_status,
    'realm_id', v_row.realm_id,
    'environment', v_row.environment,
    'has_refresh_token', v_row.refresh_token_enc is not null,
    'expires_at', v_row.expires_at
  );
end;
$$;

create or replace function public.quickbooks_read_connection()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.quickbooks_connection%rowtype;
begin
  perform public.require_admin_user();
  select * into v_row from public.quickbooks_connection where id = 1;
  return jsonb_build_object(
    'realm_id', v_row.realm_id,
    'access_token_enc', v_row.access_token_enc,
    'refresh_token_enc', v_row.refresh_token_enc,
    'expires_at', v_row.expires_at,
    'refresh_expires_at', v_row.refresh_expires_at,
    'environment', v_row.environment,
    'connection_status', v_row.connection_status,
    'refresh_locked_until', v_row.refresh_locked_until
  );
end;
$$;

create or replace function public.quickbooks_save_tokens(
  p_realm_id text,
  p_access_token_enc text,
  p_refresh_token_enc text,
  p_expires_at timestamptz,
  p_refresh_expires_at timestamptz,
  p_environment text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  if p_realm_id is null or p_realm_id !~ '^[0-9]{1,20}$' then
    raise exception 'QuickBooks company id is not valid';
  end if;
  if p_environment is null or p_environment not in ('sandbox', 'production') then
    raise exception 'QuickBooks environment is not valid';
  end if;
  if p_access_token_enc is null or p_refresh_token_enc is null or p_expires_at is null then
    raise exception 'QuickBooks tokens are missing';
  end if;
  update public.quickbooks_connection
  set realm_id = p_realm_id,
      access_token_enc = p_access_token_enc,
      refresh_token_enc = p_refresh_token_enc,
      expires_at = p_expires_at,
      refresh_expires_at = p_refresh_expires_at,
      environment = p_environment,
      connection_status = 'connected',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  return true;
end;
$$;

create or replace function public.quickbooks_try_begin_refresh(p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform public.require_admin_user();
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 120 then
    raise exception 'Invalid refresh lease';
  end if;
  update public.quickbooks_connection
  set refresh_locked_until = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where id = 1
    and (refresh_locked_until is null or refresh_locked_until < now());
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.quickbooks_release_refresh()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  update public.quickbooks_connection
  set refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  return true;
end;
$$;

create or replace function public.quickbooks_mark_needs_sign_in()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  update public.quickbooks_connection
  set connection_status = 'needs_sign_in',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  return true;
end;
$$;

create or replace function public.quickbooks_disconnect()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  update public.quickbooks_connection
  set realm_id = null,
      access_token_enc = null,
      refresh_token_enc = null,
      expires_at = null,
      refresh_expires_at = null,
      environment = null,
      connection_status = 'needs_sign_in',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  delete from public.quickbooks_oauth_pending;
  return true;
end;
$$;

create or replace function public.quickbooks_oauth_save_pending(
  p_state text,
  p_redirect_uri text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  if p_state is null or char_length(p_state) < 16 or char_length(p_state) > 200 then
    raise exception 'Sign-in state is not valid';
  end if;
  if p_redirect_uri is null or char_length(p_redirect_uri) < 8 then
    raise exception 'Redirect address is not valid';
  end if;
  delete from public.quickbooks_oauth_pending where expires_at <= now();
  insert into public.quickbooks_oauth_pending (state, redirect_uri, expires_at)
  values (p_state, p_redirect_uri, p_expires_at)
  on conflict (state) do update
  set redirect_uri = excluded.redirect_uri,
      expires_at = excluded.expires_at;
  return true;
end;
$$;

create or replace function public.quickbooks_oauth_take_pending(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.quickbooks_oauth_pending%rowtype;
begin
  perform public.require_admin_user();
  delete from public.quickbooks_oauth_pending
  where state = p_state
    and expires_at > now()
  returning * into v_row;
  if not found then
    return null;
  end if;
  return jsonb_build_object('redirect_uri', v_row.redirect_uri);
end;
$$;

revoke all on function public.quickbooks_public_status() from public, anon;
revoke all on function public.quickbooks_read_connection() from public, anon;
revoke all on function public.quickbooks_save_tokens(text, text, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.quickbooks_try_begin_refresh(integer) from public, anon;
revoke all on function public.quickbooks_release_refresh() from public, anon;
revoke all on function public.quickbooks_mark_needs_sign_in() from public, anon;
revoke all on function public.quickbooks_disconnect() from public, anon;
revoke all on function public.quickbooks_oauth_save_pending(text, text, timestamptz) from public, anon;
revoke all on function public.quickbooks_oauth_take_pending(text) from public, anon;

grant execute on function public.quickbooks_public_status() to authenticated;
grant execute on function public.quickbooks_read_connection() to authenticated;
grant execute on function public.quickbooks_save_tokens(text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.quickbooks_try_begin_refresh(integer) to authenticated;
grant execute on function public.quickbooks_release_refresh() to authenticated;
grant execute on function public.quickbooks_mark_needs_sign_in() to authenticated;
grant execute on function public.quickbooks_disconnect() to authenticated;
grant execute on function public.quickbooks_oauth_save_pending(text, text, timestamptz) to authenticated;
grant execute on function public.quickbooks_oauth_take_pending(text) to authenticated;

create table if not exists public.quickbooks_category_map (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_id text not null,
  source_name text not null,
  category text not null,
  updated_at timestamptz not null default now(),
  constraint quickbooks_category_map_kind_check check (source_kind in ('vendor', 'account')),
  constraint quickbooks_category_map_source_check check (char_length(trim(source_id)) > 0),
  constraint quickbooks_category_map_name_check check (char_length(trim(source_name)) > 0),
  constraint quickbooks_category_map_category_check check (
    category in (
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
    )
  ),
  constraint quickbooks_category_map_unique unique (source_kind, source_id)
);

comment on table public.quickbooks_category_map is
  'Saved map from a QuickBooks vendor or account to a portal expense category.';

create table if not exists public.quickbooks_posting_accounts (
  id integer primary key default 1,
  fee_debit_account_id text null,
  fee_debit_account_name text null,
  fee_credit_account_id text null,
  fee_credit_account_name text null,
  tolson_debit_account_id text null,
  tolson_debit_account_name text null,
  tolson_credit_account_id text null,
  tolson_credit_account_name text null,
  updated_at timestamptz not null default now(),
  constraint quickbooks_posting_accounts_singleton check (id = 1)
);

comment on table public.quickbooks_posting_accounts is
  'Accounts an admin picked once for the weekly journal entry. Nothing posts until the admin confirms.';

insert into public.quickbooks_posting_accounts (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.quickbooks_push_log (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  qbo_id text not null,
  income_cents integer not null,
  tolson_cents integer not null,
  posted_by text not null,
  created_at timestamptz not null default now(),
  constraint quickbooks_push_log_monday check (extract(isodow from week_start) = 1),
  constraint quickbooks_push_log_income_nonneg check (income_cents >= 0),
  constraint quickbooks_push_log_tolson_nonneg check (tolson_cents >= 0),
  constraint quickbooks_push_log_qbo_id_check check (char_length(trim(qbo_id)) > 0)
);

comment on table public.quickbooks_push_log is
  'Each confirmed post to QuickBooks. Stores the QuickBooks journal entry id.';

create index if not exists quickbooks_push_log_created_idx
  on public.quickbooks_push_log (created_at desc);

alter table public.quickbooks_category_map enable row level security;
alter table public.quickbooks_posting_accounts enable row level security;
alter table public.quickbooks_push_log enable row level security;

create policy "quickbooks_category_map_admin_all"
  on public.quickbooks_category_map
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "quickbooks_posting_accounts_admin_all"
  on public.quickbooks_posting_accounts
  for all
  to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

create policy "quickbooks_push_log_admin_select"
  on public.quickbooks_push_log
  for select
  to authenticated
  using (public.is_admin_user());

create policy "quickbooks_push_log_admin_insert"
  on public.quickbooks_push_log
  for insert
  to authenticated
  with check (
    public.is_admin_user()
    and posted_by = public.current_actor_email()
  );

grant select, insert, update, delete on table public.quickbooks_category_map to authenticated;
grant select, insert, update, delete on table public.quickbooks_posting_accounts to authenticated;
grant select, insert on table public.quickbooks_push_log to authenticated;

alter table public.mgmt_operating_expenses
  add column if not exists qbo_source_id text null;

comment on column public.mgmt_operating_expenses.qbo_source_id is
  'QuickBooks Purchase or Bill line id. Unique so the same line is not imported twice.';

create unique index if not exists mgmt_operating_expenses_qbo_source_id_idx
  on public.mgmt_operating_expenses (qbo_source_id)
  where qbo_source_id is not null;

create or replace function public.quickbooks_existing_source_ids(p_ids text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin_user();
  if p_ids is null then
    return array[]::text[];
  end if;
  return coalesce(
    (
      select array_agg(e.qbo_source_id)
      from public.mgmt_operating_expenses e
      where e.qbo_source_id = any (p_ids)
        and e.qbo_source_id is not null
    ),
    array[]::text[]
  );
end;
$$;

create or replace function public.import_quickbooks_operating_expense(
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

  if p_qbo_source_id is null
    or p_qbo_source_id !~ '^(Purchase|Bill):[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$' then
    raise exception 'QuickBooks id is not valid';
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
    'import_quickbooks_operating_expense',
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

revoke all on function public.quickbooks_existing_source_ids(text[]) from public, anon;
revoke all on function public.import_quickbooks_operating_expense(date, text, integer, text, text) from public, anon;
grant execute on function public.quickbooks_existing_source_ids(text[]) to authenticated;
grant execute on function public.import_quickbooks_operating_expense(date, text, integer, text, text) to authenticated;
