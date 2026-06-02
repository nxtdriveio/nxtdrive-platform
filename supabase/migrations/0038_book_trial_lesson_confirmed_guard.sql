-- ---------------------------------------------------------------------------
-- Fase 2 — Slimme Proeflesplanner: harden book_trial_lesson.
--
-- A lead may only ever have one *active* trial lesson. The original RPC (0037)
-- supersedes an earlier *provisional* pick, but did not stop a new booking when
-- the lead already has a *confirmed* trial. A confirmed trial must be cancelled
-- or rejected first; this enforces that server-side invariant so the UI is not
-- the only line of defence.
--
-- Recreated as a forward migration (0037 already applied; the runner tracks by
-- filename). Only the confirmed-guard block is new; the rest is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.book_trial_lesson(
  p_lead_id         uuid,
  p_tenant_id       uuid,
  p_instructor_id   uuid,
  p_starts_at       timestamptz,
  p_duration_min    integer,
  p_pickup_location text,
  p_score           integer,
  p_reason          text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_ends_at timestamptz;
begin
  if p_duration_min is null or p_duration_min not in (60, 90, 120) then
    raise exception 'trial duration must be 60, 90 or 120 minutes';
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
    starts_at, ends_at, duration_min, pickup_location, score, reason
  ) values (
    p_tenant_id, p_lead_id, p_instructor_id, 'provisional',
    p_starts_at, v_ends_at, p_duration_min, p_pickup_location,
    coalesce(p_score, 0), p_reason
  )
  returning id into v_id;

  insert into public.lead_events (lead_id, tenant_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, 'trial_requested',
    jsonb_build_object(
      'trial_lesson_id', v_id,
      'starts_at',       p_starts_at,
      'duration_min',    p_duration_min
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
      'score',         coalesce(p_score, 0)
    )
  );

  return v_id;
end;
$$;
revoke all on function public.book_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text, integer, text) from public;
revoke all on function public.book_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text, integer, text) from anon, authenticated;
grant execute on function public.book_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text, integer, text) to service_role;
