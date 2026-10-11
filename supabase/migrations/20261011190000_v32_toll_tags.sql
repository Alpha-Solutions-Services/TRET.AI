-- TRET.AI v0.0.0.32
-- Bestpass tags that the toll file stores in the tag column.
-- UD12588 is Truck 3. YHM2482 is Truck 7. Card 00011 is already Truck 2.
-- Additive. Apply with the v0.0.0.32 release. Dev data only.

insert into public.truck_toll_tags (truck_id, tag_number)
select t.id, v.tag_number
from (
  values
    ('3', 'UD12588'),
    ('7', 'YHM2482')
) as v(unit, tag_number)
join public.trucks t
  on t.unit_number = v.unit
  or t.unit_number = lpad(v.unit, 2, '0')
on conflict (tag_number) do nothing;

-- Card 00011 belongs to Truck 2. Skip when that truck is not in this database yet.
insert into public.truck_fuel_cards (truck_id, card_number)
select t.id, '00011'
from public.trucks t
where t.unit_number in ('2', '02')
  and not exists (
    select 1 from public.truck_fuel_cards c where c.card_number = '00011'
  );

-- Toll credits are negative amounts. The old checks rejected them.
alter table public.toll_transactions drop constraint if exists toll_transactions_amount_nonneg;
alter table public.toll_file_imports drop constraint if exists toll_file_imports_amount_nonneg;
alter table public.weekly_statements drop constraint if exists weekly_statements_tolls_nonneg;
alter table public.weekly_statement_lines drop constraint if exists weekly_statement_lines_amount_nonneg;
alter table public.week_closes drop constraint if exists week_closes_tolls_nonneg;
