create or replace function public.reschedule_planning_board_event(
  p_tenant_id uuid,
  p_actor uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_vehicle_id uuid default null,
  p_validation jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson record;
  v_trial record;
  v_appt record;
  v_duration_min integer;
  v_ends_at timestamptz;
  v_branch_id uuid;
  v_vehicle_id uuid;
begin
  if coalesce((p_validation->>'allowed')::boolean, false) is not true then
    raise exception 'planning validation did not allow this move';
  end if;
  if p_entity_type not in ('lesson', 'trial_lesson', 'agenda_appointment') then
    raise exception 'unsupported planning board entity type %', p_entity_type;
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'new start must be in the future'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1
      from public.memberships m
     where m.tenant_id = p_tenant_id
       and m.user_id = p_instructor_id
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  if p_entity_type = 'lesson' then
    select * into v_lesson
      from public.lessons
     where id = p_entity_id and tenant_id = p_tenant_id
     for update;
    if v_lesson.id is null then
      raise exception 'lesson % not found in tenant %', p_entity_id, p_tenant_id;
    end if;
    if v_lesson.status <> 'planned' then
      raise exception 'lesson % is not planned (status=%)', p_entity_id, v_lesson.status;
    end if;

    v_branch_id := v_lesson.branch_id;
    if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
      raise exception 'actor % not authorized for lesson branch %', p_actor, v_branch_id;
    end if;

    v_duration_min := greatest(
      15,
      round(extract(epoch from (v_lesson.ends_at - v_lesson.starts_at)) / 60.0)::integer
    );
    v_ends_at := p_starts_at + make_interval(mins => v_duration_min);
    v_vehicle_id := coalesce(p_vehicle_id, v_lesson.vehicle_id);

    if exists (
      select 1 from public.lessons l
       where l.tenant_id = p_tenant_id
         and l.id <> p_entity_id
         and l.instructor_id = p_instructor_id
         and l.status = 'planned'
         and tstzrange(l.starts_at, l.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.trial_lessons t
       where t.tenant_id = p_tenant_id
         and t.instructor_id = p_instructor_id
         and t.status in ('provisional', 'confirmed')
         and tstzrange(t.starts_at, t.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.agenda_appointments a
       where a.tenant_id = p_tenant_id
         and a.instructor_id = p_instructor_id
         and a.status = 'planned'
         and tstzrange(a.starts_at, a.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) then
      raise exception 'new slot % overlaps an existing instructor appointment', p_starts_at
        using errcode = 'check_violation';
    end if;

    if v_vehicle_id is not null and (
      exists (
        select 1 from public.lessons l
         where l.tenant_id = p_tenant_id
           and l.id <> p_entity_id
           and l.vehicle_id = v_vehicle_id
           and l.status = 'planned'
           and tstzrange(l.starts_at, l.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      ) or exists (
        select 1 from public.trial_lessons t
         where t.tenant_id = p_tenant_id
           and t.vehicle_id = v_vehicle_id
           and t.status in ('provisional', 'confirmed')
           and tstzrange(t.starts_at, t.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      ) or exists (
        select 1 from public.agenda_appointments a
         where a.tenant_id = p_tenant_id
           and a.vehicle_id = v_vehicle_id
           and a.status = 'planned'
           and tstzrange(a.starts_at, a.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      )
    ) then
      raise exception 'vehicle % overlaps an existing appointment', v_vehicle_id
        using errcode = 'check_violation';
    end if;

    update public.lessons
       set instructor_id = p_instructor_id,
           starts_at = p_starts_at,
           ends_at = v_ends_at,
           vehicle_id = v_vehicle_id
     where id = p_entity_id and tenant_id = p_tenant_id;

    insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
    values (
      p_actor, p_tenant_id, 'lesson.rescheduled', 'lesson', p_entity_id::text,
      jsonb_build_object(
        'from', v_lesson.starts_at,
        'to', p_starts_at,
        'from_instructor_id', v_lesson.instructor_id,
        'to_instructor_id', p_instructor_id,
        'vehicle_id', v_vehicle_id,
        'source', 'planning_board'
      )
    );

    return jsonb_build_object(
      'entity_type', 'lesson',
      'entity_id', p_entity_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at
    );
  end if;

  if p_entity_type = 'agenda_appointment' then
    select * into v_appt
      from public.agenda_appointments
     where id = p_entity_id and tenant_id = p_tenant_id
     for update;
    if v_appt.id is null then
      raise exception 'agenda appointment % not found in tenant %', p_entity_id, p_tenant_id;
    end if;
    if v_appt.status <> 'planned' then
      raise exception 'agenda appointment % is not planned (status=%)', p_entity_id, v_appt.status;
    end if;

    v_branch_id := v_appt.branch_id;
    if v_branch_id is null and v_appt.student_id is not null then
      select s.branch_id into v_branch_id
        from public.students s
       where s.id = v_appt.student_id
         and s.tenant_id = p_tenant_id;
    end if;
    if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
      raise exception 'actor % not authorized for agenda appointment branch %', p_actor, v_branch_id;
    end if;

    v_duration_min := greatest(
      5,
      round(extract(epoch from (v_appt.ends_at - v_appt.starts_at)) / 60.0)::integer
    );
    v_ends_at := p_starts_at + make_interval(mins => v_duration_min);
    v_vehicle_id := coalesce(p_vehicle_id, v_appt.vehicle_id);

    if exists (
      select 1 from public.lessons l
       where l.tenant_id = p_tenant_id
         and l.instructor_id = p_instructor_id
         and l.status = 'planned'
         and tstzrange(l.starts_at, l.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.trial_lessons t
       where t.tenant_id = p_tenant_id
         and t.instructor_id = p_instructor_id
         and t.status in ('provisional', 'confirmed')
         and tstzrange(t.starts_at, t.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.agenda_appointments a
       where a.tenant_id = p_tenant_id
         and a.id <> p_entity_id
         and a.instructor_id = p_instructor_id
         and a.status = 'planned'
         and tstzrange(a.starts_at, a.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) then
      raise exception 'new slot % overlaps an existing instructor appointment', p_starts_at
        using errcode = 'check_violation';
    end if;

    if v_vehicle_id is not null and (
      exists (
        select 1 from public.lessons l
         where l.tenant_id = p_tenant_id
           and l.vehicle_id = v_vehicle_id
           and l.status = 'planned'
           and tstzrange(l.starts_at, l.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      ) or exists (
        select 1 from public.trial_lessons t
         where t.tenant_id = p_tenant_id
           and t.vehicle_id = v_vehicle_id
           and t.status in ('provisional', 'confirmed')
           and tstzrange(t.starts_at, t.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      ) or exists (
        select 1 from public.agenda_appointments a
         where a.tenant_id = p_tenant_id
           and a.id <> p_entity_id
           and a.vehicle_id = v_vehicle_id
           and a.status = 'planned'
           and tstzrange(a.starts_at, a.ends_at, '[)')
               && tstzrange(p_starts_at, v_ends_at, '[)')
      )
    ) then
      raise exception 'vehicle % overlaps an existing appointment', v_vehicle_id
        using errcode = 'check_violation';
    end if;

    update public.agenda_appointments
       set instructor_id = p_instructor_id,
           starts_at = p_starts_at,
           ends_at = v_ends_at,
           vehicle_id = v_vehicle_id
     where id = p_entity_id and tenant_id = p_tenant_id;

    insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
    values (
      p_actor, p_tenant_id, 'agenda_appointment.rescheduled', 'agenda_appointment', p_entity_id::text,
      jsonb_build_object(
        'from', v_appt.starts_at,
        'to', p_starts_at,
        'from_instructor_id', v_appt.instructor_id,
        'to_instructor_id', p_instructor_id,
        'vehicle_id', v_vehicle_id,
        'source', 'planning_board'
      )
    );

    return jsonb_build_object(
      'entity_type', 'agenda_appointment',
      'entity_id', p_entity_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at
    );
  end if;

  select * into v_trial
    from public.trial_lessons
   where id = p_entity_id and tenant_id = p_tenant_id
   for update;
  if v_trial.id is null then
    raise exception 'trial lesson % not found in tenant %', p_entity_id, p_tenant_id;
  end if;
  if v_trial.status not in ('provisional', 'confirmed') then
    raise exception 'trial lesson % cannot be rescheduled (status=%)', p_entity_id, v_trial.status;
  end if;

  v_branch_id := v_trial.branch_id;
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_branch_id) then
    raise exception 'actor % not authorized for trial branch %', p_actor, v_branch_id;
  end if;

  v_duration_min := greatest(
    15,
    round(extract(epoch from (v_trial.ends_at - v_trial.starts_at)) / 60.0)::integer
  );
  if v_duration_min not in (60, 90, 120) then
    raise exception 'trial duration must be 60, 90 or 120 minutes';
  end if;
  v_ends_at := p_starts_at + make_interval(mins => v_duration_min);
  v_vehicle_id := coalesce(p_vehicle_id, v_trial.vehicle_id);

  if exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.instructor_id = p_instructor_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
  ) or exists (
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.id <> p_entity_id
       and t.instructor_id = p_instructor_id
       and t.status in ('provisional', 'confirmed')
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
  ) or exists (
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.instructor_id = p_instructor_id
       and a.status = 'planned'
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'new slot % overlaps an existing instructor appointment', p_starts_at
      using errcode = 'check_violation';
  end if;

  if v_vehicle_id is not null and (
    exists (
      select 1 from public.lessons l
       where l.tenant_id = p_tenant_id
         and l.vehicle_id = v_vehicle_id
         and l.status = 'planned'
         and tstzrange(l.starts_at, l.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.trial_lessons t
       where t.tenant_id = p_tenant_id
         and t.id <> p_entity_id
         and t.vehicle_id = v_vehicle_id
         and t.status in ('provisional', 'confirmed')
         and tstzrange(t.starts_at, t.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    ) or exists (
      select 1 from public.agenda_appointments a
       where a.tenant_id = p_tenant_id
         and a.vehicle_id = v_vehicle_id
         and a.status = 'planned'
         and tstzrange(a.starts_at, a.ends_at, '[)')
             && tstzrange(p_starts_at, v_ends_at, '[)')
    )
  ) then
    raise exception 'vehicle % overlaps an existing appointment', v_vehicle_id
      using errcode = 'check_violation';
  end if;

  update public.trial_lessons
     set instructor_id = p_instructor_id,
         starts_at = p_starts_at,
         ends_at = v_ends_at,
         duration_min = v_duration_min,
         vehicle_id = v_vehicle_id
   where id = p_entity_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    v_trial.lead_id, p_tenant_id, p_actor, 'trial_rescheduled',
    jsonb_build_object(
      'trial_lesson_id', p_entity_id,
      'from', v_trial.starts_at,
      'to', p_starts_at,
      'duration_min', v_duration_min,
      'source', 'planning_board'
    )
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'trial_lesson.rescheduled', 'trial_lesson', p_entity_id::text,
    jsonb_build_object(
      'from', v_trial.starts_at,
      'to', p_starts_at,
      'from_instructor_id', v_trial.instructor_id,
      'to_instructor_id', p_instructor_id,
      'vehicle_id', v_vehicle_id,
      'source', 'planning_board'
    )
  );

  return jsonb_build_object(
    'entity_type', 'trial_lesson',
    'entity_id', p_entity_id,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at
  );
end;
$$;

revoke all on function public.reschedule_planning_board_event(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) from public;
revoke execute on function public.reschedule_planning_board_event(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) from anon, authenticated;
grant execute on function public.reschedule_planning_board_event(
  uuid, uuid, text, uuid, uuid, timestamptz, uuid, jsonb
) to service_role;
