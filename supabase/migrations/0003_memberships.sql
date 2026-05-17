-- 0003_memberships.sql
-- A user can hold MULTIPLE roles in the same tenant — one row per (user, tenant, role).

create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  role        public.member_role not null,
  created_at  timestamptz not null default now(),
  unique (user_id, tenant_id, role)
);
