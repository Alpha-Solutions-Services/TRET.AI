-- Not a migration. Run by hand after truck_documents exists.
-- Owner-confirmed TONU fees. Gross is unchanged. TBH--1217 stays unconfirmed.
-- Match the canonical load id (TBH--####).

insert into public.truck_documents (
  truck_unit,
  load_id,
  kind,
  file_name,
  content_type,
  file_base64,
  amount_cents,
  confirmed,
  note
)
select
  seed.truck_unit,
  seed.load_id,
  'tonu_rate_con',
  'owner-confirmed.txt',
  'text/plain',
  encode(convert_to('Owner confirmed TONU', 'UTF8'), 'base64'),
  seed.amount_cents,
  true,
  'Owner confirmed'
from (
  values
    ('8', 'TBH--1201', 25000),
    ('6', 'TBH--1221', 25000)
) as seed(truck_unit, load_id, amount_cents)
where not exists (
  select 1
  from public.truck_documents existing
  where existing.kind = 'tonu_rate_con'
    and existing.confirmed = true
    and existing.load_id = seed.load_id
);
