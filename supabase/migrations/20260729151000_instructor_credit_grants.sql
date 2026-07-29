-- Allow instructors to add positive lesson credit to students they actively
-- work with. Deductions remain an admin-only correction flow. The RPC is
-- service-role only, rechecks tenant/actor/student scope and writes both the
-- immutable ledger entry and an explicit audit event.

create or replace function public.add_instructor_student_credits(
  p_student_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_delta_minutes integer,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_id uuid;
  v_is_admin boolean;
  v_is_instructor boolean;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if p_delta_minutes is null
     or p_delta_minutes < 15
     or p_delta_minutes > 6000
     or mod(p_delta_minutes, 15) <> 0 then
    raise exception 'credit grant must be 15 to 6000 minutes in 15-minute increments';
  end if;
  if char_length(v_note) < 1 or char_length(v_note) > 200 then
    raise exception 'credit grant note must contain 1 to 200 characters';
  end if;

  v_is_admin := public._tenant_admin_authorized(p_actor, p_tenant_id);
  v_is_instructor := exists (
    select 1
      from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'instructor'
  );
  if not v_is_admin and not v_is_instructor then
    raise exception 'actor is not authorized to add student credit';
  end if;

  perform 1
    from public.students s
   where s.id = p_student_id
     and s.tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'student not found in tenant';
  end if;

  if not v_is_admin and not (
    exists (
      select 1
        from public.lessons l
       where l.tenant_id = p_tenant_id
         and l.student_id = p_student_id
         and l.instructor_id = p_actor
    )
    or exists (
      select 1
        from public.agenda_appointments a
       where a.tenant_id = p_tenant_id
         and a.student_id = p_student_id
         and a.instructor_id = p_actor
    )
    or exists (
      select 1
        from public.chat_conversations c
       where c.tenant_id = p_tenant_id
         and c.student_id = p_student_id
         and c.instructor_id = p_actor
    )
  ) then
    raise exception 'instructor is not linked to this student';
  end if;

  insert into public.credit_ledger (
    tenant_id,
    student_id,
    delta,
    reason,
    note,
    actor_user_id
  ) values (
    p_tenant_id,
    p_student_id,
    p_delta_minutes,
    'adjustment',
    v_note,
    p_actor
  )
  returning id into v_ledger_id;

  insert into public.audit_log (
    actor_user_id,
    tenant_id,
    action,
    target_type,
    target_id,
    payload
  ) values (
    p_actor,
    p_tenant_id,
    'credits.instructor_added',
    'student',
    p_student_id::text,
    jsonb_build_object(
      'delta_minutes', p_delta_minutes,
      'note', v_note,
      'ledger_id', v_ledger_id
    )
  );

  return v_ledger_id;
end;
$$;

revoke all on function public.add_instructor_student_credits(
  uuid,
  uuid,
  uuid,
  integer,
  text
) from public, anon, authenticated;
grant execute on function public.add_instructor_student_credits(
  uuid,
  uuid,
  uuid,
  integer,
  text
) to service_role;

comment on function public.add_instructor_student_credits(
  uuid,
  uuid,
  uuid,
  integer,
  text
) is
  'Adds positive lesson credit for an instructor-linked student. Service-role only, tenant-scoped and audited.';
