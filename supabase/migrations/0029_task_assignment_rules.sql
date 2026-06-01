-- ============================================================================
-- 0029_task_assignment_rules.sql
--
-- Closes out Module 11 (Taken & Workflow): tenant-configurable automatic
-- assignment of a task to a department at creation, plus a new 'task_assigned'
-- notification type.
--
-- Canon (Module 11): an instructor creates "Controleer CBR-machtiging leerling"
-- and the task is automatically routed to the Administratie department. This is
-- tenant-configurable (never hardcoded per school) via task_assignment_rules.
--
--   * task_assignment_rules: tenant-scoped keyword → department rules, RLS
--     (members read), mutations via locked SECURITY DEFINER RPCs only.
--   * resolve_task_assignment(): first active matching rule wins; read-only.
--   * create_task(): when no department is supplied, resolves one from the
--     rules; falls back to the board's own department (sensible default on
--     no match) so every card still gets a department.
--   * Default rule (CBR-machtiging → Administratie) provisioned per tenant the
--     same way default departments/boards/columns are — product behaviour, not
--     demo data — and backfilled for existing tenants.
--   * Extends the notification CHECK constraints to allow 'task_assigned'.
-- ============================================================================

-- 1. task_assignment_rules ---------------------------------------------------
create table if not exists public.task_assignment_rules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  match_type    text not null default 'contains'
                  check (match_type in ('contains', 'equals', 'starts_with')),
  keyword       text not null,
  department_id uuid not null,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (char_length(keyword) between 1 and 120),
  constraint task_assignment_rules_department_tenant_fkey
    foreign key (department_id, tenant_id)
    references public.task_departments (id, tenant_id)
    on delete cascade
);

drop trigger if exists task_assignment_rules_set_updated_at on public.task_assignment_rules;
create trigger task_assignment_rules_set_updated_at
  before update on public.task_assignment_rules
  for each row execute function public.set_updated_at();

create index if not exists idx_task_assignment_rules_tenant_eval
  on public.task_assignment_rules (tenant_id, active, sort_order, created_at);

-- RLS: members read their tenant's rules; writes go through RPCs (service role).
alter table public.task_assignment_rules enable row level security;
drop policy if exists task_assignment_rules_select_members on public.task_assignment_rules;
create policy task_assignment_rules_select_members on public.task_assignment_rules
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

-- 2. resolve_task_assignment -------------------------------------------------
-- Read-only: returns the department (and that department's default board) for
-- the first active rule whose keyword matches the title, ordered by
-- (sort_order, created_at). Returns no row when nothing matches. SECURITY
-- DEFINER so create_task can call it; locked to service_role for any external
-- caller.
create or replace function public.resolve_task_assignment(
  p_tenant_id uuid,
  p_title     text
) returns table (rule_id uuid, department_id uuid, board_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         r.department_id,
         (select b.id
            from public.task_boards b
           where b.tenant_id = r.tenant_id
             and b.department_id = r.department_id
             and b.archived_at is null
           order by b.sort_order, b.created_at
           limit 1)
    from public.task_assignment_rules r
   where r.tenant_id = p_tenant_id
     and r.active
     and p_title is not null
     and case r.match_type
           when 'contains'    then position(lower(r.keyword) in lower(p_title)) > 0
           when 'equals'      then lower(btrim(p_title)) = lower(btrim(r.keyword))
           when 'starts_with' then lower(p_title) like lower(r.keyword) || '%'
           else false
         end
   order by r.sort_order, r.created_at
   limit 1;
$$;

-- 3. create_task: auto-resolve department when none supplied -----------------
-- Same signature as 0027 (grants preserved by CREATE OR REPLACE). When the
-- caller passes no department, derive one from the assignment rules; on no
-- match, inherit the board's own department.
create or replace function public.create_task(
  p_tenant_id        uuid,
  p_actor            uuid,
  p_board_id         uuid,
  p_column_id        uuid,
  p_title            text,
  p_description      text,
  p_priority         public.task_priority,
  p_due_date         date,
  p_assignee_user_id uuid,
  p_department_id    uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_board uuid;
  v_pos   integer;
  v_dept  uuid := p_department_id;
  v_rule  uuid;
  v_auto  boolean := false;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'task title is required';
  end if;

  -- Column must exist in tenant; derive/validate its board.
  select board_id into v_board
    from public.task_columns
   where id = p_column_id and tenant_id = p_tenant_id;
  if v_board is null then
    raise exception 'column % not found in tenant %', p_column_id, p_tenant_id;
  end if;
  if v_board <> p_board_id then
    raise exception 'column % does not belong to board %', p_column_id, p_board_id;
  end if;

  -- Auto-assignment: only when the caller did not pin a department.
  if v_dept is null then
    select ra.rule_id, ra.department_id
      into v_rule, v_dept
      from public.resolve_task_assignment(p_tenant_id, btrim(p_title)) ra;
    if v_rule is not null then
      v_auto := true;
    else
      -- Sensible default: inherit the department of the board the card lives on.
      select department_id into v_dept
        from public.task_boards
       where id = p_board_id and tenant_id = p_tenant_id;
    end if;
  end if;

  if v_dept is not null and not exists (
    select 1 from public.task_departments
     where id = v_dept and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', v_dept, p_tenant_id;
  end if;

  if p_assignee_user_id is not null and not exists (
    select 1 from public.memberships
     where user_id = p_assignee_user_id and tenant_id = p_tenant_id
  ) then
    raise exception 'assignee % is not a member of tenant %', p_assignee_user_id, p_tenant_id;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from public.tasks
   where column_id = p_column_id and tenant_id = p_tenant_id and archived_at is null;

  insert into public.tasks (
    tenant_id, board_id, column_id, department_id, title, description,
    priority, due_date, assignee_user_id, position, created_by
  ) values (
    p_tenant_id, p_board_id, p_column_id, v_dept, btrim(p_title),
    p_description, coalesce(p_priority, 'normal'), p_due_date,
    p_assignee_user_id, v_pos, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.created', 'task', v_id::text,
    jsonb_build_object(
      'board_id', p_board_id, 'column_id', p_column_id,
      'department_id', v_dept, 'assignee_user_id', p_assignee_user_id,
      'priority', coalesce(p_priority, 'normal'),
      'auto_assigned', v_auto, 'assignment_rule_id', v_rule
    )
  );
  return v_id;
end;
$$;

-- 4. Rule management RPCs (tenant_admin only) --------------------------------
create or replace function public.create_task_assignment_rule(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_keyword       text,
  p_match_type    text,
  p_department_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_pos integer;
  v_mt  text := coalesce(p_match_type, 'contains');
begin
  if not exists (
    select 1 from public.memberships
     where user_id = p_actor and tenant_id = p_tenant_id and role = 'tenant_admin'
  ) then
    raise exception 'actor % is not a tenant_admin for tenant %', p_actor, p_tenant_id;
  end if;
  if p_keyword is null or char_length(btrim(p_keyword)) = 0 then
    raise exception 'keyword is required';
  end if;
  if v_mt not in ('contains', 'equals', 'starts_with') then
    raise exception 'invalid match_type %', p_match_type;
  end if;
  if not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_pos
    from public.task_assignment_rules where tenant_id = p_tenant_id;

  insert into public.task_assignment_rules (
    tenant_id, keyword, match_type, department_id, sort_order
  ) values (
    p_tenant_id, btrim(p_keyword), v_mt, p_department_id, v_pos
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.rule_created', 'task_assignment_rule', v_id::text,
    jsonb_build_object('keyword', btrim(p_keyword), 'match_type', v_mt, 'department_id', p_department_id)
  );
  return v_id;
end;
$$;

create or replace function public.update_task_assignment_rule(
  p_rule_id       uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_keyword       text,
  p_match_type    text,
  p_department_id uuid,
  p_active        boolean,
  p_sort_order    integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships
     where user_id = p_actor and tenant_id = p_tenant_id and role = 'tenant_admin'
  ) then
    raise exception 'actor % is not a tenant_admin for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_assignment_rules
     where id = p_rule_id and tenant_id = p_tenant_id
  ) then
    raise exception 'rule % not found in tenant %', p_rule_id, p_tenant_id;
  end if;
  if p_match_type is not null
     and p_match_type not in ('contains', 'equals', 'starts_with') then
    raise exception 'invalid match_type %', p_match_type;
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
  end if;

  update public.task_assignment_rules
     set keyword       = coalesce(nullif(btrim(p_keyword), ''), keyword),
         match_type    = coalesce(p_match_type, match_type),
         department_id = coalesce(p_department_id, department_id),
         active        = coalesce(p_active, active),
         sort_order    = coalesce(p_sort_order, sort_order)
   where id = p_rule_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.rule_updated', 'task_assignment_rule', p_rule_id::text,
    jsonb_build_object(
      'keyword', p_keyword, 'match_type', p_match_type,
      'department_id', p_department_id, 'active', p_active, 'sort_order', p_sort_order
    )
  );
end;
$$;

create or replace function public.delete_task_assignment_rule(
  p_rule_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.memberships
     where user_id = p_actor and tenant_id = p_tenant_id and role = 'tenant_admin'
  ) then
    raise exception 'actor % is not a tenant_admin for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_assignment_rules
     where id = p_rule_id and tenant_id = p_tenant_id
  ) then
    raise exception 'rule % not found in tenant %', p_rule_id, p_tenant_id;
  end if;

  delete from public.task_assignment_rules
   where id = p_rule_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.rule_deleted', 'task_assignment_rule', p_rule_id::text, '{}'::jsonb
  );
end;
$$;

-- 5. Provision the default rule per tenant -----------------------------------
-- Re-create the two default-provisioning functions (same signatures, grants
-- preserved) to also seed the canon default rule when a tenant has none.
create or replace function public.ensure_default_task_setup(
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dept_inserted integer := 0;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  insert into public.task_departments (tenant_id, key, name, sort_order)
  select p_tenant_id, d.key, d.name, d.sort_order
    from (values
      ('administratie', 'Administratie',  10),
      ('planning',      'Planning',       20),
      ('finance',       'Finance',        30),
      ('marketing',     'Marketing',      40),
      ('theorie',       'Theorie',        50),
      ('support',       'Support',        60),
      ('examenbeheer',  'Examenbeheer',   70)
    ) as d(key, name, sort_order)
   where not exists (
     select 1 from public.task_departments td
      where td.tenant_id = p_tenant_id and td.key = d.key
   );
  get diagnostics v_dept_inserted = row_count;

  insert into public.task_boards (tenant_id, department_id, name, sort_order)
  select d.tenant_id, d.id, d.name, d.sort_order
    from public.task_departments d
   where d.tenant_id = p_tenant_id
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
   where b.tenant_id = p_tenant_id
     and not exists (
       select 1 from public.task_columns col where col.board_id = b.id
     );

  -- Default assignment rule (canon example), only if the tenant has none yet.
  insert into public.task_assignment_rules (tenant_id, keyword, match_type, department_id, sort_order)
  select p_tenant_id, 'CBR-machtiging', 'contains', d.id, 0
    from public.task_departments d
   where d.tenant_id = p_tenant_id and d.key = 'administratie'
     and not exists (
       select 1 from public.task_assignment_rules r where r.tenant_id = p_tenant_id
     );

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.defaults_seeded', 'tenant', p_tenant_id::text,
    jsonb_build_object('departments_inserted', v_dept_inserted)
  );
end;
$$;

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

  insert into public.task_assignment_rules (tenant_id, keyword, match_type, department_id, sort_order)
  select d.tenant_id, 'CBR-machtiging', 'contains', d.id, 0
    from public.task_departments d
   where d.tenant_id = new.id and d.key = 'administratie'
     and not exists (
       select 1 from public.task_assignment_rules r where r.tenant_id = new.id
     );

  return new;
end;
$$;

-- Backfill the default rule for existing tenants that have none.
insert into public.task_assignment_rules (tenant_id, keyword, match_type, department_id, sort_order)
select d.tenant_id, 'CBR-machtiging', 'contains', d.id, 0
  from public.task_departments d
 where d.key = 'administratie'
   and not exists (
     select 1 from public.task_assignment_rules r where r.tenant_id = d.tenant_id
   );

-- 6. Extend notification CHECK constraints for 'task_assigned' ---------------
-- Drop the existing enum-style CHECKs (auto-named) robustly, then re-add named
-- ones that also permit 'task_assigned'.
do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
      from pg_constraint
     where contype = 'c'
       and conrelid in (
         'public.notification_log'::regclass,
         'public.notification_templates'::regclass
       )
       and pg_get_constraintdef(oid) ilike '%payment_confirmation%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type in ('payment_confirmation', 'lesson_reminder', 'task_assigned'));

alter table public.notification_templates
  add constraint notification_templates_key_check
  check (key in ('payment_confirmation', 'lesson_reminder', 'task_assigned'));

-- 7. Grant lockdown for the new/replaced functions ---------------------------
-- (create_task / ensure_default_task_setup / _provision_task_defaults_for_tenant
--  keep their existing grants via CREATE OR REPLACE.)
revoke all on function public.resolve_task_assignment(uuid, text) from public;
revoke execute on function public.resolve_task_assignment(uuid, text) from anon, authenticated;
grant execute on function public.resolve_task_assignment(uuid, text) to service_role;

revoke all on function public.create_task_assignment_rule(uuid, uuid, text, text, uuid) from public;
revoke execute on function public.create_task_assignment_rule(uuid, uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.create_task_assignment_rule(uuid, uuid, text, text, uuid) to service_role;

revoke all on function public.update_task_assignment_rule(uuid, uuid, uuid, text, text, uuid, boolean, integer) from public;
revoke execute on function public.update_task_assignment_rule(uuid, uuid, uuid, text, text, uuid, boolean, integer) from anon, authenticated;
grant execute on function public.update_task_assignment_rule(uuid, uuid, uuid, text, text, uuid, boolean, integer) to service_role;

revoke all on function public.delete_task_assignment_rule(uuid, uuid, uuid) from public;
revoke execute on function public.delete_task_assignment_rule(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.delete_task_assignment_rule(uuid, uuid, uuid) to service_role;
