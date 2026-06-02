-- 0041_convert_lead_terminal_state.sql
-- Terminal-state consistency for the lead funnel (Slimme Opvolging).
--
-- convert_lead_to_student previously only flipped leads.status='converted'. With
-- the dashboard's status + action_status model, a converted lead must also reach
-- a clean terminal operational state: action_status='closed', no pending next
-- action, and a converted_to_student_at stamp. The automation engine PRESERVES
-- terminal states (it never derives their action_status), so this MUST happen at
-- conversion time — a later reconcile will not repair it.
--
-- Recreated verbatim from 0013 with the terminal-state fields added on the first
-- (idempotent) conversion. Grants unchanged (service_role only).

create or replace function public.convert_lead_to_student(
  p_lead_id    uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead       record;
  v_student_id uuid;
begin
  select id, status, full_name, email, phone, postcode
    into v_lead
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if v_lead.id is null then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  -- Idempotent: if already converted, return the existing student id.
  select id into v_student_id
    from public.students
   where tenant_id = p_tenant_id and lead_id = p_lead_id
   limit 1;
  if v_student_id is not null then
    return v_student_id;
  end if;

  insert into public.students (tenant_id, lead_id, full_name, email, phone, postcode)
  values (p_tenant_id, v_lead.id, v_lead.full_name, v_lead.email, v_lead.phone, v_lead.postcode)
  returning id into v_student_id;

  if v_lead.status <> 'converted' then
    update public.leads
       set status                  = 'converted',
           action_status           = 'closed',
           next_action_at          = null,
           converted_to_student_at = coalesce(converted_to_student_at, now())
     where id = p_lead_id and tenant_id = p_tenant_id;

    insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
    values (
      p_lead_id, p_tenant_id, p_actor, 'status_changed',
      jsonb_build_object('from', v_lead.status::text, 'to', 'converted', 'student_id', v_student_id)
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lead.converted', 'lead', p_lead_id::text,
    jsonb_build_object('student_id', v_student_id, 'package_id', p_package_id)
  );

  if p_package_id is not null then
    perform public.grant_package(v_student_id, p_tenant_id, p_actor, p_package_id);
  end if;

  return v_student_id;
end;
$$;

revoke all on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) to service_role;

-- Backfill any leads already converted before this migration so the dashboard's
-- "Gewonnen" tab and action filters are consistent.
update public.leads
   set action_status           = 'closed',
       next_action_at          = null,
       converted_to_student_at = coalesce(converted_to_student_at, updated_at, now())
 where status = 'converted'
   and (action_status <> 'closed' or converted_to_student_at is null);
