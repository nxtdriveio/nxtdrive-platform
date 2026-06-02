-- 0056_lesson_actor_authorization.sql
--
-- Restore defense-in-depth actor authorization on the lesson-lifecycle RPCs.
--
-- Why: 0055 split "complete" into start_lesson + complete_lesson and, while
-- redefining them, dropped the `_lesson_actor_authorized(p_actor, p_tenant_id)`
-- guard that the original complete_lesson (0015/0023) carried. Execute is still
-- service-role only and the app layer authorizes before calling, but every
-- other lesson/agenda RPC in this codebase verifies the actor inside the
-- function as a second line of defense. This migration brings start_lesson and
-- complete_lesson back in line with that pattern.
--
-- 0055 is already applied to environments, so this is a forward-only fix
-- (the migration runner tracks by filename); we never edit an applied file.
-- Bodies are otherwise identical to 0055.

-- start_lesson: planned -> in_progress. No credit movement.
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

-- complete_lesson: accepts planned OR in_progress. No credit movement.
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
