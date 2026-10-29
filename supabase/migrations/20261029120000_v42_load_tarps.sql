-- TRET.AI v0.0.0.42
-- Adds loads.tarped, loads.tarp_cents, and the tarp_cents_per_load setting.
-- Does not update load rows. Not applied from this branch.
-- Dev data only.

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
  'Tarps amount in integer cents. Zero when the load is not tarped. A tarped load with no amount uses tarp_cents_per_load, and a saved rate of 0 is $0.';

insert into public.import_settings (key, value_int, note) values
  ('tarp_cents_per_load', 5000, 'Default tarps amount in cents for a tarped load entered in TRET with no sheet amount. Default is $50. Sheet Tarps cells are stored on loads.tarp_cents and are not overwritten here.')
on conflict (key) do nothing;
