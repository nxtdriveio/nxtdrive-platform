-- Atomic server-side entitlement, circuit-breaker and limit gate.
-- The caller supplies only requested units; all scopes and period windows are
-- resolved from trusted database policy.

create or replace function public.evaluate_maps_feature_gate(
  p_tenant_id uuid,
  p_feature_code text,
  p_environment text,
  p_requested_units numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement_status text;
  v_limit public.maps_tenant_limits%rowtype;
  v_period_start timestamptz;
  v_used numeric;
  v_mode text;
begin
  if p_requested_units is null
     or p_requested_units <= 0
     or p_requested_units > 1000000 then
    raise exception 'invalid requested maps units';
  end if;
  if p_environment not in ('LOCAL', 'STAGING', 'PRODUCTION') then
    raise exception 'invalid maps environment';
  end if;

  select entitlement.status
    into v_entitlement_status
    from public.maps_tenant_entitlements entitlement
   where entitlement.tenant_id = p_tenant_id
     and entitlement.feature_code = p_feature_code
     and entitlement.effective_from <= now()
     and (entitlement.effective_until is null or entitlement.effective_until > now())
   order by entitlement.effective_from desc
   limit 1;

  if coalesce(v_entitlement_status, 'DISABLED') not in ('ENABLED', 'PILOT') then
    return jsonb_build_object(
      'featureCode', p_feature_code,
      'state', coalesce(v_entitlement_status, 'DISABLED'),
      'mode', case
        when p_feature_code in ('ADDRESS_AUTOCOMPLETE', 'PLACE_DETAILS', 'ADDRESS_VALIDATION', 'GEOCODING') then 'MANUAL'
        when p_feature_code in ('MAP_LOAD', 'WORK_AREA_MAP', 'POSTCODE_ANALYTICS', 'EMPTY_MILE_ANALYSIS') then 'LIST_ONLY'
        else 'HAVERSINE'
      end,
      'reason', 'FEATURE_DISABLED',
      'remainingUnits', 0
    );
  end if;

  if exists (
    select 1
      from public.maps_circuit_breakers breaker
     where breaker.provider = 'GOOGLE'
       and breaker.state = 'OPEN'
       and (breaker.tenant_id is null or breaker.tenant_id = p_tenant_id)
       and (breaker.feature_code is null or breaker.feature_code = p_feature_code)
       and (breaker.retry_after is null or breaker.retry_after > now())
  ) then
    return jsonb_build_object(
      'featureCode', p_feature_code,
      'state', 'DEGRADED',
      'mode', case
        when p_feature_code like 'ADDRESS%' or p_feature_code in ('PLACE_DETAILS', 'GEOCODING') then 'MANUAL'
        when p_feature_code in ('MAP_LOAD', 'WORK_AREA_MAP', 'POSTCODE_ANALYTICS', 'EMPTY_MILE_ANALYSIS') then 'LIST_ONLY'
        else 'HAVERSINE'
      end,
      'reason', 'CIRCUIT_OPEN',
      'remainingUnits', 0
    );
  end if;

  for v_limit in
    select limit_row.*
      from public.maps_tenant_limits limit_row
     where limit_row.enabled
       and limit_row.effective_from <= now()
       and (limit_row.effective_until is null or limit_row.effective_until > now())
       and (limit_row.tenant_id is null or limit_row.tenant_id = p_tenant_id)
       and (limit_row.feature_code is null or limit_row.feature_code = p_feature_code)
       and (limit_row.environment is null or limit_row.environment = p_environment)
       and limit_row.scope_type in ('TENANT', 'FEATURE', 'ENVIRONMENT', 'GLOBAL')
     order by
       case when limit_row.tenant_id = p_tenant_id then 0 else 1 end,
       limit_row.hard_limit asc
  loop
    v_period_start := case v_limit.period_type
      when 'HOUR' then date_trunc('hour', now())
      when 'DAY' then date_trunc('day', now())
      else date_trunc('month', now())
    end;

    select coalesce(sum(event.units), 0)
      into v_used
      from public.maps_usage_events event
     where event.occurred_at >= v_period_start
       and event.environment = p_environment
       and (v_limit.tenant_id is null or event.tenant_id = p_tenant_id)
       and (v_limit.feature_code is null or event.feature_code = p_feature_code)
       and (v_limit.sku_code is null or event.sku_code = v_limit.sku_code);

    if v_used + p_requested_units >= v_limit.hard_limit then
      v_mode := case v_limit.degradation_action
        when 'MANUAL_INPUT' then 'MANUAL'
        when 'LIST_ONLY' then 'LIST_ONLY'
        when 'NON_TRAFFIC_ROUTE' then 'NON_TRAFFIC'
        when 'CACHE_ONLY' then 'CACHE'
        when 'RAYON_OR_HAVERSINE' then 'HAVERSINE'
        when 'LOCAL_HEURISTIC' then 'LOCAL_HEURISTIC'
        when 'LAST_COMPLETE_PERIOD' then 'CACHE'
        else 'UNAVAILABLE'
      end;
      return jsonb_build_object(
        'featureCode', p_feature_code,
        'state', 'LIMIT_REACHED',
        'mode', v_mode,
        'reason', 'HARD_LIMIT_REACHED',
        'remainingUnits', greatest(0, floor(v_limit.hard_limit - v_used))
      );
    end if;
  end loop;

  return jsonb_build_object(
    'featureCode', p_feature_code,
    'state', v_entitlement_status,
    'mode', 'PROVIDER',
    'reason', 'ENTITLED',
    'remainingUnits', null
  );
end;
$$;

revoke all on function public.evaluate_maps_feature_gate(
  uuid, text, text, numeric
) from public, anon, authenticated;
grant execute on function public.evaluate_maps_feature_gate(
  uuid, text, text, numeric
) to service_role;

comment on function public.evaluate_maps_feature_gate(
  uuid, text, text, numeric
) is
  'PII-free atomic Maps entitlement/limit/circuit gate; service role only.';
