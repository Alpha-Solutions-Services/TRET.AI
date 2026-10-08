-- TRET.AI v0.0.0.29
-- Fuel card and E-ZPass file import: truck card, plate, and tag maps,
-- an import log, and a review queue.
-- Additive. Do not apply until the owner says go.
-- Dev data only. The seed is the Legacy card, plate, and tag list.

create table if not exists public.truck_fuel_cards (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  card_number text not null,
  created_at timestamptz not null default now(),
  constraint truck_fuel_cards_number_unique unique (card_number)
);

comment on table public.truck_fuel_cards is
  'Fuel card number for one truck. 00003 is Truck 3. Editable on the truck page.';

create table if not exists public.truck_plates (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  plate text not null,
  plate_state text null,
  created_at timestamptz not null default now(),
  constraint truck_plates_plate_unique unique (plate)
);

comment on table public.truck_plates is
  'License plate for one truck. Used to match an E-ZPass row when the unit is missing.';

create table if not exists public.truck_toll_tags (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references public.trucks (id) on delete cascade,
  tag_number text not null,
  created_at timestamptz not null default now(),
  constraint truck_toll_tags_tag_unique unique (tag_number)
);

comment on table public.truck_toll_tags is
  'E-ZPass tag for one truck. A tag that is not on file is not entered.';

create table if not exists public.fuel_file_imports (
  id uuid primary key default gen_random_uuid(),
  unit_number text not null,
  invoice text not null,
  item text not null,
  qty_milli integer not null,
  amount_cents integer not null,
  transacted_date date not null,
  location text not null,
  load_id text null,
  trip_id text null,
  sheet_tab text null,
  sheet_row integer null,
  created_at timestamptz not null default now(),
  constraint fuel_file_imports_key unique (unit_number, invoice, item, qty_milli),
  constraint fuel_file_imports_qty_nonneg check (qty_milli >= 0),
  constraint fuel_file_imports_amount_nonneg check (amount_cents >= 0)
);

comment on table public.fuel_file_imports is
  'Fuel card lines already written. Keyed on unit, invoice, item, and quantity. Amount is integer cents. Quantity is milli-gallons.';

create table if not exists public.toll_file_imports (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null,
  unit_number text not null,
  load_id text not null,
  amount_cents integer not null,
  transacted_at timestamp without time zone not null,
  location text null,
  created_at timestamptz not null default now(),
  constraint toll_file_imports_tx unique (transaction_id),
  constraint toll_file_imports_amount_nonneg check (amount_cents >= 0)
);

comment on table public.toll_file_imports is
  'E-ZPass transactions already added to Toll Expense. One row per Transaction Id and the load it went to.';

create table if not exists public.file_import_queue (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  kind text not null,
  status text not null default 'open',
  reason text not null,
  ai_suggested boolean not null default false,
  unit_number text null,
  load_id text null,
  trip_id text null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_import_queue_dedupe unique (dedupe_key),
  constraint file_import_queue_kind_check check (kind in ('fuel', 'toll')),
  constraint file_import_queue_status_check check (status in ('open', 'approved', 'dismissed'))
);

comment on table public.file_import_queue is
  'Fuel and toll rows that were not written. The owner picks a truck or load, then approves.';

create index if not exists file_import_queue_status_idx
  on public.file_import_queue (status, created_at);

insert into public.truck_fuel_cards (truck_id, card_number)
select t.id, v.card_number
from (
  values
    ('2', '00011'),
    ('3', '00003'),
    ('4', '00037'),
    ('5', '00045'),
    ('6', '00094'),
    ('7', '00029'),
    ('8', '00060')
) as v(unit, card_number)
join public.trucks t
  on t.unit_number = v.unit
  or t.unit_number = lpad(v.unit, 2, '0')
on conflict (card_number) do nothing;

insert into public.truck_plates (truck_id, plate, plate_state)
select t.id, v.plate, nullif(v.plate_state, '')
from (
  values
    ('1', 'XPV9531', ''),
    ('2', 'XRH2610', ''),
    ('3', 'UD12588', 'VA'),
    ('4', '6OSB7382', ''),
    ('5', '5OSB8618', ''),
    ('6', '5OSB8623', ''),
    ('7', 'YHM2482', ''),
    ('8', '5OSB8626', 'TX')
) as v(unit, plate, plate_state)
join public.trucks t
  on t.unit_number = v.unit
  or t.unit_number = lpad(v.unit, 2, '0')
on conflict (plate) do nothing;

insert into public.truck_toll_tags (truck_id, tag_number)
select t.id, v.tag_number
from (
  values
    ('2', 'B7010395362'),
    ('3', 'B7010395372'),
    ('6', 'B7010405625'),
    ('7', 'B7010406687'),
    ('8', 'B7010406665')
) as v(unit, tag_number)
join public.trucks t
  on t.unit_number = v.unit
  or t.unit_number = lpad(v.unit, 2, '0')
on conflict (tag_number) do nothing;

alter table public.truck_fuel_cards enable row level security;
alter table public.truck_plates enable row level security;
alter table public.truck_toll_tags enable row level security;
alter table public.fuel_file_imports enable row level security;
alter table public.toll_file_imports enable row level security;
alter table public.file_import_queue enable row level security;

create policy "truck_fuel_cards_allowed_users_all"
  on public.truck_fuel_cards for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "truck_plates_allowed_users_all"
  on public.truck_plates for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "truck_toll_tags_allowed_users_all"
  on public.truck_toll_tags for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "fuel_file_imports_allowed_users_all"
  on public.fuel_file_imports for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "toll_file_imports_allowed_users_all"
  on public.toll_file_imports for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());

create policy "file_import_queue_allowed_users_all"
  on public.file_import_queue for all to authenticated
  using (public.is_allowed_user()) with check (public.is_allowed_user());
