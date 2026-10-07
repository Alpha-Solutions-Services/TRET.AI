-- TRET.AI v0.0.0.5
-- Vektor MCP OAuth secrets. Do not apply until the owner says go.
-- Ciphertext only. The app encrypts with VEKTOR_TOKEN_ENCRYPTION_KEY before these RPCs.
-- RLS is enabled and there are no policies: anon and authenticated cannot read the tables.
-- Allowed users reach the rows only through the security-definer functions below.

create table if not exists public.vektor_mcp_connection (
  id integer primary key default 1,
  client_information_enc text null,
  access_token_enc text null,
  refresh_token_enc text null,
  expires_at timestamptz null,
  scope text null,
  token_type text null,
  connection_status text not null default 'needs_sign_in',
  refresh_locked_until timestamptz null,
  updated_at timestamptz not null default now(),
  constraint vektor_mcp_connection_singleton check (id = 1),
  constraint vektor_mcp_connection_status_check check (
    connection_status in ('connected', 'needs_sign_in')
  )
);

comment on table public.vektor_mcp_connection is
  'Single Vektor MCP OAuth client and tokens. Values are ciphertext. No client access.';

insert into public.vektor_mcp_connection (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.vektor_oauth_pending (
  state text primary key,
  code_verifier_enc text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.vektor_oauth_pending is
  'One-time PKCE verifier for Connect Vektor. Ciphertext. Deleted when the callback is consumed.';

alter table public.vektor_mcp_connection enable row level security;
alter table public.vektor_oauth_pending enable row level security;

revoke all on table public.vektor_mcp_connection from public, anon, authenticated;
revoke all on table public.vektor_oauth_pending from public, anon, authenticated;

create or replace function public.vektor_mcp_read_connection()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vektor_mcp_connection%rowtype;
begin
  perform public.require_allowed_user();
  select * into v_row from public.vektor_mcp_connection where id = 1;
  return jsonb_build_object(
    'client_information_enc', v_row.client_information_enc,
    'access_token_enc', v_row.access_token_enc,
    'refresh_token_enc', v_row.refresh_token_enc,
    'expires_at', v_row.expires_at,
    'scope', v_row.scope,
    'token_type', v_row.token_type,
    'connection_status', v_row.connection_status,
    'refresh_locked_until', v_row.refresh_locked_until
  );
end;
$$;

create or replace function public.vektor_mcp_public_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vektor_mcp_connection%rowtype;
begin
  perform public.require_allowed_user();
  select * into v_row from public.vektor_mcp_connection where id = 1;
  return jsonb_build_object(
    'connection_status', v_row.connection_status,
    'has_refresh_token', v_row.refresh_token_enc is not null,
    'has_access_token', v_row.access_token_enc is not null
  );
end;
$$;

create or replace function public.vektor_mcp_save_client(p_client_information_enc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  update public.vektor_mcp_connection
  set client_information_enc = p_client_information_enc,
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.vektor_mcp_save_tokens(
  p_access_token_enc text,
  p_refresh_token_enc text,
  p_expires_at timestamptz,
  p_scope text,
  p_token_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  update public.vektor_mcp_connection
  set access_token_enc = p_access_token_enc,
      refresh_token_enc = p_refresh_token_enc,
      expires_at = p_expires_at,
      scope = p_scope,
      token_type = p_token_type,
      connection_status = 'connected',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.vektor_mcp_try_begin_refresh(p_lease_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform public.require_allowed_user();
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 120 then
    raise exception 'Invalid refresh lease';
  end if;
  update public.vektor_mcp_connection
  set refresh_locked_until = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  where id = 1
    and (refresh_locked_until is null or refresh_locked_until < now());
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.vektor_mcp_release_refresh()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  update public.vektor_mcp_connection
  set refresh_locked_until = null,
      updated_at = now()
  where id = 1;
end;
$$;

create or replace function public.vektor_mcp_mark_needs_sign_in()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  update public.vektor_mcp_connection
  set connection_status = 'needs_sign_in',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  update public.import_settings
  set value_text = 'false',
      updated_at = now()
  where key = 'mcp_verified';
end;
$$;

create or replace function public.vektor_mcp_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  update public.vektor_mcp_connection
  set access_token_enc = null,
      refresh_token_enc = null,
      expires_at = null,
      scope = null,
      token_type = null,
      connection_status = 'needs_sign_in',
      refresh_locked_until = null,
      updated_at = now()
  where id = 1;
  delete from public.vektor_oauth_pending;
  update public.import_settings
  set value_text = 'false',
      updated_at = now()
  where key = 'mcp_verified';
  update public.import_settings
  set value_text = null,
      updated_at = now()
  where key = 'import_source'
    and value_text = 'mcp';
end;
$$;

create or replace function public.vektor_oauth_save_pending(
  p_state text,
  p_code_verifier_enc text,
  p_redirect_uri text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_allowed_user();
  delete from public.vektor_oauth_pending where expires_at <= now();
  insert into public.vektor_oauth_pending (state, code_verifier_enc, redirect_uri, expires_at)
  values (p_state, p_code_verifier_enc, p_redirect_uri, p_expires_at)
  on conflict (state) do update
  set code_verifier_enc = excluded.code_verifier_enc,
      redirect_uri = excluded.redirect_uri,
      expires_at = excluded.expires_at;
end;
$$;

create or replace function public.vektor_oauth_take_pending(p_state text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vektor_oauth_pending%rowtype;
begin
  perform public.require_allowed_user();
  delete from public.vektor_oauth_pending
  where state = p_state
    and expires_at > now()
  returning * into v_row;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'code_verifier_enc', v_row.code_verifier_enc,
    'redirect_uri', v_row.redirect_uri
  );
end;
$$;

revoke all on function public.vektor_mcp_read_connection() from public, anon;
revoke all on function public.vektor_mcp_public_status() from public, anon;
revoke all on function public.vektor_mcp_save_client(text) from public, anon;
revoke all on function public.vektor_mcp_save_tokens(text, text, timestamptz, text, text) from public, anon;
revoke all on function public.vektor_mcp_try_begin_refresh(integer) from public, anon;
revoke all on function public.vektor_mcp_release_refresh() from public, anon;
revoke all on function public.vektor_mcp_mark_needs_sign_in() from public, anon;
revoke all on function public.vektor_mcp_disconnect() from public, anon;
revoke all on function public.vektor_oauth_save_pending(text, text, text, timestamptz) from public, anon;
revoke all on function public.vektor_oauth_take_pending(text) from public, anon;

grant execute on function public.vektor_mcp_read_connection() to authenticated;
grant execute on function public.vektor_mcp_public_status() to authenticated;
grant execute on function public.vektor_mcp_save_client(text) to authenticated;
grant execute on function public.vektor_mcp_save_tokens(text, text, timestamptz, text, text) to authenticated;
grant execute on function public.vektor_mcp_try_begin_refresh(integer) to authenticated;
grant execute on function public.vektor_mcp_release_refresh() to authenticated;
grant execute on function public.vektor_mcp_mark_needs_sign_in() to authenticated;
grant execute on function public.vektor_mcp_disconnect() to authenticated;
grant execute on function public.vektor_oauth_save_pending(text, text, text, timestamptz) to authenticated;
grant execute on function public.vektor_oauth_take_pending(text) to authenticated;
