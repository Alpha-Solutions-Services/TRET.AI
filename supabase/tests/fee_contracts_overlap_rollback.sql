-- Run after the trucks/fee_contracts migration is applied.
-- Confirms overlapping fee_contracts for the same truck are rejected.
-- Entire test is rolled back (no leftover rows).

begin;

do $$
declare
  v_truck_id uuid;
begin
  insert into public.trucks (unit_number, name, truck_class, owner_name, active)
  values ('TEST-OVERLAP-1', 'Overlap Test Truck', 'third_party', 'Test Owner', true)
  returning id into v_truck_id;

  insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
  values (v_truck_id, '2026-01-01', '2026-06-30', 'first half');

  begin
    insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
    values (v_truck_id, '2026-06-01', '2026-12-31', 'overlap should fail');
    raise exception 'EXPECTED_OVERLAP_REJECT_FAILED';
  exception
    when exclusion_violation then
      raise notice 'OVERLAP_REJECTED_OK';
  end;
end $$;

rollback;
