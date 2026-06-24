-- Smart Booking Engine - phase 6 student reschedule/cancel flow.
--
-- Tightens student self-service cancellation/rescheduling against the tenant
-- self-booking policy and package rules. Every freed future lesson slot is
-- registered as a canonical slot_recovery booking_request so phase 7 can search
-- candidates, send batches and handle interest without reverse-engineering
-- cancelled/rescheduled lessons.

begin;

create or replace function public._create_lesson_slot_recovery_request(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_actor uuid,
  p_source_lesson_id uuid,
  p_student_id uuid,
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_duration_min integer,
  p_location text,
  p_location_lat double precision,
  p_location_lng double precision,
  p_location_place_id text,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_idempotency text;
  v_metadata jsonb;
begin
  if p_tenant_id is null or p_source_lesson_id is null then
    raise exception 'tenant and source lesson are required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'invalid recovery slot';
  end if;
  if p_starts_at <= now() then
    return null;
  end if;

  v_idempotency := format(
    'lesson-slot-recovery:%s:%s:%s',
    p_source_lesson_id,
    extract(epoch from p_starts_at)::bigint,
    extract(epoch from p_ends_at)::bigint
  );
  v_metadata := jsonb_build_object(
    'phase', 'student_reschedule_cancel_phase6',
    'source_lesson_id', p_source_lesson_id,
    'original_student_id', p_student_id,
    'reason', nullif(left(coalesce(p_reason, ''), 500), ''),
    'starts_at', p_starts_at,
    'ends_at', p_ends_at
  ) || coalesce(p_metadata, '{}'::jsonb);

  insert into public.booking_requests (
    tenant_id,
    branch_id,
    source,
    requester_type,
    entity_type,
    status,
    student_id,
    requested_duration_min,
    preferred_instructor_id,
    pickup_location,
    pickup_lat,
    pickup_lng,
    pickup_place_id,
    pickup_formatted_address,
    idempotency_key,
    metadata,
    created_by
  ) values (
    p_tenant_id,
    p_branch_id,
    'slot_recovery',
    'system',
    'lesson',
    'open',
    null,
    p_duration_min,
    p_instructor_id,
    nullif(left(coalesce(p_location, ''), 200), ''),
    p_location_lat,
    p_location_lng,
    nullif(left(coalesce(p_location_place_id, ''), 300), ''),
    nullif(left(coalesce(p_location, ''), 200), ''),
    v_idempotency,
    v_metadata,
    p_actor
  )
  on conflict (tenant_id, idempotency_key) where idempotency_key is not null
  do update
     set status = case
           when public.booking_requests.status in ('confirmed', 'cancelled', 'expired')
             then public.booking_requests.status
           else 'open'
         end,
         metadata = public.booking_requests.metadata || excluded.metadata
  returning id into v_id;

  perform public._insert_booking_event(
    p_tenant_id,
    p_branch_id,
    v_id,
    null,
    null,
    p_actor,
    'slot_recovery.created',
    null,
    jsonb_build_object(
      'source_lesson_id', p_source_lesson_id,
      'original_student_id', p_student_id,
      'instructor_id', p_instructor_id,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'duration_min', p_duration_min
    ),
    v_metadata
  );

  return v_id;
end;
$$;

create or replace function public.student_cancel_lesson(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_reason    text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson         record;
  v_authorized     boolean;
  v_policy         jsonb;
  v_booking_policy jsonb;
  v_tier           jsonb;
  v_min_notice     numeric := 0;
  v_hours_before   numeric;
  v_refund_pct     integer := 0;
  v_refund_credits integer := 0;
  v_new_status     public.lesson_status;
  v_package_id     uuid;
  v_package        record;
  v_duration_min   integer;
begin
  select
    id, tenant_id, branch_id, student_id, instructor_id, starts_at, ends_at,
    status, credits_cost, location, location_lat, location_lng, location_place_id
    into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  v_authorized := exists (
      select 1 from public.students s
       where s.id = v_lesson.student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_lesson.student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to cancel lesson %', p_actor, p_lesson_id;
  end if;

  if v_lesson.status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_lesson.status;
  end if;
  if v_lesson.starts_at <= now() then
    raise exception 'lesson % has already started (starts_at=%)',
      p_lesson_id, v_lesson.starts_at
      using errcode = 'check_violation';
  end if;

  select value into v_booking_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id
     and key = 'student_self_booking_policy';
  if not coalesce((v_booking_policy ->> 'students_can_cancel_lessons')::boolean, true) then
    raise exception 'student cancellation is disabled for this tenant'
      using errcode = 'check_violation';
  end if;

  select cl.related_id
    into v_package_id
    from public.credit_ledger cl
   where cl.tenant_id = p_tenant_id
     and cl.student_id = v_lesson.student_id
     and cl.reason = 'package_purchase'
     and cl.related_type = 'package'
     and cl.related_id is not null
     and cl.delta > 0
   order by cl.created_at desc
   limit 1;
  if v_package_id is not null then
    select *
      into v_package
      from public.packages p
     where p.id = v_package_id
       and p.tenant_id = p_tenant_id;
    if found and not coalesce(v_package.cancellation_allowed, true) then
      raise exception 'cancellation is not allowed for this package'
        using errcode = 'check_violation';
    end if;
  end if;

  v_hours_before := greatest(
    0,
    extract(epoch from (v_lesson.starts_at - now())) / 3600.0
  );

  select value into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'cancellation_policy';

  v_min_notice := coalesce((v_policy ->> 'min_notice_hours')::numeric, 0);
  if v_min_notice > 0 and v_hours_before < v_min_notice then
    raise exception 'cancel too late: % hours before < min notice % hours',
      round(v_hours_before, 2), v_min_notice
      using errcode = 'check_violation';
  end if;

  if v_policy is not null then
    select tier into v_tier
      from jsonb_array_elements(coalesce(v_policy -> 'tiers', '[]'::jsonb)) as tier
     where v_hours_before >= (tier ->> 'hours_before')::numeric
     order by (tier ->> 'hours_before')::numeric desc
     limit 1;
    if v_tier is not null then
      v_refund_pct := coalesce((v_tier ->> 'refund_pct')::integer, 0);
    end if;
  end if;

  v_refund_credits := round(v_lesson.credits_cost * v_refund_pct / 100.0)::integer;
  if v_refund_credits < 0 then v_refund_credits := 0; end if;
  if v_refund_credits > v_lesson.credits_cost then
    v_refund_credits := v_lesson.credits_cost;
  end if;

  v_new_status := case
    when v_refund_credits > 0 then 'cancelled_with_refund'::public.lesson_status
    else 'cancelled_no_refund'::public.lesson_status
  end;

  update public.lessons
     set status                 = v_new_status,
         cancellation_reason    = p_reason,
         cancelled_hours_before = round(v_hours_before, 2),
         refunded_credits       = v_refund_credits
   where id = p_lesson_id and tenant_id = p_tenant_id;

  if v_refund_credits > 0 then
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, v_lesson.student_id, v_refund_credits, 'lesson_refund',
      'lesson', v_lesson.id,
      format('Les zelf geannuleerd (%s%% refund, %s u vooraf)', v_refund_pct, round(v_hours_before, 1)),
      p_actor
    );
  end if;

  v_duration_min := greatest(
    15,
    round(extract(epoch from (v_lesson.ends_at - v_lesson.starts_at)) / 60.0)::integer
  );
  perform public._create_lesson_slot_recovery_request(
    p_tenant_id,
    v_lesson.branch_id,
    p_actor,
    v_lesson.id,
    v_lesson.student_id,
    v_lesson.instructor_id,
    v_lesson.starts_at,
    v_lesson.ends_at,
    v_duration_min,
    v_lesson.location,
    v_lesson.location_lat,
    v_lesson.location_lng,
    v_lesson.location_place_id,
    p_reason,
    jsonb_build_object(
      'trigger', 'student_cancel',
      'refund_pct', v_refund_pct,
      'refunded_credits', v_refund_credits
    )
  );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.cancelled', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'reason',           p_reason,
      'hours_before',     round(v_hours_before, 2),
      'refund_pct',       v_refund_pct,
      'refunded_credits', v_refund_credits,
      'status',           v_new_status,
      'self_cancel',      true,
      'slot_recovery',    true
    )
  );

  return v_refund_credits;
end;
$$;

create or replace function public.student_reschedule_lesson(
  p_lesson_id     uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_new_starts_at timestamptz
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson       record;
  v_authorized   boolean;
  v_policy       jsonb;
  v_booking_policy jsonb;
  v_min_notice   numeric := 0;
  v_hours_before numeric;
  v_duration_min integer;
  v_new_ends_at  timestamptz;
  v_package_id   uuid;
  v_package      record;
begin
  select
    id, tenant_id, branch_id, student_id, instructor_id, starts_at, ends_at,
    status, vehicle_id, pickup_service_area_id, location, location_lat,
    location_lng, location_place_id
    into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  v_authorized := exists (
      select 1 from public.students s
       where s.id = v_lesson.student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_lesson.student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to reschedule lesson %', p_actor, p_lesson_id;
  end if;

  if v_lesson.status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_lesson.status;
  end if;
  if v_lesson.starts_at <= now() then
    raise exception 'lesson % has already started (starts_at=%)',
      p_lesson_id, v_lesson.starts_at
      using errcode = 'check_violation';
  end if;
  if p_new_starts_at is null or p_new_starts_at <= now() then
    raise exception 'new start must be in the future'
      using errcode = 'check_violation';
  end if;

  select value into v_booking_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id
     and key = 'student_self_booking_policy';
  if not coalesce((v_booking_policy ->> 'students_can_reschedule_lessons')::boolean, true) then
    raise exception 'student rescheduling is disabled for this tenant'
      using errcode = 'check_violation';
  end if;

  select cl.related_id
    into v_package_id
    from public.credit_ledger cl
   where cl.tenant_id = p_tenant_id
     and cl.student_id = v_lesson.student_id
     and cl.reason = 'package_purchase'
     and cl.related_type = 'package'
     and cl.related_id is not null
     and cl.delta > 0
   order by cl.created_at desc
   limit 1;
  if v_package_id is not null then
    select *
      into v_package
      from public.packages p
     where p.id = v_package_id
       and p.tenant_id = p_tenant_id;
    if found and not coalesce(v_package.rescheduling_allowed, true) then
      raise exception 'rescheduling is not allowed for this package'
        using errcode = 'check_violation';
    end if;
  end if;

  v_hours_before := greatest(
    0,
    extract(epoch from (v_lesson.starts_at - now())) / 3600.0
  );
  select value into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'cancellation_policy';
  v_min_notice := coalesce((v_policy ->> 'min_notice_hours')::numeric, 0);
  if v_min_notice > 0 and v_hours_before < v_min_notice then
    raise exception 'reschedule too late: % hours before < min notice % hours',
      round(v_hours_before, 2), v_min_notice
      using errcode = 'check_violation';
  end if;

  v_duration_min := greatest(
    15,
    round(extract(epoch from (v_lesson.ends_at - v_lesson.starts_at)) / 60.0)::integer
  );
  v_new_ends_at := p_new_starts_at + make_interval(mins => v_duration_min);

  if not public._agenda_slot_is_free(p_tenant_id, v_lesson.instructor_id, p_new_starts_at, v_new_ends_at, p_lesson_id) then
    raise exception 'new slot % overlaps an existing appointment', p_new_starts_at
      using errcode = 'check_violation';
  end if;

  perform public._create_lesson_slot_recovery_request(
    p_tenant_id,
    v_lesson.branch_id,
    p_actor,
    v_lesson.id,
    v_lesson.student_id,
    v_lesson.instructor_id,
    v_lesson.starts_at,
    v_lesson.ends_at,
    v_duration_min,
    v_lesson.location,
    v_lesson.location_lat,
    v_lesson.location_lng,
    v_lesson.location_place_id,
    'Vrijgekomen door leerling verzetting',
    jsonb_build_object(
      'trigger', 'student_reschedule',
      'new_starts_at', p_new_starts_at,
      'new_ends_at', v_new_ends_at
    )
  );

  update public.lessons
     set starts_at = p_new_starts_at,
         ends_at   = v_new_ends_at
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.rescheduled', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'from',             v_lesson.starts_at,
      'to',               p_new_starts_at,
      'duration_min',     v_duration_min,
      'self_reschedule',  true,
      'slot_recovery',    true
    )
  );

  return v_new_ends_at;
end;
$$;

revoke all on function public._create_lesson_slot_recovery_request(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer,
  text, double precision, double precision, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public._create_lesson_slot_recovery_request(
  uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer,
  text, double precision, double precision, text, text, jsonb
) to service_role;

revoke all on function public.student_cancel_lesson(uuid, uuid, uuid, text) from public;
revoke execute on function public.student_cancel_lesson(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.student_cancel_lesson(uuid, uuid, uuid, text) to service_role;

revoke all on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) from public;
revoke execute on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.student_reschedule_lesson(uuid, uuid, uuid, timestamptz) to service_role;

commit;
