create or replace function public.schedule_planning_queue_item(
  p_tenant_id uuid,
  p_actor uuid,
  p_queue_item_id uuid,
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_vehicle_id uuid default null,
  p_validation jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_before jsonb;
  v_after jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_ends_at timestamptz;
  v_notes text;
  v_student_branch_id uuid;
  v_lead_branch_id uuid;
  v_balance integer;
  v_cost integer;
begin
  if coalesce((p_validation->>'allowed')::boolean, false) is not true then
    raise exception 'planning validation must be allowed before scheduling queue item %', p_queue_item_id;
  end if;

  select *, to_jsonb(planning_queue_items.*) as before_json
    into v_item
    from public.planning_queue_items
   where id = p_queue_item_id and tenant_id = p_tenant_id
   for update;

  if v_item.id is null then
    raise exception 'planning queue item % not found in tenant %', p_queue_item_id, p_tenant_id;
  end if;
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_item.branch_id) then
    raise exception 'actor % not authorized to schedule planning queue item %', p_actor, p_queue_item_id;
  end if;
  if v_item.status not in ('open', 'suggested') then
    raise exception 'planning queue item % cannot be scheduled with status %', p_queue_item_id, v_item.status;
  end if;
  if p_starts_at is null or v_item.duration_minutes is null or v_item.duration_minutes < 5 then
    raise exception 'invalid planning queue schedule time or duration';
  end if;
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  v_before := v_item.before_json;
  v_ends_at := p_starts_at + make_interval(mins => v_item.duration_minutes);
  v_notes := case
    when v_item.notes is null then 'Planning queue'
    else 'Planning queue: ' || v_item.notes
  end;

  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'het gekozen tijdslot overlapt een bestaande les, proefles of afspraak';
  end if;

  if p_vehicle_id is not null and exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.vehicle_id = p_vehicle_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
    union all
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.vehicle_id = p_vehicle_id
       and t.status in ('provisional', 'confirmed')
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
    union all
    select 1 from public.agenda_appointments a
     where a.tenant_id = p_tenant_id
       and a.vehicle_id = p_vehicle_id
       and a.status = 'planned'
       and tstzrange(a.starts_at, a.ends_at, '[)')
           && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then
    raise exception 'voertuig % heeft al planning in dit tijdslot', p_vehicle_id;
  end if;

  if v_item.appointment_type = 'lesson' then
    if v_item.student_id is null then
      raise exception 'lesson queue item % has no student', p_queue_item_id;
    end if;

    select s.branch_id into v_student_branch_id
      from public.students s
     where s.id = v_item.student_id and s.tenant_id = p_tenant_id
     for update;
    if not found then
      raise exception 'student % not found in tenant %', v_item.student_id, p_tenant_id;
    end if;
    if v_item.branch_id is not null and v_student_branch_id is distinct from v_item.branch_id then
      raise exception 'student branch does not match planning queue item branch';
    end if;

    if p_vehicle_id is not null and not exists (
      select 1 from public.vehicles v
       where v.id = p_vehicle_id
         and v.tenant_id = p_tenant_id
         and (v.branch_id is null or coalesce(v_item.branch_id, v_student_branch_id) is null or v.branch_id = coalesce(v_item.branch_id, v_student_branch_id))
    ) then
      raise exception 'vehicle % does not fit this planning queue scope', p_vehicle_id;
    end if;

    v_cost := v_item.duration_minutes;
    select coalesce(sum(delta), 0)::integer into v_balance
      from public.credit_ledger
     where student_id = v_item.student_id and tenant_id = p_tenant_id;
    if v_balance < v_cost then
      raise exception 'insufficient tegoed: balance % min < cost % min', v_balance, v_cost;
    end if;

    insert into public.lessons (
      tenant_id, branch_id, instructor_id, student_id,
      starts_at, ends_at, status, location, notes, credits_cost, created_by,
      vehicle_id, pickup_service_area_id
    ) values (
      p_tenant_id, coalesce(v_item.branch_id, v_student_branch_id), p_instructor_id, v_item.student_id,
      p_starts_at, v_ends_at, 'planned', v_item.pickup_address_id, v_notes, v_cost, p_actor,
      p_vehicle_id, v_item.pickup_service_area_id
    )
    returning id into v_entity_id;

    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, v_item.student_id, -v_cost, 'lesson_consumed',
      'lesson', v_entity_id, 'Les ingepland vanuit planning queue', p_actor
    );

    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'lesson.scheduled', 'lesson', v_entity_id::text,
      jsonb_build_object(
        'source', 'planning_queue',
        'planning_queue_item_id', p_queue_item_id,
        'branch_id', coalesce(v_item.branch_id, v_student_branch_id),
        'instructor_id', p_instructor_id,
        'student_id', v_item.student_id,
        'vehicle_id', p_vehicle_id,
        'pickup_service_area_id', v_item.pickup_service_area_id,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'duration_min', v_item.duration_minutes,
        'credits_cost', v_cost
      )
    );
    v_entity_type := 'lesson';

  elsif v_item.appointment_type = 'trial_lesson' then
    if v_item.lead_id is null then
      raise exception 'trial lesson queue item % has no lead', p_queue_item_id;
    end if;
    if v_item.duration_minutes not in (60, 90, 120) then
      raise exception 'trial duration must be 60, 90 or 120 minutes';
    end if;

    select l.branch_id into v_lead_branch_id
      from public.leads l
     where l.id = v_item.lead_id and l.tenant_id = p_tenant_id;
    if not found then
      raise exception 'lead % not found in tenant %', v_item.lead_id, p_tenant_id;
    end if;
    if v_item.branch_id is not null and v_lead_branch_id is distinct from v_item.branch_id then
      raise exception 'lead branch does not match planning queue item branch';
    end if;

    if exists (
      select 1 from public.trial_lessons
       where lead_id = v_item.lead_id
         and tenant_id = p_tenant_id
         and status = 'confirmed'
    ) then
      raise exception 'lead % already has a confirmed trial lesson', v_item.lead_id;
    end if;

    update public.trial_lessons
       set status = 'cancelled'
     where lead_id = v_item.lead_id
       and tenant_id = p_tenant_id
       and status = 'provisional';

    insert into public.trial_lessons (
      tenant_id, branch_id, lead_id, instructor_id, status,
      starts_at, ends_at, duration_min, pickup_location, score, reason,
      notes, created_by, vehicle_id, pickup_service_area_id
    ) values (
      p_tenant_id, coalesce(v_item.branch_id, v_lead_branch_id), v_item.lead_id, p_instructor_id, 'provisional',
      p_starts_at, v_ends_at, v_item.duration_minutes, v_item.pickup_address_id, 0, 'Planning queue',
      v_notes, p_actor, p_vehicle_id, v_item.pickup_service_area_id
    )
    returning id into v_entity_id;

    insert into public.lead_events (lead_id, tenant_id, event_type, payload)
    values (
      v_item.lead_id, p_tenant_id, 'trial_requested',
      jsonb_build_object(
        'source', 'planning_queue',
        'planning_queue_item_id', p_queue_item_id,
        'trial_lesson_id', v_entity_id,
        'starts_at', p_starts_at,
        'duration_min', v_item.duration_minutes
      )
    );

    update public.leads
       set status = 'contacted'
     where id = v_item.lead_id and tenant_id = p_tenant_id and status = 'new';

    insert into public.audit_log (tenant_id, action, target_type, target_id, payload)
    values (
      p_tenant_id, 'trial_lesson.requested', 'trial_lesson', v_entity_id::text,
      jsonb_build_object(
        'source', 'planning_queue',
        'planning_queue_item_id', p_queue_item_id,
        'branch_id', coalesce(v_item.branch_id, v_lead_branch_id),
        'lead_id', v_item.lead_id,
        'instructor_id', p_instructor_id,
        'vehicle_id', p_vehicle_id,
        'pickup_service_area_id', v_item.pickup_service_area_id,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'duration_min', v_item.duration_minutes
      )
    );
    v_entity_type := 'trial_lesson';

  else
    v_entity_id := public.create_agenda_appointment(
      p_tenant_id,
      p_actor,
      p_instructor_id,
      v_item.appointment_type::public.agenda_appointment_type,
      p_starts_at,
      v_item.duration_minutes,
      v_item.student_id,
      case when v_item.lead_id is not null then 'Planbare lead-afspraak' else 'Planbare afspraak' end,
      v_item.pickup_address_id,
      v_notes,
      v_item.branch_id,
      p_vehicle_id,
      v_item.pickup_service_area_id
    );
    v_entity_type := 'agenda_appointment';
  end if;

  update public.planning_queue_items
     set status = 'scheduled',
         scheduled_entity_type = v_entity_type,
         scheduled_entity_id = v_entity_id,
         scheduled_at = now(),
         scheduled_by = p_actor,
         last_validation = p_validation
   where id = p_queue_item_id and tenant_id = p_tenant_id;

  select to_jsonb(q.*) into v_after
    from public.planning_queue_items q
   where q.id = p_queue_item_id and q.tenant_id = p_tenant_id;

  insert into public.planning_audit_log (
    tenant_id, branch_id, actor_user_id, scope_type, scope_ref_id, action,
    entity_type, entity_id, before_json, after_json
  ) values (
    p_tenant_id, v_item.branch_id, p_actor,
    case when v_item.branch_id is null then 'tenant' else 'branch' end,
    coalesce(v_item.branch_id, p_tenant_id), 'planning_queue.scheduled',
    'planning_queue_item', p_queue_item_id, v_before, v_after
  );

  return jsonb_build_object(
    'entity_type', v_entity_type,
    'entity_id', v_entity_id,
    'queue_item_id', p_queue_item_id
  );
end;
$$;

revoke all on function public.schedule_planning_queue_item(
  uuid, uuid, uuid, uuid, timestamptz, uuid, jsonb
) from public;
revoke execute on function public.schedule_planning_queue_item(
  uuid, uuid, uuid, uuid, timestamptz, uuid, jsonb
) from anon, authenticated;
grant execute on function public.schedule_planning_queue_item(
  uuid, uuid, uuid, uuid, timestamptz, uuid, jsonb
) to service_role;
