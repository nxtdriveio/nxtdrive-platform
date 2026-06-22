-- Franchise-wide lead routing.
--
-- Datamodel choice:
--   Central intake with a local owner. The lead keeps its original tenant_id.
--   Same-tenant routing may still fill leads.branch_id, but cross-tenant
--   franchise routing is represented by this assignment table so the
--   branch_id tenant-consistency trigger remains intact.

create table if not exists public.franchise_lead_assignments (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  status text not null default 'assigned'
    check (status in ('assigned', 'accepted', 'declined', 'converted', 'cancelled')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_franchise_lead_assignments_active_lead
  on public.franchise_lead_assignments (lead_id)
  where status in ('assigned', 'accepted');

create index if not exists idx_franchise_lead_assignments_root
  on public.franchise_lead_assignments (franchise_root_tenant_id, status, assigned_at desc);

create index if not exists idx_franchise_lead_assignments_owner
  on public.franchise_lead_assignments (owner_tenant_id, status, assigned_at desc);

create index if not exists idx_franchise_lead_assignments_branch
  on public.franchise_lead_assignments (branch_id)
  where branch_id is not null;

drop trigger if exists franchise_lead_assignments_set_updated_at
  on public.franchise_lead_assignments;
create trigger franchise_lead_assignments_set_updated_at
  before update on public.franchise_lead_assignments
  for each row execute function public.set_updated_at();

comment on table public.franchise_lead_assignments is
  'Franchise-wide lead routing owner record. Keeps the source lead tenant intact and assigns local ownership to a franchisee/root tenant.';
comment on column public.franchise_lead_assignments.franchise_root_tenant_id is
  'The franchisegever tenant that controls this routing decision.';
comment on column public.franchise_lead_assignments.lead_tenant_id is
  'Original intake tenant for the lead. Must match leads.tenant_id.';
comment on column public.franchise_lead_assignments.owner_tenant_id is
  'Local tenant that owns the routed follow-up.';
comment on column public.franchise_lead_assignments.branch_id is
  'Optional local branch inside owner_tenant_id. Cross-tenant routes do not mutate leads.branch_id.';

create or replace function public._check_franchise_lead_assignment_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lead_tenant uuid;
  v_branch_tenant uuid;
begin
  select tenant_id into v_lead_tenant
    from public.leads
   where id = new.lead_id;

  if v_lead_tenant is null then
    raise exception 'lead niet gevonden';
  end if;

  if v_lead_tenant <> new.lead_tenant_id then
    raise exception 'lead_tenant_id moet overeenkomen met de lead';
  end if;

  if not exists (
    select 1
      from public.tenants t
     where t.id = new.lead_tenant_id
       and (t.id = new.franchise_root_tenant_id or t.parent_tenant_id = new.franchise_root_tenant_id)
  ) then
    raise exception 'lead behoort niet tot dit franchisenetwerk';
  end if;

  if not exists (
    select 1
      from public.tenants t
     where t.id = new.owner_tenant_id
       and (t.id = new.franchise_root_tenant_id or t.parent_tenant_id = new.franchise_root_tenant_id)
  ) then
    raise exception 'eigenaar behoort niet tot dit franchisenetwerk';
  end if;

  if new.branch_id is not null then
    select tenant_id into v_branch_tenant
      from public.branches
     where id = new.branch_id
       and is_active = true;

    if v_branch_tenant is null then
      raise exception 'vestiging niet gevonden of inactief';
    end if;

    if v_branch_tenant <> new.owner_tenant_id then
      raise exception 'vestiging moet bij de lokale eigenaar horen';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public._check_franchise_lead_assignment_consistency()
  from public;
revoke all on function public._check_franchise_lead_assignment_consistency()
  from anon;
revoke all on function public._check_franchise_lead_assignment_consistency()
  from authenticated;

drop trigger if exists trg_franchise_lead_assignment_consistency
  on public.franchise_lead_assignments;
create trigger trg_franchise_lead_assignment_consistency
  before insert or update of franchise_root_tenant_id, lead_id, lead_tenant_id, owner_tenant_id, branch_id
  on public.franchise_lead_assignments
  for each row execute function public._check_franchise_lead_assignment_consistency();

alter table public.franchise_lead_assignments enable row level security;

drop policy if exists franchise_lead_assignments_select on public.franchise_lead_assignments;
create policy franchise_lead_assignments_select on public.franchise_lead_assignments
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_lead_assignments.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id in (
           franchise_lead_assignments.lead_tenant_id,
           franchise_lead_assignments.owner_tenant_id
         )
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
    )
  );

create or replace function public.route_franchise_lead_to_owner(
  p_franchise_root_tenant_id uuid,
  p_lead_id uuid,
  p_branch_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead public.leads%rowtype;
  v_branch record;
  v_assignment public.franchise_lead_assignments%rowtype;
  v_assignment_id uuid;
  v_routing_mode text;
  v_changed boolean := true;
begin
  if p_franchise_root_tenant_id is null or p_lead_id is null or p_branch_id is null or p_actor is null then
    raise exception 'missing_fields';
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

  select *
    into v_lead
    from public.leads
   where id = p_lead_id
   for update;

  if v_lead.id is null then
    raise exception 'lead_not_found';
  end if;

  select b.id, b.tenant_id, b.name, b.is_active
    into v_branch
    from public.branches b
   where b.id = p_branch_id;

  if v_branch.id is null or v_branch.is_active is not true then
    raise exception 'branch_not_found';
  end if;

  if not exists (
    select 1
      from public.tenants t
     where t.id = v_lead.tenant_id
       and (t.id = p_franchise_root_tenant_id or t.parent_tenant_id = p_franchise_root_tenant_id)
  ) then
    raise exception 'lead_not_in_network';
  end if;

  if not exists (
    select 1
      from public.tenants t
     where t.id = v_branch.tenant_id
       and (t.id = p_franchise_root_tenant_id or t.parent_tenant_id = p_franchise_root_tenant_id)
  ) then
    raise exception 'branch_not_in_network';
  end if;

  if v_lead.tenant_id <> p_franchise_root_tenant_id and not exists (
    select 1
      from public.franchise_operations_permissions fop
     where fop.franchise_root_tenant_id = p_franchise_root_tenant_id
       and fop.franchisee_tenant_id = v_lead.tenant_id
       and fop.can_manage_leads = true
       and fop.revoked_at is null
       and coalesce(fop.valid_from, now()) <= now()
       and (fop.valid_until is null or fop.valid_until > now())
  ) then
    raise exception 'lead_delegation_required';
  end if;

  if v_branch.tenant_id <> p_franchise_root_tenant_id and not exists (
    select 1
      from public.franchise_operations_permissions fop
     where fop.franchise_root_tenant_id = p_franchise_root_tenant_id
       and fop.franchisee_tenant_id = v_branch.tenant_id
       and fop.can_manage_leads = true
       and fop.revoked_at is null
       and coalesce(fop.valid_from, now()) <= now()
       and (fop.valid_until is null or fop.valid_until > now())
  ) then
    raise exception 'target_delegation_required';
  end if;

  if v_lead.branch_id is not null then
    if v_lead.tenant_id <> v_branch.tenant_id or v_lead.branch_id <> p_branch_id then
      raise exception 'lead_already_routed';
    end if;
  end if;

  select *
    into v_assignment
    from public.franchise_lead_assignments
   where lead_id = p_lead_id
     and status in ('assigned', 'accepted')
   for update;

  if v_assignment.id is null then
    insert into public.franchise_lead_assignments (
      franchise_root_tenant_id,
      lead_id,
      lead_tenant_id,
      owner_tenant_id,
      branch_id,
      status,
      assigned_by,
      metadata
    )
    values (
      p_franchise_root_tenant_id,
      p_lead_id,
      v_lead.tenant_id,
      v_branch.tenant_id,
      p_branch_id,
      'assigned',
      p_actor,
      jsonb_build_object('created_by_rpc', 'route_franchise_lead_to_owner')
    )
    returning id into v_assignment_id;
  else
    v_assignment_id := v_assignment.id;
    v_changed :=
      v_assignment.franchise_root_tenant_id <> p_franchise_root_tenant_id
      or v_assignment.owner_tenant_id <> v_branch.tenant_id
      or v_assignment.branch_id is distinct from p_branch_id
      or v_assignment.status <> 'assigned';

    if not v_changed then
      if v_lead.tenant_id = v_branch.tenant_id and v_lead.branch_id is distinct from p_branch_id then
        update public.leads
           set branch_id = p_branch_id,
               updated_at = now()
         where id = p_lead_id;
      end if;
      return v_assignment_id;
    end if;

    update public.franchise_lead_assignments
       set franchise_root_tenant_id = p_franchise_root_tenant_id,
           lead_tenant_id = v_lead.tenant_id,
           owner_tenant_id = v_branch.tenant_id,
           branch_id = p_branch_id,
           status = 'assigned',
           assigned_by = p_actor,
           assigned_at = now(),
           accepted_at = null,
           closed_at = null,
           metadata = coalesce(metadata, '{}'::jsonb)
             || jsonb_build_object('updated_by_rpc', 'route_franchise_lead_to_owner')
     where id = v_assignment_id;
  end if;

  if v_lead.tenant_id = v_branch.tenant_id then
    update public.leads
       set branch_id = p_branch_id,
           updated_at = now()
     where id = p_lead_id;
    v_routing_mode := 'same_tenant_branch';
  else
    update public.leads
       set updated_at = now()
     where id = p_lead_id;
    v_routing_mode := 'franchise_assignment';
  end if;

  insert into public.lead_events
    (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id,
    v_lead.tenant_id,
    p_actor,
    'routed',
    jsonb_build_object(
      'action', 'franchise_route_to_owner',
      'assignment_id', v_assignment_id,
      'franchise_root_tenant_id', p_franchise_root_tenant_id,
      'owner_tenant_id', v_branch.tenant_id,
      'branch_id', p_branch_id,
      'branch_name', v_branch.name,
      'routing_mode', v_routing_mode
    )
  );

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_franchise_root_tenant_id,
    case when v_changed then 'franchise.lead_routed' else 'franchise.lead_route_confirmed' end,
    'franchise_lead_assignment',
    v_assignment_id::text,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'lead_tenant_id', v_lead.tenant_id,
      'owner_tenant_id', v_branch.tenant_id,
      'branch_id', p_branch_id,
      'branch_name', v_branch.name,
      'routing_mode', v_routing_mode
    )
  );

  return v_assignment_id;
end;
$$;

revoke all on function public.route_franchise_lead_to_owner(uuid, uuid, uuid, uuid)
  from public;
revoke all on function public.route_franchise_lead_to_owner(uuid, uuid, uuid, uuid)
  from anon;
revoke all on function public.route_franchise_lead_to_owner(uuid, uuid, uuid, uuid)
  from authenticated;
grant execute on function public.route_franchise_lead_to_owner(uuid, uuid, uuid, uuid)
  to service_role;

-- Harden the legacy branch-routing RPC. Same-tenant routing still writes
-- leads.branch_id. Root-to-franchisee routing now delegates to the assignment
-- model instead of violating the leads.branch_id tenant-consistency trigger.
create or replace function public.route_lead_to_branch(
  p_lead_id uuid,
  p_branch_id uuid,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead_tenant uuid;
  v_branch_tenant uuid;
  v_branch_parent uuid;
  v_branch_name text;
begin
  select tenant_id into v_lead_tenant
    from public.leads
   where id = p_lead_id
   for update;

  if v_lead_tenant is null then
    raise exception 'lead niet gevonden';
  end if;

  select b.tenant_id, t.parent_tenant_id, b.name
    into v_branch_tenant, v_branch_parent, v_branch_name
    from public.branches b
    join public.tenants t on t.id = b.tenant_id
   where b.id = p_branch_id
     and b.is_active = true;

  if v_branch_tenant is null then
    raise exception 'vestiging niet gevonden of inactief';
  end if;

  if v_branch_tenant <> v_lead_tenant then
    if v_branch_parent = v_lead_tenant then
      perform public.route_franchise_lead_to_owner(
        v_lead_tenant,
        p_lead_id,
        p_branch_id,
        p_actor
      );
      return;
    end if;

    raise exception 'vestiging behoort niet tot de tenant van deze lead';
  end if;

  if not (
    exists (
      select 1
        from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = v_lead_tenant
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  update public.leads
     set branch_id = p_branch_id,
         updated_at = now()
   where id = p_lead_id;

  insert into public.lead_events
    (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id,
    v_lead_tenant,
    p_actor,
    'routed',
    jsonb_build_object(
      'branch_id', p_branch_id,
      'branch_name', v_branch_name,
      'routing_mode', 'same_tenant_branch',
      'actor', p_actor
    )
  );

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    v_lead_tenant,
    'lead.routed_to_branch',
    'lead',
    p_lead_id::text,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'branch_tenant', v_branch_tenant,
      'routing_mode', 'same_tenant_branch'
    )
  );
end;
$$;

revoke all on function public.route_lead_to_branch(uuid, uuid, uuid)
  from public;
revoke all on function public.route_lead_to_branch(uuid, uuid, uuid)
  from anon;
revoke all on function public.route_lead_to_branch(uuid, uuid, uuid)
  from authenticated;
grant execute on function public.route_lead_to_branch(uuid, uuid, uuid)
  to service_role;
