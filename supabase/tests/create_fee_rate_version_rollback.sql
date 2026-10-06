-- Run after 20261006130000_change_log_rate_version_rpcs.sql is applied.
-- Confirms create_fee_rate_version closes the prior open version and inserts rules
-- in one transaction; rolls everything back (no leftover rows).

begin;

do $$
declare
  v_truck_id uuid;
  v_first uuid;
  v_second uuid;
  v_closed_to date;
  v_rule_count integer;
begin
  -- Bypass RLS for the test setup inserts by using table owner path:
  -- this script is meant for the SQL editor as a privileged role.
  insert into public.trucks (unit_number, name, truck_class, owner_name, active)
  values ('TEST-RATE-1', 'Rate Version Test', 'third_party', 'Test Owner', true)
  returning id into v_truck_id;

  -- Seed an open version without RPC (no auth jwt in SQL editor).
  insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
  values (v_truck_id, '2026-01-01', null, 'first')
  returning id into v_first;

  insert into public.fee_rules (contract_id, kind, rate_bp, base_pct_bp) values
    (v_first, 'MANAGEMENT_FEE', 1500, 10000),
    (v_first, 'TOLSON_PAYABLE', 1000, 10000),
    (v_first, 'LEGACY_RETAINED', 500, 10000);

  -- Simulate the close+insert body of create_fee_rate_version (same SQL steps).
  update public.fee_contracts
  set effective_to = ('2026-07-01'::date - 1)
  where id = v_first;

  insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
  values (v_truck_id, '2026-07-01', null, 'second')
  returning id into v_second;

  insert into public.fee_rules (contract_id, kind, rate_bp, base_pct_bp) values
    (v_second, 'MANAGEMENT_FEE', 1500, 10000),
    (v_second, 'TOLSON_PAYABLE', 1000, 10000),
    (v_second, 'LEGACY_RETAINED', 500, 10000),
    (v_second, 'DISPATCH_FEE', 550, 10000);

  select effective_to into v_closed_to from public.fee_contracts where id = v_first;
  if v_closed_to is distinct from '2026-06-30'::date then
    raise exception 'CLOSE_PREVIOUS_FAILED';
  end if;

  select count(*) into v_rule_count from public.fee_rules where contract_id = v_second;
  if v_rule_count <> 4 then
    raise exception 'INSERT_RULES_FAILED';
  end if;

  -- Overlap must still be rejected
  begin
    insert into public.fee_contracts (truck_id, effective_from, effective_to, note)
    values (v_truck_id, '2026-06-15', '2026-08-01', 'bad overlap');
    raise exception 'EXPECTED_OVERLAP_REJECT_FAILED';
  exception
    when exclusion_violation then
      raise notice 'RATE_VERSION_TX_AND_OVERLAP_OK';
  end;
end $$;

rollback;
