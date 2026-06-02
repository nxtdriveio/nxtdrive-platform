-- 0055_lesson_in_progress.sql
--
-- Instructeur-PWA cockpit: split the single "complete" step into two explicit
-- steps — "Start les" and "Les afronden" — with a real lesson status
-- transition (planned -> in_progress -> completed).
--
-- Why: the cockpit (in-car) flow needs a persisted "lesson started" state so a
-- refresh / navigation keeps showing the correct primary action. An ephemeral
-- client flag would be lost the moment the instructor navigates between the
-- day's lessons. The credit deduction stays exactly where it was (at
-- scheduling time, via schedule_lesson); starting/finishing a lesson moves no
-- credits — it only changes status and writes an audit row.
--
-- Note on the no-overlap exclusion (lessons_no_overlap, where status='planned'):
-- it is intentionally NOT widened to include in_progress in this migration.
-- A new enum value cannot be referenced in the same transaction that adds it
-- (Postgres 55P04). In practice the in_progress window is the lesson that is
-- happening *right now*; its slot was already reserved while it was planned and
-- nobody schedules a new lesson into a slot in the present, so leaving the
-- exclusion on 'planned' carries no real double-booking risk.

-- 1) New status value. (CREATE OR REPLACE FUNCTION below only *stores* the
--    body; the new literal is never evaluated during this migration, so this is
--    safe within the single per-migration transaction.)
alter type public.lesson_status add value if not exists 'in_progress';

-- 2) start_lesson: planned -> in_progress. No credit movement.
create or replace function public.start_lesson(
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
     set status = 'in_progress'
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.started', 'lesson', p_lesson_id::text,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.start_lesson(uuid, uuid, uuid) from public;
revoke execute on function public.start_lesson(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.start_lesson(uuid, uuid, uuid) to service_role;

-- 3) complete_lesson: now accepts planned OR in_progress (so "Les afronden"
--    works whether or not the instructor pressed "Start les" first). Still no
--    credit movement — credits were consumed at scheduling time.
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
  if v_status not in ('planned', 'in_progress') then
    raise exception 'lesson % cannot be completed (status=%)', p_lesson_id, v_status;
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
revoke execute on function public.complete_lesson(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.complete_lesson(uuid, uuid, uuid) to service_role;
