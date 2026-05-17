-- 0002_tenants.sql
-- Tenant model: tenants, tenant_settings (incl. cancellation policy), tenant_branding.

-- Enums --------------------------------------------------------------------
do $$ begin
  create type public.tenant_plan as enum ('start', 'pro', 'elite');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('tenant_admin', 'instructor', 'student', 'parent');
exception when duplicate_object then null; end $$;

-- tenants -------------------------------------------------------------------
create table if not exists public.tenants (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  name                 text not null,
  plan                 public.tenant_plan not null default 'start',
  white_label_enabled  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- tenant_settings: KV settings per tenant (cancellation_policy lives here) ---
create table if not exists public.tenant_settings (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, key)
);

drop trigger if exists tenant_settings_set_updated_at on public.tenant_settings;
create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function public.set_updated_at();

-- tenant_branding: white-label visual identity per tenant -------------------
create table if not exists public.tenant_branding (
  tenant_id            uuid primary key references public.tenants(id) on delete cascade,
  logo_url             text,
  primary_color        text,
  primary_foreground   text,
  custom_domain        text unique,
  updated_at           timestamptz not null default now()
);

drop trigger if exists tenant_branding_set_updated_at on public.tenant_branding;
create trigger tenant_branding_set_updated_at
  before update on public.tenant_branding
  for each row execute function public.set_updated_at();
