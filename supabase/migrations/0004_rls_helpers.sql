-- 0004_rls_helpers.sql
-- Security-definer helpers used by RLS policies. Defined BEFORE policies are
-- enabled so the policy bodies can reference them without recursion.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.my_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct tenant_id
  from public.memberships
  where user_id = auth.uid();
$$;

create or replace function public.has_role(p_tenant_id uuid, p_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and role = p_role
  );
$$;

-- Lock these down: only callable by authenticated and service_role.
revoke all on function public.is_platform_admin()       from public;
revoke all on function public.my_tenant_ids()           from public;
revoke all on function public.has_role(uuid, public.member_role) from public;
grant execute on function public.is_platform_admin()    to authenticated, service_role;
grant execute on function public.my_tenant_ids()        to authenticated, service_role;
grant execute on function public.has_role(uuid, public.member_role) to authenticated, service_role;
