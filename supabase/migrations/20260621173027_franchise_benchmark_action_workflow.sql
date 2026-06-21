-- Close the franchise benchmark steering loop.
--
-- Central franchise benchmark signals become governed action records. The
-- franchisegever owns the central task; the franchisee explicitly accepts the
-- work, gets a local task, and completes/declines the action with audit.

create table if not exists public.franchise_benchmark_actions (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  central_task_id uuid references public.tasks(id) on delete set null,
  local_task_id uuid references public.tasks(id) on delete set null,
  signal_key text not null,
  follow_up_route text not null,
  attention_priority text not null,
  title text not null,
  description text,
  status text not null default 'created'
    check (status in ('created', 'accepted', 'in_progress', 'completed', 'declined', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  declined_by uuid references auth.users(id) on delete set null,
  declined_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  local_response text,
  resolution text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(signal_key) between 1 and 180),
  check (char_length(title) between 1 and 200),
  check (description is null or char_length(description) <= 4000),
  check (local_response is null or char_length(local_response) <= 2000),
  check (resolution is null or char_length(resolution) <= 4000)
);

create unique index if not exists idx_franchise_benchmark_actions_active_signal
  on public.franchise_benchmark_actions (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    signal_key
  )
  where status in ('created', 'accepted', 'in_progress');

create index if not exists idx_franchise_benchmark_actions_root
  on public.franchise_benchmark_actions (franchise_root_tenant_id, status, created_at desc);

create index if not exists idx_franchise_benchmark_actions_franchisee
  on public.franchise_benchmark_actions (franchisee_tenant_id, status, created_at desc);

create index if not exists idx_franchise_benchmark_actions_central_task
  on public.franchise_benchmark_actions (central_task_id)
  where central_task_id is not null;

create index if not exists idx_franchise_benchmark_actions_local_task
  on public.franchise_benchmark_actions (local_task_id)
  where local_task_id is not null;

drop trigger if exists franchise_benchmark_actions_set_updated_at
  on public.franchise_benchmark_actions;
create trigger franchise_benchmark_actions_set_updated_at
  before update on public.franchise_benchmark_actions
  for each row execute function public.set_updated_at();

comment on table public.franchise_benchmark_actions is
  'Central franchise benchmark steering workflow, linking franchisegever tasks to local franchisee acceptance and completion.';
comment on column public.franchise_benchmark_actions.signal_key is
  'Idempotency key for one active benchmark action per signal and franchisee.';
comment on column public.franchise_benchmark_actions.central_task_id is
  'Governance task in the franchisegever tenant.';
comment on column public.franchise_benchmark_actions.local_task_id is
  'Execution task in the local franchisee tenant, created after acceptance.';

create or replace function public._franchise_benchmark_department_key(p_route text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_route = 'lokale-planning' then 'planning'
    when p_route = 'marketing' then 'marketing'
    when p_route = 'kwaliteit' then 'examenbeheer'
    else 'support'
  end;
$$;

revoke all on function public._franchise_benchmark_department_key(text) from public;
revoke all on function public._franchise_benchmark_department_key(text) from anon;
revoke all on function public._franchise_benchmark_department_key(text) from authenticated;

create or replace function public._first_task_target(
  p_tenant_id uuid,
  p_actor uuid,
  p_department_key text
)
returns table(board_id uuid, column_id uuid, department_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_default_task_setup(p_tenant_id, p_actor);

  return query
  select b.id, c.id, d.id
    from public.task_departments d
    join public.task_boards b
      on b.tenant_id = d.tenant_id
     and b.department_id = d.id
    join public.task_columns c
      on c.tenant_id = b.tenant_id
     and c.board_id = b.id
   where d.tenant_id = p_tenant_id
     and d.key = p_department_key
   order by b.sort_order asc, c.sort_order asc
   limit 1;
end;
$$;

revoke all on function public._first_task_target(uuid, uuid, text) from public;
revoke all on function public._first_task_target(uuid, uuid, text) from anon;
revoke all on function public._first_task_target(uuid, uuid, text) from authenticated;

create or replace function public._check_franchise_benchmark_action_consistency()
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

revoke all on function public._check_franchise_benchmark_action_consistency() from public;
revoke all on function public._check_franchise_benchmark_action_consistency() from anon;
revoke all on function public._check_franchise_benchmark_action_consistency() from authenticated;

drop trigger if exists trg_franchise_benchmark_action_consistency
  on public.franchise_benchmark_actions;
create trigger trg_franchise_benchmark_action_consistency
  before insert or update of franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id
  on public.franchise_benchmark_actions
  for each row execute function public._check_franchise_benchmark_action_consistency();

alter table public.franchise_benchmark_actions enable row level security;

drop policy if exists franchise_benchmark_actions_select on public.franchise_benchmark_actions;
create policy franchise_benchmark_actions_select on public.franchise_benchmark_actions
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_benchmark_actions.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_benchmark_actions.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff', 'marketing')
    )
  );

create or replace function public.create_franchise_benchmark_action(
  p_franchise_root_tenant_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_date date,
  p_follow_up_route text,
  p_attention_priority text,
  p_signal_key text
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
  v_signal_key text;
  v_description text;
begin
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

  v_signal_key := left(nullif(btrim(coalesce(p_signal_key, '')), ''), 180);
  if v_signal_key is null then
    v_signal_key := left(
      concat_ws(':', 'benchmark', p_franchisee_tenant_id::text, coalesce(p_follow_up_route, 'route'), coalesce(p_attention_priority, 'priority')),
      180
    );
  end if;

  select id into v_existing_id
    from public.franchise_benchmark_actions
   where franchise_root_tenant_id = p_franchise_root_tenant_id
     and franchisee_tenant_id = p_franchisee_tenant_id
     and signal_key = v_signal_key
     and status in ('created', 'accepted', 'in_progress')
   for update;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select * into v_target
    from public._first_task_target(
      p_franchise_root_tenant_id,
      p_actor,
      public._franchise_benchmark_department_key(p_follow_up_route)
    );
  if v_target.board_id is null then
    raise exception 'central_task_target_missing';
  end if;

  v_description := left(coalesce(p_description, 'Benchmarksignaal vraagt centrale opvolging.'), 3600);

  select public.create_task(
    p_franchise_root_tenant_id,
    p_actor,
    v_target.board_id,
    v_target.column_id,
    left(coalesce(nullif(btrim(p_title), ''), 'Franchise benchmark opvolging'), 200),
    v_description,
    coalesce(p_priority, 'normal'::public.task_priority),
    p_due_date,
    null,
    v_target.department_id
  ) into v_task_id;

  insert into public.franchise_benchmark_actions (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    central_task_id,
    signal_key,
    follow_up_route,
    attention_priority,
    title,
    description,
    status,
    created_by,
    metadata
  )
  values (
    p_franchise_root_tenant_id,
    p_franchisee_tenant_id,
    v_task_id,
    v_signal_key,
    coalesce(nullif(btrim(p_follow_up_route), ''), 'bewaken'),
    coalesce(nullif(btrim(p_attention_priority), ''), 'middel'),
    left(coalesce(nullif(btrim(p_title), ''), 'Franchise benchmark opvolging'), 200),
    v_description,
    'created',
    p_actor,
    jsonb_build_object('created_by_rpc', 'create_franchise_benchmark_action')
  )
  returning id into v_action_id;

  update public.tasks
     set dedupe_key = 'franchise_benchmark:' || v_action_id::text
   where id = v_task_id
     and tenant_id = p_franchise_root_tenant_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_franchise_root_tenant_id,
    'franchise.benchmark_action_created',
    'franchise_benchmark_action',
    v_action_id::text,
    jsonb_build_object(
      'franchisee_tenant_id', p_franchisee_tenant_id,
      'central_task_id', v_task_id,
      'follow_up_route', p_follow_up_route,
      'attention_priority', p_attention_priority,
      'signal_key', v_signal_key
    )
  );

  return v_action_id;
end;
$$;

revoke all on function public.create_franchise_benchmark_action(uuid, uuid, uuid, text, text, public.task_priority, date, text, text, text) from public;
revoke all on function public.create_franchise_benchmark_action(uuid, uuid, uuid, text, text, public.task_priority, date, text, text, text) from anon;
revoke all on function public.create_franchise_benchmark_action(uuid, uuid, uuid, text, text, public.task_priority, date, text, text, text) from authenticated;
grant execute on function public.create_franchise_benchmark_action(uuid, uuid, uuid, text, text, public.task_priority, date, text, text, text) to service_role;

create or replace function public.accept_franchise_benchmark_action(
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
  v_action public.franchise_benchmark_actions%rowtype;
  v_target record;
  v_task_id uuid;
  v_root_name text;
  v_note text;
begin
  select * into v_action
    from public.franchise_benchmark_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'benchmark_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'benchmark_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status in ('completed', 'cancelled') then
    raise exception 'benchmark_action_closed';
  end if;
  if v_action.status in ('accepted', 'in_progress') and v_action.local_task_id is not null then
    return v_action.local_task_id;
  end if;

  select * into v_target
    from public._first_task_target(
      p_franchisee_tenant_id,
      p_actor,
      public._franchise_benchmark_department_key(v_action.follow_up_route)
    );
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
        'Lokale uitvoering van benchmark-opvolging vanuit ' || coalesce(v_root_name, 'de franchisegever') || '.',
        case when v_note is null then null else 'Acceptatienotitie: ' || v_note end
      ),
      4000
    ),
    case
      when v_action.attention_priority = 'hoog' then 'high'::public.task_priority
      when v_action.attention_priority = 'laag' then 'low'::public.task_priority
      else 'normal'::public.task_priority
    end,
    null,
    null,
    v_target.department_id
  ) into v_task_id;

  update public.tasks
     set dedupe_key = 'franchise_benchmark_local:' || v_action.id::text
   where id = v_task_id
     and tenant_id = p_franchisee_tenant_id;

  update public.franchise_benchmark_actions
     set status = 'accepted',
         local_task_id = v_task_id,
         accepted_by = p_actor,
         accepted_at = now(),
         local_response = v_note,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('accepted_by_rpc', 'accept_franchise_benchmark_action')
   where id = v_action.id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (
      p_actor,
      p_franchisee_tenant_id,
      'franchise.benchmark_action_accepted',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object('local_task_id', v_task_id, 'franchise_root_tenant_id', v_action.franchise_root_tenant_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.benchmark_action_accepted',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object('local_task_id', v_task_id, 'franchisee_tenant_id', p_franchisee_tenant_id)
    );

  return v_task_id;
end;
$$;

revoke all on function public.accept_franchise_benchmark_action(uuid, uuid, uuid, text) from public;
revoke all on function public.accept_franchise_benchmark_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.accept_franchise_benchmark_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.accept_franchise_benchmark_action(uuid, uuid, uuid, text) to service_role;

create or replace function public.decline_franchise_benchmark_action(
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
  v_action public.franchise_benchmark_actions%rowtype;
  v_reason text;
begin
  select * into v_action
    from public.franchise_benchmark_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'benchmark_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'benchmark_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status <> 'created' then
    raise exception 'benchmark_action_not_declineable';
  end if;

  v_reason := left(nullif(btrim(coalesce(p_reason, '')), ''), 2000);

  update public.franchise_benchmark_actions
     set status = 'declined',
         declined_by = p_actor,
         declined_at = now(),
         local_response = v_reason,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('declined_by_rpc', 'decline_franchise_benchmark_action')
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
      'franchise.benchmark_action_declined',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object('reason', v_reason, 'franchise_root_tenant_id', v_action.franchise_root_tenant_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.benchmark_action_declined',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object('reason', v_reason, 'franchisee_tenant_id', p_franchisee_tenant_id)
    );
end;
$$;

revoke all on function public.decline_franchise_benchmark_action(uuid, uuid, uuid, text) from public;
revoke all on function public.decline_franchise_benchmark_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.decline_franchise_benchmark_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.decline_franchise_benchmark_action(uuid, uuid, uuid, text) to service_role;

create or replace function public.complete_franchise_benchmark_action(
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
  v_action public.franchise_benchmark_actions%rowtype;
  v_resolution text;
begin
  select * into v_action
    from public.franchise_benchmark_actions
   where id = p_action_id
   for update;

  if v_action.id is null then
    raise exception 'benchmark_action_not_found';
  end if;
  if v_action.franchisee_tenant_id <> p_franchisee_tenant_id then
    raise exception 'benchmark_action_wrong_tenant';
  end if;
  if not public._lesson_actor_authorized(p_actor, p_franchisee_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_franchisee_tenant_id;
  end if;
  if v_action.status not in ('accepted', 'in_progress') then
    raise exception 'benchmark_action_not_active';
  end if;

  v_resolution := left(nullif(btrim(coalesce(p_resolution, '')), ''), 4000);

  update public.franchise_benchmark_actions
     set status = 'completed',
         completed_by = p_actor,
         completed_at = now(),
         resolution = v_resolution,
         metadata = coalesce(metadata, '{}'::jsonb)
           || jsonb_build_object('completed_by_rpc', 'complete_franchise_benchmark_action')
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
      'franchise.benchmark_action_completed',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object('resolution', v_resolution, 'local_task_id', v_action.local_task_id)
    ),
    (
      p_actor,
      v_action.franchise_root_tenant_id,
      'franchise.benchmark_action_completed',
      'franchise_benchmark_action',
      v_action.id::text,
      jsonb_build_object(
        'resolution', v_resolution,
        'franchisee_tenant_id', p_franchisee_tenant_id,
        'central_task_id', v_action.central_task_id
      )
    );
end;
$$;

revoke all on function public.complete_franchise_benchmark_action(uuid, uuid, uuid, text) from public;
revoke all on function public.complete_franchise_benchmark_action(uuid, uuid, uuid, text) from anon;
revoke all on function public.complete_franchise_benchmark_action(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.complete_franchise_benchmark_action(uuid, uuid, uuid, text) to service_role;
