-- Franchise playbooks as customer-managed programs.
--
-- A playbook is no longer only descriptive content. A franchisegever can define
-- a program, break it into ordered steps, assign it to franchisees and follow
-- local progress with audit-friendly status changes.

create table if not exists public.franchise_playbook_programs (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'operations',
  objective text not null default '',
  owner_label text not null default 'Franchise manager',
  cadence text not null default 'eenmalig',
  target_audience text not null default 'Franchisees',
  default_due_days integer not null default 30,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_playbook_programs_category_check
    check (category in ('operations', 'planning', 'quality', 'sales', 'finance', 'training', 'compliance')),
  constraint franchise_playbook_programs_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint franchise_playbook_programs_due_days_check
    check (default_due_days between 1 and 365)
);

create index if not exists idx_franchise_playbook_programs_root
  on public.franchise_playbook_programs (franchise_root_tenant_id, status, created_at desc);

drop trigger if exists franchise_playbook_programs_set_updated_at
  on public.franchise_playbook_programs;
create trigger franchise_playbook_programs_set_updated_at
  before update on public.franchise_playbook_programs
  for each row execute function public.set_updated_at();

create table if not exists public.franchise_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.franchise_playbook_programs(id) on delete cascade,
  position integer not null default 1,
  title text not null,
  description text not null default '',
  step_type text not null default 'checklist',
  evidence_hint text,
  is_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_playbook_steps_position_check
    check (position between 1 and 999),
  constraint franchise_playbook_steps_type_check
    check (step_type in ('checklist', 'training', 'rollout', 'coaching', 'audit', 'communication', 'measurement'))
);

create unique index if not exists idx_franchise_playbook_steps_program_position
  on public.franchise_playbook_steps (program_id, position);

drop trigger if exists franchise_playbook_steps_set_updated_at
  on public.franchise_playbook_steps;
create trigger franchise_playbook_steps_set_updated_at
  before update on public.franchise_playbook_steps
  for each row execute function public.set_updated_at();

create table if not exists public.franchise_playbook_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.franchise_playbook_programs(id) on delete cascade,
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'not_started',
  owner_label text not null default 'Lokale eigenaar',
  due_date date,
  note text,
  accepted_at timestamptz,
  completed_at timestamptz,
  declined_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_playbook_assignments_status_check
    check (status in ('not_started', 'in_progress', 'blocked', 'completed', 'declined')),
  constraint franchise_playbook_assignments_not_self_check
    check (franchise_root_tenant_id <> franchisee_tenant_id)
);

create unique index if not exists idx_franchise_playbook_assignment_unique
  on public.franchise_playbook_assignments (program_id, franchisee_tenant_id);

create index if not exists idx_franchise_playbook_assignments_root
  on public.franchise_playbook_assignments (franchise_root_tenant_id, status, due_date);

create index if not exists idx_franchise_playbook_assignments_franchisee
  on public.franchise_playbook_assignments (franchisee_tenant_id, status, due_date);

drop trigger if exists franchise_playbook_assignments_set_updated_at
  on public.franchise_playbook_assignments;
create trigger franchise_playbook_assignments_set_updated_at
  before update on public.franchise_playbook_assignments
  for each row execute function public.set_updated_at();

create table if not exists public.franchise_playbook_step_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.franchise_playbook_assignments(id) on delete cascade,
  step_id uuid not null references public.franchise_playbook_steps(id) on delete cascade,
  status text not null default 'not_started',
  note text,
  evidence_url text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_playbook_step_progress_status_check
    check (status in ('not_started', 'in_progress', 'blocked', 'completed', 'skipped'))
);

create unique index if not exists idx_franchise_playbook_step_progress_unique
  on public.franchise_playbook_step_progress (assignment_id, step_id);

drop trigger if exists franchise_playbook_step_progress_set_updated_at
  on public.franchise_playbook_step_progress;
create trigger franchise_playbook_step_progress_set_updated_at
  before update on public.franchise_playbook_step_progress
  for each row execute function public.set_updated_at();

alter table public.franchise_playbook_programs enable row level security;
alter table public.franchise_playbook_steps enable row level security;
alter table public.franchise_playbook_assignments enable row level security;
alter table public.franchise_playbook_step_progress enable row level security;

drop policy if exists franchise_playbook_programs_select on public.franchise_playbook_programs;
create policy franchise_playbook_programs_select
  on public.franchise_playbook_programs
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.memberships m
       where m.user_id = (select auth.uid())
         and m.tenant_id = franchise_playbook_programs.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.franchise_playbook_assignments a
        join public.memberships m
          on m.tenant_id = a.franchisee_tenant_id
         and m.user_id = (select auth.uid())
       where a.program_id = franchise_playbook_programs.id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
    )
  );

drop policy if exists franchise_playbook_steps_select on public.franchise_playbook_steps;
create policy franchise_playbook_steps_select
  on public.franchise_playbook_steps
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.franchise_playbook_programs p
       where p.id = franchise_playbook_steps.program_id
         and (
           exists (
             select 1
               from public.memberships m
              where m.user_id = (select auth.uid())
                and m.tenant_id = p.franchise_root_tenant_id
                and m.role in ('tenant_admin', 'franchise_admin')
           )
           or exists (
             select 1
               from public.franchise_playbook_assignments a
               join public.memberships m
                 on m.tenant_id = a.franchisee_tenant_id
                and m.user_id = (select auth.uid())
              where a.program_id = p.id
                and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
           )
         )
    )
  );

drop policy if exists franchise_playbook_assignments_select on public.franchise_playbook_assignments;
create policy franchise_playbook_assignments_select
  on public.franchise_playbook_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.memberships m
       where m.user_id = (select auth.uid())
         and m.tenant_id = franchise_playbook_assignments.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = (select auth.uid())
         and m.tenant_id = franchise_playbook_assignments.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
    )
  );

drop policy if exists franchise_playbook_step_progress_select on public.franchise_playbook_step_progress;
create policy franchise_playbook_step_progress_select
  on public.franchise_playbook_step_progress
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.franchise_playbook_assignments a
        join public.memberships m
          on m.user_id = (select auth.uid())
         and m.tenant_id in (a.franchise_root_tenant_id, a.franchisee_tenant_id)
       where a.id = franchise_playbook_step_progress.assignment_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
    )
  );

revoke all on table public.franchise_playbook_programs from anon, authenticated;
revoke all on table public.franchise_playbook_steps from anon, authenticated;
revoke all on table public.franchise_playbook_assignments from anon, authenticated;
revoke all on table public.franchise_playbook_step_progress from anon, authenticated;

grant select on table public.franchise_playbook_programs to authenticated;
grant select on table public.franchise_playbook_steps to authenticated;
grant select on table public.franchise_playbook_assignments to authenticated;
grant select on table public.franchise_playbook_step_progress to authenticated;

grant all on table public.franchise_playbook_programs to service_role;
grant all on table public.franchise_playbook_steps to service_role;
grant all on table public.franchise_playbook_assignments to service_role;
grant all on table public.franchise_playbook_step_progress to service_role;

comment on table public.franchise_playbook_programs is
  'Customer-managed franchise playbook programs owned by the franchise root tenant.';
comment on table public.franchise_playbook_steps is
  'Ordered operational steps within a franchise playbook program.';
comment on table public.franchise_playbook_assignments is
  'Program rollout assignments from franchisegever to franchisee tenants.';
comment on table public.franchise_playbook_step_progress is
  'Per-assignment progress for playbook steps.';
