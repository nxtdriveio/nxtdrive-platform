-- Explainable route decisions and human-approved planning scenarios.
-- No table or RPC in this migration can publish optimized appointments
-- automatically.

create table if not exists public.route_calculation_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_code text not null,
  appointment_type text,
  appointment_id uuid,
  origin_ref_hash text not null,
  destination_ref_hash text not null,
  departure_bucket timestamptz,
  method text not null,
  status text not null,
  confidence text not null,
  duration_seconds integer,
  distance_meters integer,
  buffer_seconds integer not null default 0,
  as_of timestamptz not null,
  stale_after timestamptz,
  provider_request_correlation_id text,
  explanation_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint route_decision_method_ck check (
    method in (
      'GOOGLE_TRAFFIC',
      'GOOGLE_ROUTE',
      'CACHE',
      'RAYON_MATRIX',
      'HAVERSINE',
      'UNKNOWN'
    )
  ),
  constraint route_decision_status_ck check (
    status in (
      'FEASIBLE',
      'TIGHT',
      'INFEASIBLE',
      'UNKNOWN',
      'FALLBACK_ESTIMATE',
      'NO_ROUTE',
      'PARTIAL'
    )
  ),
  constraint route_decision_confidence_ck
    check (confidence in ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  constraint route_decision_values_ck check (
    (duration_seconds is null or duration_seconds between 0 and 86400)
    and (distance_meters is null or distance_meters between 0 and 5000000)
    and buffer_seconds between 0 and 86400
  ),
  constraint route_decision_actuality_ck
    check (stale_after is null or stale_after > as_of),
  constraint route_decision_hash_ck check (
    origin_ref_hash ~ '^[a-f0-9]{32,128}$'
    and destination_ref_hash ~ '^[a-f0-9]{32,128}$'
  )
);

create index if not exists idx_route_decisions_appointment
  on public.route_calculation_decisions
  (tenant_id, appointment_type, appointment_id, created_at desc);
create index if not exists idx_route_decisions_status
  on public.route_calculation_decisions
  (tenant_id, status, created_at desc);

create table if not exists public.route_conflict_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  version_number integer not null,
  status text not null default 'DRAFT',
  default_buffer_minutes integer not null default 15,
  unknown_result_action text not null default 'WARN',
  fallback_result_action text not null default 'WARN',
  infeasible_result_action text not null default 'BLOCK',
  override_allowed boolean not null default true,
  override_roles text[] not null default '{tenant_admin,planner}',
  appointment_type_buffers jsonb not null default '{}'::jsonb,
  region_buffers jsonb not null default '{}'::jsonb,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint route_conflict_policy_status_ck
    check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')),
  constraint route_conflict_policy_buffer_ck
    check (default_buffer_minutes between 0 and 240),
  constraint route_conflict_policy_actions_ck check (
    unknown_result_action in ('ALLOW', 'WARN', 'BLOCK')
    and fallback_result_action in ('ALLOW', 'WARN', 'BLOCK')
    and infeasible_result_action in ('WARN', 'BLOCK')
  ),
  constraint route_conflict_policy_documents_ck check (
    jsonb_typeof(appointment_type_buffers) = 'object'
    and jsonb_typeof(region_buffers) = 'object'
  ),
  constraint route_conflict_policy_period_ck
    check (effective_until is null or effective_from is null or effective_until > effective_from),
  unique (tenant_id, version_number)
);

create unique index if not exists uq_route_conflict_policy_published
  on public.route_conflict_policies (tenant_id)
  where status = 'PUBLISHED' and effective_until is null;

create table if not exists public.route_conflict_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_decision_id uuid not null
    references public.route_calculation_decisions(id) on delete restrict,
  appointment_type text not null,
  appointment_id uuid not null,
  original_status text not null,
  original_duration_seconds integer,
  available_seconds integer,
  buffer_seconds integer not null,
  method text not null,
  route_as_of timestamptz not null,
  reason text not null,
  overridden_at timestamptz not null default now(),
  overridden_by uuid not null references auth.users(id) on delete restrict,
  constraint route_override_status_ck
    check (original_status in ('TIGHT', 'INFEASIBLE', 'UNKNOWN', 'FALLBACK_ESTIMATE')),
  constraint route_override_reason_ck
    check (char_length(btrim(reason)) between 10 and 1000),
  constraint route_override_values_ck check (
    (original_duration_seconds is null or original_duration_seconds >= 0)
    and (available_seconds is null or available_seconds >= 0)
    and buffer_seconds >= 0
  )
);

create table if not exists public.planning_optimization_scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scenario_type text not null,
  status text not null default 'DRAFT',
  instructor_ids uuid[] not null default '{}',
  selected_appointment_refs jsonb not null default '[]'::jsonb,
  constraints_document jsonb not null default '{}'::jsonb,
  baseline_document jsonb not null,
  proposal_document jsonb not null,
  explanation_document jsonb not null,
  current_travel_seconds integer,
  proposed_travel_seconds integer,
  current_empty_meters integer,
  proposed_empty_meters integer,
  provider text not null,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  rolled_back_at timestamptz,
  rolled_back_by uuid references auth.users(id) on delete set null,
  constraint planning_scenario_type_ck check (
    scenario_type in (
      'SINGLE_INSTRUCTOR_ORDER',
      'MULTI_INSTRUCTOR_PREPARATION',
      'CANCELLATION_RECOVERY',
      'VEHICLE_OR_BRANCH_RECOMMENDATION'
    )
  ),
  constraint planning_scenario_status_ck check (
    status in (
      'DRAFT',
      'READY_FOR_REVIEW',
      'PARTIALLY_ACCEPTED',
      'ACCEPTED',
      'REJECTED',
      'APPLIED',
      'ROLLED_BACK',
      'EXPIRED'
    )
  ),
  constraint planning_scenario_documents_ck check (
    jsonb_typeof(selected_appointment_refs) = 'array'
    and jsonb_typeof(constraints_document) = 'object'
    and jsonb_typeof(baseline_document) = 'object'
    and jsonb_typeof(proposal_document) = 'object'
    and jsonb_typeof(explanation_document) = 'object'
  ),
  constraint planning_scenario_provider_ck
    check (provider in ('GOOGLE', 'INTERNAL_HEURISTIC', 'NONE')),
  constraint planning_scenario_metrics_ck check (
    (current_travel_seconds is null or current_travel_seconds >= 0)
    and (proposed_travel_seconds is null or proposed_travel_seconds >= 0)
    and (current_empty_meters is null or current_empty_meters >= 0)
    and (proposed_empty_meters is null or proposed_empty_meters >= 0)
  ),
  constraint planning_scenario_no_auto_apply_ck check (
    status not in ('APPLIED', 'ROLLED_BACK')
    or (reviewed_by is not null and review_reason is not null)
  )
);

create index if not exists idx_planning_scenarios_tenant_status
  on public.planning_optimization_scenarios
  (tenant_id, scenario_type, status, created_at desc);

create table if not exists public.planning_scenario_mutations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  scenario_id uuid not null
    references public.planning_optimization_scenarios(id) on delete cascade,
  sequence_number integer not null,
  appointment_type text not null,
  appointment_id uuid not null,
  mutation_type text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  accepted boolean,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  constraint planning_mutation_type_ck check (
    mutation_type in (
      'RESCHEDULE',
      'REASSIGN_INSTRUCTOR',
      'REASSIGN_VEHICLE',
      'CHANGE_LOCATION',
      'INSERT_WAITLIST',
      'NO_CHANGE'
    )
  ),
  constraint planning_mutation_documents_ck check (
    jsonb_typeof(before_snapshot) = 'object'
    and jsonb_typeof(after_snapshot) = 'object'
  ),
  unique (scenario_id, sequence_number)
);

create table if not exists public.work_area_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid,
  version_number integer not null,
  status text not null default 'DRAFT',
  label text not null,
  postcode_prefixes text[] not null default '{}',
  city_names text[] not null default '{}',
  geometry_document jsonb,
  capacity_units numeric(12,2),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint work_area_branch_fkey
    foreign key (branch_id, tenant_id)
    references public.branches (id, tenant_id)
    on delete cascade,
  constraint work_area_status_ck
    check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')),
  constraint work_area_geometry_ck check (
    geometry_document is null or jsonb_typeof(geometry_document) = 'object'
  ),
  constraint work_area_capacity_ck
    check (capacity_units is null or capacity_units >= 0),
  constraint work_area_validity_ck
    check (valid_until is null or valid_from is null or valid_until > valid_from),
  unique (tenant_id, branch_id, version_number)
);

create unique index if not exists uq_work_area_published
  on public.work_area_versions (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'PUBLISHED' and valid_until is null;

create table if not exists public.empty_mile_daily_rollups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usage_date date not null,
  branch_id uuid,
  method text not null,
  appointment_count integer not null,
  covered_appointment_count integer not null,
  empty_distance_meters bigint not null,
  empty_duration_seconds bigint not null,
  potential_saving_meters bigint,
  generated_at timestamptz not null default now(),
  constraint empty_mile_method_ck check (
    method in ('GOOGLE_ROUTE', 'CACHE', 'RAYON_MATRIX', 'HAVERSINE', 'MIXED')
  ),
  constraint empty_mile_counts_ck check (
    appointment_count >= 0
    and covered_appointment_count between 0 and appointment_count
    and empty_distance_meters >= 0
    and empty_duration_seconds >= 0
    and (potential_saving_meters is null or potential_saving_meters >= 0)
  )
);

create unique index if not exists uq_empty_mile_rollup_scope
  on public.empty_mile_daily_rollups (
    tenant_id,
    usage_date,
    method,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create table if not exists public.postcode_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  geography_level text not null,
  geography_code text not null,
  subject_count integer not null,
  appointment_count integer not null,
  metrics_document jsonb not null,
  privacy_threshold integer not null,
  suppression_status text not null,
  generated_at timestamptz not null default now(),
  constraint postcode_analytics_period_ck check (period_end >= period_start),
  constraint postcode_analytics_level_ck
    check (geography_level in ('POSTCODE4', 'CITY', 'REGION')),
  constraint postcode_analytics_count_ck check (
    subject_count >= 0 and appointment_count >= 0 and privacy_threshold >= 3
  ),
  constraint postcode_analytics_document_ck
    check (jsonb_typeof(metrics_document) = 'object'),
  constraint postcode_analytics_suppression_ck
    check (suppression_status in ('VISIBLE', 'SUPPRESSED', 'MERGED')),
  constraint postcode_analytics_privacy_ck check (
    (subject_count >= privacy_threshold and suppression_status = 'VISIBLE')
    or (subject_count < privacy_threshold and suppression_status <> 'VISIBLE')
  ),
  unique (tenant_id, period_start, period_end, geography_level, geography_code)
);

create table if not exists public.location_migration_cohorts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  cohort_type text not null,
  status text not null default 'PREVIEW',
  preview_document jsonb not null,
  parity_document jsonb not null default '{}'::jsonb,
  rollback_document jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint location_cohort_type_ck check (
    cohort_type in ('NEW_DUAL_WRITE', 'TEST_TENANT', 'PILOT', 'REMAINING')
  ),
  constraint location_cohort_status_ck check (
    status in (
      'PREVIEW',
      'APPROVED',
      'RUNNING',
      'PARITY_REVIEW',
      'COMPLETED',
      'ROLLED_BACK',
      'FAILED'
    )
  ),
  constraint location_cohort_documents_ck check (
    jsonb_typeof(preview_document) = 'object'
    and jsonb_typeof(parity_document) = 'object'
    and jsonb_typeof(rollback_document) = 'object'
  )
);

create or replace function public._planning_scenario_no_silent_apply()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'APPLIED' and old.status <> 'APPLIED' then
    if old.status not in ('ACCEPTED', 'PARTIALLY_ACCEPTED')
       or new.reviewed_by is null
       or nullif(btrim(coalesce(new.review_reason, '')), '') is null
       or new.applied_by is null
       or new.applied_at is null then
      raise exception 'optimization requires explicit human review before apply';
    end if;
  end if;
  if new.status = 'ROLLED_BACK' and old.status <> 'ROLLED_BACK' then
    if old.status <> 'APPLIED'
       or new.rolled_back_by is null
       or new.rolled_back_at is null then
      raise exception 'only an applied scenario can be rolled back';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists planning_scenario_human_gate
  on public.planning_optimization_scenarios;
create trigger planning_scenario_human_gate
  before update on public.planning_optimization_scenarios
  for each row execute function public._planning_scenario_no_silent_apply();

create or replace function public._immutable_route_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'route decisions are immutable';
end;
$$;

drop trigger if exists route_calculation_decisions_immutable
  on public.route_calculation_decisions;
create trigger route_calculation_decisions_immutable
  before update or delete on public.route_calculation_decisions
  for each row execute function public._immutable_route_decision();

alter table public.route_calculation_decisions enable row level security;
alter table public.route_conflict_policies enable row level security;
alter table public.route_conflict_overrides enable row level security;
alter table public.planning_optimization_scenarios enable row level security;
alter table public.planning_scenario_mutations enable row level security;
alter table public.work_area_versions enable row level security;
alter table public.empty_mile_daily_rollups enable row level security;
alter table public.postcode_analytics_snapshots enable row level security;
alter table public.location_migration_cohorts enable row level security;

create policy route_decisions_tenant_staff
  on public.route_calculation_decisions for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy route_conflict_policies_tenant_staff
  on public.route_conflict_policies for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy route_overrides_tenant_staff
  on public.route_conflict_overrides for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy planning_scenarios_tenant_staff
  on public.planning_optimization_scenarios for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy planning_mutations_tenant_staff
  on public.planning_scenario_mutations for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy work_area_versions_tenant_staff
  on public.work_area_versions for select using (
    public.is_platform_admin()
    or tenant_id in (select public.my_tenant_ids())
  );
create policy empty_mile_rollups_tenant_manager
  on public.empty_mile_daily_rollups for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
       where membership.tenant_id = empty_mile_daily_rollups.tenant_id
         and membership.user_id = auth.uid()
         and membership.role = 'tenant_admin'
    )
  );
create policy postcode_analytics_tenant_manager
  on public.postcode_analytics_snapshots for select using (
    public.is_platform_admin()
    or (
      suppression_status = 'VISIBLE'
      and exists (
        select 1 from public.memberships membership
         where membership.tenant_id = postcode_analytics_snapshots.tenant_id
           and membership.user_id = auth.uid()
           and membership.role = 'tenant_admin'
      )
    )
  );
create policy location_cohorts_platform_only
  on public.location_migration_cohorts for select using (
    public.is_platform_admin()
  );

revoke insert, update, delete on public.route_calculation_decisions from anon, authenticated;
revoke insert, update, delete on public.route_conflict_policies from anon, authenticated;
revoke insert, update, delete on public.route_conflict_overrides from anon, authenticated;
revoke insert, update, delete on public.planning_optimization_scenarios from anon, authenticated;
revoke insert, update, delete on public.planning_scenario_mutations from anon, authenticated;
revoke insert, update, delete on public.work_area_versions from anon, authenticated;
revoke insert, update, delete on public.empty_mile_daily_rollups from anon, authenticated;
revoke insert, update, delete on public.postcode_analytics_snapshots from anon, authenticated;
revoke insert, update, delete on public.location_migration_cohorts from anon, authenticated;

grant select on public.route_calculation_decisions to authenticated, service_role;
grant select on public.route_conflict_policies to authenticated, service_role;
grant select on public.route_conflict_overrides to authenticated, service_role;
grant select on public.planning_optimization_scenarios to authenticated, service_role;
grant select on public.planning_scenario_mutations to authenticated, service_role;
grant select on public.work_area_versions to authenticated, service_role;
grant select on public.empty_mile_daily_rollups to authenticated, service_role;
grant select on public.postcode_analytics_snapshots to authenticated, service_role;
grant select on public.location_migration_cohorts to authenticated, service_role;
grant all on public.route_calculation_decisions to service_role;
grant all on public.route_conflict_policies to service_role;
grant all on public.route_conflict_overrides to service_role;
grant all on public.planning_optimization_scenarios to service_role;
grant all on public.planning_scenario_mutations to service_role;
grant all on public.work_area_versions to service_role;
grant all on public.empty_mile_daily_rollups to service_role;
grant all on public.postcode_analytics_snapshots to service_role;
grant all on public.location_migration_cohorts to service_role;

comment on table public.planning_optimization_scenarios is
  'Advisory scenario with explicit human review, diff, partial acceptance and rollback; never auto-publishes appointments.';
comment on table public.postcode_analytics_snapshots is
  'Pre-aggregated privacy-thresholded geography metrics without exact addresses or coordinates.';
