-- Make franchise planning steering delegation-aware and auditable.
--
-- Franchisegevers do not silently mutate local rosters from the network view.
-- They create governed planning actions against a franchisee/branch/instructor.
-- The local franchisee explicitly accepts, declines, or completes the action and
-- receives a local planning task for execution.

create table if not exists public.franchise_planning_actions (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  instructor_user_id uuid references auth.users(id) on delete set null,
  central_task_id uuid references public.tasks(id) on delete set null,
  local_task_id uuid references public.tasks(id) on delete set null,
  action_type text not null
    check (action_type in (
      'capacity_request',
      'planning_task',
      'open_local_planboard',
      'branch_directive',
      'instructor_directive'
    )),
  status text not null default 'created'
    check (status in ('created', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled')),
  request_key text not null,
  title text not null,
  description text,
  requested_capacity_hours numeric(5, 2),
  requested_date date,
  priority public.task_priority not null default 'normal',
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  declined_by uuid references auth.users(id) on delete set null,
  declined_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  local_response text,
  resolution text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(request_key) between 1 and 220),
  check (char_length(title) between 1 and 200),
  check (description is null or char_length(description) <= 4000),
  check (requested_capacity_hours is null or requested_capacity_hours > 0),
  check (local_response is null or char_length(local_response) <= 2000),
  check (resolution is null or char_length(resolution) <= 4000)
);

create unique index if not exists idx_franchise_planning_actions_active_key
  on public.franchise_planning_actions (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    request_key
  )
  where status in ('created', 'accepted', 'in_progress');

create index if not exists idx_franchise_planning_actions_root
  on public.franchise_planning_actions (franchise_root_tenant_id, status, created_at desc);

create index if not exists idx_franchise_planning_actions_franchisee
  on public.franchise_planning_actions (franchisee_tenant_id, status, created_at desc);

create index if not exists idx_franchise_planning_actions_branch
  on public.franchise_planning_actions (branch_id, status)
  where branch_id is not null;

create index if not exists idx_franchise_planning_actions_instructor
  on public.franchise_planning_actions (instructor_user_id, status)
  where instructor_user_id is not null;

drop trigger if exists franchise_planning_actions_set_updated_at
  on public.franchise_planning_actions;
create trigger franchise_planning_actions_set_updated_at
  before update on public.franchise_planning_actions
  for each row execute function public.set_updated_at();

comment on table public.franchise_planning_actions is
  'Delegation-aware franchise planning steering workflow. Root tenant requests or directs; local franchisee accepts and executes.';
comment on column public.franchise_planning_actions.action_type is
  'capacity_request, planning_task, open_local_planboard, branch_directive, or instructor_directive.';
comment on column public.franchise_planning_actions.request_key is
  'Idempotency key for one active planning action per root/franchisee/request.';
comment on column public.franchise_planning_actions.central_task_id is
  'Governance task in the franchisegever tenant.';
comment on column public.franchise_planning_actions.local_task_id is
  'Execution task in the local franchisee tenant after acceptance.';

create or replace function public._franchise_planning_action_label(p_action_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_action_type
    when 'capacity_request' then 'Capaciteit aanvragen'
    when 'planning_task' then 'Planningtaak maken'
    when 'open_local_planboard' then 'Lokaal planboard openen'
    when 'branch_directive' then 'Sturen op vestiging'
    when 'instructor_directive' then 'Sturen op instructeur'
    else 'Franchise planning'
  end;
$$;

revoke all on function public._franchise_planning_action_label(text) from public;
revoke all on function public._franchise_planning_action_label(text) from anon;
revoke all on function public._franchise_planning_action_label(text) from authenticated;

create or replace function public._franchise_planning_delegation_active(
  p_franchise_root_tenant_id uuid,
  p_franchisee_tenant_id uuid,
  p_branch_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.franchise_operations_permissions fp
     where fp.franchise_root_tenant_id = p_franchise_root_tenant_id
       and fp.franchisee_tenant_id = p_franchisee_tenant_id
       and fp.can_manage_planning = true
       and fp.revoked_at is null
       and fp.valid_from <= now()
       and (fp.valid_until is null or fp.valid_until > now())
       and (
         fp.scope_type = 'tenant'
         or fp.scope_type in ('rayons', 'capabilities', 'custom')
         or (
           fp.scope_type = 'branches'
           and p_branch_id is not null
           and (
             jsonb_array_length(fp.scope_refs) = 0
             or fp.scope_refs ? p_branch_id::text
           )
         )
       )
  );
$$;

revoke all on function public._franchise_planning_delegation_active(uuid, uuid, uuid) from public;
revoke all on function public._franchise_planning_delegation_active(uuid, uuid, uuid) from anon;
revoke all on function public._franchise_planning_delegation_active(uuid, uuid, uuid) from authenticated;

create or replace function public._check_franchise_planning_action_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_central_tenant uuid;
  v_local_tenant uuid;
begin
  if not exists (
    select 1
      from public.tenants t
     where t.id = new.franchisee_tenant_id
       and t.parent_tenant_id = new.franchise_root_tenant_id
  ) then
    raise exception 'franchisee hoort niet bij deze franchisegever';
  end if;

  if new.branch_id is not null and not exists (
    select 1
      from public.branches b
     where b.id = new.branch_id
       and b.tenant_id = new.franchisee_tenant_id
       and b.is_active = true
  ) then
    raise exception 'branch_id moet bij de franchisee horen';
  end if;

  if new.instructor_user_id is not null and not exists (
    select 1
      from public.memberships m
     where m.user_id = new.instructor_user_id
       and m.tenant_id = new.franchisee_tenant_id
       and m.role in ('instructor', 'tenant_admin', 'franchise_admin', 'branch_manager', 'planner')
  ) then
    raise exception 'instructor_user_id moet lid zijn van de franchisee';
  end if;

  if new.central_task_id is not null then
    select tenant_id into v_central_tenant
      from public.tasks
     where id = new.central_task_id;
    if v_central_tenant is distinct from new.franchise_root_tenant_id then
      raise exception 'central_task_id moet bij de franchisegever horen';
    end if;
  end if;

  if new.local_task_id is not null then
    select tenant_id into v_local_tenant
      from public.tasks
     where id = new.local_task_id;
    if v_local_tenant is distinct from new.franchisee_tenant_id then
      raise exception 'local_task_id moet bij de franchisee horen';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public._check_franchise_planning_action_consistency() from public;
revoke all on function public._check_franchise_planning_action_consistency() from anon;
revoke all on function public._check_franchise_planning_action_consistency() from authenticated;

drop trigger if exists trg_franchise_planning_action_consistency
  on public.franchise_planning_actions;
create trigger trg_franchise_planning_action_consistency
  before insert or update of franchise_root_tenant_id, franchisee_tenant_id, branch_id, instructor_user_id, central_task_id, local_task_id
  on public.franchise_planning_actions
  for each row execute function public._check_franchise_planning_action_consistency();

alter table public.franchise_planning_actions enable row level security;

drop policy if exists franchise_planning_actions_select on public.franchise_planning_actions;
create policy franchise_planning_actions_select on public.franchise_planning_actions
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_planning_actions.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_planning_actions.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff', 'instructor')
    )
  );

create or replace function public.create_franchise_planning_action(
  p_franchise_root_tenant_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid,
  p_action_type text,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_date date,
  p_branch_id uuid,
  p_instructor_user_id uuid,
  p_requested_capacity_hours numeric,
  p_requested_date date,
  p_request_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing_id uuid;
  v_target record;
  v_task_id uuid;
  v_action_id uuid;
  v_request_key text;
  v_title text;
  v_description text;
  v_action_type text;
begin
  v_action_type := nullif(btrim(coalesce(p_action_type, '')), '');
  if v_action_type is null or v_action_type not in (
    'capacity_request',
    'planning_task',
    'open_local_planboard',
    'branch_directive',
    'instructor_directive'
  ) then
    raise exception 'invalid_planning_action_type';
  end if;

  if not (
    exists (
      select 1
        from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = p_franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  if not exists (
    select 1
      from public.tenants t
     where t.id = p_franchisee_tenant_id
       and t.parent_tenant_id = p_franchise_root_tenant_id
  ) then
    raise exception 'franchisee_not_in_network';
  end if;

  if p_branch_id is not null and not exists (
    select 1
      from public.branches b
     where b.id = p_branch_id
       and b.tenant_id = p_franchisee_tenant_id
       and b.is_active = true
  ) then
    raise exception 'branch_not_in_franchisee';
  end if;

  if p_instructor_user_id is not null and not exists (
    select 1
      from public.memberships m
     where m.user_id = p_instructor_user_id
       and m.tenant_id = p_franchisee_tenant_id
       and m.role in ('instructor', 'tenant_admin', 'franchise_admin', 'branch_manager', 'planner')
  ) then
    raise exception 'instructor_not_in_franchisee';
  end if;

  if not public._franchise_planning_delegation_active(
    p_franchise_root_tenant_id,
    p_franchisee_tenant_id,
    p_branch_id
  ) then
    raise exception 'planning_delegation_required';
  end if;

  v_title := left(
    coalesce(
      nullif(btrim(p_title), ''),
      public._franchise_planning_action_label(v_action_type)
    ),
    200
  );
  v_description := left(
    coalesce(
      nullif(btrim(p_description), ''),
      'Franchiseplanning actie vanuit het centrale netwerk.'
    ),
    4000
  );
  v_request_key := left(
    coalesce(
      nullif(btrim(p_request_key), ''),
      concat_ws(
        ':',
        'planning',
        v_action_type,
        p_franchisee_tenant_id::text,
        coalesce(p_branch_id::text, 'tenant'),
        coalesce(p_instructor_user_id::text, 'team'),
        coalesce(p_requested_date::text, 'date'),
        lower(regexp_replace(v_title, '\s+', '-', 'g'))
      )
    ),
    220
  );

  select id into v_existing_id
    from public.franchise_planning_actions
   where franchise_root_tenant_id = p_franchise_root_tenant_id
     and franchisee_tenant_id = p_franchisee_tenant_id
     and request_key = v_request_key
     and status in ('created', 'accepted', 'in_progress')
   for update;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select * into v_target
    from public._first_task_target(p_franchise_root_tenant_id, p_actor, 'planning');
  if v_target.board_id is null then
    raise exception 'central_task_target_missing';
  end if;

  select public.create_task(
    p_franchise_root_tenant_id,
    p_actor,
    v_target.board_id,
    v_target.column_id,
    v_title,
    v_description,
    coalesce(p_priority, 'normal'::public.task_priority),
    p_due_date,
    null,
    v_target.department_id
  ) into v_task_id;

  insert into public.franchise_planning_actions (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    branch_id,
    instructor_user_id,
    central_task_id,
    action_type,
    request_key,
    title,
    description,
    requested_capacity_hours,
    requested_date,
    priority,
    status,
    created_by,
    metadata
  )
  values (
    p_franchise_root_tenant_id,
    p_franchisee_tenant_id,
    p_branch_id,
    p_instructor_user_id,
    v_task_id,
    v_action_type,
    v_request_key,
    v_title,
    v_description,
    p_requested_capacity_hours,
    p_requested_date,
    coalesce(p_priority, 'normal'::public.task_priority),
    'created',
    p_actor,
    jsonb_build_object('created_by_rpc', 'create_franchise_planning_action')
  )
  returning id into v_action_id;

  update public.tasks
     set dedupe_key = 'franchise_planning:' || v_action_id::text
   where id = v_task_id
     and tenant_id = p_franchise_root_tenant_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_franchise_root_tenant_id,
    'franchise.planning_action_created',
    'franchise_planning_action',
    v_action_id::text,
    jsonb_build_object(
      'franchisee_tenant_id', p_franchisee_tenant_id,
      'branch_id', p_branch_id,
      'instructor_user_id', p_instructor_user_id,
      'central_task_id', v_task_id,
      'action_type', v_action_type,
      'request_key', v_request_key
    )
  );

  return v_action_id;
end;
$$;

revoke all on function public.create_franchise_planning_action(uuid, uuid, uuid, text, text, text, public.task_priority, date, uuid, uuid, numeric, date, text) from public;
revoke all on function public.create_franchise_planning_action(uuid, uuid, uuid, text, text, text, public.task_priority, date, uuid, uuid, numeric, date, text) from anon;
revoke all on function public.create_franchise_planning_action(uuid, uuid, uuid, text, text, text, public.task_priority, date, uuid, uuid, numeric, date, text) from authenticated;
grant execute on function public.create_franchise_planning_action(uuid, uuid, uuid, text, text, text, public.task_priority, date, uuid, uuid, numeric, date, text) to service_role;

create or replace function public.accept_franchise_planning_action(
  p_action_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action public.franchise_planning_actions%rowtype;
  v_target record;
  v_task_id uuid;
  v_root_name text;
  v_note text;
begin
  select * into v_action
    from public.franchise_planning_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'planning_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'planning_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status in ('completed', 'cancelled', 'declined') then
    raise exception 'planning_action_closed';
  end if;
  if v_action.status in ('accepted', 'in_progress') and v_action.local_task_id is not null then
    return v_action.local_task_id;
  end if;

  select * into v_target
    from public._first_task_target(p_franchisee_tenant_id, p_actor, 'planning');
  if v_target.board_id is null then
    raise exception 'local_task_target_missing';
  end if;

  select name into v_root_name
    from public.tenants
   where id = v_action.franchise_root_tenant_id;

  v_note := left(nullif(btrim(coalesce(p_note, '')), ''), 2000);

  select public.create_task(
    p_franchisee_tenant_id,
    p_actor,
    v_target.board_id,
    v_target.column_id,
    left(v_action.title, 200),
    left(
      concat_ws(
        E'\n\n',
        v_action.description,
        'Lokale planninguitvoering vanuit ' || coalesce(v_root_name, 'de franchisegever') || '.',
        case when v_action.requested_capacity_hours is null then null else 'Gevraagde capaciteit: ' || v_action.requested_capacity_hours::text || ' uur.' end,
        case when v_action.requested_date is null then null else 'Doeldatum: ' || v_action.requested_date::text || '.' end,
        case when v_note is null then null else 'Acceptatienotitie: ' || v_note end
      ),
      4000
    ),
    v_action.priority,
    v_action.requested_date,
    v_action.instructor_user_id,
    v_target.department_id
  ) into v_task_id;

  if v_action.branch_id is not null then
    perform public.assign_task_branch(
      v_task_id,
      p_franchisee_tenant_id,
      p_actor,
      v_action.branch_id
    );
  end if;

  update public.tasks
     set dedupe_key = 'franchise_planning_local:' || v_action.id::text
   where id = v_task_id
     and tenant_id = p_franchisee_tenant_id;

  update public.franchise_planning_actions
     set status = 'accepted',
         local_task_id = v_task_id,
         accepted_by = p_actor,
         accepted_at = now(),
         local_response = v_note,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('accepted_by_rpc', 'accept_franchise_planning_action')
   where id = v_action.id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (
      p_actor,
      p_franchisee_tenant_id,
      'franchise.planning_action_accepted',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object('local_task_id', v_task_id, 'franchise_root_tenant_id', v_action.franchise_root_tenant_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.planning_action_accepted',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object('local_task_id', v_task_id, 'franchisee_tenant_id', p_franchisee_tenant_id)
    );

  return v_task_id;
end;
$$;

revoke all on function public.accept_franchise_planning_action(uuid, uuid, uuid, text) from public;
revoke all on function public.accept_franchise_planning_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.accept_franchise_planning_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.accept_franchise_planning_action(uuid, uuid, uuid, text) to service_role;

create or replace function public.decline_franchise_planning_action(
  p_action_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action public.franchise_planning_actions%rowtype;
  v_reason text;
begin
  select * into v_action
    from public.franchise_planning_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'planning_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'planning_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status <> 'created' then
    raise exception 'planning_action_not_declineable';
  end if;

  v_reason := left(nullif(btrim(coalesce(p_reason, '')), ''), 2000);

  update public.franchise_planning_actions
     set status = 'declined',
         declined_by = p_actor,
         declined_at = now(),
         local_response = v_reason,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('declined_by_rpc', 'decline_franchise_planning_action')
   where id = v_action.id;

  if v_action.central_task_id is not null then
    update public.tasks
       set archived_at = coalesce(archived_at, now())
     where id = v_action.central_task_id
       and tenant_id = v_action.franchise_root_tenant_id;
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (
      p_actor,
      p_franchisee_tenant_id,
      'franchise.planning_action_declined',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object('reason', v_reason, 'franchise_root_tenant_id', v_action.franchise_root_tenant_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.planning_action_declined',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object('reason', v_reason, 'franchisee_tenant_id', p_franchisee_tenant_id)
    );
end;
$$;

revoke all on function public.decline_franchise_planning_action(uuid, uuid, uuid, text) from public;
revoke all on function public.decline_franchise_planning_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.decline_franchise_planning_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.decline_franchise_planning_action(uuid, uuid, uuid, text) to service_role;

create or replace function public.complete_franchise_planning_action(
  p_action_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action public.franchise_planning_actions%rowtype;
  v_resolution text;
begin
  select * into v_action
    from public.franchise_planning_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'planning_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'planning_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status not in ('accepted', 'in_progress') then
    raise exception 'planning_action_not_active';
  end if;

  v_resolution := left(nullif(btrim(coalesce(p_resolution, '')), ''), 4000);

  update public.franchise_planning_actions
     set status = 'completed',
         completed_by = p_actor,
         completed_at = now(),
         resolution = v_resolution,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('completed_by_rpc', 'complete_franchise_planning_action')
   where id = v_action.id;

  if v_action.local_task_id is not null then
    update public.tasks
       set archived_at = coalesce(archived_at, now())
     where id = v_action.local_task_id
       and tenant_id = p_franchisee_tenant_id;
  end if;

  if v_action.central_task_id is not null then
    update public.tasks
       set archived_at = coalesce(archived_at, now())
     where id = v_action.central_task_id
       and tenant_id = v_action.franchise_root_tenant_id;
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (
      p_actor,
      p_franchisee_tenant_id,
      'franchise.planning_action_completed',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object('resolution', v_resolution, 'local_task_id', v_action.local_task_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.planning_action_completed',
      'franchise_planning_action',
      v_action.id::text,
      jsonb_build_object(
        'resolution', v_resolution,
        'franchisee_tenant_id', p_franchisee_tenant_id,
        'central_task_id', v_action.central_task_id
      )
    );
end;
$$;

revoke all on function public.complete_franchise_planning_action(uuid, uuid, uuid, text) from public;
revoke all on function public.complete_franchise_planning_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.complete_franchise_planning_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.complete_franchise_planning_action(uuid, uuid, uuid, text) to service_role;
