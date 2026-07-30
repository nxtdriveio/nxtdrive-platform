import type {
  ComputeMatrixInput,
  ComputeRouteInput,
  MapsFeatureGate,
  MapsMeter,
  RouteCache,
  RoutingProvider,
} from "./contracts";
import type {
  Coordinates,
  MapsUsageEventInput,
  RouteLeg,
  RouteMatrixResult,
} from "../domain/types";

export type RouteGatewayPolicy = Readonly<{
  maxElementsPerAction: number;
  maxProviderElements: number;
  maxTrafficAwareElements: number;
  fallbackSpeedKmh: number;
  detourFactor: number;
  cacheTtlMs: number;
}>;

export const DEFAULT_ROUTE_GATEWAY_POLICY: RouteGatewayPolicy = Object.freeze({
  maxElementsPerAction: 100,
  maxProviderElements: 100,
  maxTrafficAwareElements: 25,
  fallbackSpeedKmh: 38,
  detourFactor: 1.3,
  cacheTtlMs: 10 * 60 * 1000,
});

export function matrixElementCount(
  origins: readonly unknown[],
  destinations: readonly unknown[],
): number {
  const elements = origins.length * destinations.length;
  if (!Number.isSafeInteger(elements)) {
    throw new Error("Matrixomvang is niet veilig berekenbaar.");
  }
  return elements;
}

export class RouteGateway {
  readonly #provider: RoutingProvider;
  readonly #meter: MapsMeter;
  readonly #gate: MapsFeatureGate;
  readonly #cache: RouteCache;
  readonly #policy: RouteGatewayPolicy;
  readonly #environment: MapsUsageEventInput["environment"];
  readonly #clock: () => Date;

  constructor(input: {
    provider: RoutingProvider;
    meter: MapsMeter;
    gate: MapsFeatureGate;
    cache: RouteCache;
    policy?: RouteGatewayPolicy;
    environment: MapsUsageEventInput["environment"];
    clock?: () => Date;
  }) {
    this.#provider = input.provider;
    this.#meter = input.meter;
    this.#gate = input.gate;
    this.#cache = input.cache;
    this.#policy = input.policy ?? DEFAULT_ROUTE_GATEWAY_POLICY;
    this.#environment = input.environment;
    this.#clock = input.clock ?? (() => new Date());
  }

  async computeRoute(input: ComputeRouteInput): Promise<RouteMatrixResult> {
    return this.computeMatrix({
      ...input,
      origins: [input.origin],
      destinations: [input.destination],
    });
  }

  async computeMatrix(input: ComputeMatrixInput): Promise<RouteMatrixResult> {
    assertCoordinates(input.origins);
    assertCoordinates(input.destinations);
    const elements = matrixElementCount(input.origins, input.destinations);
    if (elements === 0) {
      return result(input, [], "INTERNAL", "BLOCKED");
    }
    if (elements > this.#policy.maxElementsPerAction) {
      await this.#record(input, {
        provider: "INTERNAL",
        units: elements,
        resultStatus: "BLOCKED",
        cacheStatus: "NOT_APPLICABLE",
        latencyMs: 0,
        fallbackMethod: null,
      });
      throw new Error(
        `Routematrix bevat ${elements} elementen; maximaal ${this.#policy.maxElementsPerAction} per actie.`,
      );
    }

    const startedAt = Date.now();
    const cacheKey = stableMatrixKey(input);
    const cached = await this.#cache.get(
      input.tenantId,
      input.featureCode,
      cacheKey,
    );
    if (cached) {
      await this.#record(input, {
        provider: "INTERNAL",
        units: elements,
        resultStatus: "SUCCESS",
        cacheStatus: "HIT",
        latencyMs: Date.now() - startedAt,
        fallbackMethod: "CACHE",
      });
      return withCacheMethod(cached, this.#clock().toISOString());
    }

    const availability = await this.#gate.evaluate({
      tenantId: input.tenantId,
      featureCode: input.featureCode,
      requestedUnits: elements,
      environment: this.#environment,
    });
    const providerMaximum = input.trafficAware
      ? this.#policy.maxTrafficAwareElements
      : this.#policy.maxProviderElements;
    const mayUseProvider =
      availability.mode === "PROVIDER" && elements <= providerMaximum;

    if (mayUseProvider) {
      try {
        const providerResult = await this.#provider.computeMatrix(input);
        const validated = validateProviderMatrix(providerResult, input);
        if (validated.status === "SUCCESS") {
          await this.#cache.set(
            input.tenantId,
            input.featureCode,
            cacheKey,
            validated,
            this.#policy.cacheTtlMs,
          );
          await this.#record(input, {
            provider: "GOOGLE",
            units: elements,
            resultStatus: "SUCCESS",
            cacheStatus: "MISS",
            latencyMs: Date.now() - startedAt,
            fallbackMethod: null,
          });
          return validated;
        }

        const completed = completePartialWithFallback(
          validated,
          input,
          this.#policy,
          this.#clock(),
        );
        await this.#record(input, {
          provider: "GOOGLE",
          units: elements,
          resultStatus: "PARTIAL",
          cacheStatus: "MISS",
          latencyMs: Date.now() - startedAt,
          fallbackMethod: "HAVERSINE",
        });
        return completed;
      } catch {
        // Provider errors are deliberately converted to an explicit fallback.
      }
    }

    const fallback = fallbackMatrix(
      input,
      this.#policy,
      this.#clock().toISOString(),
      mayUseProvider
        ? "PROVIDER_UNAVAILABLE"
        : availability.mode === "PROVIDER"
          ? "PROVIDER_MATRIX_LIMIT"
          : `DEGRADED_${availability.mode}`,
    );
    await this.#record(input, {
      provider: "INTERNAL",
      units: elements,
      resultStatus: "FALLBACK",
      cacheStatus: "MISS",
      latencyMs: Date.now() - startedAt,
      fallbackMethod: "HAVERSINE",
    });
    return fallback;
  }

  async #record(
    input: ComputeMatrixInput,
    event: Readonly<{
      provider: "GOOGLE" | "INTERNAL";
      units: number;
      resultStatus: MapsUsageEventInput["resultStatus"];
      cacheStatus: MapsUsageEventInput["cacheStatus"];
      latencyMs: number;
      fallbackMethod: string | null;
    }>,
  ) {
    await this.#meter.record({
      tenantId: input.tenantId,
      environment: this.#environment,
      featureCode: input.featureCode,
      surface: input.surface,
      provider: event.provider,
      skuCode:
        event.provider === "GOOGLE"
          ? input.trafficAware
            ? "ROUTE_MATRIX_PRO"
            : "ROUTE_MATRIX_ESSENTIALS"
          : null,
      unitType: "MATRIX_ELEMENT",
      units: event.units,
      cacheStatus: event.cacheStatus,
      resultStatus: event.resultStatus,
      correlationId: input.correlationId,
      latencyMs: event.latencyMs,
      fallbackMethod: event.fallbackMethod,
    });
  }
}

export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * radius * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function fallbackLeg(
  origin: Coordinates,
  destination: Coordinates,
  originIndex: number,
  destinationIndex: number,
  policy: RouteGatewayPolicy,
  asOf: string,
  explanationCode = "HAVERSINE_FALLBACK",
): RouteLeg {
  const straightLineMeters = haversineMeters(origin, destination);
  const roadMeters = Math.round(straightLineMeters * policy.detourFactor);
  const durationSeconds = Math.round(
    (roadMeters / 1000 / policy.fallbackSpeedKmh) * 3600,
  );
  return Object.freeze({
    originIndex,
    destinationIndex,
    status: "FALLBACK",
    durationSeconds,
    distanceMeters: roadMeters,
    method: "HAVERSINE",
    confidence: "LOW",
    asOf,
    stale: false,
    explanationCodes: Object.freeze([explanationCode]),
  });
}

function fallbackMatrix(
  input: ComputeMatrixInput,
  policy: RouteGatewayPolicy,
  asOf: string,
  explanationCode: string,
): RouteMatrixResult {
  const legs = input.origins.flatMap((origin, originIndex) =>
    input.destinations.map((destination, destinationIndex) =>
      fallbackLeg(
        origin,
        destination,
        originIndex,
        destinationIndex,
        policy,
        asOf,
        explanationCode,
      ),
    ),
  );
  return result(input, legs, "INTERNAL", "FALLBACK");
}

function validateProviderMatrix(
  providerResult: RouteMatrixResult,
  input: ComputeMatrixInput,
): RouteMatrixResult {
  const elements = matrixElementCount(input.origins, input.destinations);
  const validKeys = new Set<string>();
  const validLegs: RouteLeg[] = [];
  for (const leg of providerResult.legs) {
    if (
      !Number.isInteger(leg.originIndex) ||
      !Number.isInteger(leg.destinationIndex) ||
      leg.originIndex < 0 ||
      leg.originIndex >= input.origins.length ||
      leg.destinationIndex < 0 ||
      leg.destinationIndex >= input.destinations.length
    ) {
      continue;
    }
    const key = `${leg.originIndex}:${leg.destinationIndex}`;
    if (validKeys.has(key)) continue;
    validKeys.add(key);
    const noRoute = leg.status === "NO_ROUTE";
    const durationValid =
      (noRoute &&
        leg.durationSeconds === null &&
        leg.distanceMeters === null) ||
      (!noRoute &&
        leg.durationSeconds !== null &&
        Number.isFinite(leg.durationSeconds) &&
        leg.durationSeconds >= 0);
    const distanceValid =
      (noRoute && leg.distanceMeters === null) ||
      (!noRoute &&
        leg.distanceMeters !== null &&
        Number.isFinite(leg.distanceMeters) &&
        leg.distanceMeters >= 0);
    if (!durationValid || !distanceValid) continue;
    validLegs.push(Object.freeze({ ...leg }));
  }
  const complete = validLegs.length === elements;
  return Object.freeze({
    ...providerResult,
    origins: input.origins.length,
    destinations: input.destinations.length,
    elements,
    legs: Object.freeze(validLegs),
    status: complete ? "SUCCESS" : "PARTIAL",
    correlationId: input.correlationId,
  });
}

function completePartialWithFallback(
  partial: RouteMatrixResult,
  input: ComputeMatrixInput,
  policy: RouteGatewayPolicy,
  now: Date,
): RouteMatrixResult {
  const byKey = new Map(
    partial.legs.map((leg) => [
      `${leg.originIndex}:${leg.destinationIndex}`,
      leg,
    ]),
  );
  const legs = input.origins.flatMap((origin, originIndex) =>
    input.destinations.map((destination, destinationIndex) => {
      const existing = byKey.get(`${originIndex}:${destinationIndex}`);
      return (
        existing ??
        fallbackLeg(
          origin,
          destination,
          originIndex,
          destinationIndex,
          policy,
          now.toISOString(),
          "PARTIAL_MATRIX_FALLBACK",
        )
      );
    }),
  );
  return result(input, legs, "GOOGLE", "PARTIAL");
}

function result(
  input: ComputeMatrixInput,
  legs: readonly RouteLeg[],
  provider: RouteMatrixResult["provider"],
  status: RouteMatrixResult["status"],
): RouteMatrixResult {
  return Object.freeze({
    origins: input.origins.length,
    destinations: input.destinations.length,
    elements: matrixElementCount(input.origins, input.destinations),
    legs: Object.freeze([...legs]),
    provider,
    status,
    correlationId: input.correlationId,
  });
}

function withCacheMethod(
  cached: RouteMatrixResult,
  now: string,
): RouteMatrixResult {
  return Object.freeze({
    ...cached,
    provider: "INTERNAL",
    legs: Object.freeze(
      cached.legs.map((leg) =>
        Object.freeze({
          ...leg,
          method: "CACHE" as const,
          stale: Date.parse(leg.asOf) < Date.parse(now) - 10 * 60 * 1000,
          explanationCodes: Object.freeze([
            ...leg.explanationCodes,
            "CACHE_HIT",
          ]),
        }),
      ),
    ),
  });
}

function assertCoordinates(points: readonly Coordinates[]): void {
  for (const point of points) {
    if (
      !Number.isFinite(point.latitude) ||
      point.latitude < -90 ||
      point.latitude > 90 ||
      !Number.isFinite(point.longitude) ||
      point.longitude < -180 ||
      point.longitude > 180
    ) {
      throw new Error("Ongeldige coördinaten in routeaanvraag.");
    }
  }
}

function stableMatrixKey(input: ComputeMatrixInput): string {
  const point = (coordinate: Coordinates) =>
    `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`;
  return [
    input.trafficAware ? "traffic" : "normal",
    input.departureTime?.slice(0, 16) ?? "now",
    input.origins.map(point).join("|"),
    input.destinations.map(point).join("|"),
  ].join(">");
}
