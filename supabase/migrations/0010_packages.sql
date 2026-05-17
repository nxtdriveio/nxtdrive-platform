-- 0010_packages.sql
-- Packages: tenant-defined credit bundles (e.g. "30 lessons", "starter pack").
-- Each package has a credit amount and a price. Credits are granted to a
-- student through the credit_ledger when an admin assigns the package.

create table if not exists public.packages (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  credits_total integer not null,
  price_cents   integer not null,
  valid_days    integer,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (credits_total > 0),
  check (price_cents >= 0),
  check (valid_days is null or valid_days > 0),
  check (char_length(name) between 1 and 200)
);

drop trigger if exists packages_set_updated_at on public.packages;
create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

create index if not exists idx_packages_tenant_active
  on public.packages (tenant_id, active, created_at desc);

-- Composite unique to support FK from credit_ledger.related ----------------
alter table public.packages
  drop constraint if exists packages_id_tenant_unique;
alter table public.packages
  add constraint packages_id_tenant_unique unique (id, tenant_id);

-- RLS ----------------------------------------------------------------------
alter table public.packages enable row level security;

drop policy if exists packages_select_members on public.packages;
create policy packages_select_members on public.packages
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists packages_admin_write on public.packages;
create policy packages_admin_write on public.packages
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());
