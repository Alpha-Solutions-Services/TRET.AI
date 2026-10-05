-- TRET.AI v0.0.0.1
-- allowed_users: who may sign in with email + password Auth
-- RLS on. Dev / bootstrap data only. No real Legacy business data.

create table if not exists public.allowed_users (
  email text primary key,
  role text not null,
  created_at timestamptz not null default now(),
  constraint allowed_users_email_lowercase check (email = lower(email)),
  constraint allowed_users_role_not_blank check (length(trim(role)) > 0)
);

comment on table public.allowed_users is
  'Emails allowed to use TRET.AI. Access is denied for any other Auth account.';

comment on column public.allowed_users.email is
  'Lowercase email matching Supabase Auth user email.';

comment on column public.allowed_users.role is
  'Application role label (v0.0.0.1: owner).';

alter table public.allowed_users enable row level security;

-- Authenticated users may only read their own allowlist row.
create policy "allowed_users_select_own"
  on public.allowed_users
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- No insert/update/delete for authenticated or anon via the API.
-- Seed and admin changes run with the service role (bypasses RLS).

insert into public.allowed_users (email, role)
values ('alphaassistant.alpha@gmail.com', 'owner')
on conflict (email) do update set role = excluded.role;
