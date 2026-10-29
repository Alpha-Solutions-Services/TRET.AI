-- TRET.AI v0.0.0.42
-- Tarps amount on a load, added to driver pay. Not applied from this branch.
-- Dev data only. The update below only marks rows that already exist.

alter table public.loads
  add column if not exists tarped boolean not null default false;

alter table public.loads
  add column if not exists tarp_cents integer not null default 0;

alter table public.loads
  drop constraint if exists loads_tarp_cents_nonneg;

alter table public.loads
  add constraint loads_tarp_cents_nonneg check (tarp_cents >= 0);

comment on column public.loads.tarped is
  'True when this load was tarped. Driver pay includes the tarps amount.';

comment on column public.loads.tarp_cents is
  'Tarps amount in integer cents. Zero when the load is not tarped. A tarped load uses this amount when it is above zero, otherwise tarp_cents_per_load.';

insert into public.import_settings (key, value_int, note) values
  ('tarp_cents_per_load', 5000, 'Default tarps amount in cents added to driver pay for each tarped load. Default is $50.')
on conflict (key) do nothing;

update public.loads
set tarped = true,
    tarp_cents = 5000
where load_id in (
  'TBH--1203',
  'TBH--1204',
  'TBH--1206',
  'TBH--1208',
  'TBH--1209',
  'TBH--1212',
  'TBH--1214',
  'TBH--1216',
  'TBH--1218',
  'TBH--1225'
)
  and tarped = false;
