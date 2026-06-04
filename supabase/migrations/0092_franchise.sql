-- ============================================================================
-- 0092_franchise.sql
--
-- Franchise laag (Fase F2) bovenop de vestigingen-fundering (0091).
--
-- Voegt toe:
--   * franchise_admin to member_role enum
--   * parent_tenant_id (nullable FK → tenants.id) on tenants
--   * franchise_templates table (tenant-scoped to franchisegever)
--   * franchise_template_activations table (distribution + activation record)
--   * RLS helpers: my_franchise_tenant_ids() [service_role only], is_franchise_admin()
--   * RPCs (SECURITY DEFINER):
--       set_franchisee_parent            — platform_admin only, service_role grant
--       create_franchise_template        — service_role only
--       update_franchise_template        — service_role only
--       distribute_franchise_template    — service_role only
--         Franchisegever pushes read-only template visibility to a franchisee.
--         Creates franchise_template_activations row with resulting_package_id=NULL.
--         Does NOT create a package.
--       activate_franchise_template      — service_role only
--         Franchisee-local step: requires a prior distribution record.
--         Creates real packages row in franchisee tenant and records package_id.
--       route_lead_to_branch             — service_role only
--
-- Template lifecycle:
--   1. Franchisegever: create_franchise_template     → template row
--   2. Franchisegever: distribute_franchise_template → distribution record (no package)
--   3. Franchisee:     activate_franchise_template   → package created, distribution updated
--
-- Security model:
--   - All write RPCs: service_role only (authenticated/anon grants revoked).
--   - franchise_templates SELECT: franchisegever admin sees own templates;
--     franchisee admin sees ONLY templates that have been distributed to their
--     tenant via franchise_template_activations. Direct parent-tenant read
--     without a distribution record is blocked.
--   - my_franchise_tenant_ids(): service_role only — prevents cross-tenant
--     enumeration by authenticated callers.
--
-- Forward-only (runner tracks by filename).
-- ============================================================================

-- ============================================================================
-- 1. franchise_admin to member_role
-- ============================================================================
alter type public.member_role add value if not exists 'franchise_admin';

-- ============================================================================
-- 2. parent_tenant_id on tenants (franchisee → franchisegever)
-- ============================================================================
alter table public.tenants
  add column if not exists parent_tenant_id uuid
    references public.tenants(id) on delete set null;

create index if not exists idx_tenants_parent
  on public.tenants(parent_tenant_id)
  where parent_tenant_id is not null;

-- ============================================================================
-- 3. franchise_templates table
-- Tenant-scoped to the franchisegever. Only 'package' template_type for now.
-- ============================================================================
create table if not exists public.franchise_templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  template_type text not null default 'package'
    check (template_type in ('package')),
  name          text not null,
  config        jsonb not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_franchise_templates_tenant
  on public.franchise_templates(tenant_id, is_active);

drop trigger if exists franchise_templates_set_updated_at on public.franchise_templates;
create trigger franchise_templates_set_updated_at
  before update on public.franchise_templates
  for each row execute function public.set_updated_at();

-- RLS:
--   * Franchisegever admin (tenant_admin / franchise_admin): read own templates.
--   * Franchisee admin: read ONLY templates that have been explicitly distributed
--     to their tenant (franchise_template_activations row exists). Direct
--     parent-tenant join without distribution is BLOCKED.
--   * Platform admin: read all.
--   * Writes: service_role only via RPCs (no insert/update/delete policies).
alter table public.franchise_templates enable row level security;

drop policy if exists franchise_templates_select on public.franchise_templates;
create policy franchise_templates_select on public.franchise_templates
  for select
  using (
    -- Franchisegever admin reads own templates.
    exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = franchise_templates.tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    -- Franchisee admin reads ONLY templates distributed to their tenant.
    or exists (
      select 1 from public.franchise_template_activations fta
       join public.memberships m on m.tenant_id = fta.franchisee_tenant_id
       where fta.franchise_template_id = franchise_templates.id
         and m.user_id = auth.uid()
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or public.is_platform_admin()
  );

-- ============================================================================
-- 4. franchise_template_activations table
-- One row per (template, franchisee_tenant) pair.
-- Created by distribute_franchise_template (resulting_package_id = NULL).
-- Updated by activate_franchise_template (resulting_package_id set to real pkg).
-- ============================================================================
create table if not exists public.franchise_template_activations (
  id                      uuid primary key default gen_random_uuid(),
  franchise_template_id   uuid not null
    references public.franchise_templates(id) on delete cascade,
  franchisee_tenant_id    uuid not null
    references public.tenants(id) on delete cascade,
  activated_at            timestamptz not null default now(),
  activated_by            uuid references auth.users(id),
  -- Set when franchisee activates; null = distributed but not yet activated.
  resulting_package_id    uuid references public.packages(id) on delete set null,
  unique (franchise_template_id, franchisee_tenant_id)
);

create index if not exists idx_franchise_activations_franchisee
  on public.franchise_template_activations(franchisee_tenant_id);

create index if not exists idx_franchise_activations_template
  on public.franchise_template_activations(franchise_template_id);

-- RLS:
--   * Franchisee admin: reads activation records for their own tenant only.
--   * Franchisegever admin: reads activation records via their templates.
--   * Sibling franchisee: cannot read another franchisee's activation records.
alter table public.franchise_template_activations enable row level security;

drop policy if exists franchise_template_activations_select on public.franchise_template_activations;
create policy franchise_template_activations_select on public.franchise_template_activations
  for select
  using (
    -- Franchisee admin sees own activation records only (explicit tenant match).
    exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = franchise_template_activations.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    -- Franchisegever admin sees activations via their own templates.
    or exists (
      select 1 from public.franchise_templates ft
       join public.memberships m on m.tenant_id = ft.tenant_id
       where ft.id = franchise_template_activations.franchise_template_id
         and m.user_id = auth.uid()
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or public.is_platform_admin()
  );

-- ============================================================================
-- 5. RLS helper functions
-- ============================================================================

-- my_franchise_tenant_ids(p_franchisegever_tenant_id uuid):
-- Returns all franchisee tenant ids where parent_tenant_id = arg.
-- SERVICE ROLE ONLY — authenticated callers cannot enumerate franchisee IDs.
create or replace function public.my_franchise_tenant_ids(p_franchisegever_tenant_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from public.tenants
  where parent_tenant_id = p_franchisegever_tenant_id;
$$;

revoke all on function public.my_franchise_tenant_ids(uuid) from public;
revoke all on function public.my_franchise_tenant_ids(uuid) from anon;
revoke all on function public.my_franchise_tenant_ids(uuid) from authenticated;
grant execute on function public.my_franchise_tenant_ids(uuid) to service_role;

-- is_franchise_admin(p_tenant_id uuid):
-- Returns true if auth.uid() has franchise_admin role in p_tenant_id.
create or replace function public.is_franchise_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.memberships
    where user_id  = auth.uid()
      and tenant_id = p_tenant_id
      and role = 'franchise_admin'
  );
$$;

revoke all on function public.is_franchise_admin(uuid) from public;
revoke all on function public.is_franchise_admin(uuid) from anon;
grant execute on function public.is_franchise_admin(uuid) to authenticated, service_role;

-- ============================================================================
-- 6. set_franchisee_parent
-- Platform admin only. Sets parent_tenant_id on a franchisee tenant.
-- ============================================================================
create or replace function public.set_franchisee_parent(
  p_franchisee_tenant_id    uuid,
  p_franchisegever_tenant_id uuid,  -- null = remove link
  p_actor                   uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not coalesce(
    (select is_platform_admin from public.profiles where id = p_actor), false
  ) then
    raise exception 'niet geautoriseerd: alleen een platformbeheerder mag de franchisestructuur instellen';
  end if;

  if p_franchisee_tenant_id = p_franchisegever_tenant_id then
    raise exception 'een tenant kan niet zijn eigen franchisegever zijn';
  end if;

  if p_franchisegever_tenant_id is not null then
    if exists (
      select 1 from public.tenants
       where id = p_franchisegever_tenant_id
         and parent_tenant_id is not null
    ) then
      raise exception 'de franchisegever is zelf al franchisee — geen diepere kettingen toegestaan';
    end if;
  end if;

  update public.tenants
     set parent_tenant_id = p_franchisegever_tenant_id
   where id = p_franchisee_tenant_id;

  if not found then
    raise exception 'franchisee-tenant niet gevonden';
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_franchisee_tenant_id,
    'franchise.parent_set', 'tenant', p_franchisee_tenant_id::text,
    jsonb_build_object(
      'franchisee_tenant_id',    p_franchisee_tenant_id,
      'franchisegever_tenant_id', p_franchisegever_tenant_id
    )
  );
end;
$$;

revoke all on function public.set_franchisee_parent(uuid, uuid, uuid) from public;
revoke all on function public.set_franchisee_parent(uuid, uuid, uuid) from anon;
revoke all on function public.set_franchisee_parent(uuid, uuid, uuid) from authenticated;
grant execute on function public.set_franchisee_parent(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 7. create_franchise_template
-- ============================================================================
create or replace function public.create_franchise_template(
  p_tenant_id     uuid,
  p_type          text,
  p_name          text,
  p_config        jsonb,
  p_actor         uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = p_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  -- Franchisees (have a parent) cannot create templates.
  if exists (
    select 1 from public.tenants
     where id = p_tenant_id
       and parent_tenant_id is not null
  ) then
    raise exception 'franchisees kunnen geen franchise-templates aanmaken';
  end if;

  if p_type not in ('package') then
    raise exception 'ongeldig template-type: %', p_type;
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'template-naam is verplicht';
  end if;

  insert into public.franchise_templates (tenant_id, template_type, name, config)
  values (p_tenant_id, p_type, p_name, coalesce(p_config, '{}'))
  returning id into v_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id,
    'franchise_template.created', 'franchise_template', v_id::text,
    jsonb_build_object('name', p_name, 'type', p_type, 'config', p_config)
  );

  return v_id;
end;
$$;

revoke all on function public.create_franchise_template(uuid, text, text, jsonb, uuid) from public;
revoke all on function public.create_franchise_template(uuid, text, text, jsonb, uuid) from anon;
revoke all on function public.create_franchise_template(uuid, text, text, jsonb, uuid) from authenticated;
grant execute on function public.create_franchise_template(uuid, text, text, jsonb, uuid) to service_role;

-- ============================================================================
-- 8. update_franchise_template
-- ============================================================================
create or replace function public.update_franchise_template(
  p_template_id uuid,
  p_name        text,
  p_config      jsonb,
  p_is_active   boolean,
  p_actor       uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant
    from public.franchise_templates
   where id = p_template_id;

  if v_tenant is null then
    raise exception 'template niet gevonden';
  end if;

  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = v_tenant
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  update public.franchise_templates
     set name      = coalesce(p_name, name),
         config    = coalesce(p_config, config),
         is_active = coalesce(p_is_active, is_active)
   where id = p_template_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, v_tenant,
    'franchise_template.updated', 'franchise_template', p_template_id::text,
    jsonb_build_object('name', p_name, 'is_active', p_is_active)
  );
end;
$$;

revoke all on function public.update_franchise_template(uuid, text, jsonb, boolean, uuid) from public;
revoke all on function public.update_franchise_template(uuid, text, jsonb, boolean, uuid) from anon;
revoke all on function public.update_franchise_template(uuid, text, jsonb, boolean, uuid) from authenticated;
grant execute on function public.update_franchise_template(uuid, text, jsonb, boolean, uuid) to service_role;

-- ============================================================================
-- 9. distribute_franchise_template
-- Franchisegever pushes template visibility to one franchisee.
-- Creates a franchise_template_activations row with resulting_package_id = NULL.
-- Does NOT create a package — franchisee activates locally in step 10.
-- ============================================================================
create or replace function public.distribute_franchise_template(
  p_template_id          uuid,
  p_franchisee_tenant_id uuid,
  p_actor                uuid
)
returns uuid  -- distribution record id
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_franchisegever_tenant_id uuid;
  v_distribution_id          uuid;
begin
  select tenant_id into v_franchisegever_tenant_id
    from public.franchise_templates
   where id = p_template_id and is_active = true;

  if v_franchisegever_tenant_id is null then
    raise exception 'template niet gevonden of niet actief';
  end if;

  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = v_franchisegever_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  if not exists (
    select 1 from public.tenants
     where id = p_franchisee_tenant_id
       and parent_tenant_id = v_franchisegever_tenant_id
  ) then
    raise exception 'franchisee-tenant behoort niet tot deze franchisegever';
  end if;

  -- Idempotent: return existing distribution id.
  select id into v_distribution_id
    from public.franchise_template_activations
   where franchise_template_id = p_template_id
     and franchisee_tenant_id  = p_franchisee_tenant_id;

  if v_distribution_id is not null then
    return v_distribution_id;
  end if;

  insert into public.franchise_template_activations (
    franchise_template_id, franchisee_tenant_id, activated_by
  )
  values (p_template_id, p_franchisee_tenant_id, p_actor)
  returning id into v_distribution_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, v_franchisegever_tenant_id,
    'franchise_template.distributed', 'franchise_template', p_template_id::text,
    jsonb_build_object(
      'franchisee_tenant_id', p_franchisee_tenant_id,
      'distribution_id',      v_distribution_id
    )
  );

  return v_distribution_id;
end;
$$;

revoke all on function public.distribute_franchise_template(uuid, uuid, uuid) from public;
revoke all on function public.distribute_franchise_template(uuid, uuid, uuid) from anon;
revoke all on function public.distribute_franchise_template(uuid, uuid, uuid) from authenticated;
grant execute on function public.distribute_franchise_template(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 10. activate_franchise_template
-- Franchisee-local step. Requires a prior distribution record.
-- Creates a real packages row in the franchisee tenant.
-- Updates the distribution record with resulting_package_id.
-- ============================================================================
create or replace function public.activate_franchise_template(
  p_template_id          uuid,
  p_franchisee_tenant_id uuid,
  p_actor                uuid
)
returns uuid  -- activation / distribution record id
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_distribution  public.franchise_template_activations%rowtype;
  v_template      public.franchise_templates%rowtype;
  v_package_id    uuid;
  v_credits_total int;
  v_price_cents   bigint;
  v_valid_days    int;
begin
  -- Must have a prior distribution record.
  select * into v_distribution
    from public.franchise_template_activations
   where franchise_template_id = p_template_id
     and franchisee_tenant_id  = p_franchisee_tenant_id;

  if v_distribution.id is null then
    raise exception 'template niet gedistribueerd naar deze franchisee — distribueer eerst via de franchisegever';
  end if;

  -- Idempotent: already activated.
  if v_distribution.resulting_package_id is not null then
    return v_distribution.id;
  end if;

  -- Load template.
  select * into v_template
    from public.franchise_templates
   where id = p_template_id and is_active = true;

  if v_template.id is null then
    raise exception 'template niet gevonden of niet actief';
  end if;

  -- Caller must be admin in the franchisee tenant (local activation).
  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = p_franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: tenant_admin van de franchisee vereist';
  end if;

  v_credits_total := (v_template.config ->> 'credits_total')::int;
  v_price_cents   := (v_template.config ->> 'price_cents')::bigint;
  v_valid_days    := nullif(v_template.config ->> 'valid_days', '')::int;

  insert into public.packages (
    tenant_id, name, credits_total, price_cents, valid_days, active
  )
  values (
    p_franchisee_tenant_id,
    v_template.name,
    coalesce(v_credits_total, 60),
    coalesce(v_price_cents, 0),
    v_valid_days,
    true
  )
  returning id into v_package_id;

  update public.franchise_template_activations
     set resulting_package_id = v_package_id
   where id = v_distribution.id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_franchisee_tenant_id,
    'franchise_template.activated', 'franchise_template', p_template_id::text,
    jsonb_build_object(
      'franchisee_tenant_id', p_franchisee_tenant_id,
      'resulting_package_id', v_package_id,
      'distribution_id',      v_distribution.id
    )
  );

  return v_distribution.id;
end;
$$;

revoke all on function public.activate_franchise_template(uuid, uuid, uuid) from public;
revoke all on function public.activate_franchise_template(uuid, uuid, uuid) from anon;
revoke all on function public.activate_franchise_template(uuid, uuid, uuid) from authenticated;
grant execute on function public.activate_franchise_template(uuid, uuid, uuid) to service_role;

-- ============================================================================
-- 11. route_lead_to_branch
-- ============================================================================
create or replace function public.route_lead_to_branch(
  p_lead_id   uuid,
  p_branch_id uuid,
  p_actor     uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lead_tenant   uuid;
  v_branch_tenant uuid;
  v_branch_name   text;
begin
  select tenant_id into v_lead_tenant
    from public.leads
   where id = p_lead_id;

  if v_lead_tenant is null then
    raise exception 'lead niet gevonden';
  end if;

  select tenant_id, name into v_branch_tenant, v_branch_name
    from public.branches
   where id = p_branch_id and is_active = true;

  if v_branch_tenant is null then
    raise exception 'vestiging niet gevonden of inactief';
  end if;

  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = v_lead_tenant
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  if v_branch_tenant != v_lead_tenant then
    if not exists (
      select 1 from public.tenants
       where id = v_branch_tenant
         and parent_tenant_id = v_lead_tenant
    ) then
      raise exception 'vestiging behoort niet tot een franchisee van deze tenant';
    end if;
  end if;

  update public.leads
     set branch_id = p_branch_id
   where id = p_lead_id;

  insert into public.lead_events
    (lead_id, tenant_id, event_type, payload)
  values (
    p_lead_id, v_lead_tenant,
    'routed',
    jsonb_build_object(
      'branch_id',   p_branch_id,
      'branch_name', v_branch_name,
      'actor',       p_actor
    )
  );

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, v_lead_tenant,
    'lead.routed_to_branch', 'lead', p_lead_id::text,
    jsonb_build_object('branch_id', p_branch_id, 'branch_tenant', v_branch_tenant)
  );
end;
$$;

revoke all on function public.route_lead_to_branch(uuid, uuid, uuid) from public;
revoke all on function public.route_lead_to_branch(uuid, uuid, uuid) from anon;
revoke all on function public.route_lead_to_branch(uuid, uuid, uuid) from authenticated;
grant execute on function public.route_lead_to_branch(uuid, uuid, uuid) to service_role;
