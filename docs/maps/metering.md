# Tenantmetering

`maps_usage_events` is append-only producttelemetrie per tenant, omgeving, feature, surface, provider, SKU, unittype en resultaat. De RPC `record_maps_usage_event` koppelt een actieve prijsversie en berekent een bruto modelschatting.

Meetbare units:

- Autocomplete requests en afgeronde sessies;
- Place Details, Address Validation en Geocoding;
- map loads;
- route requests en matrixelementen;
- optimization shipments, vehicles en destinations;
- interne productacties en fallbacks.

`maps_usage_daily_rollups` bewaart units, eventaantal, cachehits, fallbacks, errors en p50/p95/p99. Correlation ID is de technische koppeling; locatiepayload wordt nooit opgeslagen.

`evaluate_maps_feature_gate` beoordeelt entitlement, globale/tenant circuit breaker en uur-, dag- of maandlimieten atomair vóór providergebruik.

Dagelijkse uitvoering: `rollup_maps_usage_day` voor gisteren en de lopende dag. Herhalen is idempotent door de samengestelde rollup-primary-key.
