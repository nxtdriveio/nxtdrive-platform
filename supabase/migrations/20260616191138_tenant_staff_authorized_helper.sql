-- 20260616191138_tenant_staff_authorized_helper.sql
--
-- RIS clean-start and future staff-scoped RPCs need a single helper that
-- authorizes any operational staff member in a tenant. Older migrations only
-- provided _tenant_admin_authorized, while RIS clean-start references this
-- broader helper. Keep it small and SECURITY DEFINER, matching the existing
-- helper style.

create or replace function public._tenant_staff_authorized(
  p_actor uuid,
  p_tenant_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role in (
         'tenant_admin',
         'instructor',
         'branch_manager',
         'planner',
         'admin_staff',
         'marketing',
         'franchise_admin'
       )
  ) or exists (
    select 1
      from public.profiles p
     where p.id = p_actor
       and p.is_platform_admin = true
  );
$$;

revoke all on function public._tenant_staff_authorized(uuid, uuid) from public;
revoke execute on function public._tenant_staff_authorized(uuid, uuid)
  from anon, authenticated;
grant execute on function public._tenant_staff_authorized(uuid, uuid)
  to service_role;

comment on function public._tenant_staff_authorized(uuid, uuid) is
  'Authorizes tenant operational staff or platform admins for SECURITY DEFINER RPCs.';
