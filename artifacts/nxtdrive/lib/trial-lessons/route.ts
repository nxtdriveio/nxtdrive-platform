// Compatibility adapter for the trial/refill ranking engines.
//
// All provider work is delegated to the central maps domain. This module keeps
// the historical minutes[][] return shape so existing ranking code does not
// become provider-aware. Provider errors explicitly become null, after the
// central gateway has metered the attempted matrix elements and applied its
// Haversine fallback.
import {
  RouteGateway,
  haversineMeters,
} from "@/domains/maps/application/route-gateway";
import type { MapsUsageEventInput } from "@/domains/maps/domain/types";
import { MemoryRouteCache } from "@/domains/maps/infrastructure/cache/memory-route-cache";

export type LatLng = { lat: number; lng: number };

export const FALLBACK_AVG_SPEED_KMH = 38;

const routeCache = new MemoryRouteCache();

export function haversineKm(a: LatLng, b: LatLng): number {
  return (
    haversineMeters(
      { latitude: a.lat, longitude: a.lng },
      { latitude: b.lat, longitude: b.lng },
    ) / 1000
  );
}

export function estimateMinutesFromKm(
  km: number,
  speedKmh = FALLBACK_AVG_SPEED_KMH,
): number {
  return Math.round(((km * 1.3) / speedKmh) * 60);
}

export function routesApiKey(): string | null {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export function isRoutesApiConfigured(): boolean {
  return routesApiKey() !== null;
}

export type RouteMatrixContext = Readonly<{
  tenantId: string;
  surface?: MapsUsageEventInput["surface"];
}>;

export async function computeRouteMatrix(
  origins: LatLng[],
  destinations: LatLng[],
  context?: RouteMatrixContext,
): Promise<(number | null)[][]> {
  const empty = origins.map(() => destinations.map(() => null));
  if (
    !isRoutesApiConfigured() ||
    !context?.tenantId ||
    origins.length === 0 ||
    destinations.length === 0 ||
    origins.length * destinations.length > 100
  ) {
    return empty;
  }
  try {
    const [
      { GoogleRoutingProvider },
      { SupabaseMapsMeter },
      { createServiceRoleClient },
      { RpcMapsFeatureGate },
    ] = await Promise.all([
      import("@/domains/maps/infrastructure/google/google-routing-provider"),
      import("@/domains/maps/infrastructure/metering/supabase-maps-meter"),
      import("@/lib/supabase/service"),
      import("@/domains/maps/infrastructure/metering/rpc-feature-gate"),
    ]);
    const service = createServiceRoleClient();
    const gateway = new RouteGateway({
      provider: new GoogleRoutingProvider(),
      meter: new SupabaseMapsMeter(service),
      gate: new RpcMapsFeatureGate(service),
      cache: routeCache,
      environment: mapsEnvironment(),
    });
    const result = await gateway.computeMatrix({
      tenantId: context.tenantId,
      origins: origins.map((point) => ({
        latitude: point.lat,
        longitude: point.lng,
      })),
      destinations: destinations.map((point) => ({
        latitude: point.lat,
        longitude: point.lng,
      })),
      departureTime: new Date().toISOString(),
      trafficAware: false,
      featureCode: "ROUTE_MATRIX",
      correlationId: `route.${crypto.randomUUID()}`,
      surface: context.surface ?? "LESSON_PLANNER",
    });
    const matrix = origins.map(() =>
      destinations.map(() => null as number | null),
    );
    for (const leg of result.legs) {
      if (
        leg.durationSeconds !== null &&
        leg.status !== "NO_ROUTE" &&
        matrix[leg.originIndex]?.[leg.destinationIndex] !== undefined
      ) {
        matrix[leg.originIndex]![leg.destinationIndex] = Math.max(
          1,
          Math.round(leg.durationSeconds / 60),
        );
      }
    }
    return matrix;
  } catch {
    return empty;
  }
}

function mapsEnvironment(): MapsUsageEventInput["environment"] {
  return process.env.VERCEL_ENV === "production"
    ? "PRODUCTION"
    : process.env.VERCEL_ENV === "preview"
      ? "STAGING"
      : "LOCAL";
}
