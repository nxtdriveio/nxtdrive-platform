-- 0057_schedule_lesson_instructor.sql
--
-- Allow instructors to schedule their OWN lessons.
--
-- Why: the instructor-PWA cockpit gained a "Lesuren plannen" quick action so an
-- instructor can plan a follow-up lesson for the student they are with. The app
-- layer was broadened to instructors (pinned to self), but the canonical
-- schedule_lesson RPC (0046) still authorized only tenant_admin / platform
-- admin actors, so the action failed for plain instructors. This migration
-- aligns the DB authorization with the product behavior:
--   - tenant_admin / platform admin: may schedule for ANY instructor (unchanged)
--   - instructor: may schedule ONLY when p_instructor_id = p_actor (own lessons)
--   - anyone else: rejected
--
-- Forward-only fix (the runner tracks by filename); 0046 is left untouched.
-- The function body is otherwise identical to 0046; only the actor-auth block
-- changed. Signature is unchanged, so existing grants are preserved; we still
-- re-apply the explicit anon/authenticated lockdown (matching 0047) for safety.

create or replace function public.schedule_lesson(
  p_tenant_id        uuid,
  p_actor            uuid,
  p_instructor_id    uuid,
  p_student_id       uuid,
  p_starts_at        timestamptz,
  p_duration_min     integer,
  p_credits_cost     integer default null,
  p_location         text default null,
  p_notes            text default null,
  p_location_lat     double precision default null,
  p_location_lng     double precision default null,
  p_location_place_id text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson_id     uuid;
  v_ends_at       timestamptz;
  v_balance       integer;
  v_cost          integer;
  v_is_admin      boolean;
  v_is_instructor boolean;
begin
  if p_duration_min is null or p_duration_min < 15 then
    raise exception 'duration must be at least 15 minutes';
  end if;

  -- Tegoed is hour-based: a lesson consumes tegoed equal to its duration in
  -- minutes. p_credits_cost is accepted for signature stability but ignored.
  v_cost := p_duration_min;

  -- Authorization. Admins (tenant_admin or platform admin) may schedule for any
  -- instructor; a plain instructor may only schedule their OWN lessons.
  v_is_admin := exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'tenant_admin'
  ) or exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  );
  v_is_instructor := exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role = 'instructor'
  );
  if not v_is_admin then
    if not v_is_instructor then
      raise exception 'actor % is not authorized to schedule in tenant %', p_actor, p_tenant_id;
    end if;
    if p_instructor_id <> p_actor then
      raise exception 'instructor % may only schedule lessons for themselves', p_actor;
    end if;
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
  if v_balance < v_cost then
    raise exception 'insufficient tegoed: balance % min < cost % min', v_balance, v_cost;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  insert into public.lessons (
    tenant_id, instructor_id, student_id,
    starts_at, ends_at, status, location, notes, credits_cost, created_by,
    location_lat, location_lng, location_place_id
  ) values (
    p_tenant_id, p_instructor_id, p_student_id,
    p_starts_at, v_ends_at, 'planned', p_location, p_notes, v_cost, p_actor,
    p_location_lat, p_location_lng, p_location_place_id
  )
  returning id into v_lesson_id;

  insert into public.credit_ledger (
    tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
  ) values (
    p_tenant_id, p_student_id, -v_cost, 'lesson_consumed',
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
      'duration_min',  p_duration_min,
      'credits_cost',  v_cost
    )
  );

  return v_lesson_id;
end;
$$;

revoke execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) from anon, authenticated;

grant execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) to service_role;
