-- 0048_instructor_availability.sql
-- Module 3 — Beschikbaarheid (instructor availability).
--
-- Until now "free time" was only implied by the absence of appointments. This
-- migration introduces an EXPLICIT availability model that every later planning
-- feature (smart suggestions, student self-scheduling) builds on:
--
--   * instructor_availability            — recurring weekly schedule per
--     instructor (e.g. Mon–Fri 09:00–17:00). Multiple non-overlapping blocks
--     per weekday are allowed (e.g. 09:00–12:00 + 13:00–17:00).
--   * instructor_availability_exception  — date-specific overrides: either
--     extra availability ('available') or a block-off ('blocked') for a whole
--     day or a time range on that date.
--
-- Times are stored as integer MINUTES from midnight (0..1440), interpreted in
-- UTC for this phase — consistent with lib/trial-lessons/suggestions.ts which
-- already reasons about the agenda in UTC. Weekday uses JS getUTCDay()
-- semantics: 0 = Sunday … 6 = Saturday.
--
-- Both tables are tenant-scoped with RLS + indexes from day one. All writes go
-- through SECURITY DEFINER RPCs (service_role only); members get SELECT via RLS.

-- btree_gist powers the exclusion constraints below (equality opclasses for
-- uuid/smallint/date next to a range &&). Already enabled by the lessons
-- migration; repeated here idempotently so this file is self-contained.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1. Recurring weekly availability
-- ---------------------------------------------------------------------------
create table if not exists public.instructor_availability (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  instructor_id uuid not null references auth.users(id) on delete cascade,
  weekday       smallint not null,  -- 0=Sunday .. 6=Saturday (JS getUTCDay)
  start_min     integer not null,   -- minutes from midnight (UTC)
  end_min       integer not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (weekday between 0 and 6),
  check (start_min >= 0 and start_min < end_min and end_min <= 1440)
);

drop trigger if exists instructor_availability_set_updated_at on public.instructor_availability;
create trigger instructor_availability_set_updated_at
  before update on public.instructor_availability
  for each row execute function public.set_updated_at();

-- No two weekly blocks may overlap for the same instructor on the same weekday.
-- Back-to-back blocks ([540,720) + [720,840)) do NOT overlap and are allowed.
alter table public.instructor_availability
  drop constraint if exists instructor_availability_no_overlap;
alter table public.instructor_availability
  add constraint instructor_availability_no_overlap
  exclude using gist (
    tenant_id with =,
    instructor_id with =,
    weekday with =,
    int4range(start_min, end_min) with &&
  );

create index if not exists idx_instructor_availability_tenant_instructor
  on public.instructor_availability (tenant_id, instructor_id, weekday);

create index if not exists idx_instructor_availability_instructor
  on public.instructor_availability (instructor_id, weekday);

-- ---------------------------------------------------------------------------
-- 2. Date-specific exceptions
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.availability_exception_kind as enum ('available', 'blocked');
exception when duplicate_object then null; end $$;

create table if not exists public.instructor_availability_exception (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  instructor_id  uuid not null references auth.users(id) on delete cascade,
  exception_date date not null,
  kind           public.availability_exception_kind not null,
  -- null start/end = the WHOLE day (only meaningful for 'blocked').
  start_min      integer,
  end_min        integer,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Either both bounds set, or neither (whole day).
  check ((start_min is null) = (end_min is null)),
  check (start_min is null or (start_min >= 0 and start_min < end_min and end_min <= 1440)),
  -- An 'available' exception must specify a concrete time range.
  check (kind <> 'available' or start_min is not null)
);

drop trigger if exists instructor_availability_exception_set_updated_at
  on public.instructor_availability_exception;
create trigger instructor_availability_exception_set_updated_at
  before update on public.instructor_availability_exception
  for each row execute function public.set_updated_at();

-- No two exceptions may overlap for the same instructor on the same date.
-- A whole-day exception spans [0,1440) and therefore blocks any other
-- exception that date (you cannot both block the day and add availability).
alter table public.instructor_availability_exception
  drop constraint if exists instructor_availability_exception_no_overlap;
alter table public.instructor_availability_exception
  add constraint instructor_availability_exception_no_overlap
  exclude using gist (
    tenant_id with =,
    instructor_id with =,
    exception_date with =,
    int4range(coalesce(start_min, 0), coalesce(end_min, 1440)) with &&
  );

create index if not exists idx_availability_exception_tenant_instructor_date
  on public.instructor_availability_exception (tenant_id, instructor_id, exception_date);

create index if not exists idx_availability_exception_instructor_date
  on public.instructor_availability_exception (instructor_id, exception_date);

-- ---------------------------------------------------------------------------
-- 3. RLS — members read their tenant's availability; writes via RPC only
-- ---------------------------------------------------------------------------
alter table public.instructor_availability enable row level security;
alter table public.instructor_availability_exception enable row level security;

drop policy if exists instructor_availability_select_members
  on public.instructor_availability;
create policy instructor_availability_select_members on public.instructor_availability
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists availability_exception_select_members
  on public.instructor_availability_exception;
create policy availability_exception_select_members on public.instructor_availability_exception
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );
-- No INSERT/UPDATE/DELETE policies — all writes go through the RPCs below.

-- ---------------------------------------------------------------------------
-- 4. Authorization helper
-- ---------------------------------------------------------------------------
-- A tenant_admin (or platform admin) may manage any instructor in the tenant.
-- An instructor may manage only their OWN availability.
create or replace function public._availability_actor_authorized(
  p_actor uuid, p_tenant_id uuid, p_instructor_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- tenant_admin / platform admin → any instructor
    public._tenant_admin_authorized(p_actor, p_tenant_id)
    -- instructor → only themselves, and must be a member of the tenant
    or (
      p_actor = p_instructor_id
      and exists (
        select 1 from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('instructor', 'tenant_admin')
      )
    );
$$;
revoke all on function public._availability_actor_authorized(uuid, uuid, uuid) from public;
revoke all on function public._availability_actor_authorized(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._availability_actor_authorized(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RPCs (service_role only)
-- ---------------------------------------------------------------------------

-- set_instructor_weekly_availability: replaces the FULL weekly schedule for an
-- instructor with the given blocks (a JSON array of {weekday,start_min,end_min}).
-- Replacing the whole set keeps the editor simple and idempotent.
create or replace function public.set_instructor_weekly_availability(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_instructor_id uuid,
  p_blocks        jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public._availability_actor_authorized(p_actor, p_tenant_id, p_instructor_id) then
    raise exception 'actor % not authorized to manage availability of % in tenant %',
      p_actor, p_instructor_id, p_tenant_id;
  end if;

  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  delete from public.instructor_availability
   where tenant_id = p_tenant_id and instructor_id = p_instructor_id;

  insert into public.instructor_availability (
    tenant_id, instructor_id, weekday, start_min, end_min
  )
  select
    p_tenant_id,
    p_instructor_id,
    (b->>'weekday')::smallint,
    (b->>'start_min')::integer,
    (b->>'end_min')::integer
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b;

  select count(*) into v_count
    from public.instructor_availability
   where tenant_id = p_tenant_id and instructor_id = p_instructor_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'availability.weekly_set', 'instructor', p_instructor_id::text,
    jsonb_build_object('blocks', v_count)
  );
end;
$$;
revoke all on function public.set_instructor_weekly_availability(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.set_instructor_weekly_availability(uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.set_instructor_weekly_availability(uuid, uuid, uuid, jsonb) to service_role;

-- upsert_availability_exception: create or update a single date exception.
create or replace function public.upsert_availability_exception(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_instructor_id uuid,
  p_id            uuid,
  p_exception_date date,
  p_kind          text,
  p_start_min     integer,
  p_end_min       integer,
  p_note          text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_kind public.availability_exception_kind;
begin
  if not public._availability_actor_authorized(p_actor, p_tenant_id, p_instructor_id) then
    raise exception 'actor % not authorized to manage availability of % in tenant %',
      p_actor, p_instructor_id, p_tenant_id;
  end if;

  if p_kind not in ('available', 'blocked') then
    raise exception 'invalid exception kind %', p_kind;
  end if;
  v_kind := p_kind::public.availability_exception_kind;

  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  if p_id is null then
    insert into public.instructor_availability_exception (
      tenant_id, instructor_id, exception_date, kind, start_min, end_min, note, created_by
    ) values (
      p_tenant_id, p_instructor_id, p_exception_date, v_kind,
      p_start_min, p_end_min, p_note, p_actor
    )
    returning id into v_id;
  else
    update public.instructor_availability_exception
       set exception_date = p_exception_date,
           kind           = v_kind,
           start_min      = p_start_min,
           end_min        = p_end_min,
           note           = p_note
     where id = p_id
       and tenant_id = p_tenant_id
       and instructor_id = p_instructor_id
    returning id into v_id;
    if v_id is null then
      raise exception 'exception % not found for instructor % in tenant %',
        p_id, p_instructor_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'availability.exception_upsert', 'availability_exception', v_id::text,
    jsonb_build_object(
      'instructor_id', p_instructor_id,
      'date',          p_exception_date,
      'kind',          p_kind
    )
  );

  return v_id;
end;
$$;
revoke all on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, date, text, integer, integer, text) from public;
revoke all on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, date, text, integer, integer, text) from anon, authenticated;
grant execute on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, date, text, integer, integer, text) to service_role;

-- delete_availability_exception: remove a date exception.
create or replace function public.delete_availability_exception(
  p_tenant_id uuid,
  p_actor     uuid,
  p_id        uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
    from public.instructor_availability_exception
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if v_row.id is null then
    raise exception 'exception % not found in tenant %', p_id, p_tenant_id;
  end if;

  if not public._availability_actor_authorized(p_actor, p_tenant_id, v_row.instructor_id) then
    raise exception 'actor % not authorized to delete availability of % in tenant %',
      p_actor, v_row.instructor_id, p_tenant_id;
  end if;

  delete from public.instructor_availability_exception
   where id = p_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'availability.exception_deleted', 'availability_exception', p_id::text,
    jsonb_build_object('instructor_id', v_row.instructor_id, 'date', v_row.exception_date)
  );
end;
$$;
revoke all on function public.delete_availability_exception(uuid, uuid, uuid) from public;
revoke all on function public.delete_availability_exception(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.delete_availability_exception(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. (Optional) student daypart preference
-- ---------------------------------------------------------------------------
-- A light preference (which dayparts suit the student) recorded on the student
-- file, as input for later matching. Allowed values mirror the intake
-- dayparts: morning / afternoon / evening / weekend.
alter table public.students
  add column if not exists preferred_dayparts text[] not null default '{}';

create or replace function public.set_student_daypart_preference(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_student_id uuid,
  p_dayparts   text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text[];
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  v_clean := coalesce(p_dayparts, '{}');
  if exists (
    select 1 from unnest(v_clean) d
     where d not in ('morning', 'afternoon', 'evening', 'weekend')
  ) then
    raise exception 'invalid daypart in %', v_clean;
  end if;

  update public.students
     set preferred_dayparts = v_clean
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.daypart_preference_set', 'student', p_student_id::text,
    jsonb_build_object('dayparts', to_jsonb(v_clean))
  );
end;
$$;
revoke all on function public.set_student_daypart_preference(uuid, uuid, uuid, text[]) from public;
revoke all on function public.set_student_daypart_preference(uuid, uuid, uuid, text[]) from anon, authenticated;
grant execute on function public.set_student_daypart_preference(uuid, uuid, uuid, text[]) to service_role;
