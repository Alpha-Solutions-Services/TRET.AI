-- TRET.AI v0.0.0.24
-- Per-truck Tolson payable on trucks. Not applied until the owner says go.
-- Does not change Row Level Security. trucks_allowed_users_all already covers every column.
-- Both columns stay null until someone sets them on Edit truck. A null pair means $0 for that truck.

alter table public.trucks
  add column if not exists tolson_payable_type text null,
  add column if not exists tolson_payable_value integer null;

comment on column public.trucks.tolson_payable_type is
  'How this truck pays Tolson. percent_of_gross or fixed_weekly. Null means not set.';

comment on column public.trucks.tolson_payable_value is
  'Basis points when type is percent_of_gross (1000 is 10 percent). Integer cents when type is fixed_weekly. Null means not set.';

alter table public.trucks
  drop constraint if exists trucks_tolson_payable_pair;

alter table public.trucks
  add constraint trucks_tolson_payable_pair
  check (
    (tolson_payable_type is null and tolson_payable_value is null)
    or (
      tolson_payable_type = 'percent_of_gross'
      and tolson_payable_value between 0 and 10000
    )
    or (
      tolson_payable_type = 'fixed_weekly'
      and tolson_payable_value between 0 and 2147483647
    )
  );
