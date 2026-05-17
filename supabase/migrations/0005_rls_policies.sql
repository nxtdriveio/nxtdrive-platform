-- 0005_rls_policies.sql
-- Enable RLS on every tenant-scoped table and install the baseline policies.
-- Service role bypasses RLS entirely (used by server-side mutations).

-- profiles ------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select
  using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- A user cannot grant themselves platform admin.
    and is_platform_admin = (select is_platform_admin from public.profiles where id = auth.uid())
  );

-- tenants -------------------------------------------------------------------
alter table public.tenants enable row level security;

drop policy if exists tenants_select_member_or_admin on public.tenants;
create policy tenants_select_member_or_admin on public.tenants
  for select
  using (id in (select public.my_tenant_ids()) or public.is_platform_admin());

-- tenant_settings -----------------------------------------------------------
alter table public.tenant_settings enable row level security;

drop policy if exists tenant_settings_select on public.tenant_settings;
create policy tenant_settings_select on public.tenant_settings
  for select
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists tenant_settings_admin_write on public.tenant_settings;
create policy tenant_settings_admin_write on public.tenant_settings
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

-- tenant_branding -----------------------------------------------------------
alter table public.tenant_branding enable row level security;

drop policy if exists tenant_branding_select on public.tenant_branding;
create policy tenant_branding_select on public.tenant_branding
  for select
  using (tenant_id in (select public.my_tenant_ids()) or public.is_platform_admin());

drop policy if exists tenant_branding_admin_write on public.tenant_branding;
create policy tenant_branding_admin_write on public.tenant_branding
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

-- memberships ---------------------------------------------------------------
alter table public.memberships enable row level security;

drop policy if exists memberships_select_self_or_admin on public.memberships;
create policy memberships_select_self_or_admin on public.memberships
  for select
  using (
    user_id = auth.uid()
    or public.has_role(tenant_id, 'tenant_admin')
    or public.is_platform_admin()
  );

drop policy if exists memberships_admin_write on public.memberships;
create policy memberships_admin_write on public.memberships
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

-- audit_log: select-only for members; inserts only via service role ---------
alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select
  using (
    public.is_platform_admin()
    or (tenant_id is not null and public.has_role(tenant_id, 'tenant_admin'))
  );

-- No INSERT/UPDATE/DELETE policies — only service_role can write.
