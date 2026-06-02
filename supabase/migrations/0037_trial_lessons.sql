-- 0037_trial_lessons.sql
-- Fase 2 — Slimme Proeflesplanner.
--
-- A trial lesson ("proefles") is the first appointment a prospect books before
-- becoming a paying student. It is fundamentally different from a regular lesson:
--   * It is linked to a LEAD, never to a student.
--   * It NEVER touches credit_ledger — no credits are consumed or refunded.
--   * It is created as `provisional` from the public intake flow (the prospect
--     picks one of up to 3 suggested slots). It is never created `confirmed`
--     directly — the solo instructor / backoffice confirms, reschedules or
--     rejects it.
--
-- Scoring of the suggested slots lives in the application layer
-- (lib/trial-lessons/suggestions.ts). This migration only stores the chosen
-- slot and the score/reason that produced it, so the backoffice can see why a
-- slot was offered. Fase 3 route intelligence will extend the score; the column
-- shape here does not need to change for that.

-- Status lifecycle ---------------------------------------------------------
--   available  — a free slot (conceptual; not normally persisted)
--   suggested  — offered to the prospect (conceptual; not normally persisted)
--   provisional— prospect picked it, awaiting backoffice confirmation
--   confirmed  — backoffice/instructor confirmed the appointment
--   cancelled  — called off after being provisional/confirmed
--   rejected   — backoffice declined this slot (prospect may pick another)
do $$ begin
  create type public.trial_lesson_status as enum (
    'available',
    'suggested',
    'provisional',
    'confirmed',
    'cancelled',
    'rejected'
  );
exception when duplicate_object then null; end $$;

-- Extend lead_events so trial-lesson activity shows on the lead timeline.
-- ALTER TYPE ... ADD VALUE is committed with this migration's transaction and
-- only USED at runtime (later connections), so there is no same-transaction
-- enum-use violation here.
alter type public.lead_event_type add value if not exists 'trial_requested';
alter type public.lead_event_type add value if not exists 'trial_confirmed';
alter type public.lead_event_type add value if not exists 'trial_rescheduled';
alter type public.lead_event_type add value if not exists 'trial_rejected';

-- trial_lessons ------------------------------------------------------------
create table if not exists public.trial_lessons (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  lead_id         uuid not null,
  instructor_id   uuid not null references auth.users(id) on delete cascade,
  status          public.trial_lesson_status not null default 'provisional',
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  duration_min    integer not null,
  pickup_location text,
  -- Why this slot was offered (score + human-readable reason at booking time).
  score           integer not null default 0,
  reason          text,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (duration_min in (60, 90, 120)),
  -- Tenant consistency: the lead must belong to the same tenant.
  constraint trial_lessons_lead_tenant_fkey
    foreign key (lead_id, tenant_id)
    references public.leads (id, tenant_id)
    on delete cascade
);

drop trigger if exists trial_lessons_set_updated_at on public.trial_lessons;
create trigger trial_lessons_set_updated_at
  before update on public.trial_lessons
  for each row execute function public.set_updated_at();

-- No two active (provisional/confirmed) trial lessons may overlap for the same
-- instructor. btree_gist is already enabled by the lessons migration.
alter table public.trial_lessons
  drop constraint if exists trial_lessons_no_overlap;
alter table public.trial_lessons
  add constraint trial_lessons_no_overlap
  exclude using gist (
    tenant_id with =,
    instructor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('provisional', 'confirmed'));

-- Indexes ------------------------------------------------------------------
create index if not exists idx_trial_lessons_tenant_starts
  on public.trial_lessons (tenant_id, starts_at);

create index if not exists idx_trial_lessons_lead
  on public.trial_lessons (lead_id, created_at desc);

create index if not exists idx_trial_lessons_instructor_starts
  on public.trial_lessons (instructor_id, starts_at);

create index if not exists idx_trial_lessons_tenant_status
  on public.trial_lessons (tenant_id, status);

-- RLS ----------------------------------------------------------------------
alter table public.trial_lessons enable row level security;

drop policy if exists trial_lessons_select_members on public.trial_lessons;
create policy trial_lessons_select_members on public.trial_lessons
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );
-- No INSERT/UPDATE/DELETE policies — all writes go through the RPCs below as
-- service_role.

-- Shared overlap guard: raises if [p_starts, p_ends) collides with any planned
-- lesson or active trial lesson for this instructor (optionally excluding one
-- trial-lesson row, used when rescheduling it).
create or replace function public._trial_slot_is_free(
  p_tenant_id     uuid,
  p_instructor_id uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_exclude_id    uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.lessons l
     where l.tenant_id = p_tenant_id
       and l.instructor_id = p_instructor_id
       and l.status = 'planned'
       and tstzrange(l.starts_at, l.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  ) and not exists (
    select 1 from public.trial_lessons t
     where t.tenant_id = p_tenant_id
       and t.instructor_id = p_instructor_id
       and t.status in ('provisional', 'confirmed')
       and (p_exclude_id is null or t.id <> p_exclude_id)
       and tstzrange(t.starts_at, t.ends_at, '[)')
           && tstzrange(p_starts_at, p_ends_at, '[)')
  );
$$;
revoke all on function public._trial_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public._trial_slot_is_free(uuid, uuid, timestamptz, timestamptz, uuid) to service_role;

-- book_trial_lesson: called by the PUBLIC intake flow (service role) when the
-- prospect picks a suggested slot. Always stores it as `provisional`.
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

-- confirm_trial_lesson: backoffice/instructor confirms a provisional trial.
create or replace function public.confirm_trial_lesson(
  p_trial_id  uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial record;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_trial
    from public.trial_lessons
   where id = p_trial_id and tenant_id = p_tenant_id
   for update;
  if v_trial.id is null then
    raise exception 'trial lesson % not found in tenant %', p_trial_id, p_tenant_id;
  end if;
  if v_trial.status <> 'provisional' then
    raise exception 'trial lesson % is not provisional (status=%)', p_trial_id, v_trial.status;
  end if;

  if not public._trial_slot_is_free(
    p_tenant_id, v_trial.instructor_id, v_trial.starts_at, v_trial.ends_at, v_trial.id
  ) then
    raise exception 'trial lesson % overlaps an existing appointment', p_trial_id;
  end if;

  update public.trial_lessons
     set status = 'confirmed'
   where id = p_trial_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    v_trial.lead_id, p_tenant_id, p_actor, 'trial_confirmed',
    jsonb_build_object('trial_lesson_id', p_trial_id, 'starts_at', v_trial.starts_at)
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'trial_lesson.confirmed', 'trial_lesson', p_trial_id::text,
    jsonb_build_object('lead_id', v_trial.lead_id, 'starts_at', v_trial.starts_at)
  );
end;
$$;
revoke all on function public.confirm_trial_lesson(uuid, uuid, uuid) from public;
revoke all on function public.confirm_trial_lesson(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.confirm_trial_lesson(uuid, uuid, uuid) to service_role;

-- reschedule_trial_lesson: backoffice proposes/changes the time of a trial.
-- Keeps the trial `provisional` (the change is the new agreed moment) and
-- re-checks overlap.
create or replace function public.reschedule_trial_lesson(
  p_trial_id        uuid,
  p_tenant_id       uuid,
  p_actor           uuid,
  p_starts_at       timestamptz,
  p_duration_min    integer,
  p_pickup_location text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial   record;
  v_ends_at timestamptz;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_duration_min is null or p_duration_min not in (60, 90, 120) then
    raise exception 'trial duration must be 60, 90 or 120 minutes';
  end if;

  select * into v_trial
    from public.trial_lessons
   where id = p_trial_id and tenant_id = p_tenant_id
   for update;
  if v_trial.id is null then
    raise exception 'trial lesson % not found in tenant %', p_trial_id, p_tenant_id;
  end if;
  if v_trial.status not in ('provisional', 'confirmed') then
    raise exception 'trial lesson % cannot be rescheduled (status=%)', p_trial_id, v_trial.status;
  end if;

  v_ends_at := p_starts_at + make_interval(mins => p_duration_min);

  if not public._trial_slot_is_free(
    p_tenant_id, v_trial.instructor_id, p_starts_at, v_ends_at, v_trial.id
  ) then
    raise exception 'new slot % overlaps an existing appointment', p_starts_at;
  end if;

  update public.trial_lessons
     set starts_at       = p_starts_at,
         ends_at         = v_ends_at,
         duration_min    = p_duration_min,
         pickup_location = coalesce(p_pickup_location, pickup_location),
         status          = 'provisional'
   where id = p_trial_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    v_trial.lead_id, p_tenant_id, p_actor, 'trial_rescheduled',
    jsonb_build_object(
      'trial_lesson_id', p_trial_id,
      'from',            v_trial.starts_at,
      'to',              p_starts_at,
      'duration_min',    p_duration_min
    )
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'trial_lesson.rescheduled', 'trial_lesson', p_trial_id::text,
    jsonb_build_object('from', v_trial.starts_at, 'to', p_starts_at, 'duration_min', p_duration_min)
  );
end;
$$;
revoke all on function public.reschedule_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text) from public;
revoke all on function public.reschedule_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text) from anon, authenticated;
grant execute on function public.reschedule_trial_lesson(uuid, uuid, uuid, timestamptz, integer, text) to service_role;

-- reject_trial_lesson: backoffice declines a trial slot.
create or replace function public.reject_trial_lesson(
  p_trial_id  uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_reason    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial record;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_trial
    from public.trial_lessons
   where id = p_trial_id and tenant_id = p_tenant_id
   for update;
  if v_trial.id is null then
    raise exception 'trial lesson % not found in tenant %', p_trial_id, p_tenant_id;
  end if;
  if v_trial.status not in ('provisional', 'confirmed') then
    raise exception 'trial lesson % cannot be rejected (status=%)', p_trial_id, v_trial.status;
  end if;

  update public.trial_lessons
     set status = 'rejected',
         notes  = coalesce(p_reason, notes)
   where id = p_trial_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    v_trial.lead_id, p_tenant_id, p_actor, 'trial_rejected',
    jsonb_build_object('trial_lesson_id', p_trial_id, 'reason', p_reason)
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'trial_lesson.rejected', 'trial_lesson', p_trial_id::text,
    jsonb_build_object('lead_id', v_trial.lead_id, 'reason', p_reason)
  );
end;
$$;
revoke all on function public.reject_trial_lesson(uuid, uuid, uuid, text) from public;
revoke all on function public.reject_trial_lesson(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.reject_trial_lesson(uuid, uuid, uuid, text) to service_role;
