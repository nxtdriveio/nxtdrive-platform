-- Sprint 5A: allow organization admins to manage their own profile.
--
-- The original organization profile RPC was platform-admin only because it was
-- introduced from the platform admin screen. Sprint 5A exposes organization
-- profile management inside the tenant backoffice, so tenant_admin and
-- franchise_admin users must be able to update their own organization's profile
-- without gaining cross-tenant access or lifecycle/plan controls.

create or replace function public.upsert_organization_profile(
  p_tenant_id uuid,
  p_actor uuid,
  p_legal_name text default null,
  p_billing_email text default null,
  p_support_email text default null,
  p_kvk_number text default null,
  p_vat_number text default null,
  p_owner_user_id uuid default null,
  p_lifecycle_status text default 'onboarding',
  p_onboarding_status text default 'not_started'
)
returns public.organization_profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile public.organization_profiles%rowtype;
  v_is_platform_admin boolean;
  v_is_org_admin boolean;
begin
  select coalesce(is_platform_admin, false)
    into v_is_platform_admin
    from public.profiles
   where id = p_actor;

  select exists (
    select 1
      from public.memberships m
     where m.user_id = p_actor
       and m.tenant_id = p_tenant_id
       and m.role in ('tenant_admin', 'franchise_admin')
  ) into v_is_org_admin;

  if not coalesce(v_is_platform_admin, false) and not coalesce(v_is_org_admin, false) then
    raise exception 'niet geautoriseerd: alleen organisatiebeheerders mogen dit organisatieprofiel beheren';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'organisatie niet gevonden';
  end if;

  if p_owner_user_id is not null
     and not exists (
       select 1
         from public.memberships m
        where m.user_id = p_owner_user_id
          and m.tenant_id = p_tenant_id
          and m.role in (
            'tenant_admin',
            'franchise_admin',
            'branch_manager',
            'planner',
            'admin_staff',
            'marketing',
            'instructor'
          )
     ) then
    raise exception 'organisatie-eigenaar moet een medewerker binnen deze organisatie zijn';
  end if;

  if coalesce(p_lifecycle_status, '') not in ('prospect', 'onboarding', 'active', 'paused', 'churned') then
    raise exception 'ongeldige lifecycle-status: %', p_lifecycle_status;
  end if;

  if coalesce(p_onboarding_status, '') not in ('not_started', 'in_progress', 'ready', 'blocked') then
    raise exception 'ongeldige onboarding-status: %', p_onboarding_status;
  end if;

  insert into public.organization_profiles (
    tenant_id,
    legal_name,
    billing_email,
    support_email,
    kvk_number,
    vat_number,
    owner_user_id,
    lifecycle_status,
    onboarding_status
  )
  values (
    p_tenant_id,
    nullif(btrim(p_legal_name), ''),
    nullif(lower(btrim(p_billing_email)), ''),
    nullif(lower(btrim(p_support_email)), ''),
    nullif(btrim(p_kvk_number), ''),
    nullif(btrim(p_vat_number), ''),
    p_owner_user_id,
    p_lifecycle_status,
    p_onboarding_status
  )
  on conflict (tenant_id) do update set
    legal_name = excluded.legal_name,
    billing_email = excluded.billing_email,
    support_email = excluded.support_email,
    kvk_number = excluded.kvk_number,
    vat_number = excluded.vat_number,
    owner_user_id = excluded.owner_user_id,
    lifecycle_status = excluded.lifecycle_status,
    onboarding_status = excluded.onboarding_status
  returning * into v_profile;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_profile.upserted',
    'organization_profile',
    p_tenant_id::text,
    jsonb_build_object(
      'legal_name', v_profile.legal_name,
      'billing_email', v_profile.billing_email,
      'support_email', v_profile.support_email,
      'kvk_number', v_profile.kvk_number,
      'vat_number', v_profile.vat_number,
      'owner_user_id', v_profile.owner_user_id,
      'lifecycle_status', v_profile.lifecycle_status,
      'onboarding_status', v_profile.onboarding_status
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.upsert_organization_profile(
  uuid, uuid, text, text, text, text, text, uuid, text, text
) from public;
revoke all on function public.upsert_organization_profile(
  uuid, uuid, text, text, text, text, text, uuid, text, text
) from anon;
revoke all on function public.upsert_organization_profile(
  uuid, uuid, text, text, text, text, text, uuid, text, text
) from authenticated;
grant execute on function public.upsert_organization_profile(
  uuid, uuid, text, text, text, text, text, uuid, text, text
) to service_role;
