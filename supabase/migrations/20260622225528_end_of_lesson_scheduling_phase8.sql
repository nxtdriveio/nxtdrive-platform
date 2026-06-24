-- Phase 8 — End-of-lesson scheduling
--
-- Turns a confirmed instructor-next-lesson booking candidate into the actual
-- next planned lesson. Proposals use the existing booking request /
-- confirmation tables; this RPC is intentionally narrow and only finalizes
-- source='instructor_next_lesson' after all required confirmations are accepted.

create or replace function public.complete_instructor_next_lesson_booking(
  p_booking_candidate_id uuid,
  p_tenant_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_candidate public.booking_candidates%rowtype;
  v_request public.booking_requests%rowtype;
  v_lesson_id uuid;
  v_balance integer;
  v_booking_actor uuid;
begin
  select * into v_candidate
    from public.booking_candidates
   where id = p_booking_candidate_id
     and tenant_id = p_tenant_id
     and candidate_student_id is not null
   for update;
  if v_candidate.id is null then
    raise exception 'instructor next lesson candidate not found';
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_candidate.booking_request_id
     and tenant_id = p_tenant_id
     and source = 'instructor_next_lesson'
   for update;
  if v_request.id is null then
    raise exception 'instructor next lesson request not found';
  end if;
  if v_request.status = 'confirmed' and v_request.confirmed_entity_id is not null then
    return v_request.confirmed_entity_id;
  end if;
  if v_request.status in ('cancelled', 'expired', 'failed', 'declined') then
    raise exception 'instructor next lesson request is closed';
  end if;

  if not (
    public._tenant_staff_authorized(p_actor, p_tenant_id)
    or exists (
      select 1 from public.students s
       where s.id = v_candidate.candidate_student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_candidate.candidate_student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    )
  ) then
    raise exception 'actor is not authorized to complete this next-lesson booking';
  end if;

  if exists (
    select 1
      from public.booking_confirmations c
     where c.booking_candidate_id = v_candidate.id
       and c.required = true
       and c.status = 'pending'
  ) then
    raise exception 'required confirmation is still pending';
  end if;
  if exists (
    select 1
      from public.booking_confirmations c
     where c.booking_candidate_id = v_candidate.id
       and c.required = true
       and c.status in ('declined', 'expired', 'cancelled')
  ) then
    raise exception 'required confirmation was not accepted';
  end if;
  if v_candidate.starts_at <= now() then
    raise exception 'dit lesvoorstel is verlopen';
  end if;
  if not public._agenda_slot_is_free(
    p_tenant_id,
    v_candidate.instructor_id,
    v_candidate.starts_at,
    v_candidate.ends_at,
    null
  ) then
    raise exception 'het tijdslot is niet meer beschikbaar';
  end if;

  perform 1
    from public.students
   where id = v_candidate.candidate_student_id
     and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'leerling niet gevonden';
  end if;

  select coalesce(sum(delta), 0)::integer into v_balance
    from public.credit_ledger
   where student_id = v_candidate.candidate_student_id
     and tenant_id = p_tenant_id;
  if v_balance < v_candidate.duration_min then
    raise exception 'onvoldoende tegoed: % min beschikbaar, % min nodig', v_balance, v_candidate.duration_min;
  end if;

  v_booking_actor := coalesce(p_actor, v_request.created_by);

  insert into public.lessons (
    tenant_id,
    branch_id,
    instructor_id,
    student_id,
    vehicle_id,
    starts_at,
    ends_at,
    status,
    location,
    notes,
    credits_cost,
    created_by,
    location_lat,
    location_lng,
    location_place_id
  ) values (
    p_tenant_id,
    v_request.branch_id,
    v_candidate.instructor_id,
    v_candidate.candidate_student_id,
    v_candidate.vehicle_id,
    v_candidate.starts_at,
    v_candidate.ends_at,
    'planned',
    coalesce(v_candidate.pickup_location, v_request.pickup_location),
    'Volgende les ingepland vanuit lesevaluatie',
    v_candidate.duration_min,
    v_booking_actor,
    coalesce(v_candidate.pickup_lat, v_request.pickup_lat),
    coalesce(v_candidate.pickup_lng, v_request.pickup_lng),
    coalesce(v_candidate.pickup_place_id, v_request.pickup_place_id)
  )
  returning id into v_lesson_id;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id,
    v_candidate.candidate_student_id,
    -v_candidate.duration_min,
    'lesson_consumed',
    'lesson',
    v_lesson_id,
    'Volgende les ingepland vanuit lesevaluatie',
    v_booking_actor
  );

  update public.booking_candidates
     set status = 'confirmed'
   where id = v_candidate.id;
  update public.booking_candidate_preferences
     set status = case when booking_candidate_id = v_candidate.id then 'confirmed' else 'cancelled' end
   where booking_request_id = v_request.id
     and status = 'selected';
  update public.booking_confirmations
     set status = 'cancelled'
   where booking_request_id = v_request.id
     and booking_candidate_id <> v_candidate.id
     and status = 'pending';
  update public.booking_requests
     set status = 'confirmed',
         selected_candidate_id = v_candidate.id,
         confirmed_entity_type = 'lesson',
         confirmed_entity_id = v_lesson_id,
         confirmed_at = now(),
         metadata = metadata || jsonb_build_object('next_lesson_id', v_lesson_id)
   where id = v_request.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    v_booking_actor,
    p_tenant_id,
    'lesson.scheduled',
    'lesson',
    v_lesson_id::text,
    jsonb_build_object(
      'source', 'instructor_next_lesson',
      'booking_request_id', v_request.id,
      'booking_candidate_id', v_candidate.id,
      'student_id', v_candidate.candidate_student_id,
      'instructor_id', v_candidate.instructor_id,
      'starts_at', v_candidate.starts_at,
      'ends_at', v_candidate.ends_at,
      'duration_min', v_candidate.duration_min,
      'credits_cost', v_candidate.duration_min
    )
  );

  perform public._insert_booking_event(
    p_tenant_id, v_request.branch_id, v_request.id, v_candidate.id, null, v_booking_actor,
    'instructor_next_lesson.lesson_created', null,
    jsonb_build_object('lesson_id', v_lesson_id),
    '{}'::jsonb
  );

  return v_lesson_id;
end;
$$;

revoke all on function public.complete_instructor_next_lesson_booking(uuid, uuid, uuid) from public;
revoke execute on function public.complete_instructor_next_lesson_booking(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.complete_instructor_next_lesson_booking(uuid, uuid, uuid) to service_role;

comment on function public.complete_instructor_next_lesson_booking(uuid, uuid, uuid) is
  'Finalizes an instructor_next_lesson booking candidate into a planned lesson after all required confirmations are accepted.';
