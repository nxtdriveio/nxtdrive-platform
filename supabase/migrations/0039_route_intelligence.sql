-- 0039_route_intelligence.sql
-- Fase 3 — Route Intelligence for the Slimme Proeflesplanner.
--
-- Makes the Fase 2 trial-lesson planner spatially aware. We capture a precise
-- pickup location for the lead (via Google Places: place_id, formatted address,
-- lat/lng) and store coordinates on lessons + trial lessons so the suggestion
-- engine can reason about travel time between consecutive appointments.
--
-- The scoring itself stays in the application layer
-- (lib/trial-lessons/suggestions.ts + lib/trial-lessons/route.ts):
--   * Haversine prefilter (cheap, always available)
--   * Google Routes API (Compute Route Matrix) refinement when configured
-- We persist only the *result* of a route calculation on the chosen trial
-- (travel minutes + a status flag) — never raw Google responses.
--
-- Graceful degradation: every coordinate column is nullable. When Google is
-- unconfigured or fails, pickup stays free-text, the engine falls back to
-- Haversine estimates and the trial is flagged route_needs_confirm = true so the
-- instructor confirms manually. Trials remain `provisional` until confirmed.
--
-- All writes continue to flow through the existing SECURITY DEFINER RPCs as
-- service_role; no new client INSERT/UPDATE/DELETE policies are added. The
-- existing select-only RLS already covers the new columns.

-- ---------------------------------------------------------------------------
-- 1. lead_intake_details — precise pickup coordinates
-- ---------------------------------------------------------------------------
alter table public.lead_intake_details
  add column if not exists pickup_lat               double precision,
  add column if not exists pickup_lng               double precision,
  add column if not exists pickup_place_id          text,
  add column if not exists pickup_formatted_address text;

alter table public.lead_intake_details
  drop constraint if exists lead_intake_details_pickup_coords_ck;
alter table public.lead_intake_details
  add constraint lead_intake_details_pickup_coords_ck check (
    -- lat/lng are both present or both absent, and within valid ranges.
    (pickup_lat is null) = (pickup_lng is null)
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lng is null or pickup_lng between -180 and 180)
  );

alter table public.lead_intake_details
  drop constraint if exists lead_intake_details_pickup_place_id_ck;
alter table public.lead_intake_details
  add constraint lead_intake_details_pickup_place_id_ck
    check (char_length(coalesce(pickup_place_id, '')) <= 300);

alter table public.lead_intake_details
  drop constraint if exists lead_intake_details_pickup_addr_ck;
alter table public.lead_intake_details
  add constraint lead_intake_details_pickup_addr_ck
    check (char_length(coalesce(pickup_formatted_address, '')) <= 300);

-- Partial index over geocoded intakes for tenant-scoped spatial scans.
create index if not exists idx_lead_intake_details_pickup_coords
  on public.lead_intake_details (tenant_id, pickup_lat, pickup_lng)
  where pickup_lat is not null;

-- ---------------------------------------------------------------------------
-- 2. lessons — appointment location coordinates (start == end for now)
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column if not exists location_lat      double precision,
  add column if not exists location_lng      double precision,
  add column if not exists location_place_id text;

alter table public.lessons
  drop constraint if exists lessons_location_coords_ck;
alter table public.lessons
  add constraint lessons_location_coords_ck check (
    (location_lat is null) = (location_lng is null)
    and (location_lat is null or location_lat between -90 and 90)
    and (location_lng is null or location_lng between -180 and 180)
  );

alter table public.lessons
  drop constraint if exists lessons_location_place_id_ck;
alter table public.lessons
  add constraint lessons_location_place_id_ck
    check (char_length(coalesce(location_place_id, '')) <= 300);

create index if not exists idx_lessons_location_coords
  on public.lessons (tenant_id, location_lat, location_lng)
  where location_lat is not null;

-- ---------------------------------------------------------------------------
-- 3. trial_lessons — pickup coordinates + persisted route result
-- ---------------------------------------------------------------------------
alter table public.trial_lessons
  add column if not exists pickup_lat               double precision,
  add column if not exists pickup_lng               double precision,
  add column if not exists pickup_place_id          text,
  add column if not exists pickup_formatted_address text,
  -- Route result captured at booking time (no raw Google payloads):
  --   route_status: how travel time was determined for this slot.
  --     'computed'    — Google Routes API returned a real travel time
  --     'estimated'   — Haversine straight-line estimate (Google unavailable)
  --     'unavailable' — no coordinates to compute against
  add column if not exists route_status        text not null default 'unavailable',
  add column if not exists route_travel_to_min   integer,
  add column if not exists route_travel_from_min integer,
  -- True when route fit could not be confirmed and an instructor must check it.
  add column if not exists route_needs_confirm boolean not null default false;

alter table public.trial_lessons
  drop constraint if exists trial_lessons_pickup_coords_ck;
alter table public.trial_lessons
  add constraint trial_lessons_pickup_coords_ck check (
    (pickup_lat is null) = (pickup_lng is null)
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lng is null or pickup_lng between -180 and 180)
  );

alter table public.trial_lessons
  drop constraint if exists trial_lessons_route_status_ck;
alter table public.trial_lessons
  add constraint trial_lessons_route_status_ck
    check (route_status in ('computed', 'estimated', 'unavailable'));

alter table public.trial_lessons
  drop constraint if exists trial_lessons_route_travel_ck;
alter table public.trial_lessons
  add constraint trial_lessons_route_travel_ck check (
    (route_travel_to_min is null or route_travel_to_min between 0 and 600)
    and (route_travel_from_min is null or route_travel_from_min between 0 and 600)
  );

create index if not exists idx_trial_lessons_pickup_coords
  on public.trial_lessons (tenant_id, pickup_lat, pickup_lng)
  where pickup_lat is not null;

-- ---------------------------------------------------------------------------
-- 4. create_lead_with_intake — accept pickup coordinates
--    The runner tracks migrations by filename, so we drop the old signature
--    and recreate it with four appended params (default null) to avoid an
--    ambiguous overload. All existing named-parameter callers keep working.
-- ---------------------------------------------------------------------------
drop function if exists public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text
);

create function public.create_lead_with_intake(
  p_tenant_id                 uuid,
  p_source                    public.lead_source,
  p_full_name                 text,
  p_email                     text,
  p_phone                     text,
  p_applicant_type            public.intake_applicant_type,
  p_date_of_birth             date,
  p_city                      text,
  p_pickup_location           text,
  p_license_goal              public.intake_license_goal,
  p_transmission              public.intake_transmission,
  p_has_driving_experience    boolean,
  p_had_lessons_before        boolean,
  p_has_done_exam             boolean,
  p_theory_status             public.intake_status,
  p_health_declaration_status public.intake_status,
  p_cbr_authorization_status  public.intake_status,
  p_preferred_days            text[],
  p_preferred_times           text[],
  p_weekly_availability       text,
  p_desired_start_date        date,
  p_lessons_per_week          int,
  p_pace                      public.intake_pace,
  p_has_anxiety               boolean,
  p_remarks                   text,
  p_terms_accepted            boolean,
  p_submitted_ip              inet,
  p_user_agent                text,
  p_pickup_lat                double precision default null,
  p_pickup_lng                double precision default null,
  p_pickup_place_id           text default null,
  p_pickup_formatted_address  text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_terms_accepted is not true then
    raise exception 'terms must be accepted';
  end if;

  insert into public.leads (
    tenant_id, status, source, full_name, email, phone,
    submitted_ip, user_agent
  ) values (
    p_tenant_id, 'new', coalesce(p_source, 'website'), p_full_name, p_email,
    p_phone, p_submitted_ip, p_user_agent
  )
  returning id into v_lead_id;

  insert into public.lead_intake_details (
    lead_id, tenant_id, applicant_type, date_of_birth, city, pickup_location,
    pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address,
    license_goal, transmission, has_driving_experience, had_lessons_before,
    has_done_exam, theory_status, health_declaration_status,
    cbr_authorization_status, preferred_days, preferred_times,
    weekly_availability, desired_start_date, lessons_per_week, pace,
    has_anxiety, remarks, terms_accepted, terms_accepted_at
  ) values (
    v_lead_id, p_tenant_id, coalesce(p_applicant_type, 'student'),
    p_date_of_birth, p_city, p_pickup_location,
    p_pickup_lat, p_pickup_lng, p_pickup_place_id, p_pickup_formatted_address,
    p_license_goal, p_transmission,
    p_has_driving_experience, p_had_lessons_before, p_has_done_exam,
    coalesce(p_theory_status, 'unknown'),
    coalesce(p_health_declaration_status, 'unknown'),
    coalesce(p_cbr_authorization_status, 'unknown'),
    coalesce(p_preferred_days, '{}'), coalesce(p_preferred_times, '{}'),
    p_weekly_availability, p_desired_start_date,
    nullif(p_lessons_per_week, 0)::smallint, p_pace, p_has_anxiety, p_remarks,
    true, now()
  );

  insert into public.lead_events (lead_id, tenant_id, event_type, payload)
  values (
    v_lead_id, p_tenant_id, 'created',
    jsonb_build_object('source', coalesce(p_source, 'website')::text, 'via', 'intake_wizard')
  );

  insert into public.audit_log (tenant_id, action, target_type, target_id, payload)
  values (
    p_tenant_id, 'lead.created', 'lead', v_lead_id::text,
    jsonb_build_object('source', coalesce(p_source, 'website')::text, 'via', 'intake_wizard')
  );

  return v_lead_id;
end;
$$;

revoke all on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text
) from public;
revoke execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text
) from anon, authenticated;
grant execute on function public.create_lead_with_intake(
  uuid, public.lead_source, text, text, text, public.intake_applicant_type,
  date, text, text, public.intake_license_goal, public.intake_transmission,
  boolean, boolean, boolean, public.intake_status, public.intake_status,
  public.intake_status, text[], text[], text, date, int, public.intake_pace,
  boolean, text, boolean, inet, text,
  double precision, double precision, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. book_trial_lesson — accept pickup coordinates + route result
--    Drop the 8-arg signature (0037/0038) and recreate with appended params.
-- ---------------------------------------------------------------------------
drop function if exists public.book_trial_lesson(
  uuid, uuid, uuid, timestamptz, integer, text, integer, text
);

create function public.book_trial_lesson(
  p_lead_id              uuid,
  p_tenant_id            uuid,
  p_instructor_id        uuid,
  p_starts_at            timestamptz,
  p_duration_min         integer,
  p_pickup_location      text,
  p_score                integer,
  p_reason               text,
  p_pickup_lat           double precision default null,
  p_pickup_lng           double precision default null,
  p_pickup_place_id      text default null,
  p_pickup_formatted_address text default null,
  p_route_status         text default 'unavailable',
  p_route_travel_to_min  integer default null,
  p_route_travel_from_min integer default null,
  p_route_needs_confirm  boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_ends_at timestamptz;
  v_route_status text;
begin
  if p_duration_min is null or p_duration_min not in (60, 90, 120) then
    raise exception 'trial duration must be 60, 90 or 120 minutes';
  end if;

  v_route_status := coalesce(p_route_status, 'unavailable');
  if v_route_status not in ('computed', 'estimated', 'unavailable') then
    raise exception 'invalid route_status %', v_route_status;
  end if;

  -- Lead must exist in this tenant.
  if not exists (
    select 1 from public.leads
     where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  -- Instructor must be a member of the tenant.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- A confirmed trial blocks any new booking — it must be cancelled/rejected
  -- first. (Provisional picks may be superseded; see below.)
  if exists (
    select 1 from public.trial_lessons
     where lead_id = p_lead_id
       and tenant_id = p_tenant_id
       and status = 'confirmed'
  ) then
    raise exception 'lead % already has a confirmed trial lesson', p_lead_id;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._trial_slot_is_free(p_tenant_id, p_instructor_id, p_starts_at, v_ends_at, null) then
    raise exception 'slot % overlaps an existing appointment', p_starts_at;
  end if;

  -- A lead may only have one active (provisional/confirmed) trial at a time.
  -- Supersede any earlier provisional pick by cancelling it.
  update public.trial_lessons
     set status = 'cancelled'
   where lead_id = p_lead_id
     and tenant_id = p_tenant_id
     and status = 'provisional';

  insert into public.trial_lessons (
    tenant_id, lead_id, instructor_id, status,
    starts_at, ends_at, duration_min, pickup_location, score, reason,
    pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address,
    route_status, route_travel_to_min, route_travel_from_min, route_needs_confirm
  ) values (
    p_tenant_id, p_lead_id, p_instructor_id, 'provisional',
    p_starts_at, v_ends_at, p_duration_min, p_pickup_location,
    coalesce(p_score, 0), p_reason,
    p_pickup_lat, p_pickup_lng, p_pickup_place_id, p_pickup_formatted_address,
    v_route_status, p_route_travel_to_min, p_route_travel_from_min,
    coalesce(p_route_needs_confirm, false)
  )
  returning id into v_id;

  insert into public.lead_events (lead_id, tenant_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, 'trial_requested',
    jsonb_build_object(
      'trial_lesson_id', v_id,
      'starts_at',       p_starts_at,
      'duration_min',    p_duration_min,
      'route_status',    v_route_status
    )
  );

  -- Move a brand-new lead forward in the pipeline.
  update public.leads
     set status = 'contacted'
   where id = p_lead_id and tenant_id = p_tenant_id and status = 'new';

  insert into public.audit_log (tenant_id, action, target_type, target_id, payload)
  values (
    p_tenant_id, 'trial_lesson.requested', 'trial_lesson', v_id::text,
    jsonb_build_object(
      'lead_id',       p_lead_id,
      'instructor_id', p_instructor_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at,
      'duration_min',  p_duration_min,
      'score',         coalesce(p_score, 0),
      'route_status',  v_route_status
    )
  );

  return v_id;
end;
$$;

revoke all on function public.book_trial_lesson(
  uuid, uuid, uuid, timestamptz, integer, text, integer, text,
  double precision, double precision, text, text, text, integer, integer, boolean
) from public;
revoke all on function public.book_trial_lesson(
  uuid, uuid, uuid, timestamptz, integer, text, integer, text,
  double precision, double precision, text, text, text, integer, integer, boolean
) from anon, authenticated;
grant execute on function public.book_trial_lesson(
  uuid, uuid, uuid, timestamptz, integer, text, integer, text,
  double precision, double precision, text, text, text, integer, integer, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- 6. schedule_lesson — accept optional location coordinates
--    Drop the 9-arg signature (0014/0015) and recreate with three appended
--    params (default null). Body is otherwise unchanged from 0015.
-- ---------------------------------------------------------------------------
drop function if exists public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text
);

create function public.schedule_lesson(
  p_tenant_id        uuid,
  p_actor            uuid,
  p_instructor_id    uuid,
  p_student_id       uuid,
  p_starts_at        timestamptz,
  p_duration_min     integer,
  p_credits_cost     integer,
  p_location         text,
  p_notes            text,
  p_location_lat     double precision default null,
  p_location_lng     double precision default null,
  p_location_place_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson_id uuid;
  v_ends_at   timestamptz;
  v_balance   integer;
begin
  if p_duration_min is null or p_duration_min < 15 then
    raise exception 'duration must be at least 15 minutes';
  end if;
  if p_credits_cost is null or p_credits_cost < 1 then
    raise exception 'credits_cost must be >= 1';
  end if;

  -- Actor must be tenant_admin in this tenant (admins schedule lessons).
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % is not authorized to schedule in tenant %', p_actor, p_tenant_id;
  end if;

  -- Instructor must belong to the tenant.
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Lock the student row so concurrent schedules for the same student
  -- serialize on the balance check.
  perform 1
    from public.students
   where id = p_student_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Balance check (sum of ledger rows so far) — now serialized.
  select coalesce(sum(delta), 0)::integer into v_balance
    from public.credit_ledger
   where student_id = p_student_id and tenant_id = p_tenant_id;
  if v_balance < p_credits_cost then
    raise exception 'insufficient credits: balance % < cost %', v_balance, p_credits_cost;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  insert into public.lessons (
    tenant_id, instructor_id, student_id,
    starts_at, ends_at, status, location, notes, credits_cost, created_by,
    location_lat, location_lng, location_place_id
  ) values (
    p_tenant_id, p_instructor_id, p_student_id,
    p_starts_at, v_ends_at, 'planned', p_location, p_notes, p_credits_cost, p_actor,
    p_location_lat, p_location_lng, p_location_place_id
  )
  returning id into v_lesson_id;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id, p_student_id, -p_credits_cost, 'lesson_consumed',
    'lesson', v_lesson_id,
    'Les ingepland', p_actor
  );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.scheduled', 'lesson', v_lesson_id::text,
    jsonb_build_object(
      'instructor_id', p_instructor_id,
      'student_id',    p_student_id,
      'starts_at',     p_starts_at,
      'ends_at',       v_ends_at,
      'credits_cost',  p_credits_cost
    )
  );

  return v_lesson_id;
end;
$$;

revoke all on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) from public;
grant execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) to service_role;
