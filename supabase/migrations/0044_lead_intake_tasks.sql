-- ---------------------------------------------------------------------------
-- 0044_lead_intake_tasks.sql
--
-- Turn intake "aandachtspunten" (Fase 1B intake-analyse) into ready-made
-- backoffice tasks. The instructor can, from the lead-detail page, convert a
-- specific attention point (or all of them) into a Kanban task with one click.
--
--   * ensure_lead_intake_task(): idempotent (one open task per dedupe_key),
--     linked to the lead, and routed via the existing task-assignment rules
--     (resolve_task_assignment) so e.g. a "CBR-machtiging" task lands on the
--     Administratie board. Falls back to the first board when no rule matches.
--
-- These are instructor-initiated reminders, not funnel-stage auto-tasks, so the
-- task_type is 'manual' — the lead automation stale-sweep (which only archives
-- non-manual auto-tasks) must never silently remove them. Idempotency still
-- holds via the (tenant_id, dedupe_key) partial unique index from 0040.
--
-- SECURITY DEFINER + locked to service_role (anon/authenticated revoked), in
-- line with the canon: task mutations are server-side only.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_lead_intake_task(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_lead_id     uuid,
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
  v_dept     uuid;
  v_rule     uuid;
  v_pos      integer;
  v_id       uuid;
begin
  -- Actor is required: these are always instructor/admin initiated.
  if p_actor is null or not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.leads where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'dedupe_key is required';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'task title is required';
  end if;

  -- Idempotency: an open task with this key already covers the attention point.
  select id into v_existing
    from public.tasks
   where tenant_id = p_tenant_id
     and dedupe_key = p_dedupe_key
     and archived_at is null
   limit 1;
  if found then
    return v_existing;
  end if;

  -- Route via the tenant's assignment rules (keyword → department + its board).
  select ra.rule_id, ra.department_id, ra.board_id
    into v_rule, v_dept, v_board
    from public.resolve_task_assignment(p_tenant_id, btrim(p_title)) ra;

  -- Resolve the target column: the matched department's board first column;
  -- otherwise the first non-archived board's first column.
  if v_board is not null then
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order, created_at
     limit 1;
  end if;

  if v_column is null then
    select c.id, c.board_id into v_column, v_board
      from public.task_columns c
      join public.task_boards b
        on b.id = c.board_id and b.tenant_id = c.tenant_id
     where c.tenant_id = p_tenant_id
       and b.archived_at is null
     order by b.sort_order, b.created_at, c.sort_order
     limit 1;
  end if;

  -- Bootstrap a board if the tenant has none yet (mirrors ensure_lead_task).
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
    v_dept := null;
  end if;

  -- Keep department_id consistent with the board we land on.
  if v_dept is null then
    select department_id into v_dept
      from public.task_boards
     where id = v_board and tenant_id = p_tenant_id;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from public.tasks
   where column_id = v_column and tenant_id = p_tenant_id and archived_at is null;

  insert into public.tasks (
    tenant_id, board_id, column_id, department_id, title, description,
    priority, due_date, position, created_by, task_type, dedupe_key
  ) values (
    p_tenant_id, v_board, v_column, v_dept, btrim(p_title), p_description,
    coalesce(p_priority, 'normal'), p_due_date, v_pos, p_actor,
    'manual', p_dedupe_key
  )
  returning id into v_id;

  insert into public.task_links (tenant_id, task_id, entity_type, entity_id, created_by)
  values (p_tenant_id, v_id, 'lead', p_lead_id, p_actor)
  on conflict (task_id, entity_type, entity_id) do nothing;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload, metadata)
  values (
    p_lead_id, p_tenant_id, p_actor, 'task_auto_created',
    jsonb_build_object('task_id', v_id::text, 'title', btrim(p_title)),
    jsonb_build_object('dedupe_key', p_dedupe_key, 'source', 'intake_attention')
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'task.intake_created', 'task', v_id::text,
    jsonb_build_object(
      'lead_id', p_lead_id::text, 'dedupe_key', p_dedupe_key,
      'department_id', v_dept, 'assignment_rule_id', v_rule, 'source', 'intake_attention'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ensure_lead_intake_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) from public;
revoke execute on function public.ensure_lead_intake_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) from anon, authenticated;
grant execute on function public.ensure_lead_intake_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) to service_role;
