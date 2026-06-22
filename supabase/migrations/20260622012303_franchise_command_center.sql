-- Franchise command center: targets and template rollout batches.
-- Signal -> action -> owner -> status -> audit is composed from existing
-- franchise action tables; these tables add the missing durable controls.

create table if not exists public.franchise_benchmark_targets (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric_key text not null,
  target_value numeric not null,
  current_value numeric,
  unit text not null default 'percent',
  status text not null default 'active',
  due_date date,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_benchmark_targets_metric_check
    check (metric_key in (
      'capacity_utilisation',
      'lead_conversion_rate',
      'exam_pass_rate',
      'current_lessons',
      'current_revenue_cents'
    )),
  constraint franchise_benchmark_targets_unit_check
    check (unit in ('percent', 'count', 'euro_cents')),
  constraint franchise_benchmark_targets_status_check
    check (status in ('active', 'paused', 'achieved', 'at_risk', 'expired'))
);

create unique index if not exists idx_franchise_benchmark_targets_unique
  on public.franchise_benchmark_targets (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    metric_key
  );

create index if not exists idx_franchise_benchmark_targets_root
  on public.franchise_benchmark_targets (
    franchise_root_tenant_id,
    status,
    due_date
  );

drop trigger if exists franchise_benchmark_targets_set_updated_at
  on public.franchise_benchmark_targets;
create trigger franchise_benchmark_targets_set_updated_at
  before update on public.franchise_benchmark_targets
  for each row execute function public.set_updated_at();

comment on table public.franchise_benchmark_targets is
  'Command-center benchmark targets set by the franchisegever per franchisee.';
comment on column public.franchise_benchmark_targets.current_value is
  'Latest observed value written by the application loader/action for monitoring.';

create table if not exists public.franchise_template_rollout_batches (
  id uuid primary key default gen_random_uuid(),
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.franchise_templates(id) on delete cascade,
  mode text not null,
  status text not null default 'pending',
  requested_by uuid references auth.users(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  rollback_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint franchise_template_rollout_batches_mode_check
    check (mode in ('dry_run', 'apply', 'rollback')),
  constraint franchise_template_rollout_batches_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'rolled_back'))
);

create index if not exists idx_franchise_template_rollout_batches_root
  on public.franchise_template_rollout_batches (
    franchise_root_tenant_id,
    created_at desc
  );

create index if not exists idx_franchise_template_rollout_batches_template
  on public.franchise_template_rollout_batches (template_id, created_at desc);

drop trigger if exists franchise_template_rollout_batches_set_updated_at
  on public.franchise_template_rollout_batches;
create trigger franchise_template_rollout_batches_set_updated_at
  before update on public.franchise_template_rollout_batches
  for each row execute function public.set_updated_at();

comment on table public.franchise_template_rollout_batches is
  'Auditable template rollout batches with dry-run/apply/rollback-log semantics.';

create table if not exists public.franchise_template_rollout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.franchise_template_rollout_batches(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  action text not null,
  status text not null default 'pending',
  message text,
  resulting_activation_id uuid references public.franchise_template_activations(id) on delete set null,
  rollback_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint franchise_template_rollout_items_action_check
    check (action in ('dry_run', 'distributed', 'applied', 'skipped', 'failed', 'rollback_logged')),
  constraint franchise_template_rollout_items_status_check
    check (status in ('pending', 'dry_run', 'applied', 'skipped', 'failed', 'rolled_back'))
);

create unique index if not exists idx_franchise_template_rollout_items_unique
  on public.franchise_template_rollout_items (batch_id, franchisee_tenant_id);

create index if not exists idx_franchise_template_rollout_items_franchisee
  on public.franchise_template_rollout_items (franchisee_tenant_id, created_at desc);

alter table public.franchise_benchmark_targets enable row level security;
alter table public.franchise_template_rollout_batches enable row level security;
alter table public.franchise_template_rollout_items enable row level security;

drop policy if exists franchise_benchmark_targets_select
  on public.franchise_benchmark_targets;
create policy franchise_benchmark_targets_select
  on public.franchise_benchmark_targets
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_benchmark_targets.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_benchmark_targets.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff')
    )
  );

drop policy if exists franchise_template_rollout_batches_select
  on public.franchise_template_rollout_batches;
create policy franchise_template_rollout_batches_select
  on public.franchise_template_rollout_batches
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_template_rollout_batches.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
  );

drop policy if exists franchise_template_rollout_items_select
  on public.franchise_template_rollout_items;
create policy franchise_template_rollout_items_select
  on public.franchise_template_rollout_items
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.franchise_template_rollout_batches b
        join public.memberships m
          on m.tenant_id = b.franchise_root_tenant_id
       where b.id = franchise_template_rollout_items.batch_id
         and m.user_id = auth.uid()
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = franchise_template_rollout_items.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
  );
