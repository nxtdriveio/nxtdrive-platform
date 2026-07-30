-- Tenant-scoped Maps usage, cost modelling, limits and degradation.
-- Usage rows deliberately contain no address, query, place id, coordinates,
-- polyline, person identifier or provider session token.

create table if not exists public.maps_cost_price_versions (
  id uuid primary key default gen_random_uuid(),
  currency text not null default 'USD',
  effective_from timestamptz not null,
  effective_until timestamptz,
  source_reference text not null,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint maps_cost_price_currency_ck check (currency = 'USD'),
  constraint maps_cost_price_period_ck
    check (effective_until is null or effective_until > effective_from),
  constraint maps_cost_price_status_ck
    check (status in ('DRAFT', 'PUBLISHED', 'RETIRED')),
  constraint maps_cost_price_publication_ck check (
    status <> 'PUBLISHED'
    or (published_at is not null and published_by is not null)
  )
);

create unique index if not exists uq_maps_cost_price_active_from
  on public.maps_cost_price_versions (effective_from)
  where status = 'PUBLISHED';

create table if not exists public.maps_sku_prices (
  id uuid primary key default gen_random_uuid(),
  pricing_version_id uuid not null
    references public.maps_cost_price_versions(id) on delete cascade,
  sku_code text not null,
  unit_type text not null,
  unit_price_micros bigint not null,
  tier_start_units numeric(18,4) not null default 0,
  tier_end_units numeric(18,4),
  created_at timestamptz not null default now(),
  constraint maps_sku_price_unit_type_ck check (
    unit_type in (
      'REQUEST',
      'SESSION',
      'MAP_LOAD',
      'MATRIX_ELEMENT',
      'SHIPMENT',
      'VEHICLE',
      'DESTINATION',
      'PRODUCT_ACTION'
    )
  ),
  constraint maps_sku_price_amount_ck check (unit_price_micros >= 0),
  constraint maps_sku_price_tier_ck check (
    tier_start_units >= 0
    and (tier_end_units is null or tier_end_units > tier_start_units)
  ),
  unique (pricing_version_id, sku_code, unit_type, tier_start_units)
);

create table if not exists public.maps_usage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  environment text not null,
  feature_code text not null,
  surface text not null,
  provider text not null,
  sku_code text,
  unit_type text not null,
  units numeric(18,4) not null,
  cache_status text not null default 'NOT_APPLICABLE',
  result_status text not null,
  pricing_version_id uuid
    references public.maps_cost_price_versions(id) on delete set null,
  estimated_gross_cost_micros bigint,
  correlation_id text not null,
  latency_ms integer,
  fallback_method text,
  created_at timestamptz not null default now(),
  constraint maps_usage_environment_ck
    check (environment in ('LOCAL', 'STAGING', 'PRODUCTION')),
  constraint maps_usage_feature_ck check (
    feature_code in (
      'ADDRESS_AUTOCOMPLETE',
      'PLACE_DETAILS',
      'ADDRESS_VALIDATION',
      'GEOCODING',
      'MAP_LOAD',
      'EXTERNAL_NAVIGATION',
      'ROUTE_CALCULATION',
      'ROUTE_MATRIX',
      'ROUTE_CONFLICT_CHECK',
      'INSTRUCTOR_RECOMMENDATION',
      'VEHICLE_LOCATION_RECOMMENDATION',
      'SINGLE_VEHICLE_OPTIMIZATION',
      'FLEET_OPTIMIZATION',
      'CANCELLATION_OPTIMIZATION',
      'WORK_AREA_MAP',
      'POSTCODE_ANALYTICS',
      'EMPTY_MILE_ANALYSIS',
      'EXAM_DEPARTURE_ADVICE'
    )
  ),
  constraint maps_usage_surface_ck check (
    surface in (
      'INTAKE',
      'STUDENT_PROFILE',
      'STUDENT_APP',
      'INSTRUCTOR_APP',
      'LESSON_PLANNER',
      'PLANNING_BOARD',
      'PLATFORM_ADMIN',
      'EXAM',
      'BACKGROUND_JOB'
    )
  ),
  constraint maps_usage_provider_ck
    check (provider in ('GOOGLE', 'INTERNAL')),
  constraint maps_usage_unit_type_ck check (
    unit_type in (
      'REQUEST',
      'SESSION',
      'MAP_LOAD',
      'MATRIX_ELEMENT',
      'SHIPMENT',
      'VEHICLE',
      'DESTINATION',
      'PRODUCT_ACTION'
    )
  ),
  constraint maps_usage_units_ck check (units > 0 and units <= 1000000),
  constraint maps_usage_cache_ck
    check (cache_status in ('HIT', 'MISS', 'NOT_APPLICABLE')),
  constraint maps_usage_result_ck check (
    result_status in ('SUCCESS', 'PARTIAL', 'FALLBACK', 'FAILED', 'BLOCKED')
  ),
  constraint maps_usage_cost_ck
    check (estimated_gross_cost_micros is null or estimated_gross_cost_micros >= 0),
  constraint maps_usage_correlation_ck
    check (correlation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
  constraint maps_usage_latency_ck
    check (latency_ms is null or latency_ms between 0 and 3600000)
);

create index if not exists idx_maps_usage_tenant_occurred
  on public.maps_usage_events (tenant_id, occurred_at desc);
create index if not exists idx_maps_usage_feature_occurred
  on public.maps_usage_events (tenant_id, feature_code, occurred_at desc);
create index if not exists idx_maps_usage_sku_occurred
  on public.maps_usage_events (sku_code, occurred_at desc)
  where sku_code is not null;
create index if not exists idx_maps_usage_correlation
  on public.maps_usage_events (correlation_id);

create table if not exists public.maps_usage_daily_rollups (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usage_date date not null,
  environment text not null,
  feature_code text not null,
  provider text not null,
  sku_code text not null default '',
  unit_type text not null,
  result_status text not null,
  units numeric(20,4) not null,
  estimated_gross_cost_micros bigint not null default 0,
  event_count bigint not null,
  cache_hit_count bigint not null default 0,
  fallback_count bigint not null default 0,
  error_count bigint not null default 0,
  latency_p50_ms integer,
  latency_p95_ms integer,
  latency_p99_ms integer,
  rolled_up_at timestamptz not null default now(),
  primary key (
    tenant_id,
    usage_date,
    environment,
    feature_code,
    provider,
    sku_code,
    unit_type,
    result_status
  ),
  constraint maps_usage_rollup_units_ck check (units >= 0),
  constraint maps_usage_rollup_counts_ck check (
    event_count >= 0
    and cache_hit_count >= 0
    and fallback_count >= 0
    and error_count >= 0
  )
);

create table if not exists public.maps_tenant_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_code text not null,
  status text not null default 'DISABLED',
  included_units numeric(18,4),
  allocation_method text not null default 'SUBSCRIPTION_INCLUDED',
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  configured_by uuid references auth.users(id) on delete set null,
  configuration_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maps_entitlement_status_ck check (
    status in (
      'ENABLED',
      'PILOT',
      'DISABLED',
      'DEGRADED',
      'LIMIT_REACHED',
      'SUSPENDED'
    )
  ),
  constraint maps_entitlement_allocation_ck check (
    allocation_method in (
      'GROSS',
      'PRO_RATA',
      'AFTER_SHARED_CREDITS',
      'SUBSCRIPTION_INCLUDED',
      'FAIR_USE',
      'BUNDLE_PLUS_OVERAGE'
    )
  ),
  constraint maps_entitlement_period_ck
    check (effective_until is null or effective_until > effective_from),
  constraint maps_entitlement_units_ck
    check (included_units is null or included_units >= 0)
);

create unique index if not exists uq_maps_entitlement_active
  on public.maps_tenant_entitlements (tenant_id, feature_code)
  where effective_until is null;

create table if not exists public.maps_tenant_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  feature_code text,
  sku_code text,
  environment text,
  scope_type text not null,
  period_type text not null,
  soft_limit numeric(18,4),
  hard_limit numeric(18,4) not null,
  degradation_action text not null,
  warning_thresholds integer[] not null default '{50,70,85,100}',
  enabled boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint maps_limit_target_ck check (
    feature_code is not null or sku_code is not null
  ),
  constraint maps_limit_scope_ck check (
    scope_type in ('USER', 'TENANT', 'FEATURE', 'SKU', 'ENVIRONMENT', 'GLOBAL')
  ),
  constraint maps_limit_period_ck
    check (period_type in ('HOUR', 'DAY', 'MONTH')),
  constraint maps_limit_environment_ck check (
    environment is null or environment in ('LOCAL', 'STAGING', 'PRODUCTION')
  ),
  constraint maps_limit_values_ck check (
    hard_limit > 0
    and (soft_limit is null or (soft_limit >= 0 and soft_limit <= hard_limit))
  ),
  constraint maps_limit_action_ck check (
    degradation_action in (
      'MANUAL_INPUT',
      'LIST_ONLY',
      'NON_TRAFFIC_ROUTE',
      'CACHE_ONLY',
      'RAYON_OR_HAVERSINE',
      'LOCAL_HEURISTIC',
      'LAST_COMPLETE_PERIOD',
      'DISABLE_OPTIONAL_FEATURE',
      'BLOCK'
    )
  ),
  constraint maps_limit_thresholds_ck check (
    warning_thresholds <@ array[25, 50, 60, 70, 75, 80, 85, 90, 95, 100, 110, 125]
  )
);

create index if not exists idx_maps_limits_lookup
  on public.maps_tenant_limits
  (tenant_id, feature_code, sku_code, environment, enabled);

create table if not exists public.maps_budget_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  threshold_percent integer not null,
  status text not null default 'OPEN',
  forecast_cost_micros bigint,
  budget_cost_micros bigint,
  correlation_id text not null,
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  constraint maps_budget_period_ck check (period_end >= period_start),
  constraint maps_budget_threshold_ck
    check (threshold_percent between 1 and 500),
  constraint maps_budget_status_ck
    check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  constraint maps_budget_cost_ck check (
    (forecast_cost_micros is null or forecast_cost_micros >= 0)
    and (budget_cost_micros is null or budget_cost_micros >= 0)
  )
);

create unique index if not exists uq_maps_budget_open_threshold
  on public.maps_budget_alerts
  (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), period_start, threshold_percent)
  where status in ('OPEN', 'ACKNOWLEDGED');

create table if not exists public.maps_cost_reconciliations (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  cloud_project_ref text not null,
  service_code text not null,
  sku_code text not null,
  actual_units numeric(20,4) not null,
  gross_cost_micros bigint not null,
  credits_micros bigint not null default 0,
  actual_account_cost_micros bigint not null,
  currency text not null default 'USD',
  source_type text not null,
  source_reference text not null,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  constraint maps_reconciliation_period_ck check (period_end >= period_start),
  constraint maps_reconciliation_values_ck check (
    actual_units >= 0
    and gross_cost_micros >= 0
    and credits_micros >= 0
    and actual_account_cost_micros >= 0
  ),
  constraint maps_reconciliation_currency_ck check (currency = 'USD'),
  constraint maps_reconciliation_source_ck
    check (source_type in ('BIGQUERY_BILLING_EXPORT', 'MANUAL')),
  unique (period_start, period_end, cloud_project_ref, service_code, sku_code)
);

create table if not exists public.maps_feature_degradation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  feature_code text not null,
  trigger_type text not null,
  normal_mode text not null,
  degraded_mode text not null,
  status text not null default 'ACTIVE',
  correlation_id text not null,
  opened_at timestamptz not null default now(),
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  reason text,
  constraint maps_degradation_trigger_ck check (
    trigger_type in (
      'LIMIT',
      'BUDGET',
      'QUOTA',
      'CREDENTIAL',
      'ERROR_RATE',
      'TIMEOUT_STORM',
      'MANUAL',
      'PROVIDER_DISABLED'
    )
  ),
  constraint maps_degradation_status_ck
    check (status in ('ACTIVE', 'RECOVERING', 'CLOSED'))
);

create index if not exists idx_maps_degradation_active
  on public.maps_feature_degradation_events
  (tenant_id, feature_code, opened_at desc)
  where status <> 'CLOSED';

create table if not exists public.maps_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  provider text not null default 'GOOGLE',
  api_code text not null,
  feature_code text,
  state text not null default 'CLOSED',
  failure_count integer not null default 0,
  opened_at timestamptz,
  retry_after timestamptz,
  reason_code text,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint maps_breaker_provider_ck check (provider = 'GOOGLE'),
  constraint maps_breaker_state_ck
    check (state in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  constraint maps_breaker_failure_ck check (failure_count >= 0)
);

create unique index if not exists uq_maps_circuit_breaker_scope
  on public.maps_circuit_breakers (
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    api_code,
    coalesce(feature_code, '')
  );

create table if not exists public.maps_route_cache_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_code text not null,
  cache_key_hash text not null,
  method text not null,
  duration_seconds integer,
  distance_meters integer,
  result_status text not null,
  confidence text not null,
  as_of timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint maps_cache_derived_only_ck check (
    duration_seconds is not null or distance_meters is not null
  ),
  constraint maps_cache_duration_ck check (
    duration_seconds is null or duration_seconds between 0 and 86400
  ),
  constraint maps_cache_distance_ck check (
    distance_meters is null or distance_meters between 0 and 5000000
  ),
  constraint maps_cache_status_ck
    check (result_status in ('SUCCESS', 'PARTIAL', 'NO_ROUTE', 'FALLBACK')),
  constraint maps_cache_confidence_ck
    check (confidence in ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  constraint maps_cache_expiry_ck check (expires_at > as_of),
  unique (tenant_id, feature_code, cache_key_hash)
);

create index if not exists idx_maps_cache_expiry
  on public.maps_route_cache_entries (tenant_id, feature_code, expires_at);

create table if not exists public.maps_credential_registry (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  credential_role text not null,
  secret_reference text not null,
  application_restriction text not null,
  allowed_apis text[] not null,
  owner_reference text not null,
  last_rotated_at timestamptz,
  rotate_by timestamptz,
  status text not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maps_credential_environment_ck
    check (environment in ('LOCAL', 'STAGING', 'PRODUCTION')),
  constraint maps_credential_role_ck check (
    credential_role in (
      'BROWSER',
      'ANDROID',
      'SERVER_PLACES_VALIDATION_ROUTES',
      'ROUTE_OPTIMIZATION'
    )
  ),
  constraint maps_credential_status_ck
    check (status in ('PLANNED', 'ACTIVE', 'ROTATION_DUE', 'REVOKED')),
  constraint maps_credential_no_secret_ck check (
    secret_reference !~ '(AIza|-----BEGIN|[A-Za-z0-9_=-]{32,})'
  ),
  unique (environment, credential_role)
);

create table if not exists public.maps_notification_dedup (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deduplication_key text not null,
  event_type text not null,
  first_recorded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (tenant_id, deduplication_key),
  constraint maps_notification_dedup_expiry_ck
    check (expires_at > first_recorded_at)
);

drop trigger if exists maps_entitlements_set_updated_at
  on public.maps_tenant_entitlements;
create trigger maps_entitlements_set_updated_at
  before update on public.maps_tenant_entitlements
  for each row execute function public.set_updated_at();

drop trigger if exists maps_credentials_set_updated_at
  on public.maps_credential_registry;
create trigger maps_credentials_set_updated_at
  before update on public.maps_credential_registry
  for each row execute function public.set_updated_at();

create or replace function public.record_maps_usage_event(
  p_tenant_id uuid,
  p_environment text,
  p_feature_code text,
  p_surface text,
  p_provider text,
  p_sku_code text,
  p_unit_type text,
  p_units numeric,
  p_cache_status text,
  p_result_status text,
  p_correlation_id text,
  p_latency_ms integer default null,
  p_fallback_method text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price_version_id uuid;
  v_unit_price_micros bigint;
  v_event_id uuid;
begin
  if p_units is null or p_units <= 0 or p_units > 1000000 then
    raise exception 'invalid maps usage units';
  end if;
  if p_correlation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' then
    raise exception 'invalid correlation id';
  end if;

  if p_sku_code is not null then
    select price.id, sku.unit_price_micros
      into v_price_version_id, v_unit_price_micros
      from public.maps_cost_price_versions price
      join public.maps_sku_prices sku on sku.pricing_version_id = price.id
     where price.status = 'PUBLISHED'
       and price.effective_from <= now()
       and (price.effective_until is null or price.effective_until > now())
       and sku.sku_code = p_sku_code
       and sku.unit_type = p_unit_type
       and sku.tier_start_units = 0
     order by price.effective_from desc
     limit 1;
  end if;

  insert into public.maps_usage_events (
    tenant_id, environment, feature_code, surface, provider, sku_code,
    unit_type, units, cache_status, result_status, pricing_version_id,
    estimated_gross_cost_micros, correlation_id, latency_ms, fallback_method
  ) values (
    p_tenant_id, p_environment, p_feature_code, p_surface, p_provider,
    nullif(btrim(coalesce(p_sku_code, '')), ''), p_unit_type, p_units,
    p_cache_status, p_result_status, v_price_version_id,
    case
      when v_unit_price_micros is null then null
      else ceil(p_units * v_unit_price_micros)::bigint
    end,
    p_correlation_id, p_latency_ms,
    nullif(btrim(coalesce(p_fallback_method, '')), '')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_maps_usage_event(
  uuid, text, text, text, text, text, text, numeric, text, text, text, integer, text
) from public;
revoke execute on function public.record_maps_usage_event(
  uuid, text, text, text, text, text, text, numeric, text, text, text, integer, text
) from anon, authenticated;
grant execute on function public.record_maps_usage_event(
  uuid, text, text, text, text, text, text, numeric, text, text, text, integer, text
) to service_role;

create or replace function public.rollup_maps_usage_day(p_usage_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.maps_usage_daily_rollups (
    tenant_id, usage_date, environment, feature_code, provider, sku_code,
    unit_type, result_status, units, estimated_gross_cost_micros,
    event_count, cache_hit_count, fallback_count, error_count,
    latency_p50_ms, latency_p95_ms, latency_p99_ms, rolled_up_at
  )
  select
    tenant_id,
    occurred_at::date,
    environment,
    feature_code,
    provider,
    coalesce(sku_code, ''),
    unit_type,
    result_status,
    sum(units),
    sum(coalesce(estimated_gross_cost_micros, 0)),
    count(*),
    count(*) filter (where cache_status = 'HIT'),
    count(*) filter (where result_status = 'FALLBACK'),
    count(*) filter (where result_status in ('FAILED', 'BLOCKED')),
    percentile_disc(0.50) within group (order by latency_ms)
      filter (where latency_ms is not null),
    percentile_disc(0.95) within group (order by latency_ms)
      filter (where latency_ms is not null),
    percentile_disc(0.99) within group (order by latency_ms)
      filter (where latency_ms is not null),
    now()
  from public.maps_usage_events
  where occurred_at >= p_usage_date::timestamptz
    and occurred_at < (p_usage_date + 1)::timestamptz
  group by
    tenant_id, occurred_at::date, environment, feature_code, provider,
    coalesce(sku_code, ''), unit_type, result_status
  on conflict (
    tenant_id, usage_date, environment, feature_code, provider, sku_code,
    unit_type, result_status
  ) do update
    set units = excluded.units,
        estimated_gross_cost_micros = excluded.estimated_gross_cost_micros,
        event_count = excluded.event_count,
        cache_hit_count = excluded.cache_hit_count,
        fallback_count = excluded.fallback_count,
        error_count = excluded.error_count,
        latency_p50_ms = excluded.latency_p50_ms,
        latency_p95_ms = excluded.latency_p95_ms,
        latency_p99_ms = excluded.latency_p99_ms,
        rolled_up_at = now();
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.rollup_maps_usage_day(date) from public;
grant execute on function public.rollup_maps_usage_day(date) to service_role;

alter table public.maps_cost_price_versions enable row level security;
alter table public.maps_sku_prices enable row level security;
alter table public.maps_usage_events enable row level security;
alter table public.maps_usage_daily_rollups enable row level security;
alter table public.maps_tenant_entitlements enable row level security;
alter table public.maps_tenant_limits enable row level security;
alter table public.maps_budget_alerts enable row level security;
alter table public.maps_cost_reconciliations enable row level security;
alter table public.maps_feature_degradation_events enable row level security;
alter table public.maps_circuit_breakers enable row level security;
alter table public.maps_route_cache_entries enable row level security;
alter table public.maps_credential_registry enable row level security;
alter table public.maps_notification_dedup enable row level security;

create policy maps_usage_platform_or_tenant_admin
  on public.maps_usage_events for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
       where membership.tenant_id = maps_usage_events.tenant_id
         and membership.user_id = auth.uid()
         and membership.role = 'tenant_admin'
    )
  );
create policy maps_rollup_platform_or_tenant_admin
  on public.maps_usage_daily_rollups for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
       where membership.tenant_id = maps_usage_daily_rollups.tenant_id
         and membership.user_id = auth.uid()
         and membership.role = 'tenant_admin'
    )
  );
create policy maps_entitlements_platform_or_tenant_admin
  on public.maps_tenant_entitlements for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships membership
       where membership.tenant_id = maps_tenant_entitlements.tenant_id
         and membership.user_id = auth.uid()
         and membership.role = 'tenant_admin'
    )
  );
create policy maps_limits_platform_or_tenant_admin
  on public.maps_tenant_limits for select using (
    public.is_platform_admin()
    or (
      tenant_id is not null
      and exists (
        select 1 from public.memberships membership
         where membership.tenant_id = maps_tenant_limits.tenant_id
           and membership.user_id = auth.uid()
           and membership.role = 'tenant_admin'
      )
    )
  );
create policy maps_degradation_platform_or_tenant_admin
  on public.maps_feature_degradation_events for select using (
    public.is_platform_admin()
    or (
      tenant_id is not null
      and exists (
        select 1 from public.memberships membership
         where membership.tenant_id = maps_feature_degradation_events.tenant_id
           and membership.user_id = auth.uid()
           and membership.role = 'tenant_admin'
      )
    )
  );
create policy maps_budget_alerts_platform_only
  on public.maps_budget_alerts for select using (public.is_platform_admin());
create policy maps_cost_price_platform_only
  on public.maps_cost_price_versions for select using (public.is_platform_admin());
create policy maps_sku_price_platform_only
  on public.maps_sku_prices for select using (public.is_platform_admin());
create policy maps_reconciliation_platform_only
  on public.maps_cost_reconciliations for select using (public.is_platform_admin());
create policy maps_breaker_platform_only
  on public.maps_circuit_breakers for select using (public.is_platform_admin());
create policy maps_credentials_platform_only
  on public.maps_credential_registry for select using (public.is_platform_admin());

revoke all on public.maps_route_cache_entries from anon, authenticated;
revoke all on public.maps_notification_dedup from anon, authenticated;
revoke insert, update, delete on public.maps_usage_events from anon, authenticated;
revoke insert, update, delete on public.maps_usage_daily_rollups from anon, authenticated;
revoke insert, update, delete on public.maps_tenant_entitlements from anon, authenticated;
revoke insert, update, delete on public.maps_tenant_limits from anon, authenticated;
revoke insert, update, delete on public.maps_budget_alerts from anon, authenticated;
revoke insert, update, delete on public.maps_cost_price_versions from anon, authenticated;
revoke insert, update, delete on public.maps_sku_prices from anon, authenticated;
revoke insert, update, delete on public.maps_cost_reconciliations from anon, authenticated;
revoke insert, update, delete on public.maps_feature_degradation_events from anon, authenticated;
revoke insert, update, delete on public.maps_circuit_breakers from anon, authenticated;
revoke all on public.maps_credential_registry from anon, authenticated;

grant select on public.maps_usage_events to authenticated, service_role;
grant select on public.maps_usage_daily_rollups to authenticated, service_role;
grant select on public.maps_tenant_entitlements to authenticated, service_role;
grant select on public.maps_tenant_limits to authenticated, service_role;
grant select on public.maps_feature_degradation_events to authenticated, service_role;
grant select on public.maps_budget_alerts to authenticated, service_role;
grant select on public.maps_cost_price_versions to authenticated, service_role;
grant select on public.maps_sku_prices to authenticated, service_role;
grant select on public.maps_cost_reconciliations to authenticated, service_role;
grant select on public.maps_circuit_breakers to authenticated, service_role;
grant all on public.maps_usage_events to service_role;
grant all on public.maps_usage_daily_rollups to service_role;
grant all on public.maps_tenant_entitlements to service_role;
grant all on public.maps_tenant_limits to service_role;
grant all on public.maps_budget_alerts to service_role;
grant all on public.maps_cost_price_versions to service_role;
grant all on public.maps_sku_prices to service_role;
grant all on public.maps_cost_reconciliations to service_role;
grant all on public.maps_feature_degradation_events to service_role;
grant all on public.maps_circuit_breakers to service_role;
grant all on public.maps_route_cache_entries to service_role;
grant all on public.maps_credential_registry to service_role;
grant all on public.maps_notification_dedup to service_role;

comment on table public.maps_usage_events is
  'PII-free tenant usage ledger. Matrix elements and optimization dimensions are billable units, not one HTTP request.';
comment on table public.maps_cost_reconciliations is
  'Actual account cost imported from billing export or manual evidence; never inferred from tenant estimates.';
