-- TRET.AI v0.0.0.10
-- Mark one open Warn or Block issue resolved and write change_log.
-- Does not change imported rows and does not unlock a week.
-- Do not apply until the owner says go. No new table.

alter table public.change_log drop constraint change_log_entity_type_check;
alter table public.change_log add constraint change_log_entity_type_check check (
  entity_type in (
    'truck',
    'fee_contract',
    'truck_fixed_expense',
    'truck_fixed_expense_override',
    'mgmt_operating_expense',
    'weekly_statement',
    'week_close',
    'issue'
  )
);

create or replace function public.resolve_issue(p_issue_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_before jsonb;
  v_after jsonb;
  v_severity text;
  v_status text;
begin
  v_actor := public.require_allowed_user();

  if p_issue_id is null then
    raise exception 'Issue is required';
  end if;

  select to_jsonb(i), i.severity, i.status
    into v_before, v_severity, v_status
  from public.issues i
  where i.id = p_issue_id
  for update;

  if v_before is null then
    raise exception 'Issue not found';
  end if;

  if v_severity not in ('Warn', 'Block') then
    raise exception 'Only Warn and Block issues can be resolved';
  end if;

  if v_status = 'resolved' then
    raise exception 'This issue is already resolved';
  end if;

  if v_status <> 'open' then
    raise exception 'Only an open issue can be resolved';
  end if;

  update public.issues
  set status = 'resolved'
  where id = p_issue_id;

  select to_jsonb(i) into v_after
  from public.issues i
  where i.id = p_issue_id;

  insert into public.change_log (entity_type, entity_id, action, actor_email, before_data, after_data)
  values (
    'issue',
    p_issue_id,
    'resolve_issue',
    v_actor,
    v_before,
    v_after
  );

  return p_issue_id;
end;
$$;

revoke all on function public.resolve_issue(uuid) from public;
revoke all on function public.resolve_issue(uuid) from anon;
grant execute on function public.resolve_issue(uuid) to authenticated;

comment on function public.resolve_issue(uuid) is
  'Marks one open Warn or Block issue resolved. Does not change imported rows or a locked week.';
