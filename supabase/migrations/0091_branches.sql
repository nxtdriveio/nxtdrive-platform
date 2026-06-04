-- ============================================================================
-- 0091_branches.sql
--
-- Vestigingen (branches) layer + extended staff roles.
--
-- Adds:
--   * org_type enum + column on tenants
--   * Extended member_role values: branch_manager, planner, admin_staff, marketing
--   * branches table (tenant-scoped, slug unique per tenant)
--   * membership_branches table (scope a membership to specific branches)
--   * nullable branch_id FK on students, lessons, leads, trial_lessons
--     with tenant-consistency triggers on all four tables
--   * RLS helpers: my_branch_ids(p_tenant_id), has_branch_access(p_tenant_id, p_branch_id)
--   * Updated RLS SELECT policies on students, lessons, leads, trial_lessons
--   * Branch management RPCs (SECURITY DEFINER, service_role only):
--       create_branch, update_branch, set_membership_branches, set_tenant_org_type
--
-- Forward-only (runner tracks by filename).
-- ============================================================================

-- ============================================================================
-- 1. org_type enum + column on tenants
-- ============================================================================
do $$ begin
  create type public.org_type as enum (
    'zzp',
    'rijschool',
    'groot',
    'multi_vestiging',
    'franchise'
  );
exception when duplicate_object then null; end $$;

alter table public.tenants
  add column if not exists org_type public.org_type not null default 'rijschool';

-- ============================================================================
-- 2. Extended member_role enum values
-- ============================================================================
alter type public.member_role add value if not exists 'branch_manager';
alter type public.member_role add value if not exists 'planner';
alter type public.member_role add value if not exists 'admin_staff';
alter type public.member_role add value if not exists 'marketing';

-- ============================================================================
-- 3. branches table
-- ============================================================================
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  slug       text not null,
  address    text,
  city       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Slug: lowercase alphanumeric + hyphens, at least 2 chars
  constraint branches_slug_valid check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  -- Slug is unique within a tenant
  unique (tenant_id, slug)
);

create index if not exists idx_branches_tenant
  on public.branches (tenant_id, is_active);

drop trigger if exists branches_set_updated_at on public.branches;
create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- RLS: members can read their tenant's branches; writes via RPC only.
alter table public.branches enable row level security;

drop policy if exists branches_select_member on public.branches;
create policy branches_select_member on public.branches
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- ============================================================================
-- 4. membership_branches table
-- A membership with NO rows here = access to all branches (no restriction).
-- ============================================================================
create table if not exists public.membership_branches (
  membership_id  uuid not null references public.memberships(id) on delete cascade,
  branch_id      uuid not null references public.branches(id)    on delete cascade,
  primary key (membership_id, branch_id)
);

create index if not exists idx_membership_branches_branch
  on public.membership_branches (branch_id);
create index if not exists idx_membership_branches_membership
  on public.membership_branches (membership_id);

-- RLS: tenant admins can read; writes via RPC only.
alter table public.membership_branches enable row level security;

drop policy if exists membership_branches_select_admin on public.membership_branches;
create policy membership_branches_select_admin on public.membership_branches
  for select
  using (
    exists (
      select 1 from public.memberships m
       where m.id        = membership_id
         and (
           public.has_role(m.tenant_id, 'tenant_admin')
           or public.is_platform_admin()
         )
    )
  );

-- Tenant-consistency trigger: membership and branch must belong to the same tenant.
create or replace function public._check_membership_branch_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_tenant uuid;
  v_branch_tenant     uuid;
begin
  select tenant_id into v_membership_tenant
    from public.memberships where id = new.membership_id;
  select tenant_id into v_branch_tenant
    from public.branches    where id = new.branch_id;
  if v_membership_tenant is distinct from v_branch_tenant then
    raise exception 'membership en vestiging moeten tot dezelfde tenant behoren';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_membership_branch_tenant_check on public.membership_branches;
create trigger trg_membership_branch_tenant_check
  before insert or update on public.membership_branches
  for each row execute function public._check_membership_branch_tenant();

-- ============================================================================
-- 5. Nullable branch_id FK on tenant-scoped tables
--    + tenant-consistency triggers on each table.
-- ============================================================================

-- Shared trigger function: ensures branches.tenant_id = NEW.tenant_id
-- Called by triggers on students, lessons, leads, trial_lessons.
create or replace function public._check_branch_tenant_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_tenant uuid;
begin
  -- Allow NULL branch_id (unassigned row is always valid).
  if new.branch_id is null then
    return new;
  end if;

  select tenant_id into v_branch_tenant
    from public.branches where id = new.branch_id;

  if v_branch_tenant is null then
    raise exception 'vestiging niet gevonden';
  end if;

  if v_branch_tenant <> new.tenant_id then
    raise exception 'vestiging behoort niet tot de tenant van deze rij';
  end if;

  return new;
end;
$$;

-- students -------------------------------------------------------------------
alter table public.students
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists idx_students_branch
  on public.students (tenant_id, branch_id) where branch_id is not null;

drop trigger if exists trg_students_branch_tenant_check on public.students;
create trigger trg_students_branch_tenant_check
  before insert or update of branch_id on public.students
  for each row execute function public._check_branch_tenant_consistency();

-- lessons --------------------------------------------------------------------
alter table public.lessons
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists idx_lessons_branch
  on public.lessons (tenant_id, branch_id) where branch_id is not null;

drop trigger if exists trg_lessons_branch_tenant_check on public.lessons;
create trigger trg_lessons_branch_tenant_check
  before insert or update of branch_id on public.lessons
  for each row execute function public._check_branch_tenant_consistency();

-- leads ----------------------------------------------------------------------
alter table public.leads
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists idx_leads_branch
  on public.leads (tenant_id, branch_id) where branch_id is not null;

drop trigger if exists trg_leads_branch_tenant_check on public.leads;
create trigger trg_leads_branch_tenant_check
  before insert or update of branch_id on public.leads
  for each row execute function public._check_branch_tenant_consistency();

-- trial_lessons --------------------------------------------------------------
alter table public.trial_lessons
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists idx_trial_lessons_branch
  on public.trial_lessons (tenant_id, branch_id) where branch_id is not null;

drop trigger if exists trg_trial_lessons_branch_tenant_check on public.trial_lessons;
create trigger trg_trial_lessons_branch_tenant_check
  before insert or update of branch_id on public.trial_lessons
  for each row execute function public._check_branch_tenant_consistency();

-- ============================================================================
-- 6. RLS helpers: my_branch_ids + has_branch_access
-- ============================================================================

-- my_branch_ids(p_tenant_id):
--   Set-returning function. Returns the branch IDs the caller may access in
--   p_tenant_id.
--
--   Logic:
--     * Collect all membership_ids the caller holds in this tenant.
--     * Collect scoped branch IDs from membership_branches for those memberships.
--     * If NO scoping rows exist at all → the caller is unrestricted: return all
--       branch IDs in the tenant.
--     * Otherwise → return only the explicitly scoped branch IDs.
--
--   NOTE: uses UNION + conditional, NOT a CASE with scalar subqueries, so it
--   is safe for multi-branch tenants.
create or replace function public.my_branch_ids(p_tenant_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  with
    -- All membership IDs the caller holds in this tenant.
    caller_memberships as (
      select id as membership_id
        from public.memberships
       where user_id   = auth.uid()
         and tenant_id = p_tenant_id
    ),
    -- Explicitly scoped branch IDs (may be empty set).
    scoped_branch_ids as (
      select mb.branch_id
        from public.membership_branches mb
        join caller_memberships cm on cm.membership_id = mb.membership_id
    )
  -- No scoping rows → return every branch in the tenant.
  select b.id
    from public.branches b
   where b.tenant_id = p_tenant_id
     and not exists (select 1 from scoped_branch_ids)

  union all

  -- Scoping rows exist → return only those branches.
  select branch_id
    from scoped_branch_ids
   where exists (select 1 from scoped_branch_ids);
$$;

-- has_branch_access(p_tenant_id, p_branch_id):
--   True if p_branch_id is NULL (unscoped row) OR the caller can access it.
--   tenant_admin and platform_admin always return true.
create or replace function public.has_branch_access(
  p_tenant_id uuid,
  p_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p_branch_id is null
    or public.is_platform_admin()
    or public.has_role(p_tenant_id, 'tenant_admin')
    or p_branch_id in (select public.my_branch_ids(p_tenant_id));
$$;

revoke all on function public.my_branch_ids(uuid)           from public;
revoke all on function public.my_branch_ids(uuid)           from anon;
revoke all on function public.my_branch_ids(uuid)           from authenticated;
revoke all on function public.has_branch_access(uuid, uuid) from public;
revoke all on function public.has_branch_access(uuid, uuid) from anon;
revoke all on function public.has_branch_access(uuid, uuid) from authenticated;

grant execute on function public.my_branch_ids(uuid)          to authenticated, service_role;
grant execute on function public.has_branch_access(uuid, uuid) to authenticated, service_role;

-- ============================================================================
-- 7. Updated RLS SELECT policies on students, lessons, leads, trial_lessons
--
-- Invariants:
--   * tenant_admin → all rows in tenant (no branch filter)
--   * platform_admin → all rows everywhere
--   * scoped staff → only rows where has_branch_access passes
--   * Students/parents see their own data (unchanged)
-- ============================================================================

-- students -------------------------------------------------------------------
drop policy if exists students_select_members on public.students;
create policy students_select_members on public.students
  for select
  using (
    public.is_platform_admin()
    -- Tenant admins see all students in their tenant regardless of branch.
    or public.has_role(tenant_id, 'tenant_admin')
    -- Other staff (explicit role check — students/parents must NOT match this
    -- branch): branch-scoped access.
    or (
      exists (
        select 1 from public.memberships m
         where m.user_id   = auth.uid()
           and m.tenant_id = students.tenant_id
           and m.role in ('instructor', 'branch_manager', 'planner', 'admin_staff', 'marketing')
      )
      and public.has_branch_access(tenant_id, branch_id)
    )
    -- Students always see their own row.
    or user_id = auth.uid()
    -- Guardians see their linked student's row (from 0019_student_guardians.sql).
    or id in (
      select g.student_id from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = students.tenant_id
    )
  );

-- lessons --------------------------------------------------------------------
drop policy if exists lessons_select_members on public.lessons;
create policy lessons_select_members on public.lessons
  for select
  using (
    public.is_platform_admin()
    -- Tenant admins: full access regardless of branch.
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lessons.tenant_id
         and m.role = 'tenant_admin'
    )
    -- Other staff (instructor, branch_manager, planner, etc.): branch-scoped.
    or (
      exists (
        select 1 from public.memberships m
         where m.user_id   = auth.uid()
           and m.tenant_id = lessons.tenant_id
           and m.role in ('instructor', 'branch_manager', 'planner', 'admin_staff', 'marketing')
      )
      and public.has_branch_access(lessons.tenant_id, lessons.branch_id)
    )
    -- Students see their own lessons.
    or student_id in (
      select s.id from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = lessons.tenant_id
    )
    -- Guardians see lessons of their linked student.
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = lessons.tenant_id
    )
  );

-- leads ----------------------------------------------------------------------
drop policy if exists leads_select_members on public.leads;
create policy leads_select_members on public.leads
  for select
  using (
    public.is_platform_admin()
    -- Tenant admins: all leads.
    or public.has_role(tenant_id, 'tenant_admin')
    -- Other staff (explicit role check): branch-scoped.
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = leads.tenant_id
         and m.role in ('instructor', 'branch_manager', 'planner', 'admin_staff', 'marketing')
         and public.has_branch_access(leads.tenant_id, leads.branch_id)
    )
  );

-- trial_lessons --------------------------------------------------------------
drop policy if exists trial_lessons_select_members on public.trial_lessons;
create policy trial_lessons_select_members on public.trial_lessons
  for select
  using (
    public.is_platform_admin()
    -- Tenant admins: all trial lessons.
    or public.has_role(tenant_id, 'tenant_admin')
    -- Other staff (explicit role check): branch-scoped.
    or exists (
      select 1 from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = trial_lessons.tenant_id
         and m.role in ('instructor', 'branch_manager', 'planner', 'admin_staff', 'marketing')
         and public.has_branch_access(trial_lessons.tenant_id, trial_lessons.branch_id)
    )
  );

-- ============================================================================
-- 8. Branch management RPCs (SECURITY DEFINER, service_role only)
-- ============================================================================

-- create_branch ---------------------------------------------------------------
create or replace function public.create_branch(
  p_tenant_id uuid,
  p_name      text,
  p_slug      text,
  p_address   text,
  p_city      text,
  p_actor     uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  -- Only tenant_admin of this tenant or platform_admin may create branches.
  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = p_tenant_id
         and m.role = 'tenant_admin'
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: alleen een tenantbeheerder mag vestigingen aanmaken';
  end if;

  insert into public.branches (tenant_id, name, slug, address, city)
  values (p_tenant_id, p_name, p_slug, p_address, p_city)
  returning id into v_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id,
    'branch.created', 'branch', v_id::text,
    jsonb_build_object('name', p_name, 'slug', p_slug, 'city', p_city)
  );

  return v_id;
end;
$$;

revoke all on function public.create_branch(uuid, text, text, text, text, uuid) from public;
revoke all on function public.create_branch(uuid, text, text, text, text, uuid) from anon;
revoke all on function public.create_branch(uuid, text, text, text, text, uuid) from authenticated;
grant execute on function public.create_branch(uuid, text, text, text, text, uuid) to service_role;

-- update_branch ---------------------------------------------------------------
create or replace function public.update_branch(
  p_branch_id uuid,
  p_name      text,
  p_address   text,
  p_city      text,
  p_is_active boolean,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.branches where id = p_branch_id;
  if v_tenant is null then
    raise exception 'vestiging niet gevonden';
  end if;

  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = v_tenant
         and m.role = 'tenant_admin'
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: alleen een tenantbeheerder mag vestigingen bewerken';
  end if;

  update public.branches
     set name      = coalesce(p_name, name),
         address   = p_address,
         city      = p_city,
         is_active = p_is_active
   where id = p_branch_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, v_tenant,
    'branch.updated', 'branch', p_branch_id::text,
    jsonb_build_object(
      'name', p_name, 'address', p_address,
      'city', p_city, 'is_active', p_is_active
    )
  );
end;
$$;

revoke all on function public.update_branch(uuid, text, text, text, boolean, uuid) from public;
revoke all on function public.update_branch(uuid, text, text, text, boolean, uuid) from anon;
revoke all on function public.update_branch(uuid, text, text, text, boolean, uuid) from authenticated;
grant execute on function public.update_branch(uuid, text, text, text, boolean, uuid) to service_role;

-- set_membership_branches -----------------------------------------------------
-- Replace-semantics: deletes all existing branch assignments for the membership,
-- then inserts the new set. Empty array = unrestricted (access to all branches).
create or replace function public.set_membership_branches(
  p_membership_id uuid,
  p_branch_ids    uuid[],
  p_actor         uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.memberships where id = p_membership_id;
  if v_tenant is null then
    raise exception 'lidmaatschap niet gevonden';
  end if;

  if not (
    exists (
      select 1 from public.memberships m
       where m.user_id   = p_actor
         and m.tenant_id = v_tenant
         and m.role = 'tenant_admin'
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: alleen een tenantbeheerder mag vestigingstoegang instellen';
  end if;

  -- Validate all branch_ids belong to the same tenant.
  if array_length(p_branch_ids, 1) > 0 then
    if exists (
      select 1 from unnest(p_branch_ids) bid
       where not exists (
         select 1 from public.branches b
          where b.id = bid and b.tenant_id = v_tenant
       )
    ) then
      raise exception 'een of meer vestigingen behoren niet tot deze tenant';
    end if;
  end if;

  -- Replace.
  delete from public.membership_branches where membership_id = p_membership_id;

  if array_length(p_branch_ids, 1) > 0 then
    insert into public.membership_branches (membership_id, branch_id)
    select p_membership_id, bid from unnest(p_branch_ids) bid;
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, v_tenant,
    'membership.branches_set', 'membership', p_membership_id::text,
    jsonb_build_object('branch_ids', to_jsonb(p_branch_ids))
  );
end;
$$;

revoke all on function public.set_membership_branches(uuid, uuid[], uuid) from public;
revoke all on function public.set_membership_branches(uuid, uuid[], uuid) from anon;
revoke all on function public.set_membership_branches(uuid, uuid[], uuid) from authenticated;
grant execute on function public.set_membership_branches(uuid, uuid[], uuid) to service_role;

-- set_tenant_org_type ---------------------------------------------------------
-- Platform admin only: set the org_type of a tenant.
create or replace function public.set_tenant_org_type(
  p_tenant_id uuid,
  p_org_type  public.org_type,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not coalesce(
    (select is_platform_admin from public.profiles where id = p_actor), false
  ) then
    raise exception 'niet geautoriseerd: alleen een platformbeheerder mag het organisatietype instellen';
  end if;

  update public.tenants set org_type = p_org_type where id = p_tenant_id;

  if not found then
    raise exception 'tenant niet gevonden';
  end if;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id,
    'tenant.org_type_set', 'tenant', p_tenant_id::text,
    jsonb_build_object('org_type', p_org_type::text)
  );
end;
$$;

revoke all on function public.set_tenant_org_type(uuid, public.org_type, uuid) from public;
revoke all on function public.set_tenant_org_type(uuid, public.org_type, uuid) from anon;
revoke all on function public.set_tenant_org_type(uuid, public.org_type, uuid) from authenticated;
grant execute on function public.set_tenant_org_type(uuid, public.org_type, uuid) to service_role;
