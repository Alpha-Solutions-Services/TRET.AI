-- v0.0.0.35. Not applied from this branch.
-- Unit 3 is Tolson's truck. Fee percents stay where they are.

update public.trucks
set truck_class = 'tolson_owned'
where ltrim(regexp_replace(unit_number, '[^0-9]', '', 'g'), '0') = '3'
  and truck_class is distinct from 'tolson_owned';
