-- Sprint 6A: organization-manageable role permission overrides.
--
-- The hardcoded permission registry remains the safe default policy. This
-- table stores tenant-level allow/deny overrides per role+permission so
-- organizations can tune their backoffice model without forking the codebase.

create table if not exists public.organization_role_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role text not null,
  permission text not null,
  effect text not null check (effect in ('allow', 'deny')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_role_permission_overrides_unique unique (tenant_id, role, permission),
  constraint organization_role_permission_overrides_role_check check (
    role in (
      'tenant_admin',
      'franchise_admin',
      'branch_manager',
      'planner',
      'admin_staff',
      'marketing',
      'instructor'
    )
  ),
  constraint organization_role_permission_overrides_permission_check check (
    permission in (
      'branch:manage',
      'branch:read',
      'franchise:manage',
      'invoice:manage',
      'invoice:read',
      'lead:manage',
      'lead:read',
      'organization:read',
      'organization:update',
      'planning:manage',
      'planning:read',
      'report:export',
      'report:read',
      'settings:manage',
      'student:manage',
      'student:read',
      'task:manage',
      'task:read',
      'team:manage',
      'user:manage',
      'vehicle:manage',
      'vehicle:read'
    )
  )
);

create index if not exists idx_org_role_permission_overrides_tenant_role
  on public.organization_role_permission_overrides (tenant_id, role);

alter table public.organization_role_permission_overrides enable row level security;

grant select on public.organization_role_permission_overrides to service_role;
grant insert, update, delete on public.organization_role_permission_overrides to service_role;

create or replace function public.set_organization_role_permission_overrides(
  p_tenant_id uuid,
  p_role text,
  p_actor uuid,
  p_overrides jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invalid_count integer;
begin
  if not exists (
    select 1
      from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role in ('tenant_admin', 'franchise_admin')
  ) then
    raise exception 'niet geautoriseerd: permissies beheren vereist organisatiebeheer';
  end if;

  if p_role not in (
    'tenant_admin',
    'franchise_admin',
    'branch_manager',
    'planner',
    'admin_staff',
    'marketing',
    'instructor'
  ) then
    raise exception 'ongeldige rol voor permissiebeheer';
  end if;

  if jsonb_typeof(coalesce(p_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'p_overrides moet een JSON-array zijn';
  end if;

  select count(*)
    into v_invalid_count
    from jsonb_to_recordset(coalesce(p_overrides, '[]'::jsonb)) as x(permission text, effect text)
   where x.permission not in (
      'branch:manage',
      'branch:read',
      'franchise:manage',
      'invoice:manage',
      'invoice:read',
      'lead:manage',
      'lead:read',
      'organization:read',
      'organization:update',
      'planning:manage',
      'planning:read',
      'report:export',
      'report:read',
      'settings:manage',
      'student:manage',
      'student:read',
      'task:manage',
      'task:read',
      'team:manage',
      'user:manage',
      'vehicle:manage',
      'vehicle:read'
   )
      or x.effect not in ('allow', 'deny');

  if coalesce(v_invalid_count, 0) > 0 then
    raise exception 'een of meer permissie-overrides zijn ongeldig';
  end if;

  delete from public.organization_role_permission_overrides
   where tenant_id = p_tenant_id
     and role = p_role;

  insert into public.organization_role_permission_overrides (
    tenant_id,
    role,
    permission,
    effect,
    created_by,
    updated_by
  )
  select distinct
    p_tenant_id,
    p_role,
    x.permission,
    x.effect,
    p_actor,
    p_actor
    from jsonb_to_recordset(coalesce(p_overrides, '[]'::jsonb)) as x(permission text, effect text);

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_permissions.role_overrides_set',
    'role',
    p_role,
    jsonb_build_object('override_count', jsonb_array_length(coalesce(p_overrides, '[]'::jsonb)))
  );
end;
$$;

revoke all on function public.set_organization_role_permission_overrides(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_organization_role_permission_overrides(uuid, text, uuid, jsonb) to service_role;

comment on function public.set_organization_role_permission_overrides(uuid, text, uuid, jsonb) is
  'Replaces all tenant-level permission overrides for one manageable role.';
