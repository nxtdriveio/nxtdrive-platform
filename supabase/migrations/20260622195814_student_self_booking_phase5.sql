-- Smart Booking Engine - phase 5 existing student self-booking.
--
-- Existing students may only self-book when the tenant policy and their latest
-- package rules allow it. The app shows friendly warnings and suggestions, but
-- this RPC is the source of truth for the final mutation/request.

begin;

alter table public.packages
  add column if not exists self_booking_allowed boolean not null default true,
  add column if not exists rescheduling_allowed boolean not null default true,
  add column if not exists cancellation_allowed boolean not null default true,
  add column if not exists max_lessons_per_week integer,
  add column if not exists allowed_lesson_durations jsonb not null default '[]'::jsonb,
  add column if not exists allowed_lesson_types jsonb not null default '["lesson"]'::jsonb,
  add column if not exists fixed_instructor_only boolean not null default false,
  add column if not exists requires_paid_installment boolean not null default false,
  add column if not exists credit_release_strategy text not null default 'available_credit';

alter table public.packages
  drop constraint if exists packages_self_booking_max_lessons_per_week_ck;
alter table public.packages
  add constraint packages_self_booking_max_lessons_per_week_ck
  check (max_lessons_per_week is null or max_lessons_per_week between 1 and 21);

alter table public.packages
  drop constraint if exists packages_allowed_lesson_durations_json_ck;
alter table public.packages
  add constraint packages_allowed_lesson_durations_json_ck
  check (jsonb_typeof(allowed_lesson_durations) = 'array');

alter table public.packages
  drop constraint if exists packages_allowed_lesson_types_json_ck;
alter table public.packages
  add constraint packages_allowed_lesson_types_json_ck
  check (jsonb_typeof(allowed_lesson_types) = 'array');

alter table public.packages
  drop constraint if exists packages_credit_release_strategy_ck;
alter table public.packages
  add constraint packages_credit_release_strategy_ck
  check (credit_release_strategy in ('available_credit', 'paid_only', 'manual_release'));

comment on column public.packages.self_booking_allowed is
  'Whether students using this package may book lessons themselves, if tenant policy also allows it.';
comment on column public.packages.allowed_lesson_durations is
  'Allowed lesson durations in minutes for self-booking; empty array means tenant/default durations.';
comment on column public.packages.fixed_instructor_only is
  'When true, self-booking must use the student''s most recent instructor.';

create or replace function public.student_self_book_lesson(
  p_tenant_id uuid,
  p_actor uuid,
  p_student_id uuid,
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_min integer,
  p_location text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_location_place_id text default null,
  p_score integer default 0,
  p_reason text default null,
  p_warnings jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_student record;
  v_policy jsonb;
  v_enabled boolean := false;
  v_students_can_book boolean := false;
  v_manual_approval boolean := false;
  v_instructor_approval boolean := false;
  v_student_final_confirmation boolean := false;
  v_allow_unpaid_invoice boolean := false;
  v_allow_without_credit boolean := false;
  v_max_future integer := 2;
  v_max_week integer := 2;
  v_min_notice numeric := 24;
  v_window_days integer := 30;
  v_balance integer := 0;
  v_cost integer;
  v_ends_at timestamptz;
  v_future_count integer := 0;
  v_week_count integer := 0;
  v_has_open_invoice boolean := false;
  v_package record;
  v_package_id uuid;
  v_fixed_instructor uuid;
  v_requires_backoffice boolean := false;
  v_requires_instructor boolean := false;
  v_request_status text;
  v_request_id uuid;
  v_candidate_id uuid;
  v_lesson_id uuid;
  v_deadline timestamptz := now() + interval '48 hours';
begin
  if p_actor is null then
    raise exception 'actor is required';
  end if;
  if p_student_id is null or p_instructor_id is null then
    raise exception 'student and instructor are required';
  end if;
  if p_duration_min is null or p_duration_min < 15 or p_duration_min > 240 then
    raise exception 'duration must be between 15 and 240 minutes';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'start must be in the future' using errcode = 'check_violation';
  end if;
  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then
    raise exception 'invalid latitude';
  end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then
    raise exception 'invalid longitude';
  end if;
  if jsonb_typeof(coalesce(p_warnings, '[]'::jsonb)) <> 'array' then
    raise exception 'warnings must be an array';
  end if;

  select *
    into v_student
    from public.students
   where id = p_student_id
     and tenant_id = p_tenant_id
   for update;
  if v_student.id is null then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if not coalesce(v_student.active, true) then
    raise exception 'student is inactive';
  end if;

  if not (
    v_student.user_id = p_actor
    or exists (
      select 1
        from public.student_guardians g
       where g.student_id = p_student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    )
  ) then
    raise exception 'actor % not authorized to self-book for student %',
      p_actor,
      p_student_id;
  end if;

  select value
    into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id
     and key = 'student_self_booking_policy';
  v_policy := coalesce(v_policy, '{}'::jsonb);

  v_enabled := coalesce((v_policy ->> 'self_booking_enabled')::boolean, false);
  v_students_can_book := coalesce((v_policy ->> 'students_can_book_lessons')::boolean, false);
  v_manual_approval := coalesce((v_policy ->> 'manual_approval_required')::boolean, false);
  v_instructor_approval := coalesce((v_policy ->> 'instructor_approval_required')::boolean, false);
  v_student_final_confirmation := coalesce((v_policy ->> 'student_final_confirmation_required')::boolean, false);
  v_allow_unpaid_invoice := coalesce((v_policy ->> 'allow_booking_with_unpaid_invoice')::boolean, false);
  v_allow_without_credit := coalesce((v_policy ->> 'allow_booking_without_sufficient_credit')::boolean, false);
  v_max_future := coalesce((v_policy ->> 'max_future_bookings_per_student')::integer, 2);
  v_max_week := coalesce((v_policy ->> 'max_lessons_per_week')::integer, 2);
  v_min_notice := coalesce((v_policy ->> 'min_notice_hours_for_booking')::numeric, 24);
  v_window_days := coalesce((v_policy ->> 'booking_window_days')::integer, 30);

  if not v_enabled or not v_students_can_book then
    raise exception 'student self-booking is disabled for this tenant'
      using errcode = 'check_violation';
  end if;
  if v_max_future < 1 or v_max_future > 50 then
    raise exception 'invalid max_future_bookings_per_student';
  end if;
  if v_max_week < 1 or v_max_week > 21 then
    raise exception 'invalid max_lessons_per_week';
  end if;
  if v_min_notice < 0 or v_min_notice > 8760 then
    raise exception 'invalid min_notice_hours_for_booking';
  end if;
  if v_window_days < 1 or v_window_days > 365 then
    raise exception 'invalid booking_window_days';
  end if;

  if p_starts_at < now() + make_interval(secs => (v_min_notice * 3600)::integer) then
    raise exception 'booking too soon: min notice is % hours', v_min_notice
      using errcode = 'check_violation';
  end if;
  if p_starts_at > now() + make_interval(days => v_window_days) then
    raise exception 'booking outside window: % days', v_window_days
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
      from public.memberships m
     where m.tenant_id = p_tenant_id
       and m.user_id = p_instructor_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %',
      p_instructor_id,
      p_tenant_id;
  end if;

  if v_student.branch_id is not null and not exists (
    select 1
      from public.memberships m
     where m.tenant_id = p_tenant_id
       and m.user_id = p_instructor_id
       and m.role in ('instructor', 'tenant_admin')
       and (
         coalesce(m.branch_scope_type, 'all') <> 'branches'
         or exists (
         select 1
           from public.membership_branches mb
          where mb.membership_id = m.id
            and mb.branch_id = v_student.branch_id
         )
       )
  ) then
    raise exception 'instructor cannot serve this student branch';
  end if;

  select coalesce(sum(delta), 0)::integer
    into v_balance
    from public.credit_ledger
   where tenant_id = p_tenant_id
     and student_id = p_student_id;
  v_cost := p_duration_min;

  select cl.related_id
    into v_package_id
    from public.credit_ledger cl
   where cl.tenant_id = p_tenant_id
     and cl.student_id = p_student_id
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

    if not found then
      v_package_id := null;
    end if;
  end if;

  if v_package_id is not null then
    if not coalesce(v_package.self_booking_allowed, true) then
      raise exception 'self-booking is not allowed for this package'
        using errcode = 'check_violation';
    end if;
    if coalesce(v_package.requires_paid_installment, false)
       and not v_allow_unpaid_invoice
       and exists (
         select 1
           from public.invoices i
          where i.tenant_id = p_tenant_id
            and i.student_id = p_student_id
            and i.status = 'open'
            and i.kind = 'invoice'
            and coalesce(i.amount_paid_cents, 0) < greatest(i.total_cents, 0)
       ) then
      raise exception 'package requires a paid installment before booking'
        using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(v_package.allowed_lesson_durations, '[]'::jsonb)) > 0
       and not exists (
         select 1
           from jsonb_array_elements_text(v_package.allowed_lesson_durations) d(value)
          where d.value ~ '^\d+$'
            and d.value::integer = p_duration_min
       ) then
      raise exception 'duration % is not allowed for this package', p_duration_min
        using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(v_package.allowed_lesson_types, '[]'::jsonb)) > 0
       and not exists (
         select 1
           from jsonb_array_elements_text(v_package.allowed_lesson_types) t(value)
          where t.value = 'lesson'
       ) then
      raise exception 'lesson self-booking is not allowed for this package'
        using errcode = 'check_violation';
    end if;
    v_max_week := coalesce(v_package.max_lessons_per_week, v_max_week);
    if coalesce(v_package.fixed_instructor_only, false) then
      select l.instructor_id
        into v_fixed_instructor
        from public.lessons l
       where l.tenant_id = p_tenant_id
         and l.student_id = p_student_id
         and l.status in ('planned', 'in_progress', 'completed')
       order by l.starts_at desc
       limit 1;
      if v_fixed_instructor is not null and v_fixed_instructor <> p_instructor_id then
        raise exception 'package requires the existing instructor'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  select exists (
    select 1
      from public.invoices i
     where i.tenant_id = p_tenant_id
       and i.student_id = p_student_id
       and i.status = 'open'
       and i.kind = 'invoice'
       and coalesce(i.amount_paid_cents, 0) < greatest(i.total_cents, 0)
  ) into v_has_open_invoice;
  if v_has_open_invoice and not v_allow_unpaid_invoice then
    raise exception 'open unpaid invoice blocks self-booking'
      using errcode = 'check_violation';
  end if;

  select count(*)::integer
    into v_future_count
    from public.lessons l
   where l.tenant_id = p_tenant_id
     and l.student_id = p_student_id
     and l.status = 'planned'
     and l.starts_at > now();
  if v_future_count >= v_max_future then
    raise exception 'max future bookings reached (% of %)',
      v_future_count,
      v_max_future
      using errcode = 'check_violation';
  end if;

  select count(*)::integer
    into v_week_count
    from public.lessons l
   where l.tenant_id = p_tenant_id
     and l.student_id = p_student_id
     and l.status = 'planned'
     and l.starts_at >= date_trunc('week', p_starts_at)
     and l.starts_at < date_trunc('week', p_starts_at) + interval '7 days';
  if v_week_count >= v_max_week then
    raise exception 'max lessons per week reached (% of %)',
      v_week_count,
      v_max_week
      using errcode = 'check_violation';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);
  if not public._agenda_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'slot overlaps an existing appointment'
      using errcode = 'check_violation';
  end if;

  v_requires_backoffice := v_manual_approval or (v_balance < v_cost and v_allow_without_credit);
  v_requires_instructor := v_instructor_approval;

  if v_balance < v_cost and not v_allow_without_credit then
    raise exception 'insufficient tegoed: balance % min < cost % min',
      v_balance,
      v_cost
      using errcode = 'check_violation';
  end if;

  v_request_status := case
    when v_requires_backoffice then 'pending_backoffice'
    when v_requires_instructor then 'pending_instructor'
    else 'confirmed'
  end;

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
    selected_candidate_id,
    requires_backoffice_confirmation,
    requires_instructor_confirmation,
    requires_student_confirmation,
    confirmation_deadline_at,
    metadata,
    created_by
  ) values (
    p_tenant_id,
    v_student.branch_id,
    'student_self_book',
    case
      when exists (
        select 1 from public.student_guardians g
         where g.student_id = p_student_id
           and g.tenant_id = p_tenant_id
           and g.user_id = p_actor
      ) and v_student.user_id <> p_actor then 'guardian'
      else 'student'
    end,
    'lesson',
    v_request_status,
    p_student_id,
    p_duration_min,
    p_instructor_id,
    nullif(left(coalesce(p_location, ''), 200), ''),
    p_location_lat,
    p_location_lng,
    nullif(left(coalesce(p_location_place_id, ''), 300), ''),
    nullif(left(coalesce(p_location, ''), 200), ''),
    null,
    v_requires_backoffice,
    v_requires_instructor,
    v_student_final_confirmation,
    case when v_request_status = 'confirmed' then null else v_deadline end,
    jsonb_build_object(
      'phase', 'student_self_booking',
      'balance_minutes', v_balance,
      'cost_minutes', v_cost,
      'latest_package_id', v_package_id,
      'student_final_confirmation_recorded', v_student_final_confirmation
    ),
    p_actor
  )
  returning id into v_request_id;

  insert into public.booking_candidates (
    booking_request_id,
    tenant_id,
    branch_id,
    rank,
    instructor_id,
    starts_at,
    ends_at,
    duration_min,
    pickup_location,
    pickup_lat,
    pickup_lng,
    pickup_place_id,
    pickup_formatted_address,
    score,
    score_factors,
    warnings,
    validation,
    reason,
    status,
    metadata
  ) values (
    v_request_id,
    p_tenant_id,
    v_student.branch_id,
    1,
    p_instructor_id,
    p_starts_at,
    v_ends_at,
    p_duration_min,
    nullif(left(coalesce(p_location, ''), 200), ''),
    p_location_lat,
    p_location_lng,
    nullif(left(coalesce(p_location_place_id, ''), 300), ''),
    nullif(left(coalesce(p_location, ''), 200), ''),
    coalesce(p_score, 0),
    '[]'::jsonb,
    coalesce(p_warnings, '[]'::jsonb),
    jsonb_build_object('source', 'student_self_booking_rpc'),
    nullif(left(coalesce(p_reason, ''), 500), ''),
    case when v_request_status = 'confirmed' then 'confirmed' else 'selected' end,
    jsonb_build_object('selected_by', 'student_pwa')
  )
  returning id into v_candidate_id;

  update public.booking_requests
     set selected_candidate_id = v_candidate_id
   where id = v_request_id;

  perform public._insert_booking_event(
    p_tenant_id,
    v_student.branch_id,
    v_request_id,
    v_candidate_id,
    null,
    p_actor,
    'student_self_booking.selected',
    null,
    jsonb_build_object(
      'instructor_id', p_instructor_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at,
      'duration_min', p_duration_min,
      'status', v_request_status
    ),
    jsonb_build_object('score', coalesce(p_score, 0), 'warnings', coalesce(p_warnings, '[]'::jsonb))
  );

  if v_request_status = 'confirmed' then
    insert into public.lessons (
      tenant_id,
      branch_id,
      instructor_id,
      student_id,
      starts_at,
      ends_at,
      duration_min,
      buffer_min,
      status,
      location,
      credits_cost,
      created_by,
      location_lat,
      location_lng,
      location_place_id
    ) values (
      p_tenant_id,
      v_student.branch_id,
      p_instructor_id,
      p_student_id,
      p_starts_at,
      v_ends_at,
      p_duration_min,
      0,
      'planned',
      nullif(left(coalesce(p_location, ''), 200), ''),
      v_cost,
      p_actor,
      p_location_lat,
      p_location_lng,
      nullif(left(coalesce(p_location_place_id, ''), 300), '')
    )
    returning id into v_lesson_id;

    insert into public.credit_ledger (
      tenant_id,
      student_id,
      delta,
      reason,
      related_type,
      related_id,
      note,
      actor_user_id
    ) values (
      p_tenant_id,
      p_student_id,
      -v_cost,
      'lesson_consumed',
      'lesson',
      v_lesson_id,
      'Les zelf gepland via leerlingapp',
      p_actor
    );

    update public.booking_requests
       set confirmed_entity_type = 'lesson',
           confirmed_entity_id = v_lesson_id
     where id = v_request_id;

    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor,
      p_tenant_id,
      'lesson.self_booked',
      'lesson',
      v_lesson_id::text,
      jsonb_build_object(
        'booking_request_id', v_request_id,
        'booking_candidate_id', v_candidate_id,
        'student_id', p_student_id,
        'instructor_id', p_instructor_id,
        'starts_at', p_starts_at,
        'ends_at', v_ends_at,
        'duration_min', p_duration_min,
        'credits_cost', v_cost
      )
    );

    perform public._insert_booking_event(
      p_tenant_id,
      v_student.branch_id,
      v_request_id,
      v_candidate_id,
      null,
      p_actor,
      'student_self_booking.confirmed',
      null,
      jsonb_build_object('lesson_id', v_lesson_id),
      '{}'::jsonb
    );

    return jsonb_build_object(
      'status', 'confirmed',
      'lesson_id', v_lesson_id,
      'booking_request_id', v_request_id
    );
  end if;

  if v_requires_backoffice then
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      status,
      required,
      expires_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_student.branch_id,
      v_request_id,
      v_candidate_id,
      'backoffice',
      'pending',
      true,
      v_deadline,
      jsonb_build_object('reason', case when v_balance < v_cost then 'insufficient_credit' else 'manual_approval_required' end),
      p_actor
    );
  end if;

  if v_requires_instructor then
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      actor_user_id,
      status,
      required,
      expires_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_student.branch_id,
      v_request_id,
      v_candidate_id,
      'instructor',
      p_instructor_id,
      'pending',
      true,
      v_deadline,
      jsonb_build_object('reason', 'instructor_approval_required'),
      p_actor
    );
  end if;

  if v_student_final_confirmation then
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      actor_user_id,
      status,
      required,
      expires_at,
      responded_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_student.branch_id,
      v_request_id,
      v_candidate_id,
      'student',
      p_actor,
      'accepted',
      true,
      v_deadline,
      now(),
      jsonb_build_object('accepted_during_self_booking', true),
      p_actor
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor,
    p_tenant_id,
    'lesson.self_booking_requested',
    'booking_request',
    v_request_id::text,
    jsonb_build_object(
      'booking_candidate_id', v_candidate_id,
      'student_id', p_student_id,
      'instructor_id', p_instructor_id,
      'starts_at', p_starts_at,
      'ends_at', v_ends_at,
      'duration_min', p_duration_min,
      'status', v_request_status,
      'balance_minutes', v_balance,
      'cost_minutes', v_cost
    )
  );

  return jsonb_build_object(
    'status', v_request_status,
    'booking_request_id', v_request_id,
    'booking_candidate_id', v_candidate_id
  );
end;
$$;

revoke all on function public.student_self_book_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, text,
  double precision, double precision, text, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.student_self_book_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, text,
  double precision, double precision, text, integer, text, jsonb
) to service_role;

commit;
