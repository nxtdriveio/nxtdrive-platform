-- Sprint 4C: branch-aware task boards and tasks.
--
-- `branch_id = null` means the board/task is shared across the organization.
-- Branch-scoped views include shared rows plus rows from the caller's branches.

alter table public.task_boards
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

alter table public.tasks
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

create index if not exists idx_task_boards_tenant_branch
  on public.task_boards (tenant_id, branch_id)
  where branch_id is not null;

create index if not exists idx_tasks_tenant_branch
  on public.tasks (tenant_id, branch_id)
  where branch_id is not null;

create index if not exists idx_tasks_tenant_assignee
  on public.tasks (tenant_id, assignee_user_id)
  where assignee_user_id is not null and archived_at is null;

create or replace function public.ensure_task_branch_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.branch_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = new.branch_id
      and b.tenant_id = new.tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists task_boards_branch_tenant_guard on public.task_boards;
create trigger task_boards_branch_tenant_guard
  before insert or update of tenant_id, branch_id on public.task_boards
  for each row
  execute function public.ensure_task_branch_tenant();

drop trigger if exists tasks_branch_tenant_guard on public.tasks;
create trigger tasks_branch_tenant_guard
  before insert or update of tenant_id, branch_id on public.tasks
  for each row
  execute function public.ensure_task_branch_tenant();

create or replace function public.assign_task_branch(
  p_task_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_branch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  update public.tasks
     set branch_id = p_branch_id,
         updated_at = now()
   where id = p_task_id
     and tenant_id = p_tenant_id;

  if not found then
    raise exception 'task not found';
  end if;

  perform p_actor;
end;
$$;

revoke all on function public.assign_task_branch(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_task_branch(uuid, uuid, uuid, uuid) to service_role;

comment on column public.task_boards.branch_id is
  'Optional operational branch assignment. Null means shared across the organization.';

comment on column public.tasks.branch_id is
  'Optional operational branch assignment. Null means shared across the organization.';

comment on function public.assign_task_branch(uuid, uuid, uuid, uuid) is
  'Assigns a task to a branch. Null branch means shared organization task. Service-role only; app code must authorize task:manage first.';
