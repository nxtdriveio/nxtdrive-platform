create or replace function public.set_lesson_progress(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_score     smallint,
  p_summary   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  public.lesson_status;
  v_summary text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then
    raise exception 'progress score must be between 0 and 10';
  end if;

  select status into v_status
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_status is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;
  if v_status not in ('planned', 'in_progress', 'completed') then
    raise exception 'cannot record progress on lesson with status %', v_status;
  end if;

  v_summary := nullif(trim(coalesce(p_summary, '')), '');

  update public.lessons
     set progress_score   = p_score,
         progress_summary = v_summary
   where id = p_lesson_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.progress_set', 'lesson', p_lesson_id::text,
    jsonb_build_object('score', p_score, 'has_summary', v_summary is not null)
  );
end;
$$;

revoke all on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text) from public;
grant execute on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text) to service_role;
