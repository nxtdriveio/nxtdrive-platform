-- ============================================================================
-- 0088_tenant_domains.sql
--
-- Multi-tenant domeinen: koppel hostnames aan een tenant zodat een rijschool
-- bereikbaar is via een wildcard-subdomein (`<slug>.nxtdrive.io`) en/of een
-- eigen domein (`rijschoolxyz.nl`) ZONDER code- of Caddy-wijziging per school.
--
-- Deze tabel is de bron van waarheid voor twee dingen:
--   1. Host-gebaseerde tenantresolutie in de app (welke tenant hoort bij een
--      inkomende host-header).
--   2. De on-demand-TLS "ask"-check in Caddy: alleen een hostname met status
--      'active' krijgt automatisch een certificaat (voorkomt cert-misbruik /
--      DoS via willekeurige hosts).
--
-- Invarianten (spiegelen de rest van het schema):
--   * Elke rij is tenant-scoped (tenant_id) met RLS + indexes vanaf dag één.
--   * Een hostname kan globaal nooit naar twee tenants wijzen (uniek).
--   * RLS is SELECT-only en alleen voor tenant_admins/platform-admins — de
--     verificatietoken is een eigendomsbewijs en mag niet breed lekken (geen
--     `tenant_id in (my_tenant_ids())`-tak die ook leerlingen/ouders toelaat).
--   * Alle schrijfacties lopen via SECURITY DEFINER RPC's die ALLEEN voor
--     service_role uitvoerbaar zijn (execute revoked van anon + authenticated).
--   * Mutaties worden geaudit (audit_log, insert-only).
--   * Domeinen verifiëren we via een TXT-record met de verificatietoken; pas na
--     succesvolle verificatie (in de app-laag) zet de RPC de status op 'active'.
-- Forward-only (de runner volgt op bestandsnaam).
-- ============================================================================

-- Enums ----------------------------------------------------------------------
do $$ begin
  create type public.tenant_domain_type as enum ('subdomain', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tenant_domain_status as enum ('pending', 'active', 'failed');
exception when duplicate_object then null; end $$;

-- Table ----------------------------------------------------------------------
create table if not exists public.tenant_domains (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  hostname           text not null,
  type               public.tenant_domain_type not null,
  status             public.tenant_domain_status not null default 'pending',
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  is_primary         boolean not null default false,
  verified_at        timestamptz,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Hostnames worden altijd lowercase opgeslagen.
  constraint tenant_domains_hostname_lower check (hostname = lower(hostname)),
  constraint tenant_domains_hostname_len   check (length(hostname) between 4 and 253),
  -- Basale FQDN-validatie: labels van letters/cijfers/koppeltekens + een TLD.
  constraint tenant_domains_hostname_fqdn
    check (hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$')
);

-- Eén globale eigenaar per hostname: een host kan nooit naar twee tenants wijzen.
create unique index if not exists uq_tenant_domains_hostname
  on public.tenant_domains (hostname);

-- Lijst-/routing-reads per tenant.
create index if not exists idx_tenant_domains_tenant
  on public.tenant_domains (tenant_id, status);

-- Snelle status-lookup voor de TLS-ask + routing (alleen 'active' telt).
create index if not exists idx_tenant_domains_status
  on public.tenant_domains (status);

-- Max één primair domein per tenant (canonieke host voor redirects/links).
create unique index if not exists uq_tenant_domains_primary
  on public.tenant_domains (tenant_id)
  where is_primary;

drop trigger if exists tenant_domains_set_updated_at on public.tenant_domains;
create trigger tenant_domains_set_updated_at
  before update on public.tenant_domains
  for each row execute function public.set_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.tenant_domains enable row level security;

drop policy if exists tenant_domains_select on public.tenant_domains;
create policy tenant_domains_select on public.tenant_domains
  for select
  using (
    public.has_role(tenant_id, 'tenant_admin')
    or public.is_platform_admin()
  );
-- Geen INSERT/UPDATE/DELETE policies — schrijven uitsluitend via service_role RPC.

-- Authorization helper -------------------------------------------------------
-- True wanneer p_actor de tenant mag beheren (tenant_admin van die tenant of
-- platform admin). Bewust gescheiden van de RLS-policy (die op auth.uid() leunt)
-- omdat de RPC's de actor expliciet meegeven en service_role-only zijn.
create or replace function public._domain_actor_authorized(
  p_tenant_id uuid,
  p_actor     uuid
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    exists (
      select 1 from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = p_tenant_id
         and m.role = 'tenant_admin'
    )
    or coalesce(
      (select is_platform_admin from public.profiles where id = p_actor),
      false
    );
$$;

revoke all on function public._domain_actor_authorized(uuid, uuid) from public;
revoke all on function public._domain_actor_authorized(uuid, uuid) from anon;
revoke all on function public._domain_actor_authorized(uuid, uuid) from authenticated;
grant execute on function public._domain_actor_authorized(uuid, uuid) to service_role;

-- RPC: add_tenant_domain -----------------------------------------------------
-- Voeg een hostname toe (status 'pending'). Idempotent binnen dezelfde tenant
-- (geeft de bestaande rij terug); weigert een host die al bij een ANDERE tenant
-- hoort.
create or replace function public.add_tenant_domain(
  p_tenant_id uuid,
  p_hostname  text,
  p_type      public.tenant_domain_type,
  p_actor     uuid
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_host  text := lower(btrim(p_hostname));
  v_id    uuid;
  v_owner uuid;
begin
  if v_host = '' then
    raise exception 'hostname is leeg';
  end if;
  if not public._domain_actor_authorized(p_tenant_id, p_actor) then
    raise exception 'niet geautoriseerd voor deze tenant';
  end if;

  select id, tenant_id into v_id, v_owner
    from public.tenant_domains
   where hostname = v_host;

  if v_id is not null then
    if v_owner <> p_tenant_id then
      raise exception 'hostname is al gekoppeld aan een andere tenant';
    end if;
    return v_id; -- idempotent
  end if;

  insert into public.tenant_domains (tenant_id, hostname, type, created_by)
  values (p_tenant_id, v_host, p_type, p_actor)
  returning id into v_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (p_actor, p_tenant_id, 'tenant_domain.added', 'tenant_domain', v_id::text,
     jsonb_build_object('hostname', v_host, 'type', p_type::text));

  return v_id;
end;
$$;

revoke all on function public.add_tenant_domain(uuid, text, public.tenant_domain_type, uuid) from public;
revoke all on function public.add_tenant_domain(uuid, text, public.tenant_domain_type, uuid) from anon;
revoke all on function public.add_tenant_domain(uuid, text, public.tenant_domain_type, uuid) from authenticated;
grant execute on function public.add_tenant_domain(uuid, text, public.tenant_domain_type, uuid) to service_role;

-- RPC: set_tenant_domain_status ----------------------------------------------
-- Zet de status van een domein (pending/active/failed). 'active' stempelt
-- verified_at. De app-laag roept dit aan NA een geslaagde DNS-verificatie.
create or replace function public.set_tenant_domain_status(
  p_domain_id uuid,
  p_status    public.tenant_domain_status,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
  v_host   text;
begin
  select tenant_id, hostname into v_tenant, v_host
    from public.tenant_domains where id = p_domain_id;
  if v_tenant is null then
    raise exception 'domein niet gevonden';
  end if;
  if not public._domain_actor_authorized(v_tenant, p_actor) then
    raise exception 'niet geautoriseerd voor deze tenant';
  end if;

  update public.tenant_domains
     set status      = p_status,
         verified_at = case when p_status = 'active' then now() else verified_at end
   where id = p_domain_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (p_actor, v_tenant, 'tenant_domain.status_changed', 'tenant_domain', p_domain_id::text,
     jsonb_build_object('hostname', v_host, 'status', p_status::text));
end;
$$;

revoke all on function public.set_tenant_domain_status(uuid, public.tenant_domain_status, uuid) from public;
revoke all on function public.set_tenant_domain_status(uuid, public.tenant_domain_status, uuid) from anon;
revoke all on function public.set_tenant_domain_status(uuid, public.tenant_domain_status, uuid) from authenticated;
grant execute on function public.set_tenant_domain_status(uuid, public.tenant_domain_status, uuid) to service_role;

-- RPC: set_primary_tenant_domain ---------------------------------------------
-- Markeer een ACTIEF domein als het primaire (canonieke) domein van de tenant.
-- Zet eventueel bestaand primair domein terug (max één primair via partial index).
create or replace function public.set_primary_tenant_domain(
  p_domain_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
  v_status public.tenant_domain_status;
  v_host   text;
begin
  select tenant_id, status, hostname into v_tenant, v_status, v_host
    from public.tenant_domains where id = p_domain_id;
  if v_tenant is null then
    raise exception 'domein niet gevonden';
  end if;
  if not public._domain_actor_authorized(v_tenant, p_actor) then
    raise exception 'niet geautoriseerd voor deze tenant';
  end if;
  if v_status <> 'active' then
    raise exception 'alleen een geverifieerd (actief) domein kan primair zijn';
  end if;

  update public.tenant_domains
     set is_primary = false
   where tenant_id = v_tenant and is_primary and id <> p_domain_id;

  update public.tenant_domains
     set is_primary = true
   where id = p_domain_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (p_actor, v_tenant, 'tenant_domain.set_primary', 'tenant_domain', p_domain_id::text,
     jsonb_build_object('hostname', v_host));
end;
$$;

revoke all on function public.set_primary_tenant_domain(uuid, uuid) from public;
revoke all on function public.set_primary_tenant_domain(uuid, uuid) from anon;
revoke all on function public.set_primary_tenant_domain(uuid, uuid) from authenticated;
grant execute on function public.set_primary_tenant_domain(uuid, uuid) to service_role;

-- RPC: remove_tenant_domain --------------------------------------------------
create or replace function public.remove_tenant_domain(
  p_domain_id uuid,
  p_actor     uuid
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant uuid;
  v_host   text;
begin
  select tenant_id, hostname into v_tenant, v_host
    from public.tenant_domains where id = p_domain_id;
  if v_tenant is null then
    return; -- idempotent: al weg
  end if;
  if not public._domain_actor_authorized(v_tenant, p_actor) then
    raise exception 'niet geautoriseerd voor deze tenant';
  end if;

  delete from public.tenant_domains where id = p_domain_id;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values
    (p_actor, v_tenant, 'tenant_domain.removed', 'tenant_domain', p_domain_id::text,
     jsonb_build_object('hostname', v_host));
end;
$$;

revoke all on function public.remove_tenant_domain(uuid, uuid) from public;
revoke all on function public.remove_tenant_domain(uuid, uuid) from anon;
revoke all on function public.remove_tenant_domain(uuid, uuid) from authenticated;
grant execute on function public.remove_tenant_domain(uuid, uuid) to service_role;
