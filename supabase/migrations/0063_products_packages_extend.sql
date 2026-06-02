-- 0063_products_packages_extend.sql
-- Module 4 (Pakketten) + Module 5 (Tegoed): make the offer catalogue richer.
--
--   * products: tenant-defined standalone offerings (proefles, losse rijles,
--     praktijkexamen, tussentijdse toets, theoriebegeleiding, ...). Each has a
--     price, an OPTIONAL hour-credit (stored in MINUTES, shown in hours), and
--     web/app visibility flags. No hardcoding of any specific school.
--   * packages: extend with category, voorwaarden (terms), termijnbetaling
--     (modelled only — no payment flow here), auto-grant flag, web/app
--     visibility, and a follow-up signal threshold (in minutes).
--   * package_products: which standalone products are INCLUDED in a package,
--     with tenant-consistent FKs.
--
-- Catalogue rows do NOT mutate tegoed, so (like the existing packages writes)
-- they are written server-side with the service role from guarded server
-- actions — no client writes, RLS still tenant-scoped, admin-only for writes.

begin;

-- Shared category enum for both packages and products.
do $$ begin
  create type public.offering_category as enum (
    'los',      -- standalone product / losse les
    'pakket',   -- bundled lesson package
    'traject',  -- multi-step traject (starterspakket, faalangsttraject, ...)
    'examen'    -- exam-focused (praktijkexamen, herexamenpakket, ...)
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  name               text not null,
  description        text,
  category           public.offering_category not null default 'los',
  price_cents        integer not null default 0,
  -- Optional tegoed granted by this product, in MINUTES (shown in hours).
  credit_minutes     integer,
  visible_on_website boolean not null default false,
  visible_in_app     boolean not null default true,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (price_cents >= 0),
  check (credit_minutes is null or credit_minutes > 0),
  check (char_length(name) between 1 and 200)
);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create index if not exists idx_products_tenant_active
  on public.products (tenant_id, active, created_at desc);

-- Composite unique so package_products can bind a (product, tenant) pair.
alter table public.products
  drop constraint if exists products_id_tenant_unique;
alter table public.products
  add constraint products_id_tenant_unique unique (id, tenant_id);

alter table public.products enable row level security;

drop policy if exists products_select_members on public.products;
create policy products_select_members on public.products
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- packages: richer configuration
-- ---------------------------------------------------------------------------
alter table public.packages
  add column if not exists category             public.offering_category not null default 'pakket',
  add column if not exists terms                text,
  add column if not exists installments_enabled boolean not null default false,
  add column if not exists installment_count    integer,
  -- When true (default), assigning the package immediately books its tegoed in
  -- the ledger (current behaviour). When false the tegoed is deferred (e.g.
  -- until payment, handled elsewhere) and grant_package books nothing.
  add column if not exists auto_grant           boolean not null default true,
  add column if not exists visible_on_website   boolean not null default false,
  add column if not exists visible_in_app       boolean not null default true,
  -- Follow-up signal: once the student has CONSUMED this many MINUTES of tegoed
  -- after the grant, a backoffice task is raised once. Null = no signal.
  add column if not exists signal_threshold_minutes integer;

alter table public.packages
  drop constraint if exists packages_installment_count_chk;
alter table public.packages
  add constraint packages_installment_count_chk
  check (installment_count is null or installment_count > 1);

alter table public.packages
  drop constraint if exists packages_signal_threshold_chk;
alter table public.packages
  add constraint packages_signal_threshold_chk
  check (signal_threshold_minutes is null or signal_threshold_minutes > 0);

comment on column public.packages.signal_threshold_minutes is
  'Follow-up signal threshold in MINUTES of consumed tegoed after grant; null = off.';
comment on column public.packages.auto_grant is
  'When true, assigning the package books its tegoed immediately via the ledger.';

-- ---------------------------------------------------------------------------
-- package_products: products included in a package
-- ---------------------------------------------------------------------------
create table if not exists public.package_products (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  package_id  uuid not null,
  product_id  uuid not null,
  quantity    integer not null default 1,
  created_at  timestamptz not null default now(),
  check (quantity > 0),
  constraint package_products_package_fkey
    foreign key (package_id, tenant_id)
    references public.packages (id, tenant_id) on delete cascade,
  constraint package_products_product_fkey
    foreign key (product_id, tenant_id)
    references public.products (id, tenant_id) on delete cascade,
  constraint package_products_unique unique (package_id, product_id)
);

create index if not exists idx_package_products_tenant_package
  on public.package_products (tenant_id, package_id);

alter table public.package_products enable row level security;

drop policy if exists package_products_select_members on public.package_products;
create policy package_products_select_members on public.package_products
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists package_products_admin_write on public.package_products;
create policy package_products_admin_write on public.package_products
  for all
  using (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin())
  with check (public.has_role(tenant_id, 'tenant_admin') or public.is_platform_admin());

commit;
