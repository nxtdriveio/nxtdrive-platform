-- Sprint 5B: organization teams foundation.
--
-- Teams are configurable departments inside an organization. They can be
-- organization-wide or optionally scoped to a branch. Staff team membership is
-- stored separately from role and branch authorization so Sprint 6 can make
-- permissions configurable without rewriting organization structure.

create table if not exists public.organization_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#6d5dfc',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(name)) between 1 and 120),
  check (char_length(btrim(slug)) between 2 and 60),
  check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  check (description is null or char_length(btrim(description)) <= 500),
  check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (tenant_id, slug)
);

create index if not exists idx_organization_teams_tenant_active
  on public.organization_teams(tenant_id, is_active, name);

create index if not exists idx_organization_teams_branch
  on public.organization_teams(tenant_id, branch_id)
  where branch_id is not null;

create table if not exists public.organization_team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  team_id uuid not null references public.organization_teams(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, membership_id)
);

create index if not exists idx_organization_team_members_tenant
  on public.organization_team_members(tenant_id);

create index if not exists idx_organization_team_members_membership
  on public.organization_team_members(membership_id);

drop trigger if exists organization_teams_set_updated_at on public.organization_teams;
create trigger organization_teams_set_updated_at
  before update on public.organization_teams
  for each row execute function public.set_updated_at();

create or replace function public.organization_team_validate_branch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.branch_id is not null
     and not exists (
       select 1
         from public.branches b
        where b.id = new.branch_id
          and b.tenant_id = new.tenant_id
     ) then
    raise exception 'teamvestiging hoort niet bij deze organisatie';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_team_validate_branch on public.organization_teams;
create trigger organization_team_validate_branch
  before insert or update of tenant_id, branch_id on public.organization_teams
  for each row execute function public.organization_team_validate_branch();

create or replace function public.organization_team_member_validate_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.organization_teams t
     where t.id = new.team_id
       and t.tenant_id = new.tenant_id
  ) then
    raise exception 'team hoort niet bij deze organisatie';
  end if;

  if not exists (
    select 1
      from public.memberships m
     where m.id = new.membership_id
       and m.tenant_id = new.tenant_id
       and m.role not in ('student', 'parent')
  ) then
    raise exception 'teamlid moet een medewerker binnen deze organisatie zijn';
  end if;

  return new;
end;
$$;

drop trigger if exists organization_team_member_validate_tenant on public.organization_team_members;
create trigger organization_team_member_validate_tenant
  before insert or update of tenant_id, team_id, membership_id on public.organization_team_members
  for each row execute function public.organization_team_member_validate_tenant();

create or replace function public.actor_can_manage_organization_team(
  p_actor uuid,
  p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_actor
       and coalesce(p.is_platform_admin, false) = true
  )
  or exists (
    select 1
      from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role in ('tenant_admin', 'franchise_admin')
  );
$$;

revoke all on function public.actor_can_manage_organization_team(uuid, uuid) from public, anon, authenticated;
grant execute on function public.actor_can_manage_organization_team(uuid, uuid) to service_role;

alter table public.organization_teams enable row level security;
alter table public.organization_team_members enable row level security;

grant select on public.organization_teams to authenticated;
grant select on public.organization_team_members to authenticated;
grant select, insert, update, delete on public.organization_teams to service_role;
grant select, insert, update, delete on public.organization_team_members to service_role;

drop policy if exists organization_teams_select on public.organization_teams;
create policy organization_teams_select
  on public.organization_teams
  for select
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, true));

drop policy if exists organization_team_members_select on public.organization_team_members;
create policy organization_team_members_select
  on public.organization_team_members
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.organization_teams t
       where t.id = organization_team_members.team_id
         and t.tenant_id = organization_team_members.tenant_id
         and public.current_user_can_access_optional_branch(t.tenant_id, t.branch_id, true)
    )
  );

create or replace function public.create_organization_team(
  p_tenant_id uuid,
  p_actor uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_branch_id uuid default null,
  p_color text default '#6d5dfc'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team_id uuid;
begin
  if not public.actor_can_manage_organization_team(p_actor, p_tenant_id) then
    raise exception 'niet geautoriseerd: teams beheren vereist organisatiebeheer';
  end if;

  insert into public.organization_teams (
    tenant_id,
    branch_id,
    name,
    slug,
    description,
    color,
    created_by,
    updated_by
  ) values (
    p_tenant_id,
    p_branch_id,
    nullif(btrim(p_name), ''),
    lower(nullif(btrim(p_slug), '')),
    nullif(btrim(p_description), ''),
    coalesce(nullif(btrim(p_color), ''), '#6d5dfc'),
    p_actor,
    p_actor
  ) returning id into v_team_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_team.created',
    'organization_team',
    v_team_id::text,
    jsonb_build_object(
      'name', p_name,
      'slug', p_slug,
      'branch_id', p_branch_id,
      'color', p_color
    )
  );

  return v_team_id;
end;
$$;

create or replace function public.update_organization_team(
  p_team_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_name text,
  p_description text default null,
  p_branch_id uuid default null,
  p_color text default '#6d5dfc',
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.actor_can_manage_organization_team(p_actor, p_tenant_id) then
    raise exception 'niet geautoriseerd: teams beheren vereist organisatiebeheer';
  end if;

  update public.organization_teams
     set name = nullif(btrim(p_name), ''),
         description = nullif(btrim(p_description), ''),
         branch_id = p_branch_id,
         color = coalesce(nullif(btrim(p_color), ''), '#6d5dfc'),
         is_active = coalesce(p_is_active, true),
         updated_by = p_actor
   where id = p_team_id
     and tenant_id = p_tenant_id;

  if not found then
    raise exception 'team niet gevonden';
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_team.updated',
    'organization_team',
    p_team_id::text,
    jsonb_build_object(
      'name', p_name,
      'branch_id', p_branch_id,
      'color', p_color,
      'is_active', p_is_active
    )
  );
end;
$$;

create or replace function public.set_organization_team_members(
  p_team_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_membership_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_distinct_count integer;
  v_valid_count integer;
begin
  if not public.actor_can_manage_organization_team(p_actor, p_tenant_id) then
    raise exception 'niet geautoriseerd: teams beheren vereist organisatiebeheer';
  end if;

  if not exists (
    select 1
      from public.organization_teams t
     where t.id = p_team_id
       and t.tenant_id = p_tenant_id
  ) then
    raise exception 'team niet gevonden';
  end if;

  select count(distinct ids.membership_id)
    into v_distinct_count
    from unnest(coalesce(p_membership_ids, array[]::uuid[])) as ids(membership_id);

  select count(distinct m.id)
    into v_valid_count
    from public.memberships m
   where m.tenant_id = p_tenant_id
     and m.role not in ('student', 'parent')
     and m.id = any(coalesce(p_membership_ids, array[]::uuid[]));

  if coalesce(v_distinct_count, 0) <> coalesce(v_valid_count, 0) then
    raise exception 'een of meer teamleden horen niet bij deze organisatie';
  end if;

  delete from public.organization_team_members
   where team_id = p_team_id
     and tenant_id = p_tenant_id;

  insert into public.organization_team_members (
    tenant_id,
    team_id,
    membership_id,
    created_by
  )
  select p_tenant_id, p_team_id, ids.membership_id, p_actor
    from (
      select distinct ids.membership_id
        from unnest(coalesce(p_membership_ids, array[]::uuid[])) as ids(membership_id)
    ) ids;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_team.members_set',
    'organization_team',
    p_team_id::text,
    jsonb_build_object('membership_count', coalesce(v_valid_count, 0))
  );
end;
$$;

revoke all on function public.create_organization_team(uuid, uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.update_organization_team(uuid, uuid, uuid, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_organization_team_members(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.create_organization_team(uuid, uuid, text, text, text, uuid, text) to service_role;
grant execute on function public.update_organization_team(uuid, uuid, uuid, text, text, uuid, text, boolean) to service_role;
grant execute on function public.set_organization_team_members(uuid, uuid, uuid, uuid[]) to service_role;

comment on table public.organization_teams is
  'Configurable organization teams/departments. Teams are organization-wide by default and can optionally be scoped to a branch.';

comment on table public.organization_team_members is
  'Staff membership assignments to configurable organization teams. This is separate from RBAC roles and branch scope.';
