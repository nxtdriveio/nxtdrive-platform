-- 0015_lessons_hardening.sql
-- Tighten lesson RPCs:
--   * schedule_lesson: SELECT ... FOR UPDATE on the student row before
--     reading the balance, so two concurrent calls can't both overspend.
--   * All three RPCs: assert p_actor has an allowed role in p_tenant_id,
--     so a future service-role caller can't forge actor identity or skip
--     role gates that exist only in the Next.js layer.

create or replace function public.schedule_lesson(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_instructor_id uuid,
  p_student_id    uuid,
  p_starts_at     timestamptz,
  p_duration_min  integer,
  p_credits_cost  integer,
  p_location      text,
  p_notes         text
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
    starts_at, ends_at, status, location, notes, credits_cost, created_by
  ) values (
    p_tenant_id, p_instructor_id, p_student_id,
    p_starts_at, v_ends_at, 'planned', p_location, p_notes, p_credits_cost, p_actor
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

revoke all on function public.schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text) from public;
grant execute on function public.schedule_lesson(uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text) to service_role;

-- Helper: any tenant_admin / instructor / platform admin may act.
create or replace function public._lesson_actor_authorized(
  p_actor uuid, p_tenant_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role in ('tenant_admin', 'instructor')
  ) or exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  );
$$;
revoke all on function public._lesson_actor_authorized(uuid, uuid) from public;
grant execute on function public._lesson_actor_authorized(uuid, uuid) to service_role;

create or replace function public.complete_lesson(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.lesson_status;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select status into v_status
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_status;
  end if;

  update public.lessons
     set status = 'completed'
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.completed', 'lesson', p_lesson_id::text,
    '{}'::jsonb
  );
end;
$$;
revoke all on function public.complete_lesson(uuid, uuid, uuid) from public;
grant execute on function public.complete_lesson(uuid, uuid, uuid) to service_role;

create or replace function public.cancel_lesson(
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
  v_policy         jsonb;
  v_tier           jsonb;
  v_hours_before   numeric;
  v_refund_pct     integer := 0;
  v_refund_credits integer := 0;
  v_new_status     public.lesson_status;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select id, tenant_id, student_id, starts_at, status, credits_cost
    into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_lesson.status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_lesson.status;
  end if;

  v_hours_before := greatest(
    0,
    extract(epoch from (v_lesson.starts_at - now())) / 3600.0
  );

  select value into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'cancellation_policy';

  if v_policy is not null then
    select tier into v_tier
      from jsonb_array_elements(v_policy -> 'tiers') as tier
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
      format('Les geannuleerd (%s%% refund, %s u vooraf)', v_refund_pct, round(v_hours_before, 1)),
      p_actor
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.cancelled', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'reason',           p_reason,
      'hours_before',     round(v_hours_before, 2),
      'refund_pct',       v_refund_pct,
      'refunded_credits', v_refund_credits,
      'status',           v_new_status
    )
  );

  return v_refund_credits;
end;
$$;
revoke all on function public.cancel_lesson(uuid, uuid, uuid, text) from public;
grant execute on function public.cancel_lesson(uuid, uuid, uuid, text) to service_role;
