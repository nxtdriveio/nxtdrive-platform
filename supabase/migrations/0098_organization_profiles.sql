-- ============================================================================
-- 0098_organization_profiles.sql
--
-- Organization profile foundation (Sprint 2).
--
-- In product language, an Organization is the commercial and operational
-- customer boundary. Technically, that boundary is still backed by tenants.
-- This table stores the organization profile data that should not be mixed into
-- the core tenant routing/isolation table.
--
-- Adds:
--   * organization_profiles table (1:1 with tenants)
--   * lifecycle and onboarding status fields
--   * optional owner user reference
--   * RLS read policy for platform admins and own tenant admins
--   * service-role-only RPC for audited platform-admin upserts
--   * backfill profile rows for existing tenants
-- ============================================================================

create table if not exists public.organization_profiles (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text,
  billing_email text,
  support_email text,
  kvk_number text,
  vat_number text,
  owner_user_id uuid references auth.users(id) on delete set null,
  lifecycle_status text not null default 'onboarding'
    check (lifecycle_status in ('prospect', 'onboarding', 'active', 'paused', 'churned')),
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'ready', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (legal_name is null or char_length(btrim(legal_name)) between 1 and 200),
  check (billing_email is null or char_length(btrim(billing_email)) between 3 and 320),
  check (support_email is null or char_length(btrim(support_email)) between 3 and 320),
  check (kvk_number is null or char_length(btrim(kvk_number)) between 1 and 32),
  check (vat_number is null or char_length(btrim(vat_number)) between 1 and 40)
);

create index if not exists idx_organization_profiles_owner_user
  on public.organization_profiles(owner_user_id)
  where owner_user_id is not null;

create index if not exists idx_organization_profiles_lifecycle
  on public.organization_profiles(lifecycle_status, onboarding_status);

drop trigger if exists organization_profiles_set_updated_at on public.organization_profiles;
create trigger organization_profiles_set_updated_at
  before update on public.organization_profiles
  for each row execute function public.set_updated_at();

alter table public.organization_profiles enable row level security;

drop policy if exists organization_profiles_select on public.organization_profiles;
create policy organization_profiles_select on public.organization_profiles
  for select
  using (
    exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and p.is_platform_admin
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = organization_profiles.tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
  );

-- Existing organizations become active/ready profiles so platform-admin screens
-- can gradually adopt this table without breaking current tenants.
insert into public.organization_profiles (
  tenant_id,
  legal_name,
  lifecycle_status,
  onboarding_status
)
select t.id, t.name, 'active', 'ready'
  from public.tenants t
on conflict (tenant_id) do nothing;

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
begin
  if not coalesce(
    (select is_platform_admin from public.profiles where id = p_actor), false
  ) then
    raise exception 'niet geautoriseerd: alleen een platformbeheerder mag organisatieprofielen beheren';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'organisatie niet gevonden';
  end if;

  if p_owner_user_id is not null
     and not exists (select 1 from auth.users where id = p_owner_user_id) then
    raise exception 'organisatie-eigenaar niet gevonden';
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
