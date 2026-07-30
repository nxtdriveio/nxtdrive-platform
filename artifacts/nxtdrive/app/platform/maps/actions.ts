"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

const FEATURES = new Set([
  "ADDRESS_AUTOCOMPLETE",
  "PLACE_DETAILS",
  "ADDRESS_VALIDATION",
  "GEOCODING",
  "MAP_LOAD",
  "ROUTE_CALCULATION",
  "ROUTE_MATRIX",
  "ROUTE_CONFLICT_CHECK",
  "INSTRUCTOR_RECOMMENDATION",
  "VEHICLE_LOCATION_RECOMMENDATION",
  "SINGLE_VEHICLE_OPTIMIZATION",
  "FLEET_OPTIMIZATION",
  "CANCELLATION_OPTIMIZATION",
  "WORK_AREA_MAP",
  "POSTCODE_ANALYTICS",
  "EMPTY_MILE_ANALYSIS",
  "EXAM_DEPARTURE_ADVICE",
]);

export async function saveMapsEntitlement(formData: FormData) {
  const user = await requirePlatformAdmin();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const featureCode = String(formData.get("feature_code") ?? "");
  const status = String(formData.get("status") ?? "");
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    !FEATURES.has(featureCode) ||
    !["ENABLED", "PILOT", "DISABLED", "SUSPENDED"].includes(status)
  ) {
    return;
  }
  const service = createServiceRoleClient();
  const { data: existing } = await service
    .from("maps_tenant_entitlements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("feature_code", featureCode)
    .is("effective_until", null)
    .maybeSingle();
  const values = {
    tenant_id: tenantId,
    feature_code: featureCode,
    status,
    configured_by: user.id,
    configuration_reason: "Platform Control Center",
  };
  if (existing) {
    await service
      .from("maps_tenant_entitlements")
      .update(values)
      .eq("id", existing.id);
  } else {
    await service.from("maps_tenant_entitlements").insert(values);
  }
  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenantId,
    action: "maps.entitlement_changed",
    target_type: "maps_feature",
    target_id: featureCode,
    payload: { status },
  });
  revalidatePath(`/platform/maps/tenants/${tenantId}`);
  revalidatePath("/platform/maps");
}

export async function saveMapsLimit(formData: FormData) {
  const user = await requirePlatformAdmin();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const featureCode = String(formData.get("feature_code") ?? "");
  const hardLimit = Number(formData.get("hard_limit"));
  const softLimit = Number(formData.get("soft_limit"));
  const degradationAction = String(
    formData.get("degradation_action") ?? "RAYON_OR_HAVERSINE",
  );
  if (
    !/^[0-9a-f-]{36}$/i.test(tenantId) ||
    !FEATURES.has(featureCode) ||
    !Number.isSafeInteger(hardLimit) ||
    hardLimit < 1 ||
    !Number.isSafeInteger(softLimit) ||
    softLimit < 0 ||
    softLimit > hardLimit
  ) {
    return;
  }
  const service = createServiceRoleClient();
  await service.from("maps_tenant_limits").insert({
    tenant_id: tenantId,
    feature_code: featureCode,
    environment: "PRODUCTION",
    scope_type: "FEATURE",
    period_type: "MONTH",
    soft_limit: softLimit,
    hard_limit: hardLimit,
    warning_thresholds: [50, 70, 85, 100],
    degradation_action: degradationAction,
    enabled: true,
    created_by: user.id,
  });
  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenantId,
    action: "maps.limit_created",
    target_type: "maps_feature",
    target_id: featureCode,
    payload: {
      period_type: "MONTH",
      soft_limit: softLimit,
      hard_limit: hardLimit,
      degradation_action: degradationAction,
    },
  });
  revalidatePath(`/platform/maps/tenants/${tenantId}`);
}

export async function closeMapsCircuitBreaker(formData: FormData) {
  const user = await requirePlatformAdmin();
  const breakerId = String(formData.get("breaker_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(breakerId)) return;
  const service = createServiceRoleClient();
  await service
    .from("maps_circuit_breakers")
    .update({
      state: "HALF_OPEN",
      failure_count: 0,
      retry_after: new Date(Date.now() + 5 * 60_000).toISOString(),
      updated_by: user.id,
    })
    .eq("id", breakerId);
  revalidatePath("/platform/maps");
}
