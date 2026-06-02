-- 0046_tegoed_uren.sql
-- Convert abstract "credits" into hour-based "tegoed".
--
-- Decision: the internal unit of tegoed is now MINUTES (integer, exact — lessons
-- are always a whole number of minutes). It is DISPLAYED to users in hours
-- ("uren"), e.g. 90 minutes => "1,5 uur". A lesson consumes tegoed equal to its
-- duration in minutes; packages grant tegoed in minutes.
--
-- Column/table/view names stay stable (credit_ledger.delta, packages.credits_total,
-- lessons.credits_cost, lessons.refunded_credits, student_credit_balance.balance)
-- to avoid a wide rename across triggers, RPCs and RLS — they are REINTERPRETED as
-- minutes. Existing data is multiplied by 60 (1 old credit = 1 hour = 60 minutes).
--
-- Canon respected: the ledger is insert-only, so the one-off data conversion
-- temporarily disables the insert-only UPDATE trigger, rewrites the deltas, then
-- re-enables it. No new ledger rows are created and balances stay consistent
-- (every delta scales by the same factor, so sum(delta) scales identically).

begin;

-- 1+2. One-off data conversion (×60) — GUARDED for idempotency.
--   This is the only destructive, non-idempotent part of the migration: running
--   the ×60 UPDATEs twice would corrupt every balance. The migration runner
--   (scripts/src/apply-migrations.ts) already records each applied file in
--   public._migrations and never re-applies it, but we add a self-contained guard
--   so that *manually* re-executing this file's raw SQL after it has been applied
--   is a safe no-op. The runner inserts the filename only AFTER the migration
--   succeeds, so on the genuine first run the marker is absent and the conversion
--   runs exactly once.
do $$
begin
  if exists (
    select 1 from public._migrations where filename = '0046_tegoed_uren.sql'
  ) then
    raise notice 'tegoed minute conversion already applied — skipping ×60 backfill';
    return;
  end if;

  -- Convert the credit_ledger deltas (minutes). The insert-only trigger blocks
  -- UPDATE, so disable it just for this one-off backfill, then re-enable.
  alter table public.credit_ledger disable trigger credit_ledger_no_update;
  update public.credit_ledger set delta = delta * 60;
  alter table public.credit_ledger enable trigger credit_ledger_no_update;

  -- Convert package sizes and lesson costs/refunds to minutes.
  update public.packages set credits_total = credits_total * 60;
  update public.lessons set credits_cost = credits_cost * 60;
  update public.lessons
    set refunded_credits = refunded_credits * 60
    where refunded_credits is not null;
end
$$;

-- 3. A planned lesson now costs its duration in minutes; default a standard 60-min
--    lesson (1 uur) for the rare direct insert. The schedule_lesson RPC always
--    derives the cost from the duration, so this default is a safety net only.
alter table public.lessons alter column credits_cost set default 60;

-- 4. Document the reinterpreted unit at the schema level.
comment on column public.credit_ledger.delta is
  'Tegoed change in MINUTES (insert-only ledger). Displayed to users in hours.';
comment on column public.packages.credits_total is
  'Tegoed granted by this package, in MINUTES. Displayed/edited in hours (x60).';
comment on column public.lessons.credits_cost is
  'Tegoed this lesson consumes, in MINUTES — equal to the lesson duration.';
comment on column public.lessons.refunded_credits is
  'Tegoed refunded on cancellation, in MINUTES.';
comment on view public.student_credit_balance is
  'Per-student tegoed balance = sum(credit_ledger.delta), in MINUTES.';

-- 5. Recreate schedule_lesson so the cost is always the lesson duration (minutes).
--    Signature is unchanged (so existing GRANT/REVOKE and callers keep working);
--    p_credits_cost is now optional and ignored — the duration is the source of
--    truth for how much tegoed a lesson consumes.
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
  v_lesson_id uuid;
  v_ends_at   timestamptz;
  v_balance   integer;
  v_cost      integer;
begin
  if p_duration_min is null or p_duration_min < 15 then
    raise exception 'duration must be at least 15 minutes';
  end if;

  -- Tegoed is hour-based: a lesson consumes tegoed equal to its duration in
  -- minutes. p_credits_cost is accepted for signature stability but ignored.
  v_cost := p_duration_min;

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

-- Re-assert the service-role-only lockdown (idempotent; create-or-replace keeps
-- privileges, but we keep this explicit to match migration 0023).
revoke all on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) from public;
grant execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) to service_role;

commit;
