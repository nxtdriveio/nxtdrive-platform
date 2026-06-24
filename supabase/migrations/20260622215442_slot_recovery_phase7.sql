-- Phase 7: canonical Slot Recovery Engine.
--
-- A cancelled/rescheduled lesson creates a booking_request with
-- source = slot_recovery. This migration lets that one recovered slot fan out
-- to several eligible students, records their interest, supports staff
-- acceptance/final confirmations, and atomically creates the replacement
-- lesson once all required confirmations are accepted.

begin;

alter table public.booking_candidates
  add column if not exists candidate_student_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'booking_candidates_candidate_student_tenant_fkey'
  ) then
    alter table public.booking_candidates
      add constraint booking_candidates_candidate_student_tenant_fkey
      foreign key (candidate_student_id, tenant_id)
      references public.students(id, tenant_id)
      on delete cascade;
  end if;
end;
$$;

drop index if exists public.uq_booking_candidates_slot;

create unique index if not exists uq_booking_candidates_slot_standard
  on public.booking_candidates (
    booking_request_id,
    instructor_id,
    starts_at,
    ends_at
  )
  where candidate_student_id is null;

create unique index if not exists uq_booking_candidates_slot_recovery_student
  on public.booking_candidates (
    booking_request_id,
    candidate_student_id
  )
  where candidate_student_id is not null;

create index if not exists idx_booking_candidates_candidate_student
  on public.booking_candidates (
    tenant_id,
    candidate_student_id,
    status,
    starts_at
  )
  where candidate_student_id is not null;

create or replace function public.replace_booking_candidates(
  p_booking_request_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_candidates jsonb
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_item jsonb;
  v_count integer := 0;
  v_candidate_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration integer;
  v_instructor uuid;
  v_vehicle uuid;
  v_candidate_student uuid;
begin
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    raise exception 'candidates must be a JSON array';
  end if;

  select * into v_request
    from public.booking_requests
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found in tenant %', p_booking_request_id, p_tenant_id;
  end if;

  if not (
    (p_actor is null and v_request.requester_type = 'public_lead')
    or public._tenant_staff_authorized(p_actor, p_tenant_id)
  ) then
    raise exception 'actor is not authorized to replace booking candidates';
  end if;

  delete from public.booking_candidates
   where booking_request_id = p_booking_request_id
     and status in ('generated', 'selected', 'rejected', 'expired');

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    v_instructor := nullif(v_item->>'instructor_id', '')::uuid;
    v_vehicle := nullif(v_item->>'vehicle_id', '')::uuid;
    v_candidate_student := nullif(v_item->>'candidate_student_id', '')::uuid;
    v_starts_at := (v_item->>'starts_at')::timestamptz;
    v_ends_at := (v_item->>'ends_at')::timestamptz;
    v_duration := coalesce(
      nullif(v_item->>'duration_min', '')::integer,
      ceil(extract(epoch from (v_ends_at - v_starts_at)) / 60.0)::integer
    );

    if v_instructor is null then
      raise exception 'candidate instructor_id is required';
    end if;
    if not exists (
      select 1 from public.memberships m
       where m.tenant_id = p_tenant_id
         and m.user_id = v_instructor
         and m.role in ('tenant_admin', 'instructor', 'branch_manager', 'planner')
    ) then
      raise exception 'candidate instructor % is not a tenant staff member', v_instructor;
    end if;
    if v_candidate_student is not null and not exists (
      select 1
        from public.students s
       where s.id = v_candidate_student
         and s.tenant_id = p_tenant_id
         and (v_request.branch_id is null or s.branch_id = v_request.branch_id)
    ) then
      raise exception 'candidate student % is not in scope for this request', v_candidate_student;
    end if;

    if v_candidate_student is null then
      insert into public.booking_candidates (
        booking_request_id, tenant_id, branch_id, rank, instructor_id,
        vehicle_id, starts_at, ends_at, duration_min, pickup_location,
        pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address,
        score, score_factors, warnings, blocking_reasons, validation,
        route_status, route_travel_to_min, route_travel_from_min,
        route_needs_confirm, reason, status, metadata
      ) values (
        p_booking_request_id, p_tenant_id, v_request.branch_id,
        coalesce(nullif(v_item->>'rank', '')::integer, v_count + 1),
        v_instructor, v_vehicle, v_starts_at, v_ends_at, v_duration,
        nullif(v_item->>'pickup_location', ''),
        nullif(v_item->>'pickup_lat', '')::double precision,
        nullif(v_item->>'pickup_lng', '')::double precision,
        nullif(v_item->>'pickup_place_id', ''),
        nullif(v_item->>'pickup_formatted_address', ''),
        coalesce(nullif(v_item->>'score', '')::integer, 0),
        coalesce(v_item->'score_factors', '[]'::jsonb),
        coalesce(v_item->'warnings', '[]'::jsonb),
        coalesce(v_item->'blocking_reasons', '[]'::jsonb),
        coalesce(v_item->'validation', '{}'::jsonb),
        nullif(v_item->>'route_status', ''),
        nullif(v_item->>'route_travel_to_min', '')::integer,
        nullif(v_item->>'route_travel_from_min', '')::integer,
        coalesce(nullif(v_item->>'route_needs_confirm', '')::boolean, false),
        nullif(v_item->>'reason', ''),
        coalesce(nullif(v_item->>'status', ''), 'generated'),
        coalesce(v_item->'metadata', '{}'::jsonb)
      )
      on conflict (booking_request_id, instructor_id, starts_at, ends_at)
        where candidate_student_id is null
      do update set
        rank = excluded.rank,
        vehicle_id = excluded.vehicle_id,
        duration_min = excluded.duration_min,
        pickup_location = excluded.pickup_location,
        pickup_lat = excluded.pickup_lat,
        pickup_lng = excluded.pickup_lng,
        pickup_place_id = excluded.pickup_place_id,
        pickup_formatted_address = excluded.pickup_formatted_address,
        score = excluded.score,
        score_factors = excluded.score_factors,
        warnings = excluded.warnings,
        blocking_reasons = excluded.blocking_reasons,
        validation = excluded.validation,
        route_status = excluded.route_status,
        route_travel_to_min = excluded.route_travel_to_min,
        route_travel_from_min = excluded.route_travel_from_min,
        route_needs_confirm = excluded.route_needs_confirm,
        reason = excluded.reason,
        metadata = excluded.metadata,
        status = case
          when public.booking_candidates.status in ('held', 'confirmed') then public.booking_candidates.status
          else excluded.status
        end
      returning id into v_candidate_id;
    else
      insert into public.booking_candidates (
        booking_request_id, tenant_id, branch_id, rank, instructor_id,
        candidate_student_id, vehicle_id, starts_at, ends_at, duration_min,
        pickup_location, pickup_lat, pickup_lng, pickup_place_id,
        pickup_formatted_address, score, score_factors, warnings,
        blocking_reasons, validation, route_status, route_travel_to_min,
        route_travel_from_min, route_needs_confirm, reason, status, metadata
      ) values (
        p_booking_request_id, p_tenant_id, v_request.branch_id,
        coalesce(nullif(v_item->>'rank', '')::integer, v_count + 1),
        v_instructor, v_candidate_student, v_vehicle, v_starts_at, v_ends_at,
        v_duration, nullif(v_item->>'pickup_location', ''),
        nullif(v_item->>'pickup_lat', '')::double precision,
        nullif(v_item->>'pickup_lng', '')::double precision,
        nullif(v_item->>'pickup_place_id', ''),
        nullif(v_item->>'pickup_formatted_address', ''),
        coalesce(nullif(v_item->>'score', '')::integer, 0),
        coalesce(v_item->'score_factors', '[]'::jsonb),
        coalesce(v_item->'warnings', '[]'::jsonb),
        coalesce(v_item->'blocking_reasons', '[]'::jsonb),
        coalesce(v_item->'validation', '{}'::jsonb),
        nullif(v_item->>'route_status', ''),
        nullif(v_item->>'route_travel_to_min', '')::integer,
        nullif(v_item->>'route_travel_from_min', '')::integer,
        coalesce(nullif(v_item->>'route_needs_confirm', '')::boolean, false),
        nullif(v_item->>'reason', ''),
        coalesce(nullif(v_item->>'status', ''), 'generated'),
        coalesce(v_item->'metadata', '{}'::jsonb)
      )
      on conflict (booking_request_id, candidate_student_id)
        where candidate_student_id is not null
      do update set
        rank = excluded.rank,
        instructor_id = excluded.instructor_id,
        vehicle_id = excluded.vehicle_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        duration_min = excluded.duration_min,
        pickup_location = excluded.pickup_location,
        pickup_lat = excluded.pickup_lat,
        pickup_lng = excluded.pickup_lng,
        pickup_place_id = excluded.pickup_place_id,
        pickup_formatted_address = excluded.pickup_formatted_address,
        score = excluded.score,
        score_factors = excluded.score_factors,
        warnings = excluded.warnings,
        blocking_reasons = excluded.blocking_reasons,
        validation = excluded.validation,
        route_status = excluded.route_status,
        route_travel_to_min = excluded.route_travel_to_min,
        route_travel_from_min = excluded.route_travel_from_min,
        route_needs_confirm = excluded.route_needs_confirm,
        reason = excluded.reason,
        metadata = excluded.metadata,
        status = case
          when public.booking_candidates.status in ('held', 'confirmed') then public.booking_candidates.status
          else excluded.status
        end
      returning id into v_candidate_id;
    end if;

    perform public._insert_booking_event(
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      v_candidate_id,
      null,
      p_actor,
      'booking_candidate.generated',
      null,
      v_item,
      '{}'::jsonb
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 and v_request.status not in ('confirmed', 'cancelled') then
    update public.booking_requests
       set status = 'candidates_ready'
     where id = p_booking_request_id
       and tenant_id = p_tenant_id;
  end if;

  perform public._insert_booking_event(
    p_tenant_id,
    v_request.branch_id,
    p_booking_request_id,
    null,
    null,
    p_actor,
    'booking_candidates.replaced',
    null,
    jsonb_build_object('count', v_count),
    '{}'::jsonb
  );

  return v_count;
end;
$$;

drop policy if exists booking_requests_select_members on public.booking_requests;
create policy booking_requests_select_members on public.booking_requests
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.students s
       where s.id = booking_requests.student_id
         and s.tenant_id = booking_requests.tenant_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.student_guardians g
       where g.student_id = booking_requests.student_id
         and g.tenant_id = booking_requests.tenant_id
         and g.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_candidates bc
        join public.students s
          on s.id = bc.candidate_student_id
         and s.tenant_id = bc.tenant_id
       where bc.booking_request_id = booking_requests.id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_candidates bc
        join public.student_guardians g
          on g.student_id = bc.candidate_student_id
         and g.tenant_id = bc.tenant_id
       where bc.booking_request_id = booking_requests.id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_candidates_select_members on public.booking_candidates;
create policy booking_candidates_select_members on public.booking_candidates
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.students s
       where s.id = booking_candidates.candidate_student_id
         and s.tenant_id = booking_candidates.tenant_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.student_guardians g
       where g.student_id = booking_candidates.candidate_student_id
         and g.tenant_id = booking_candidates.tenant_id
         and g.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_candidates.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_candidates.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_candidate_preferences_select_members on public.booking_candidate_preferences;
create policy booking_candidate_preferences_select_members on public.booking_candidate_preferences
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.booking_candidates bc
        join public.students s
          on s.id in (bc.candidate_student_id, (
            select br.student_id
              from public.booking_requests br
             where br.id = bc.booking_request_id
          ))
         and s.tenant_id = bc.tenant_id
       where bc.id = booking_candidate_preferences.booking_candidate_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_candidates bc
        join public.student_guardians g
          on g.student_id in (bc.candidate_student_id, (
            select br.student_id
              from public.booking_requests br
             where br.id = bc.booking_request_id
          ))
         and g.tenant_id = bc.tenant_id
       where bc.id = booking_candidate_preferences.booking_candidate_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_confirmations_select_members on public.booking_confirmations;
create policy booking_confirmations_select_members on public.booking_confirmations
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or actor_user_id = (select auth.uid())
    or exists (
      select 1
        from public.booking_candidates bc
        join public.students s
          on s.id in (bc.candidate_student_id, (
            select br.student_id
              from public.booking_requests br
             where br.id = bc.booking_request_id
          ))
         and s.tenant_id = bc.tenant_id
       where bc.id = booking_confirmations.booking_candidate_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_candidates bc
        join public.student_guardians g
          on g.student_id in (bc.candidate_student_id, (
            select br.student_id
              from public.booking_requests br
             where br.id = bc.booking_request_id
          ))
         and g.tenant_id = bc.tenant_id
       where bc.id = booking_confirmations.booking_candidate_id
         and g.user_id = (select auth.uid())
    )
  );

drop policy if exists booking_events_select_members on public.booking_events;
create policy booking_events_select_members on public.booking_events
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or actor_user_id = (select auth.uid())
    or exists (
      select 1
        from public.booking_candidates bc
        join public.students s
          on s.id = bc.candidate_student_id
         and s.tenant_id = bc.tenant_id
       where bc.booking_request_id = booking_events.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_candidates bc
        join public.student_guardians g
          on g.student_id = bc.candidate_student_id
         and g.tenant_id = bc.tenant_id
       where bc.booking_request_id = booking_events.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

create or replace function public.generate_slot_recovery_candidates(
  p_booking_request_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_max_candidates integer default 8,
  p_valid_minutes integer default 120
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration integer;
  v_original_student uuid;
  v_count integer := 0;
begin
  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'actor is not authorized to generate recovery candidates';
  end if;

  select * into v_request
    from public.booking_requests
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
     and source = 'slot_recovery'
   for update;
  if v_request.id is null then
    raise exception 'slot recovery request not found';
  end if;
  if v_request.status in ('confirmed', 'cancelled', 'expired', 'failed') then
    return 0;
  end if;

  v_starts_at := nullif(v_request.metadata->>'starts_at', '')::timestamptz;
  v_ends_at := nullif(v_request.metadata->>'ends_at', '')::timestamptz;
  v_duration := coalesce(
    v_request.requested_duration_min,
    ceil(extract(epoch from (v_ends_at - v_starts_at)) / 60.0)::integer
  );
  v_original_student := nullif(v_request.metadata->>'original_student_id', '')::uuid;

  if v_request.preferred_instructor_id is null then
    raise exception 'slot recovery request has no instructor';
  end if;
  if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
    raise exception 'slot recovery request has invalid slot metadata';
  end if;
  if v_starts_at <= now() then
    update public.booking_requests
       set status = 'expired'
     where id = v_request.id;
    return 0;
  end if;
  if not public._agenda_slot_is_free(
    p_tenant_id,
    v_request.preferred_instructor_id,
    v_starts_at,
    v_ends_at,
    null
  ) then
    update public.booking_requests
       set status = 'failed',
           metadata = metadata || jsonb_build_object('failure_reason', 'slot_unavailable')
     where id = v_request.id;
    perform public._insert_booking_event(
      p_tenant_id, v_request.branch_id, v_request.id, null, null, p_actor,
      'slot_recovery.unavailable', null,
      jsonb_build_object('starts_at', v_starts_at, 'ends_at', v_ends_at),
      '{}'::jsonb
    );
    return 0;
  end if;

  with ranked as (
    select
      s.id as student_id,
      (row_number() over (
        order by
          (case when s.branch_id = v_request.branch_id then 1 else 0 end) desc,
          coalesce(sum(cl.delta), 0) desc,
          s.created_at asc
      ))::integer as rank,
      (
        50
        + case when s.branch_id = v_request.branch_id then 20 else 0 end
        + least(greatest(coalesce(sum(cl.delta), 0)::integer / greatest(v_duration, 1), 0), 10)
        + case when not exists (
            select 1
              from public.lessons l
             where l.tenant_id = p_tenant_id
               and l.student_id = s.id
               and l.status = 'planned'
               and l.starts_at >= now()
          ) then 10 else 0 end
      )::integer as score,
      coalesce(sum(cl.delta), 0)::integer as balance
    from public.students s
    left join public.credit_ledger cl
      on cl.tenant_id = s.tenant_id
     and cl.student_id = s.id
    where s.tenant_id = p_tenant_id
      and coalesce(s.refill_opt_in, false) = true
      and (v_request.branch_id is null or s.branch_id = v_request.branch_id)
      and (v_original_student is null or s.id <> v_original_student)
      and not exists (
        select 1
          from public.lessons l
         where l.tenant_id = p_tenant_id
           and l.student_id = s.id
           and l.status = 'planned'
           and tstzrange(l.starts_at, l.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
      )
    group by s.id, s.branch_id, s.created_at
    having coalesce(sum(cl.delta), 0)::integer >= v_duration
    limit greatest(coalesce(p_max_candidates, 8), 1)
  ),
  inserted as (
    insert into public.booking_candidates (
      booking_request_id,
      tenant_id,
      branch_id,
      rank,
      instructor_id,
      candidate_student_id,
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
      blocking_reasons,
      validation,
      reason,
      status,
      metadata
    )
    select
      v_request.id,
      p_tenant_id,
      v_request.branch_id,
      r.rank,
      v_request.preferred_instructor_id,
      r.student_id,
      v_starts_at,
      v_ends_at,
      v_duration,
      v_request.pickup_location,
      v_request.pickup_lat,
      v_request.pickup_lng,
      v_request.pickup_place_id,
      v_request.pickup_formatted_address,
      r.score,
      jsonb_build_array(
        jsonb_build_object('label', 'Tegoed', 'value', r.balance),
        jsonb_build_object('label', 'Vestiging', 'value', case when v_request.branch_id is null then 'tenant' else 'match' end)
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object('balance_min', r.balance, 'expires_at', now() + make_interval(mins => greatest(coalesce(p_valid_minutes, 120), 5))),
      'Vrijgekomen lesmoment',
      'generated',
      jsonb_build_object(
        'source', 'slot_recovery',
        'notification_status', 'queued',
        'expires_at', now() + make_interval(mins => greatest(coalesce(p_valid_minutes, 120), 5))
      )
    from ranked r
    on conflict (booking_request_id, candidate_student_id)
      where candidate_student_id is not null
    do update set
      rank = excluded.rank,
      instructor_id = excluded.instructor_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      duration_min = excluded.duration_min,
      pickup_location = excluded.pickup_location,
      pickup_lat = excluded.pickup_lat,
      pickup_lng = excluded.pickup_lng,
      pickup_place_id = excluded.pickup_place_id,
      pickup_formatted_address = excluded.pickup_formatted_address,
      score = excluded.score,
      score_factors = excluded.score_factors,
      warnings = excluded.warnings,
      blocking_reasons = excluded.blocking_reasons,
      validation = excluded.validation,
      reason = excluded.reason,
      metadata = public.booking_candidates.metadata || excluded.metadata,
      status = case
        when public.booking_candidates.status in ('selected', 'held', 'confirmed') then public.booking_candidates.status
        else 'generated'
      end
    returning id, candidate_student_id, starts_at, duration_min
  ),
  notified as (
    insert into public.app_notifications (
      tenant_id,
      recipient_user_id,
      type,
      title,
      body,
      link,
      related_type,
      related_id,
      dedupe_key,
      payload
    )
    select
      p_tenant_id,
      recipients.user_id,
      'slot_recovery_invitation',
      'Vrijgekomen lesmoment',
      'Er is een rijles vrijgekomen. Laat weten of je dit moment kunt.',
      '/student',
      'booking_candidate',
      inserted.id::text,
      format('slot-recovery:%s:%s', inserted.id, recipients.user_id),
      jsonb_build_object(
        'booking_request_id', v_request.id,
        'booking_candidate_id', inserted.id,
        'student_id', inserted.candidate_student_id,
        'starts_at', inserted.starts_at,
        'duration_min', inserted.duration_min
      )
    from inserted
    cross join lateral (
      select s.user_id
        from public.students s
       where s.id = inserted.candidate_student_id
         and s.tenant_id = p_tenant_id
         and s.user_id is not null
      union
      select g.user_id
        from public.student_guardians g
       where g.student_id = inserted.candidate_student_id
         and g.tenant_id = p_tenant_id
    ) recipients
    where recipients.user_id is not null
    on conflict (tenant_id, dedupe_key) do nothing
    returning id
  )
  select count(*)::integer into v_count from inserted;

  update public.booking_requests
     set status = case when v_count > 0 then 'candidates_ready' else 'open' end,
         expires_at = greatest(coalesce(expires_at, now()), now() + make_interval(mins => greatest(coalesce(p_valid_minutes, 120), 5)))
   where id = v_request.id;

  perform public._insert_booking_event(
    p_tenant_id, v_request.branch_id, v_request.id, null, null, p_actor,
    'slot_recovery.candidates_generated', null,
    jsonb_build_object('count', v_count, 'max_candidates', p_max_candidates),
    '{}'::jsonb
  );

  return v_count;
end;
$$;

create or replace function public.express_slot_recovery_interest(
  p_booking_candidate_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_candidate public.booking_candidates%rowtype;
  v_request public.booking_requests%rowtype;
  v_requester text;
  v_preference_id uuid;
begin
  select * into v_candidate
    from public.booking_candidates
   where id = p_booking_candidate_id
     and tenant_id = p_tenant_id
   for update;
  if v_candidate.id is null or v_candidate.candidate_student_id is null then
    raise exception 'slot recovery candidate not found';
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_candidate.booking_request_id
     and tenant_id = p_tenant_id
     and source = 'slot_recovery'
   for update;
  if v_request.id is null then
    raise exception 'slot recovery request not found';
  end if;
  if v_request.status in ('confirmed', 'cancelled', 'expired', 'failed') or v_candidate.status in ('rejected', 'expired', 'confirmed') then
    raise exception 'dit herstelmoment is niet meer beschikbaar';
  end if;
  if v_candidate.starts_at <= now() then
    update public.booking_candidates set status = 'expired' where id = v_candidate.id;
    raise exception 'dit herstelmoment is verlopen';
  end if;

  if exists (
    select 1 from public.students s
     where s.id = v_candidate.candidate_student_id
       and s.tenant_id = p_tenant_id
       and s.user_id = p_actor
  ) then
    v_requester := 'student';
  elsif exists (
    select 1 from public.student_guardians g
     where g.student_id = v_candidate.candidate_student_id
       and g.tenant_id = p_tenant_id
       and g.user_id = p_actor
  ) then
    v_requester := 'guardian';
  elsif public._tenant_staff_authorized(p_actor, p_tenant_id) then
    v_requester := 'staff';
  else
    raise exception 'actor is not authorized for this recovery candidate';
  end if;

  update public.booking_candidate_preferences
     set status = 'superseded'
   where booking_request_id = v_request.id
     and booking_candidate_id = v_candidate.id
     and status = 'selected';

  insert into public.booking_candidate_preferences (
    tenant_id,
    branch_id,
    booking_request_id,
    booking_candidate_id,
    preference_rank,
    requester_type,
    selected_by_user_id,
    status,
    metadata
  ) values (
    p_tenant_id,
    v_request.branch_id,
    v_request.id,
    v_candidate.id,
    1,
    v_requester,
    p_actor,
    'selected',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_preference_id;

  update public.booking_candidates
     set status = 'selected',
         metadata = metadata || jsonb_build_object('interest_at', now(), 'interest_actor', p_actor)
   where id = v_candidate.id;

  update public.booking_requests
     set status = 'preference_selected'
   where id = v_request.id
     and status not in ('confirmed', 'cancelled');

  perform public._insert_booking_event(
    p_tenant_id, v_request.branch_id, v_request.id, v_candidate.id, null, p_actor,
    'slot_recovery.interest_submitted', null,
    jsonb_build_object('candidate_student_id', v_candidate.candidate_student_id, 'requester_type', v_requester),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_preference_id;
end;
$$;

create or replace function public.create_slot_recovery_confirmation(
  p_booking_candidate_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_requires_instructor boolean default false,
  p_requires_student_final boolean default true,
  p_valid_minutes integer default 120
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_candidate public.booking_candidates%rowtype;
  v_request public.booking_requests%rowtype;
  v_count integer;
  v_expires_at timestamptz;
begin
  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'actor is not authorized to accept recovery candidates';
  end if;

  select * into v_candidate
    from public.booking_candidates
   where id = p_booking_candidate_id
     and tenant_id = p_tenant_id
     and candidate_student_id is not null
   for update;
  if v_candidate.id is null then
    raise exception 'slot recovery candidate not found';
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_candidate.booking_request_id
     and tenant_id = p_tenant_id
     and source = 'slot_recovery'
   for update;
  if v_request.id is null then
    raise exception 'slot recovery request not found';
  end if;
  if v_request.status in ('confirmed', 'cancelled', 'expired', 'failed') then
    raise exception 'slot recovery request is already closed';
  end if;
  if not exists (
    select 1 from public.booking_candidate_preferences p
     where p.booking_candidate_id = v_candidate.id
       and p.status = 'selected'
  ) then
    raise exception 'candidate has not shown interest yet';
  end if;

  v_expires_at := now() + make_interval(mins => greatest(coalesce(p_valid_minutes, 120), 5));

  v_count := public.create_booking_confirmations_for_candidate(
    v_request.id,
    v_candidate.id,
    p_tenant_id,
    p_actor,
    false,
    coalesce(p_requires_instructor, false),
    coalesce(p_requires_student_final, true),
    null,
    v_expires_at,
    v_expires_at,
    jsonb_build_object('source', 'slot_recovery')
  );

  perform public._insert_booking_event(
    p_tenant_id, v_request.branch_id, v_request.id, v_candidate.id, null, p_actor,
    'slot_recovery.acceptance_requested', null,
    jsonb_build_object(
      'requires_instructor', coalesce(p_requires_instructor, false),
      'requires_student_final', coalesce(p_requires_student_final, true),
      'confirmation_count', v_count
    ),
    '{}'::jsonb
  );

  return v_count;
end;
$$;

create or replace function public.complete_slot_recovery_booking(
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
    raise exception 'slot recovery candidate not found';
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_candidate.booking_request_id
     and tenant_id = p_tenant_id
     and source = 'slot_recovery'
   for update;
  if v_request.id is null then
    raise exception 'slot recovery request not found';
  end if;
  if v_request.status = 'confirmed' and v_request.confirmed_entity_id is not null then
    return v_request.confirmed_entity_id;
  end if;
  if v_request.status in ('cancelled', 'expired', 'failed') then
    raise exception 'slot recovery request is closed';
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
    raise exception 'actor is not authorized to complete this recovery booking';
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
    raise exception 'dit herstelmoment is verlopen';
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
    'Herbezet via slot recovery',
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
    'Les ingepland (slot recovery)',
    v_booking_actor
  );

  update public.booking_candidates
     set status = 'confirmed'
   where id = v_candidate.id;
  update public.booking_candidates
     set status = 'rejected',
         metadata = metadata || jsonb_build_object('rejected_reason', 'slot_recovered_by_other_candidate')
   where booking_request_id = v_request.id
     and id <> v_candidate.id
     and status in ('generated', 'selected', 'held');
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
         metadata = metadata || jsonb_build_object('recovered_lesson_id', v_lesson_id)
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
      'source', 'slot_recovery',
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
    'slot_recovery.lesson_created', null,
    jsonb_build_object('lesson_id', v_lesson_id),
    '{}'::jsonb
  );

  return v_lesson_id;
end;
$$;

revoke all on function public.generate_slot_recovery_candidates(uuid, uuid, uuid, integer, integer) from public;
revoke execute on function public.generate_slot_recovery_candidates(uuid, uuid, uuid, integer, integer) from anon, authenticated;
grant execute on function public.generate_slot_recovery_candidates(uuid, uuid, uuid, integer, integer) to service_role;

revoke all on function public.express_slot_recovery_interest(uuid, uuid, uuid, jsonb) from public;
revoke execute on function public.express_slot_recovery_interest(uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.express_slot_recovery_interest(uuid, uuid, uuid, jsonb) to service_role;

revoke all on function public.create_slot_recovery_confirmation(uuid, uuid, uuid, boolean, boolean, integer) from public;
revoke execute on function public.create_slot_recovery_confirmation(uuid, uuid, uuid, boolean, boolean, integer) from anon, authenticated;
grant execute on function public.create_slot_recovery_confirmation(uuid, uuid, uuid, boolean, boolean, integer) to service_role;

revoke all on function public.complete_slot_recovery_booking(uuid, uuid, uuid) from public;
revoke execute on function public.complete_slot_recovery_booking(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.complete_slot_recovery_booking(uuid, uuid, uuid) to service_role;

comment on function public.generate_slot_recovery_candidates(uuid, uuid, uuid, integer, integer) is
  'Phase 7 slot recovery: finds eligible opted-in students for a freed lesson slot and queues canonical booking candidates.';
comment on function public.express_slot_recovery_interest(uuid, uuid, uuid, jsonb) is
  'Phase 7 slot recovery: records student/guardian/staff interest in a recovered slot candidate.';
comment on function public.create_slot_recovery_confirmation(uuid, uuid, uuid, boolean, boolean, integer) is
  'Phase 7 slot recovery: staff accepts an interested candidate and creates required final confirmations.';
comment on function public.complete_slot_recovery_booking(uuid, uuid, uuid) is
  'Phase 7 slot recovery: atomically creates the replacement lesson after required confirmations are accepted.';

commit;
