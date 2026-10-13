-- TRET.AI v0.0.0.41
-- Rate confirmation files and receipt photos. Not applied until the owner says go.
-- Dev data only. No real Legacy files belong in this table until the owner says so.

create table if not exists public.truck_documents (
  id uuid primary key default gen_random_uuid(),
  truck_unit text not null,
  load_id text null,
  expense_id uuid null,
  kind text not null,
  file_name text not null,
  content_type text not null,
  file_base64 text not null,
  amount_cents integer null,
  vendor text null,
  note text null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint truck_documents_kind_check check (
    kind in ('tonu_rate_con', 'fuel_receipt', 'expense_receipt')
  ),
  constraint truck_documents_content_type_check check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain')
  ),
  constraint truck_documents_amount_check check (amount_cents is null or amount_cents >= 0),
  constraint truck_documents_file_name_check check (char_length(file_name) between 1 and 200)
);

comment on table public.truck_documents is
  'Uploaded TONU rate confirmations and fuel or expense receipt photos. The file is base64. A confirmed TONU rate replaces the unconfirmed flag.';

alter table public.truck_documents enable row level security;

drop policy if exists truck_documents_allowed on public.truck_documents;
create policy truck_documents_allowed
  on public.truck_documents
  for all
  to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

revoke all on table public.truck_documents from anon, authenticated;
grant select, insert, delete on table public.truck_documents to authenticated;
