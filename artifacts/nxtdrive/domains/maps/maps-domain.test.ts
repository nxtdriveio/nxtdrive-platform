import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePostcodeAnalytics,
  assertSafeAnalyticsDimensions,
  summarizeEmptyMiles,
} from "./application/analytics";
import { AutocompleteSession } from "./application/autocomplete-session";
import type {
  MapsFeatureGate,
  MapsMeter,
  RoutingProvider,
} from "./application/contracts";
import {
  allocateCost,
  calculateTieredGrossCost,
  evaluateLimit,
} from "./application/limits-and-costs";
import {
  buildExternalNavigationUrl,
  departureAdvice,
} from "./application/navigation";
import {
  notificationDeduplicationKey,
  safeLocationNotification,
} from "./application/notifications";
import {
  acceptScenarioMutations,
  optimizeSingleInstructorLocally,
} from "./application/optimization";
import { evaluateTravelConflict } from "./application/planning-conflicts";
import {
  recommendResources,
  shortlistInstructorCandidates,
} from "./application/recommendations";
import {
  DEFAULT_ROUTE_GATEWAY_POLICY,
  RouteGateway,
  fallbackLeg,
  haversineMeters,
  matrixElementCount,
} from "./application/route-gateway";
import {
  coordinates,
  locationDeduplicationKey,
  normalizeDutchPostalCode,
  snapshotLocation,
  validateLocationVersionDraft,
} from "./domain/location";
import type {
  Coordinates,
  FeatureAvailability,
  LocationVersion,
  MapsUsageEventInput,
  RouteMatrixResult,
} from "./domain/types";
import { MemoryRouteCache } from "./infrastructure/cache/memory-route-cache";

const ROTTERDAM: Coordinates = Object.freeze({
  latitude: 51.9244,
  longitude: 4.4777,
});
const DEN_HAAG: Coordinates = Object.freeze({
  latitude: 52.0705,
  longitude: 4.3007,
});

test("coordinates accepts a complete pair", () => {
  assert.deepEqual(coordinates(52, 4), { latitude: 52, longitude: 4 });
});

test("coordinates rejects a half coordinate pair", () => {
  assert.throws(() => coordinates(52, null), /samen/);
});

test("coordinates rejects values outside the earth bounds", () => {
  assert.throws(() => coordinates(91, 4), /latitude/);
  assert.throws(() => coordinates(52, 181), /longitude/);
});

test("Dutch postcodes are canonicalized without losing the suffix", () => {
  assert.equal(normalizeDutchPostalCode(" 2583ab "), "2583 AB");
});

test("location provenance requires a provider for a provider reference", () => {
  assert.throws(
    () =>
      validateLocationVersionDraft({
        tenantId: "tenant",
        locationRecordId: "location",
        versionNumber: 1,
        label: "Thuis",
        formattedAddress: "Voorbeeldstraat 1",
        source: "USER_ENTERED",
        provider: null,
        providerPlaceId: "secret-reference",
      }),
    /provenance/,
  );
});

test("manual confirmation requires an auditable reason", () => {
  assert.throws(
    () =>
      validateLocationVersionDraft({
        tenantId: "tenant",
        locationRecordId: "location",
        versionNumber: 1,
        label: "Thuis",
        formattedAddress: "Voorbeeldstraat 1",
        source: "USER_CONFIRMED",
        validationStatus: "MANUALLY_CONFIRMED",
      }),
    /reden/,
  );
});

test("location deduplication prefers an opaque provider reference", () => {
  assert.equal(
    locationDeduplicationKey({
      formattedAddress: "ignored",
      postalCode: null,
      providerPlaceId: "place-1",
    }),
    "google:place-1",
  );
});

test("location snapshots are immutable and tenant-scoped", () => {
  const version: LocationVersion = {
    id: "version",
    tenantId: "tenant",
    locationRecordId: "location",
    versionNumber: 1,
    label: "Thuis",
    formattedAddress: "Voorbeeldstraat 1",
    street: "Voorbeeldstraat",
    houseNumber: "1",
    houseNumberAddition: null,
    postalCode: "2583 AB",
    city: "Den Haag",
    region: null,
    countryCode: "NL",
    coordinates: DEN_HAAG,
    source: "USER_CONFIRMED",
    provider: null,
    providerPlaceId: null,
    validationStatus: "MANUALLY_CONFIRMED",
    providerObtainedAt: null,
    providerExpiresAt: null,
    userConfirmedAt: "2026-01-01T00:00:00.000Z",
    confirmedBy: "student",
    changeReason: "Door leerling gecontroleerd",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "student",
  };
  const snapshot = snapshotLocation(version, {
    id: "stop",
    tenantId: "tenant",
    appointmentType: "LESSON",
    appointmentId: "lesson",
    stopType: "PICKUP",
    sequenceNumber: 1,
    publicationStatus: "PUBLISHED",
    publishedAt: "2026-01-02T00:00:00.000Z",
    supersededAt: null,
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.coordinatesSnapshot!));
  assert.throws(() => {
    (snapshot as { labelSnapshot: string }).labelSnapshot = "gewijzigd";
  }, /read only|Cannot assign/);
});

test("cross-tenant snapshots are rejected", () => {
  const version = {
    tenantId: "tenant-a",
  } as LocationVersion;
  assert.throws(
    () =>
      snapshotLocation(version, {
        id: "stop",
        tenantId: "tenant-b",
        appointmentType: "LESSON",
        appointmentId: "lesson",
        stopType: "PICKUP",
        sequenceNumber: 1,
        publicationStatus: "DRAFT",
        publishedAt: null,
        supersededAt: null,
      }),
    /Cross-tenant/,
  );
});

test("autocomplete waits until the minimum input length", () => {
  const session = new AutocompleteSession({ tokenFactory: () => "token" });
  assert.deepEqual(session.evaluate("ab", 0), {
    action: "SKIP",
    reason: "TOO_SHORT",
  });
});

test("autocomplete reuses one token during a billable session", () => {
  const session = new AutocompleteSession({
    debounceMs: 0,
    tokenFactory: () => "token",
  });
  const first = session.evaluate("Den", 0);
  const second = session.evaluate("Den Haag", 500);
  assert.equal(first.action, "REQUEST");
  assert.equal(second.action, "REQUEST");
  if (first.action === "REQUEST" && second.action === "REQUEST") {
    assert.equal(first.session.token, second.session.token);
    assert.equal(second.session.requests, 2);
  }
});

test("resolved autocomplete starts a new provider session", () => {
  let count = 0;
  const session = new AutocompleteSession({
    debounceMs: 0,
    tokenFactory: () => `token-${++count}`,
  });
  session.evaluate("Den", 0);
  session.resolve(100);
  const result = session.evaluate("Rotterdam", 200);
  assert.equal(result.action, "REQUEST");
  if (result.action === "REQUEST")
    assert.equal(result.session.token, "token-2");
});

test("matrix element count is origins times destinations", () => {
  assert.equal(matrixElementCount([1, 2, 3], [1, 2, 3, 4]), 12);
});

test("haversine returns a plausible non-zero distance", () => {
  assert.ok(haversineMeters(ROTTERDAM, DEN_HAAG) > 15_000);
});

test("fallback leg labels method confidence and timestamp", () => {
  const leg = fallbackLeg(
    ROTTERDAM,
    DEN_HAAG,
    0,
    0,
    DEFAULT_ROUTE_GATEWAY_POLICY,
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(leg.method, "HAVERSINE");
  assert.equal(leg.confidence, "LOW");
  assert.ok((leg.durationSeconds ?? 0) > 0);
});

test("route gateway blocks matrix explosions before provider use", async () => {
  const harness = gatewayHarness();
  await assert.rejects(
    harness.gateway.computeMatrix(
      matrixInput(Array(11).fill(ROTTERDAM), Array(10).fill(DEN_HAAG)),
    ),
    /maximaal 100/,
  );
  assert.equal(harness.providerCalls.length, 0);
  assert.equal(harness.events[0]?.resultStatus, "BLOCKED");
});

test("route gateway meters matrix elements instead of HTTP calls", async () => {
  const harness = gatewayHarness();
  await harness.gateway.computeMatrix(
    matrixInput([ROTTERDAM, DEN_HAAG], [ROTTERDAM, DEN_HAAG]),
  );
  assert.equal(harness.events[0]?.units, 4);
  assert.equal(harness.events[0]?.unitType, "MATRIX_ELEMENT");
});

test("route gateway falls back when provider access is disabled", async () => {
  const harness = gatewayHarness({ mode: "HAVERSINE" });
  const result = await harness.gateway.computeMatrix(
    matrixInput([ROTTERDAM], [DEN_HAAG]),
  );
  assert.equal(result.status, "FALLBACK");
  assert.equal(result.legs[0]?.method, "HAVERSINE");
});

test("route gateway fills a partial provider matrix without claiming exactness", async () => {
  const harness = gatewayHarness({
    providerResult: routeResult([providerLeg(0, 0)], "PARTIAL"),
  });
  const result = await harness.gateway.computeMatrix(
    matrixInput([ROTTERDAM], [DEN_HAAG, ROTTERDAM]),
  );
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.legs.length, 2);
  assert.equal(result.legs[1]?.method, "HAVERSINE");
});

test("route cache never crosses tenant boundaries", async () => {
  const cache = new MemoryRouteCache();
  const value = routeResult([providerLeg(0, 0)]);
  await cache.set("tenant-a", "ROUTE_MATRIX", "key", value, 60_000);
  assert.equal(await cache.get("tenant-b", "ROUTE_MATRIX", "key"), null);
});

test("route cache expires and returns a defensive copy", async () => {
  let now = 0;
  const cache = new MemoryRouteCache(() => now);
  const value = routeResult([providerLeg(0, 0)]);
  await cache.set("tenant", "ROUTE_MATRIX", "key", value, 10);
  assert.notEqual(await cache.get("tenant", "ROUTE_MATRIX", "key"), value);
  now = 11;
  assert.equal(await cache.get("tenant", "ROUTE_MATRIX", "key"), null);
});

test("conflict control distinguishes infeasible from tight", () => {
  const infeasible = evaluateTravelConflict({
    previousEndsAt: "2026-01-01T10:00:00.000Z",
    nextStartsAt: "2026-01-01T10:10:00.000Z",
    route: providerLeg(0, 0, 900),
    policy: conflictPolicy(),
  });
  assert.equal(infeasible.status, "INFEASIBLE");
  assert.equal(infeasible.action, "BLOCK");
  assert.ok(infeasible.overrideAllowed);
});

test("unknown route applies the explicit tenant policy", () => {
  const decision = evaluateTravelConflict({
    previousEndsAt: "2026-01-01T10:00:00.000Z",
    nextStartsAt: "2026-01-01T10:10:00.000Z",
    route: null,
    policy: conflictPolicy(),
  });
  assert.equal(decision.status, "UNKNOWN");
  assert.equal(decision.action, "WARN");
});

test("feature limits retain a safe degraded planning mode", () => {
  const result = evaluateLimit({
    featureCode: "ROUTE_MATRIX",
    requestedUnits: 10,
    usage: { usedUnits: 95, limitUnits: 100, forecastUnits: 120 },
    policy: {
      warningPercent: 70,
      degradationPercent: 85,
      hardPercent: 100,
      degradedMode: "HAVERSINE",
    },
    featureEnabled: true,
  });
  assert.equal(result.state, "LIMIT_REACHED");
  assert.equal(result.mode, "HAVERSINE");
});

test("feature forecast can degrade before the hard limit", () => {
  const result = evaluateLimit({
    featureCode: "ADDRESS_AUTOCOMPLETE",
    requestedUnits: 1,
    usage: { usedUnits: 10, limitUnits: 100, forecastUnits: 101 },
    policy: {
      warningPercent: 70,
      degradationPercent: 85,
      hardPercent: 100,
      degradedMode: "MANUAL",
    },
    featureEnabled: true,
  });
  assert.equal(result.state, "DEGRADED");
  assert.equal(result.reason, "FORECAST_LIMIT_EXCEEDED");
});

test("tiered cost calculation crosses pricing tiers correctly", () => {
  assert.equal(
    calculateTieredGrossCost(150, [
      { upToUnits: 100, unitPriceMicros: 20 },
      { upToUnits: null, unitPriceMicros: 10 },
    ]),
    2_500,
  );
});

test("allocated costs never masquerade as an account invoice", () => {
  const result = allocateCost({
    grossMicros: 10_000,
    method: "PRO_RATA",
    tenantShare: 0.25,
  });
  assert.equal(result.allocatedMicros, 2_500);
  assert.equal(result.actualAccountMicros, null);
  assert.equal(result.isEstimate, true);
});

test("local optimization refuses published appointments", () => {
  assert.throws(
    () =>
      optimizeSingleInstructorLocally({
        start: ROTTERDAM,
        end: ROTTERDAM,
        stops: [optimizationStop("lesson", true)],
      }),
    /ongepubliceerde/,
  );
});

test("local optimization produces a human-gated scenario and diff", () => {
  const scenario = optimizeSingleInstructorLocally({
    start: ROTTERDAM,
    end: ROTTERDAM,
    stops: [
      { ...optimizationStop("far", false), coordinates: DEN_HAAG },
      {
        ...optimizationStop("near", false),
        coordinates: { latitude: 51.93, longitude: 4.48 },
      },
    ],
  });
  assert.equal(scenario.proposedOrder[0], "near");
  assert.equal(scenario.automaticallyPublished, false);
  assert.equal(scenario.requiresHumanApproval, true);
  const accepted = acceptScenarioMutations(scenario, [
    scenario.mutations[0]!.appointmentId,
  ]);
  assert.equal(accepted.status, "ACCEPTED");
});

test("postcode analytics suppresses groups below both privacy thresholds", () => {
  const result = aggregatePostcodeAnalytics(
    [
      {
        postcode4: "2583",
        people: 2,
        appointments: 10,
        leads: 1,
        travelSeconds: 600,
      },
      {
        postcode4: "3011",
        people: 12,
        appointments: 3,
        leads: 1,
        travelSeconds: 600,
      },
    ],
    {
      minimumPeople: 5,
      minimumAppointments: 5,
      maximumGeographicPrecision: "POSTCODE4",
    },
  );
  assert.equal(result.visible.length, 0);
  assert.equal(result.suppressedCells, 2);
});

test("analytics rejects dimensions that enable employee ranking", () => {
  assert.throws(
    () => assertSafeAnalyticsDimensions(["branch_id", "instructor_id"]),
    /Onveilige/,
  );
});

test("empty-mile summary states coverage and that it is not GPS data", () => {
  const result = summarizeEmptyMiles({
    legs: [
      {
        distanceMeters: 10_000,
        durationSeconds: 900,
        method: "GOOGLE_ROUTE",
        confidence: "HIGH",
      },
    ],
    appointmentCount: 2,
    expectedLegCount: 2,
  });
  assert.equal(result.plannedEmptyKilometers, 10);
  assert.equal(result.coveragePercent, 50);
  assert.match(result.disclaimer, /geen GPS/);
});

test("instructor recommendations filter hard constraints and explain ordering", () => {
  const recommendations = shortlistInstructorCandidates([
    instructorCandidate("blocked", { existingHardConflict: true }),
    instructorCandidate("continuity", {
      continuity: true,
      extraTravelSeconds: 600,
    }),
    instructorCandidate("near", { extraTravelSeconds: 60 }),
  ]);
  assert.deepEqual(
    recommendations.map((item) => item.instructorId),
    ["continuity", "near"],
  );
  assert.ok(recommendations[0]!.explanation.length >= 3);
});

test("vehicle recommendations reject maintenance and capability blockers", () => {
  const result = recommendResources([
    {
      id: "broken",
      label: "A",
      available: true,
      capabilityMatch: true,
      maintenanceBlocked: true,
      branchMatch: true,
      extraTravelSeconds: 0,
    },
    {
      id: "valid",
      label: "B",
      available: true,
      capabilityMatch: true,
      maintenanceBlocked: false,
      branchMatch: true,
      extraTravelSeconds: 120,
    },
  ]);
  assert.deepEqual(
    result.map((item) => item.id),
    ["valid"],
  );
});

test("Google external navigation prefers place id and encodes all data", () => {
  const url = buildExternalNavigationUrl({
    provider: "GOOGLE_MAPS",
    placeId: "place id",
    coordinates: DEN_HAAG,
    formattedAddress: "ignored",
  });
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "www.google.com");
  assert.equal(parsed.searchParams.get("destination_place_id"), "place id");
});

test("departure advice visibly falls back to configured time", () => {
  const result = departureAdvice({
    startsAt: "2026-01-01T10:00:00.000Z",
    travelSeconds: null,
    arrivalBufferSeconds: 600,
    now: "2026-01-01T09:00:00.000Z",
    fallbackMinutes: 20,
  });
  assert.equal(result.method, "CONFIGURED_BUFFER");
  assert.equal(result.departureAt, "2026-01-01T09:30:00.000Z");
});

test("notification keys are stable per publication version", () => {
  const input = {
    tenantId: "tenant",
    eventType: "PICKUP_CHANGED",
    aggregateType: "LESSON",
    aggregateId: "lesson",
    publicationVersion: 1,
  };
  assert.equal(
    notificationDeduplicationKey(input),
    notificationDeduplicationKey(input),
  );
  assert.notEqual(
    notificationDeduplicationKey(input),
    notificationDeduplicationKey({ ...input, publicationVersion: 2 }),
  );
});

test("location notifications never expose an address and wait for publication", () => {
  assert.equal(
    safeLocationNotification({ eventType: "PICKUP_CHANGED", published: false }),
    null,
  );
  const body = safeLocationNotification({
    eventType: "PICKUP_CHANGED",
    published: true,
    recipientFirstName: "Noa",
  });
  assert.doesNotMatch(body ?? "", /straat|postcode|2583/i);
});

function conflictPolicy() {
  return {
    bufferSeconds: 300,
    tightThresholdSeconds: 300,
    unknownAction: "WARN" as const,
    fallbackAction: "WARN" as const,
    infeasibleAction: "BLOCK" as const,
    overrideAllowed: true,
  };
}

function optimizationStop(appointmentId: string, published: boolean) {
  return {
    appointmentId,
    coordinates: ROTTERDAM,
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T12:00:00.000Z",
    durationSeconds: 3600,
    published,
    flexible: true,
  };
}

function instructorCandidate(
  id: string,
  overrides: Partial<
    Parameters<typeof shortlistInstructorCandidates>[0][number]
  > = {},
) {
  return {
    instructorId: id,
    displayName: id,
    authorized: true,
    available: true,
    withinWorkingHours: true,
    branchMatch: true,
    vehicleMatch: true,
    existingHardConflict: false,
    continuity: false,
    extraTravelSeconds: 300,
    emptyMeters: 1_000,
    bufferSeconds: 1_800,
    ...overrides,
  };
}

function matrixInput(origins = [ROTTERDAM], destinations = [DEN_HAAG]) {
  return {
    tenantId: "tenant-a",
    origins,
    destinations,
    departureTime: "2026-01-01T10:00:00.000Z",
    trafficAware: false,
    featureCode: "ROUTE_MATRIX" as const,
    correlationId: "correlation",
    surface: "PLANNING_BOARD" as const,
  };
}

function providerLeg(
  originIndex: number,
  destinationIndex: number,
  durationSeconds = 600,
) {
  return {
    originIndex,
    destinationIndex,
    status: "SUCCESS" as const,
    durationSeconds,
    distanceMeters: 5_000,
    method: "GOOGLE_ROUTE" as const,
    confidence: "HIGH" as const,
    asOf: "2026-01-01T10:00:00.000Z",
    stale: false,
    explanationCodes: [] as string[],
  };
}

function routeResult(
  legs: ReturnType<typeof providerLeg>[],
  status: RouteMatrixResult["status"] = "SUCCESS",
): RouteMatrixResult {
  return {
    origins: 1,
    destinations: legs.length,
    elements: legs.length,
    legs,
    provider: "GOOGLE",
    status,
    correlationId: "correlation",
  };
}

function gatewayHarness(
  input: {
    mode?: FeatureAvailability["mode"];
    providerResult?: RouteMatrixResult;
  } = {},
) {
  const events: MapsUsageEventInput[] = [];
  const providerCalls: unknown[] = [];
  const provider: RoutingProvider = {
    async computeRoute(request) {
      providerCalls.push(request);
      return input.providerResult ?? routeResult([providerLeg(0, 0)]);
    },
    async computeMatrix(request) {
      providerCalls.push(request);
      return (
        input.providerResult ??
        routeResult(
          request.origins.flatMap((_, originIndex) =>
            request.destinations.map((__, destinationIndex) =>
              providerLeg(originIndex, destinationIndex),
            ),
          ),
        )
      );
    },
    async optimizeSingleVehicle() {
      throw new Error("not used");
    },
    async optimizeFleet() {
      throw new Error("not used");
    },
  };
  const meter: MapsMeter = {
    async record(event) {
      events.push(event);
    },
  };
  const gate: MapsFeatureGate = {
    async evaluate(request) {
      return {
        featureCode: request.featureCode,
        state: input.mode && input.mode !== "PROVIDER" ? "DEGRADED" : "ENABLED",
        mode: input.mode ?? "PROVIDER",
        reason: "test",
        remainingUnits: 10_000,
      };
    },
  };
  return {
    gateway: new RouteGateway({
      provider,
      meter,
      gate,
      cache: new MemoryRouteCache(),
      environment: "LOCAL",
      clock: () => new Date("2026-01-01T10:00:00.000Z"),
    }),
    events,
    providerCalls,
  };
}
