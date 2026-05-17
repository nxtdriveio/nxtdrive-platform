-- 0011_students.sql
-- Students: people taking lessons. May or may not have a login (user_id).
-- May be linked back to the lead they originated from.

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  lead_id     uuid references public.leads(id) on delete set null,
  full_name   text not null,
  email       text,
  phone       text,
  postcode    text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (char_length(full_name) between 1 and 200),
  -- A user can only be linked to one student row per tenant (if linked at all)
  unique (tenant_id, user_id)
);

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

create index if not exists idx_students_tenant_created
  on public.students (tenant_id, created_at desc);

create index if not exists idx_students_user
  on public.students (user_id)
  where user_id is not null;

create index if not exists idx_students_lead
  on public.students (lead_id)
  where lead_id is not null;

-- Composite unique for cross-table FKs (credit_ledger).
alter table public.students
  drop constraint if exists students_id_tenant_unique;
alter table public.students
  add constraint students_id_tenant_unique unique (id, tenant_id);

-- RLS ----------------------------------------------------------------------
alter table public.students enable row level security;

drop policy if exists students_select_members on public.students;
create policy students_select_members on public.students
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    -- Students can always read their own row even if RLS-helper changes.
    or user_id = auth.uid()
  );

-- No INSERT/UPDATE/DELETE policies — server actions write via service role.
