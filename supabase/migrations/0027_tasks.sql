-- ============================================================================
-- 0027_tasks.sql
--
-- Module 11 (Taken & Workflow / Kanban) — data model + security foundation.
-- NO UI in this migration; this is the tenant-scoped base every Kanban screen
-- and automation builds on.
--
-- Five tables:
--   * task_departments  — the canon afdelingen (administratie, planning,
--                          finance, marketing, theorie, support, examenbeheer).
--   * task_boards       — one default board per department (extensible).
--   * task_columns      — ordered columns per board (Te doen / Bezig / Klaar).
--   * tasks             — the cards: title, description, priority, due date,
--                          assignee, department/board/column + ordering position.
--   * task_links        — polymorphic links from a card to a student / invoice /
--                          exam (CBR) / lesson / lead / instructor.
--
-- Invariants (mirror the rest of the schema):
--   * Every row is tenant-scoped (tenant_id) with RLS (member-select only) +
--     indexes from day one.
--   * Paired foreign keys use (id, tenant_id) so a child can never point at a
--     parent in another tenant.
--   * No INSERT/UPDATE/DELETE policies: all writes go through SECURITY DEFINER
--     RPCs that validate the actor's role and write an audit_log row.
--   * RPCs are locked down: execute revoked from public/anon/authenticated and
--     granted only to service_role (see 0023 for the rationale).
-- ============================================================================

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type public.task_priority as enum (
    'low',
    'normal',
    'high',
    'urgent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_link_type as enum (
    'student',
    'invoice',
    'exam',
    'lesson',
    'lead',
    'instructor'
  );
exception when duplicate_object then null; end $$;

-- task_departments -----------------------------------------------------------
create table if not exists public.task_departments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,
  name        text not null,
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(key)  between 1 and 64),
  check (char_length(name) between 1 and 120),
  unique (tenant_id, key)
);

drop trigger if exists task_departments_set_updated_at on public.task_departments;
create trigger task_departments_set_updated_at
  before update on public.task_departments
  for each row execute function public.set_updated_at();

create index if not exists idx_task_departments_tenant_sort
  on public.task_departments (tenant_id, sort_order, name);

alter table public.task_departments
  drop constraint if exists task_departments_id_tenant_unique;
alter table public.task_departments
  add constraint task_departments_id_tenant_unique unique (id, tenant_id);

-- task_boards ----------------------------------------------------------------
create table if not exists public.task_boards (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  department_id  uuid,
  name           text not null,
  sort_order     smallint not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (char_length(name) between 1 and 120),
  constraint task_boards_department_tenant_fkey
    foreign key (department_id, tenant_id)
    references public.task_departments (id, tenant_id)
    on delete set null
);

drop trigger if exists task_boards_set_updated_at on public.task_boards;
create trigger task_boards_set_updated_at
  before update on public.task_boards
  for each row execute function public.set_updated_at();

create index if not exists idx_task_boards_tenant_sort
  on public.task_boards (tenant_id, sort_order, name);
create index if not exists idx_task_boards_tenant_department
  on public.task_boards (tenant_id, department_id);

alter table public.task_boards
  drop constraint if exists task_boards_id_tenant_unique;
alter table public.task_boards
  add constraint task_boards_id_tenant_unique unique (id, tenant_id);

-- task_columns ---------------------------------------------------------------
create table if not exists public.task_columns (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  board_id    uuid not null,
  name        text not null,
  sort_order  integer not null default 0,
  wip_limit   integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(name) between 1 and 120),
  check (wip_limit is null or wip_limit > 0),
  constraint task_columns_board_tenant_fkey
    foreign key (board_id, tenant_id)
    references public.task_boards (id, tenant_id)
    on delete cascade
);

drop trigger if exists task_columns_set_updated_at on public.task_columns;
create trigger task_columns_set_updated_at
  before update on public.task_columns
  for each row execute function public.set_updated_at();

create index if not exists idx_task_columns_board_sort
  on public.task_columns (tenant_id, board_id, sort_order);

alter table public.task_columns
  drop constraint if exists task_columns_id_tenant_unique;
alter table public.task_columns
  add constraint task_columns_id_tenant_unique unique (id, tenant_id);

-- tasks (cards) --------------------------------------------------------------
create table if not exists public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  board_id             uuid not null,
  column_id            uuid not null,
  department_id        uuid,
  title                text not null,
  description          text,
  priority             public.task_priority not null default 'normal',
  due_date             date,
  assignee_user_id     uuid references auth.users(id) on delete set null,
  position             integer not null default 0,
  created_by           uuid references auth.users(id) on delete set null,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (char_length(title) between 1 and 200),
  check (description is null or char_length(description) <= 4000),
  constraint tasks_board_tenant_fkey
    foreign key (board_id, tenant_id)
    references public.task_boards (id, tenant_id)
    on delete cascade,
  constraint tasks_column_tenant_fkey
    foreign key (column_id, tenant_id)
    references public.task_columns (id, tenant_id)
    on delete restrict,
  constraint tasks_department_tenant_fkey
    foreign key (department_id, tenant_id)
    references public.task_departments (id, tenant_id)
    on delete set null
);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index if not exists idx_tasks_tenant_board
  on public.tasks (tenant_id, board_id);
create index if not exists idx_tasks_column_position
  on public.tasks (tenant_id, column_id, position);
create index if not exists idx_tasks_tenant_department
  on public.tasks (tenant_id, department_id);
create index if not exists idx_tasks_assignee
  on public.tasks (assignee_user_id)
  where assignee_user_id is not null;
create index if not exists idx_tasks_tenant_due
  on public.tasks (tenant_id, due_date)
  where due_date is not null;

alter table public.tasks
  drop constraint if exists tasks_id_tenant_unique;
alter table public.tasks
  add constraint tasks_id_tenant_unique unique (id, tenant_id);

-- task_links (polymorphic) ---------------------------------------------------
create table if not exists public.task_links (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  task_id      uuid not null,
  entity_type  public.task_link_type not null,
  entity_id    uuid not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint task_links_task_tenant_fkey
    foreign key (task_id, tenant_id)
    references public.tasks (id, tenant_id)
    on delete cascade,
  constraint task_links_unique unique (task_id, entity_type, entity_id)
);

create index if not exists idx_task_links_task
  on public.task_links (task_id);
create index if not exists idx_task_links_entity
  on public.task_links (tenant_id, entity_type, entity_id);

-- RLS ------------------------------------------------------------------------
alter table public.task_departments enable row level security;
alter table public.task_boards      enable row level security;
alter table public.task_columns     enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_links       enable row level security;

drop policy if exists task_departments_select_members on public.task_departments;
create policy task_departments_select_members on public.task_departments
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

drop policy if exists task_boards_select_members on public.task_boards;
create policy task_boards_select_members on public.task_boards
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

drop policy if exists task_columns_select_members on public.task_columns;
create policy task_columns_select_members on public.task_columns
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

drop policy if exists tasks_select_members on public.tasks;
create policy tasks_select_members on public.tasks
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );

drop policy if exists task_links_select_members on public.task_links;
create policy task_links_select_members on public.task_links
  for select
  using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
-- no insert/update/delete policies — writes go through RPCs (service role)

-- ============================================================================
-- RPCs
--
-- Every mutation RPC authorises the actor via public._lesson_actor_authorized
-- (tenant_admin / instructor of the tenant, or a platform admin) and writes an
-- audit_log row. All are service_role-only (grant lockdown at the end).
-- ============================================================================

-- ensure_default_task_setup: idempotently provision the canon departments, one
-- default board per department, and the default columns (Te doen / Bezig /
-- Klaar). Safe to re-run; used for tenant onboarding.
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

  -- Departments (canon afdelingen).
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

  -- One default board per department that has none.
  insert into public.task_boards (tenant_id, department_id, name, sort_order)
  select d.tenant_id, d.id, d.name, d.sort_order
    from public.task_departments d
   where d.tenant_id = p_tenant_id
     and not exists (
       select 1 from public.task_boards b where b.department_id = d.id
     );

  -- Default columns for any board (in this tenant) that has none.
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

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.defaults_seeded', 'tenant', p_tenant_id::text,
    jsonb_build_object('departments_inserted', v_dept_inserted)
  );
end;
$$;

-- create_task_board ----------------------------------------------------------
create or replace function public.create_task_board(
  p_tenant_id     uuid,
  p_actor         uuid,
  p_department_id uuid,
  p_name          text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'board name is required';
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
  end if;

  insert into public.task_boards (tenant_id, department_id, name)
  values (p_tenant_id, p_department_id, btrim(p_name))
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_board.created', 'task_board', v_id::text,
    jsonb_build_object('name', btrim(p_name), 'department_id', p_department_id)
  );
  return v_id;
end;
$$;

-- update_task_board ----------------------------------------------------------
create or replace function public.update_task_board(
  p_board_id      uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_name          text,
  p_department_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_boards
     where id = p_board_id and tenant_id = p_tenant_id
  ) then
    raise exception 'board % not found in tenant %', p_board_id, p_tenant_id;
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
  end if;

  update public.task_boards
     set name          = coalesce(nullif(btrim(p_name), ''), name),
         department_id = p_department_id
   where id = p_board_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_board.updated', 'task_board', p_board_id::text,
    jsonb_build_object('name', p_name, 'department_id', p_department_id)
  );
end;
$$;

-- archive_task_board ---------------------------------------------------------
create or replace function public.archive_task_board(
  p_board_id  uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_boards
     where id = p_board_id and tenant_id = p_tenant_id
  ) then
    raise exception 'board % not found in tenant %', p_board_id, p_tenant_id;
  end if;

  update public.task_boards
     set archived_at = now()
   where id = p_board_id and tenant_id = p_tenant_id and archived_at is null;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_board.archived', 'task_board', p_board_id::text,
    '{}'::jsonb
  );
end;
$$;

-- create_task_column ---------------------------------------------------------
create or replace function public.create_task_column(
  p_board_id  uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_name      text,
  p_wip_limit integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_pos integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_boards
     where id = p_board_id and tenant_id = p_tenant_id
  ) then
    raise exception 'board % not found in tenant %', p_board_id, p_tenant_id;
  end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'column name is required';
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_pos
    from public.task_columns
   where board_id = p_board_id and tenant_id = p_tenant_id;

  insert into public.task_columns (tenant_id, board_id, name, sort_order, wip_limit)
  values (p_tenant_id, p_board_id, btrim(p_name), v_pos, p_wip_limit)
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_column.created', 'task_column', v_id::text,
    jsonb_build_object('board_id', p_board_id, 'name', btrim(p_name))
  );
  return v_id;
end;
$$;

-- update_task_column ---------------------------------------------------------
create or replace function public.update_task_column(
  p_column_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_name      text,
  p_wip_limit integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.task_columns
     where id = p_column_id and tenant_id = p_tenant_id
  ) then
    raise exception 'column % not found in tenant %', p_column_id, p_tenant_id;
  end if;

  update public.task_columns
     set name      = coalesce(nullif(btrim(p_name), ''), name),
         wip_limit = p_wip_limit
   where id = p_column_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_column.updated', 'task_column', p_column_id::text,
    jsonb_build_object('name', p_name, 'wip_limit', p_wip_limit)
  );
end;
$$;

-- reorder_task_columns -------------------------------------------------------
create or replace function public.reorder_task_columns(
  p_board_id   uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_column_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if p_column_ids is null or array_length(p_column_ids, 1) is null then
    raise exception 'column id list is required';
  end if;

  -- Every supplied column must belong to this board + tenant.
  select count(*) into v_count
    from public.task_columns
   where board_id = p_board_id
     and tenant_id = p_tenant_id
     and id = any(p_column_ids);
  if v_count <> array_length(p_column_ids, 1) then
    raise exception 'one or more columns do not belong to board % / tenant %',
      p_board_id, p_tenant_id;
  end if;

  update public.task_columns c
     set sort_order = (x.ord * 10)
    from unnest(p_column_ids) with ordinality as x(id, ord)
   where c.id = x.id
     and c.board_id = p_board_id
     and c.tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task_column.reordered', 'task_board', p_board_id::text,
    jsonb_build_object('order', to_jsonb(p_column_ids))
  );
end;
$$;

-- create_task ----------------------------------------------------------------
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
  v_id       uuid;
  v_board    uuid;
  v_pos      integer;
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

  if p_department_id is not null and not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
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
    p_tenant_id, p_board_id, p_column_id, p_department_id, btrim(p_title),
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
      'department_id', p_department_id, 'assignee_user_id', p_assignee_user_id,
      'priority', coalesce(p_priority, 'normal')
    )
  );
  return v_id;
end;
$$;

-- update_task ----------------------------------------------------------------
create or replace function public.update_task(
  p_task_id       uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_title         text,
  p_description   text,
  p_priority      public.task_priority,
  p_due_date      date,
  p_department_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.tasks
     where id = p_task_id and tenant_id = p_tenant_id
  ) then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;
  if p_department_id is not null and not exists (
    select 1 from public.task_departments
     where id = p_department_id and tenant_id = p_tenant_id
  ) then
    raise exception 'department % not found in tenant %', p_department_id, p_tenant_id;
  end if;

  update public.tasks
     set title         = coalesce(nullif(btrim(p_title), ''), title),
         description   = p_description,
         priority      = coalesce(p_priority, priority),
         due_date      = p_due_date,
         department_id = p_department_id
   where id = p_task_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.updated', 'task', p_task_id::text,
    jsonb_build_object('priority', p_priority, 'department_id', p_department_id)
  );
end;
$$;

-- move_task ------------------------------------------------------------------
-- Move a card to a column at a target position, shifting the cards at/after
-- that position down to make room. Deterministic, gap-free enough for the UI.
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
  v_board uuid;
  v_pos   integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.tasks
     where id = p_task_id and tenant_id = p_tenant_id
  ) then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;

  select board_id into v_board
    from public.task_columns
   where id = p_column_id and tenant_id = p_tenant_id;
  if v_board is null then
    raise exception 'column % not found in tenant %', p_column_id, p_tenant_id;
  end if;

  v_pos := greatest(coalesce(p_position, 0), 0);

  -- Make room at the destination index (excluding the moving card itself).
  update public.tasks
     set position = position + 1
   where tenant_id = p_tenant_id
     and column_id = p_column_id
     and archived_at is null
     and id <> p_task_id
     and position >= v_pos;

  update public.tasks
     set column_id = p_column_id,
         board_id  = v_board,
         position  = v_pos
   where id = p_task_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.moved', 'task', p_task_id::text,
    jsonb_build_object('column_id', p_column_id, 'position', v_pos)
  );
end;
$$;

-- assign_task ----------------------------------------------------------------
-- Assign (or, with NULL, unassign) a card. A non-null assignee must be a member
-- of the tenant.
create or replace function public.assign_task(
  p_task_id          uuid,
  p_tenant_id        uuid,
  p_actor            uuid,
  p_assignee_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.tasks
     where id = p_task_id and tenant_id = p_tenant_id
  ) then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;
  if p_assignee_user_id is not null and not exists (
    select 1 from public.memberships
     where user_id = p_assignee_user_id and tenant_id = p_tenant_id
  ) then
    raise exception 'assignee % is not a member of tenant %', p_assignee_user_id, p_tenant_id;
  end if;

  update public.tasks
     set assignee_user_id = p_assignee_user_id
   where id = p_task_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.assigned', 'task', p_task_id::text,
    jsonb_build_object('assignee_user_id', p_assignee_user_id)
  );
end;
$$;

-- archive_task ---------------------------------------------------------------
create or replace function public.archive_task(
  p_task_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.tasks
     where id = p_task_id and tenant_id = p_tenant_id
  ) then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;

  update public.tasks
     set archived_at = now()
   where id = p_task_id and tenant_id = p_tenant_id and archived_at is null;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.archived', 'task', p_task_id::text, '{}'::jsonb
  );
end;
$$;

-- link_task_entity -----------------------------------------------------------
-- Link a card to an existing entity in the same tenant. The entity is validated
-- per type; 'exam' references the student whose exam/CBR readiness the task
-- concerns; 'instructor' references a member (auth user) of the tenant.
create or replace function public.link_task_entity(
  p_task_id     uuid,
  p_tenant_id   uuid,
  p_actor       uuid,
  p_entity_type public.task_link_type,
  p_entity_id   uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_valid boolean;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not exists (
    select 1 from public.tasks
     where id = p_task_id and tenant_id = p_tenant_id
  ) then
    raise exception 'task % not found in tenant %', p_task_id, p_tenant_id;
  end if;

  v_valid := case p_entity_type
    when 'student' then exists (
      select 1 from public.students where id = p_entity_id and tenant_id = p_tenant_id)
    when 'exam' then exists (
      select 1 from public.students where id = p_entity_id and tenant_id = p_tenant_id)
    when 'invoice' then exists (
      select 1 from public.invoices where id = p_entity_id and tenant_id = p_tenant_id)
    when 'lesson' then exists (
      select 1 from public.lessons where id = p_entity_id and tenant_id = p_tenant_id)
    when 'lead' then exists (
      select 1 from public.leads where id = p_entity_id and tenant_id = p_tenant_id)
    when 'instructor' then exists (
      select 1 from public.memberships
       where user_id = p_entity_id and tenant_id = p_tenant_id
         and role in ('tenant_admin', 'instructor'))
    else false
  end;
  if not v_valid then
    raise exception 'entity % (type %) not found in tenant %',
      p_entity_id, p_entity_type, p_tenant_id;
  end if;

  insert into public.task_links (tenant_id, task_id, entity_type, entity_id, created_by)
  values (p_tenant_id, p_task_id, p_entity_type, p_entity_id, p_actor)
  on conflict (task_id, entity_type, entity_id) do update
     set created_by = excluded.created_by
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.linked', 'task', p_task_id::text,
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id)
  );
  return v_id;
end;
$$;

-- unlink_task_entity ---------------------------------------------------------
create or replace function public.unlink_task_entity(
  p_link_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select task_id into v_task_id
    from public.task_links
   where id = p_link_id and tenant_id = p_tenant_id;
  if v_task_id is null then
    raise exception 'link % not found in tenant %', p_link_id, p_tenant_id;
  end if;

  delete from public.task_links
   where id = p_link_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'task.unlinked', 'task', v_task_id::text,
    jsonb_build_object('link_id', p_link_id)
  );
end;
$$;

-- ============================================================================
-- Backfill existing tenants (set-based, idempotent) — departments, one board
-- per department, default columns per board.
-- ============================================================================
insert into public.task_departments (tenant_id, key, name, sort_order)
select t.id, d.key, d.name, d.sort_order
  from public.tenants t
  cross join (values
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
 where not exists (
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
 where not exists (
   select 1 from public.task_columns col where col.board_id = b.id
 );

-- ============================================================================
-- Grant lockdown: Supabase default privileges auto-grant EXECUTE on new public
-- functions to anon/authenticated. Revoke and re-grant to service_role only
-- (see 0023 for the rationale).
-- ============================================================================
revoke all on function public.ensure_default_task_setup(uuid, uuid) from public;
revoke execute on function public.ensure_default_task_setup(uuid, uuid) from anon, authenticated;
grant execute on function public.ensure_default_task_setup(uuid, uuid) to service_role;

revoke all on function public.create_task_board(uuid, uuid, uuid, text) from public;
revoke execute on function public.create_task_board(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.create_task_board(uuid, uuid, uuid, text) to service_role;

revoke all on function public.update_task_board(uuid, uuid, uuid, text, uuid) from public;
revoke execute on function public.update_task_board(uuid, uuid, uuid, text, uuid) from anon, authenticated;
grant execute on function public.update_task_board(uuid, uuid, uuid, text, uuid) to service_role;

revoke all on function public.archive_task_board(uuid, uuid, uuid) from public;
revoke execute on function public.archive_task_board(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.archive_task_board(uuid, uuid, uuid) to service_role;

revoke all on function public.create_task_column(uuid, uuid, uuid, text, integer) from public;
revoke execute on function public.create_task_column(uuid, uuid, uuid, text, integer) from anon, authenticated;
grant execute on function public.create_task_column(uuid, uuid, uuid, text, integer) to service_role;

revoke all on function public.update_task_column(uuid, uuid, uuid, text, integer) from public;
revoke execute on function public.update_task_column(uuid, uuid, uuid, text, integer) from anon, authenticated;
grant execute on function public.update_task_column(uuid, uuid, uuid, text, integer) to service_role;

revoke all on function public.reorder_task_columns(uuid, uuid, uuid, uuid[]) from public;
revoke execute on function public.reorder_task_columns(uuid, uuid, uuid, uuid[]) from anon, authenticated;
grant execute on function public.reorder_task_columns(uuid, uuid, uuid, uuid[]) to service_role;

revoke all on function public.create_task(uuid, uuid, uuid, uuid, text, text, public.task_priority, date, uuid, uuid) from public;
revoke execute on function public.create_task(uuid, uuid, uuid, uuid, text, text, public.task_priority, date, uuid, uuid) from anon, authenticated;
grant execute on function public.create_task(uuid, uuid, uuid, uuid, text, text, public.task_priority, date, uuid, uuid) to service_role;

revoke all on function public.update_task(uuid, uuid, uuid, text, text, public.task_priority, date, uuid) from public;
revoke execute on function public.update_task(uuid, uuid, uuid, text, text, public.task_priority, date, uuid) from anon, authenticated;
grant execute on function public.update_task(uuid, uuid, uuid, text, text, public.task_priority, date, uuid) to service_role;

revoke all on function public.move_task(uuid, uuid, uuid, uuid, integer) from public;
revoke execute on function public.move_task(uuid, uuid, uuid, uuid, integer) from anon, authenticated;
grant execute on function public.move_task(uuid, uuid, uuid, uuid, integer) to service_role;

revoke all on function public.assign_task(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.assign_task(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.assign_task(uuid, uuid, uuid, uuid) to service_role;

revoke all on function public.archive_task(uuid, uuid, uuid) from public;
revoke execute on function public.archive_task(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.archive_task(uuid, uuid, uuid) to service_role;

revoke all on function public.link_task_entity(uuid, uuid, uuid, public.task_link_type, uuid) from public;
revoke execute on function public.link_task_entity(uuid, uuid, uuid, public.task_link_type, uuid) from anon, authenticated;
grant execute on function public.link_task_entity(uuid, uuid, uuid, public.task_link_type, uuid) to service_role;

revoke all on function public.unlink_task_entity(uuid, uuid, uuid) from public;
revoke execute on function public.unlink_task_entity(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.unlink_task_entity(uuid, uuid, uuid) to service_role;
