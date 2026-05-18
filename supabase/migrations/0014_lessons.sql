-- 0014_lessons.sql
-- Lessons: the operational core. Scheduling a lesson immediately consumes
-- credits via the ledger; cancelling refunds according to the tenant's
-- cancellation_policy in tenant_settings (never hardcoded).

create extension if not exists btree_gist;

do $$ begin
  create type public.lesson_status as enum (
    'planned',
    'completed',
    'cancelled_with_refund',
    'cancelled_no_refund',
    'no_show'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.lessons (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  instructor_id           uuid not null references auth.users(id) on delete restrict,
  student_id              uuid not null,
  starts_at               timestamptz not null,
  ends_at                 timestamptz not null,
  status                  public.lesson_status not null default 'planned',
  location                text,
  notes                   text,
  credits_cost            integer not null default 1,
  cancellation_reason     text,
  cancelled_hours_before  numeric(8,2),
  refunded_credits        integer,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (ends_at > starts_at),
  check (credits_cost > 0),
  -- Tenant-consistent FK to students.
  constraint lessons_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  -- No overlapping planned lessons for the same instructor within a tenant.
  constraint lessons_no_overlap
    exclude using gist (
      tenant_id with =,
      instructor_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status = 'planned')
);

drop trigger if exists lessons_set_updated_at on public.lessons;
create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

create index if not exists idx_lessons_tenant_starts
  on public.lessons (tenant_id, starts_at desc);
create index if not exists idx_lessons_instructor_starts
  on public.lessons (instructor_id, starts_at desc);
create index if not exists idx_lessons_student_starts
  on public.lessons (student_id, starts_at desc);
create index if not exists idx_lessons_tenant_status
  on public.lessons (tenant_id, status);

-- RLS ----------------------------------------------------------------------
alter table public.lessons enable row level security;

drop policy if exists lessons_select_members on public.lessons;
create policy lessons_select_members on public.lessons
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or student_id in (
      select s.id from public.students s where s.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies — writes go through RPCs (service role).

-- RPCs ---------------------------------------------------------------------

-- schedule_lesson: insert a planned lesson + matching credit_ledger row.
-- Saldo is verified BEFORE the ledger insert so a failure leaves no trace.
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

  -- Instructor must belong to the tenant (instructor or tenant_admin role).
  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  -- Student must belong to the tenant.
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Balance check (sum of ledger rows so far).
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

-- complete_lesson: mark a planned lesson as completed. No credit movement —
-- credits were already deducted at scheduling time.
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

-- cancel_lesson: read the tenant's cancellation_policy tiers and refund
-- whatever the policy dictates. Status reflects whether a refund happened.
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

  -- Pull the active policy. Tiers are ordered by hours_before desc; pick the
  -- first tier where v_hours_before >= tier.hours_before.
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
