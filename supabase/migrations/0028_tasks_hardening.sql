-- ============================================================================
-- 0028_tasks_hardening.sql
--
-- Follow-up hardening for Module 11 (Kanban), addressing two issues found in
-- review of 0027:
--
--   1. move_task reordering was incomplete: it shifted the destination column
--      but never compacted the source column (cross-column moves left gaps) and
--      mishandled same-column downward moves. This rewrites move_task to be
--      fully rank-based: it produces contiguous 0-based positions in BOTH the
--      destination and the source column, under row locks for deterministic
--      concurrent behaviour.
--
--   2. New tenants were not guaranteed the default Kanban setup. 0027 backfills
--      existing tenants and exposes ensure_default_task_setup(), but nothing
--      enforced it on tenant creation. This adds an AFTER INSERT trigger on
--      public.tenants that idempotently provisions the canon departments, one
--      default board per department, and the default columns — independent of
--      which code path creates the tenant.
-- ============================================================================

-- 1. move_task (rank-based, source + destination compaction) -----------------
create or replace function public.move_task(
  p_task_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_column_id uuid,
  p_position  integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src   uuid;
  v_board uuid;
  v_max   integer;
  v_pos   integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  -- Current column of the task (also the existence check).
  select column_id into v_src
    from public.tasks
   where id = p_task_id and tenant_id = p_tenant_id;
  if v_src is null then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;

  -- Destination column must exist in tenant; derive its board.
  select board_id into v_board
    from public.task_columns
   where id = p_column_id and tenant_id = p_tenant_id;
  if v_board is null then
    raise exception 'column % not found in tenant %', p_column_id, p_tenant_id;
  end if;

  -- Lock all non-archived cards in both affected columns for a deterministic
  -- concurrent reorder.
  perform 1
    from public.tasks
   where tenant_id = p_tenant_id
     and archived_at is null
     and column_id in (v_src, p_column_id)
   for update;

  -- Clamp the target index to [0, number of OTHER cards in the destination].
  select count(*) into v_max
    from public.tasks
   where tenant_id = p_tenant_id
     and column_id = p_column_id
     and archived_at is null
     and id <> p_task_id;
  v_pos := least(greatest(coalesce(p_position, 0), 0), v_max);

  -- Place the task in the destination column at v_pos, shifting the cards that
  -- currently sit at/after v_pos up by one. Rank-based, so the result is always
  -- contiguous regardless of prior gaps. Handles same-column moves too (the
  -- task's old slot is excluded from "others").
  with others as (
    select id,
           row_number() over (order by position, created_at) - 1 as rnk
      from public.tasks
     where tenant_id = p_tenant_id
       and column_id = p_column_id
       and archived_at is null
       and id <> p_task_id
  ),
  final as (
    select id, case when rnk < v_pos then rnk else rnk + 1 end as new_pos
      from others
    union all
    select p_task_id, v_pos
  )
  update public.tasks t
     set position  = f.new_pos,
         column_id = p_column_id,
         board_id  = v_board
    from final f
   where t.id = f.id
     and t.tenant_id = p_tenant_id;

  -- Compact the source column when the move was cross-column (the destination
  -- was already renumbered above).
  if v_src is distinct from p_column_id then
    with ordered as (
      select id,
             row_number() over (order by position, created_at) - 1 as new_pos
        from public.tasks
       where tenant_id = p_tenant_id
         and column_id = v_src
         and archived_at is null
    )
    update public.tasks t
       set position = o.new_pos
      from ordered o
     where t.id = o.id
       and t.tenant_id = p_tenant_id
       and t.position is distinct from o.new_pos;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.moved', 'task', p_task_id::text,
    jsonb_build_object('column_id', p_column_id, 'position', v_pos)
  );
end;
$$;

-- move_task signature is unchanged, but re-assert the grant lockdown so a fresh
-- DB (where this runs as one migration set) is never left with the Supabase
-- default anon/authenticated execute grants.
revoke all on function public.move_task(uuid, uuid, uuid, uuid, integer) from public;
revoke execute on function public.move_task(uuid, uuid, uuid, uuid, integer) from anon, authenticated;
grant execute on function public.move_task(uuid, uuid, uuid, uuid, integer) to service_role;

-- 2. Auto-provision default Kanban setup for every new tenant ----------------
-- System-driven (no actor): runs as a SECURITY DEFINER trigger so it works
-- regardless of which path inserts the tenant. Idempotent, mirroring the
-- backfill in 0027 and the body of ensure_default_task_setup().
create or replace function public._provision_task_defaults_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_departments (tenant_id, key, name, sort_order)
  select new.id, d.key, d.name, d.sort_order
    from (values
      ('administratie', 'Administratie',  10),
      ('planning',      'Planning',       20),
      ('finance',       'Finance',        30),
      ('marketing',     'Marketing',      40),
      ('theorie',       'Theorie',        50),
      ('support',       'Support',        60),
      ('examenbeheer',  'Examenbeheer',   70)
    ) as d(key, name, sort_order)
  on conflict (tenant_id, key) do nothing;

  insert into public.task_boards (tenant_id, department_id, name, sort_order)
  select d.tenant_id, d.id, d.name, d.sort_order
    from public.task_departments d
   where d.tenant_id = new.id
     and not exists (
       select 1 from public.task_boards b where b.department_id = d.id
     );

  insert into public.task_columns (tenant_id, board_id, name, sort_order)
  select b.tenant_id, b.id, c.name, c.sort_order
    from public.task_boards b
    cross join (values
      ('Te doen', 10),
      ('Bezig',   20),
      ('Klaar',   30)
    ) as c(name, sort_order)
   where b.tenant_id = new.id
     and not exists (
       select 1 from public.task_columns col where col.board_id = b.id
     );

  return new;
end;
$$;

drop trigger if exists tenants_provision_task_defaults on public.tenants;
create trigger tenants_provision_task_defaults
  after insert on public.tenants
  for each row execute function public._provision_task_defaults_for_tenant();

revoke all on function public._provision_task_defaults_for_tenant() from public;
revoke execute on function public._provision_task_defaults_for_tenant() from anon, authenticated;
grant execute on function public._provision_task_defaults_for_tenant() to service_role;
