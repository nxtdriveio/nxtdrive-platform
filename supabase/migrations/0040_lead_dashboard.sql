-- ============================================================================
-- 0040_lead_dashboard.sql
--
-- Task #54 — Lead Dashboard + Taken + Slimme Opvolging.
--
-- EXTENDS the existing leads / Kanban-tasks / lead_events systems (no new
-- persons / timeline / task tables). Adds:
--   * lead_action_status enum ("wie-wacht-waarop").
--   * 10 new lead_status funnel values (existing 5 preserved + mapped 1:1).
--   * 4 new lead_source values.
--   * Denormalised dashboard columns on leads (+ indexes for the dashboard
--     sort/filter paths: next_action_at, last_activity_at, status,
--     action_status, lead_score).
--   * task_type enum + dedupe_key on tasks for idempotent auto-tasks.
--   * lead_events.metadata + new event types for the timeline.
--   * Service-role-only SECURITY DEFINER RPCs for every mutation
--     (audit_log stays insert-only; lead_events stays insert-only).
--
-- IMPORTANT: new values added with ALTER TYPE ... ADD VALUE are committed with
-- this migration but may only be USED by later connections. We therefore never
-- reference a newly-added enum value in immediate DDL/DML here. plpgsql function
-- bodies are stored as text and validated at call time, so enum literals inside
-- the RPC bodies below are safe.
-- ============================================================================

-- 1. Enum extensions ---------------------------------------------------------

-- lead_status: extend the 5-value funnel to the full 15-status spec funnel.
-- Existing values (new/contacted/package_advised/converted/dropped) are kept,
-- so existing rows need no data migration.
alter type public.lead_status add value if not exists 'intake_completed';
alter type public.lead_status add value if not exists 'trial_offered';
alter type public.lead_status add value if not exists 'trial_planned';
alter type public.lead_status add value if not exists 'trial_confirmed';
alter type public.lead_status add value if not exists 'trial_completed';
alter type public.lead_status add value if not exists 'assessment_pending';
alter type public.lead_status add value if not exists 'assessment_done';
alter type public.lead_status add value if not exists 'payment_pending';
alter type public.lead_status add value if not exists 'paid';
alter type public.lead_status add value if not exists 'follow_up';

-- lead_source: channels beyond the original public-website set.
alter type public.lead_source add value if not exists 'intake_wizard';
alter type public.lead_source add value if not exists 'manual';
alter type public.lead_source add value if not exists 'phone';
alter type public.lead_source add value if not exists 'email';

-- lead_event_type: timeline events for automation + manual follow-up.
alter type public.lead_event_type add value if not exists 'intake_completed';
alter type public.lead_event_type add value if not exists 'score_updated';
alter type public.lead_event_type add value if not exists 'lost';
alter type public.lead_event_type add value if not exists 'follow_up_scheduled';
alter type public.lead_event_type add value if not exists 'assessment_due';
alter type public.lead_event_type add value if not exists 'package_advised';
alter type public.lead_event_type add value if not exists 'payment_pending';
alter type public.lead_event_type add value if not exists 'paid';
alter type public.lead_event_type add value if not exists 'reengaged';
alter type public.lead_event_type add value if not exists 'task_auto_created';
alter type public.lead_event_type add value if not exists 'task_completed';

-- lead_action_status: brand-new enum (safe to use in this migration).
do $$ begin
  create type public.lead_action_status as enum (
    'none',         -- geen actie nodig
    'awaiting_us',  -- de rijschool moet iets doen
    'awaiting_lead',-- wachten op de lead
    'scheduled',    -- staat ingepland
    'closed'        -- afgehandeld (gewonnen/verloren)
  );
exception when duplicate_object then null; end $$;

-- task_type: brand-new enum (safe to use in this migration).
do $$ begin
  create type public.task_type as enum (
    'manual',
    'new_lead_contact',
    'intake_review',
    'trial_plan',
    'trial_confirm',
    'trial_complete',
    'assessment',
    'package_advice',
    'payment_followup',
    'reengage'
  );
exception when duplicate_object then null; end $$;

-- 2. leads: denormalised dashboard columns -----------------------------------
alter table public.leads
  add column if not exists action_status            public.lead_action_status not null default 'awaiting_us',
  add column if not exists priority                 public.task_priority not null default 'normal',
  add column if not exists lead_score               integer not null default 0,
  add column if not exists lead_score_reason        jsonb not null default '[]'::jsonb,
  add column if not exists assigned_owner_id        uuid references auth.users(id) on delete set null,
  add column if not exists assigned_instructor_id   uuid references auth.users(id) on delete set null,
  add column if not exists assigned_location_id     uuid,
  add column if not exists preferred_license_goal   public.intake_license_goal,
  add column if not exists preferred_transmission   public.intake_transmission,
  add column if not exists role_type                public.intake_applicant_type,
  add column if not exists birth_date               date,
  add column if not exists city                     text,
  add column if not exists neighborhood             text,
  add column if not exists pickup_address           text,
  add column if not exists pickup_place_id          text,
  add column if not exists pickup_lat               double precision,
  add column if not exists pickup_lng               double precision,
  add column if not exists desired_start_date       date,
  add column if not exists last_activity_at         timestamptz not null default now(),
  add column if not exists next_action_at           timestamptz,
  add column if not exists converted_to_student_at  timestamptz,
  add column if not exists lost_at                  timestamptz,
  add column if not exists lost_reason              text,
  add column if not exists source_detail            text;

alter table public.leads
  drop constraint if exists leads_lead_score_range;
alter table public.leads
  add constraint leads_lead_score_range check (lead_score between 0 and 100);

alter table public.leads
  drop constraint if exists leads_pickup_coords_pair;
alter table public.leads
  add constraint leads_pickup_coords_pair check (
    (pickup_lat is null) = (pickup_lng is null)
    and (pickup_lat is null or pickup_lat between -90 and 90)
    and (pickup_lng is null or pickup_lng between -180 and 180)
  );

-- Dashboard sort/filter indexes.
create index if not exists idx_leads_tenant_status
  on public.leads (tenant_id, status);
create index if not exists idx_leads_tenant_action_status
  on public.leads (tenant_id, action_status);
create index if not exists idx_leads_tenant_next_action
  on public.leads (tenant_id, next_action_at)
  where next_action_at is not null;
create index if not exists idx_leads_tenant_last_activity
  on public.leads (tenant_id, last_activity_at);
create index if not exists idx_leads_tenant_score
  on public.leads (tenant_id, lead_score);

-- 3. tasks: task_type + idempotency marker -----------------------------------
alter table public.tasks
  add column if not exists task_type   public.task_type not null default 'manual',
  add column if not exists dedupe_key  text;

-- One open (non-archived) auto-task per dedupe key per tenant. Archiving a task
-- frees the key so a later automation run can recreate it if the trigger
-- recurs.
drop index if exists idx_tasks_dedupe_open;
create unique index idx_tasks_dedupe_open
  on public.tasks (tenant_id, dedupe_key)
  where dedupe_key is not null and archived_at is null;

create index if not exists idx_tasks_tenant_type
  on public.tasks (tenant_id, task_type);

-- 4. lead_events: metadata jsonb ---------------------------------------------
alter table public.lead_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ============================================================================
-- RPCs — all SECURITY DEFINER, search_path pinned, service_role only.
--
-- p_actor is nullable: a non-null actor is authorised via
-- _lesson_actor_authorized (user-triggered); a null actor means a system /
-- cron run (the grant lockdown already guarantees only service_role can call
-- these). The lead is always validated against the tenant.
-- ============================================================================

-- sync_lead_from_intake: copy the structured intake answers onto the
-- denormalised dashboard columns so list/filter/sort stay on one table.
create or replace function public.sync_lead_from_intake(
  p_lead_id   uuid,
  p_tenant_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.leads where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  update public.leads l
     set role_type              = d.applicant_type,
         birth_date             = d.date_of_birth,
         city                   = d.city,
         neighborhood           = d.pickup_location,
         pickup_address         = coalesce(d.pickup_formatted_address, d.pickup_location),
         pickup_place_id        = d.pickup_place_id,
         pickup_lat             = d.pickup_lat,
         pickup_lng             = d.pickup_lng,
         preferred_license_goal = d.license_goal,
         preferred_transmission = d.transmission,
         desired_start_date     = d.desired_start_date
    from public.lead_intake_details d
   where l.id = p_lead_id
     and l.tenant_id = p_tenant_id
     and d.lead_id = l.id
     and d.tenant_id = l.tenant_id;
end;
$$;

revoke all on function public.sync_lead_from_intake(uuid, uuid) from public;
revoke execute on function public.sync_lead_from_intake(uuid, uuid) from anon, authenticated;
grant execute on function public.sync_lead_from_intake(uuid, uuid) to service_role;

-- set_lead_automation_fields: persist the computed automation state (action
-- status, priority, score + reason, next action moment). Status changes go
-- through update_lead_status separately. Only non-null args are applied.
create or replace function public.set_lead_automation_fields(
  p_lead_id          uuid,
  p_tenant_id        uuid,
  p_actor            uuid,
  p_action_status    public.lead_action_status,
  p_priority         public.task_priority,
  p_lead_score       integer,
  p_lead_score_reason jsonb,
  p_next_action_at   timestamptz,
  p_touch_activity   boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_score integer;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select lead_score into v_old_score
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  update public.leads
     set action_status     = coalesce(p_action_status, action_status),
         priority          = coalesce(p_priority, priority),
         lead_score        = coalesce(p_lead_score, lead_score),
         lead_score_reason = coalesce(p_lead_score_reason, lead_score_reason),
         next_action_at    = p_next_action_at,
         last_activity_at  = case when p_touch_activity then now() else last_activity_at end
   where id = p_lead_id and tenant_id = p_tenant_id;

  if p_lead_score is not null and p_lead_score is distinct from v_old_score then
    insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload, metadata)
    values (
      p_lead_id, p_tenant_id, p_actor, 'score_updated',
      jsonb_build_object('from', v_old_score, 'to', p_lead_score),
      coalesce(p_lead_score_reason, '[]'::jsonb)
    );
  end if;
end;
$$;

revoke all on function public.set_lead_automation_fields(uuid, uuid, uuid, public.lead_action_status, public.task_priority, integer, jsonb, timestamptz, boolean) from public;
revoke execute on function public.set_lead_automation_fields(uuid, uuid, uuid, public.lead_action_status, public.task_priority, integer, jsonb, timestamptz, boolean) from anon, authenticated;
grant execute on function public.set_lead_automation_fields(uuid, uuid, uuid, public.lead_action_status, public.task_priority, integer, jsonb, timestamptz, boolean) to service_role;

-- ensure_lead_task: idempotently create an auto-task of a given type, linked to
-- the lead. Returns the existing open task id if one with this dedupe_key is
-- already open (no duplicate). Bootstraps a board + columns if the tenant has
-- none yet so automation never fails on a fresh tenant.
create or replace function public.ensure_lead_task(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_lead_id     uuid,
  p_task_type   public.task_type,
  p_dedupe_key  text,
  p_title       text,
  p_description text,
  p_priority    public.task_priority,
  p_due_date    date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_board    uuid;
  v_column   uuid;
  v_pos      integer;
  v_id       uuid;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.leads where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'dedupe_key is required for auto-tasks';
  end if;

  -- Idempotency: an open task with this key already covers the trigger.
  select id into v_existing
    from public.tasks
   where tenant_id = p_tenant_id
     and dedupe_key = p_dedupe_key
     and archived_at is null
   limit 1;
  if found then
    return v_existing;
  end if;

  -- Target the first non-archived board's first column.
  select c.id, c.board_id into v_column, v_board
    from public.task_columns c
    join public.task_boards b
      on b.id = c.board_id and b.tenant_id = c.tenant_id
   where c.tenant_id = p_tenant_id
     and b.archived_at is null
   order by b.sort_order, b.created_at, c.sort_order
   limit 1;

  if v_column is null then
    insert into public.task_boards (tenant_id, name, sort_order)
    values (p_tenant_id, 'Leads', 0)
    returning id into v_board;
    insert into public.task_columns (tenant_id, board_id, name, sort_order)
    values
      (p_tenant_id, v_board, 'Te doen', 10),
      (p_tenant_id, v_board, 'Bezig',   20),
      (p_tenant_id, v_board, 'Klaar',   30);
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order
     limit 1;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from public.tasks
   where column_id = v_column and tenant_id = p_tenant_id and archived_at is null;

  insert into public.tasks (
    tenant_id, board_id, column_id, title, description, priority, due_date,
    position, created_by, task_type, dedupe_key
  ) values (
    p_tenant_id, v_board, v_column, btrim(p_title), p_description,
    coalesce(p_priority, 'normal'), p_due_date, v_pos, p_actor,
    p_task_type, p_dedupe_key
  )
  returning id into v_id;

  insert into public.task_links (tenant_id, task_id, entity_type, entity_id, created_by)
  values (p_tenant_id, v_id, 'lead', p_lead_id, p_actor)
  on conflict (task_id, entity_type, entity_id) do nothing;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload, metadata)
  values (
    p_lead_id, p_tenant_id, p_actor, 'task_auto_created',
    jsonb_build_object('task_id', v_id::text, 'task_type', p_task_type::text, 'title', btrim(p_title)),
    jsonb_build_object('dedupe_key', p_dedupe_key)
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'task.auto_created', 'task', v_id::text,
    jsonb_build_object('lead_id', p_lead_id::text, 'task_type', p_task_type::text, 'dedupe_key', p_dedupe_key)
  );

  return v_id;
end;
$$;

revoke all on function public.ensure_lead_task(uuid, uuid, uuid, public.task_type, text, text, text, public.task_priority, date) from public;
revoke execute on function public.ensure_lead_task(uuid, uuid, uuid, public.task_type, text, text, text, public.task_priority, date) from anon, authenticated;
grant execute on function public.ensure_lead_task(uuid, uuid, uuid, public.task_type, text, text, text, public.task_priority, date) to service_role;

-- complete_lead_task: archive a task (= "afronden") and log a completion event
-- on every lead it is linked to.
create or replace function public.complete_lead_task(
  p_task_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  r record;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select title into v_title
    from public.tasks
   where id = p_task_id and tenant_id = p_tenant_id and archived_at is null;
  if not found then
    -- already completed / not in tenant — no-op (idempotent).
    return;
  end if;

  update public.tasks
     set archived_at = now()
   where id = p_task_id and tenant_id = p_tenant_id and archived_at is null;

  for r in
    select entity_id from public.task_links
     where task_id = p_task_id and tenant_id = p_tenant_id and entity_type = 'lead'
  loop
    insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
    values (
      r.entity_id, p_tenant_id, p_actor, 'task_completed',
      jsonb_build_object('task_id', p_task_id::text, 'title', v_title)
    );
  end loop;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'task.completed', 'task', p_task_id::text,
    jsonb_build_object('title', v_title)
  );
end;
$$;

revoke all on function public.complete_lead_task(uuid, uuid, uuid) from public;
revoke execute on function public.complete_lead_task(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.complete_lead_task(uuid, uuid, uuid) to service_role;

-- mark_lead_lost: terminal "afgehaakt" with a reason.
create or replace function public.mark_lead_lost(
  p_lead_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_reason    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.lead_status;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select status into v_from
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  update public.leads
     set status        = 'dropped',
         action_status = 'closed',
         lost_at       = now(),
         lost_reason   = nullif(btrim(coalesce(p_reason, '')), ''),
         next_action_at = null,
         last_activity_at = now()
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, p_actor, 'lost',
    jsonb_build_object('from', v_from::text, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'lead.lost', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_from::text, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );
end;
$$;

revoke all on function public.mark_lead_lost(uuid, uuid, uuid, text) from public;
revoke execute on function public.mark_lead_lost(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.mark_lead_lost(uuid, uuid, uuid, text) to service_role;

-- schedule_lead_follow_up: "later opvolgen" with a chosen moment.
create or replace function public.schedule_lead_follow_up(
  p_lead_id      uuid,
  p_tenant_id    uuid,
  p_actor        uuid,
  p_next_action_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.lead_status;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_next_action_at is null then
    raise exception 'follow-up moment is required';
  end if;

  select status into v_from
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  update public.leads
     set status         = 'follow_up',
         action_status  = 'scheduled',
         next_action_at = p_next_action_at,
         last_activity_at = now()
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, p_actor, 'follow_up_scheduled',
    jsonb_build_object('from', v_from::text, 'next_action_at', p_next_action_at)
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'lead.follow_up_scheduled', 'lead', p_lead_id::text,
    jsonb_build_object('next_action_at', p_next_action_at)
  );
end;
$$;

revoke all on function public.schedule_lead_follow_up(uuid, uuid, uuid, timestamptz) from public;
revoke execute on function public.schedule_lead_follow_up(uuid, uuid, uuid, timestamptz) from anon, authenticated;
grant execute on function public.schedule_lead_follow_up(uuid, uuid, uuid, timestamptz) to service_role;

-- create_lead_manual: backoffice-created lead (phone/email/walk-in). Logs the
-- created event + audit row and returns the new lead id.
create or replace function public.create_lead_manual(
  p_tenant_id uuid,
  p_actor     uuid,
  p_source    public.lead_source,
  p_full_name text,
  p_email     text,
  p_phone     text,
  p_message   text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_actor is not null and not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_full_name is null or char_length(btrim(p_full_name)) = 0 then
    raise exception 'full_name is required';
  end if;
  if coalesce(nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), '')) is null then
    raise exception 'email or phone is required';
  end if;

  insert into public.leads (
    tenant_id, status, source, full_name, email, phone, message,
    assigned_owner_id, last_activity_at
  ) values (
    p_tenant_id, 'new', coalesce(p_source, 'manual'), btrim(p_full_name),
    nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_message, '')), ''), p_actor, now()
  )
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    v_lead_id, p_tenant_id, p_actor, 'created',
    jsonb_build_object('source', coalesce(p_source, 'manual')::text, 'via', 'backoffice')
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'lead.created', 'lead', v_lead_id::text,
    jsonb_build_object('source', coalesce(p_source, 'manual')::text, 'via', 'backoffice')
  );

  return v_lead_id;
end;
$$;

revoke all on function public.create_lead_manual(uuid, uuid, public.lead_source, text, text, text, text) from public;
revoke execute on function public.create_lead_manual(uuid, uuid, public.lead_source, text, text, text, text) from anon, authenticated;
grant execute on function public.create_lead_manual(uuid, uuid, public.lead_source, text, text, text, text) to service_role;
