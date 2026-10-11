-- TRET.AI v0.0.0.33
-- Add trucks 1, 2, 9, and 10 when they are missing.
-- No sheet URL and no money. Paste the Google Sheet link on Trucks before their weekly costs can be read.
-- Do not apply this file from the agent. The owner applies it.

insert into public.trucks (unit_number, name, truck_class, active)
select seed.unit_number, seed.name, 'third_party', true
from (
  values
    ('1', 'Truck 1'),
    ('2', 'Truck 2'),
    ('9', 'Truck 9'),
    ('10', 'Truck 10')
) as seed(unit_number, name)
where not exists (
  select 1 from public.trucks as truck where truck.unit_number = seed.unit_number
);
