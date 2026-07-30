import "server-only";
import type {
  ComputeMatrixInput,
  ComputeRouteInput,
  OptimizationResult,
  OptimizationStop,
  RoutingProvider,
} from "../../application/contracts";
import type {
  Coordinates,
  RouteLeg,
  RouteMatrixResult,
} from "../../domain/types";
import {
  durationSeconds,
  googleJson,
  serverCredential,
  type SafeFetch,
} from "./http";

type GoogleMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  distanceMeters?: number;
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND";
  status?: { code?: number; message?: string };
  fallbackInfo?: unknown;
};

export class GoogleRoutingProvider implements RoutingProvider {
  readonly #routesApiKey: () => string;
  readonly #fetcher: SafeFetch;
  readonly #clock: () => Date;
  readonly #optimization?: {
    projectId: string;
    accessToken: () => Promise<string>;
    fleetEnabled: boolean;
  };

  constructor(input?: {
    routesApiKey?: () => string;
    fetcher?: SafeFetch;
    clock?: () => Date;
    optimization?: {
      projectId: string;
      accessToken: () => Promise<string>;
      fleetEnabled: boolean;
    };
  }) {
    this.#routesApiKey =
      input?.routesApiKey ?? (() => serverCredential("GOOGLE_ROUTES_API_KEY"));
    this.#fetcher = input?.fetcher ?? fetch;
    this.#clock = input?.clock ?? (() => new Date());
    this.#optimization = input?.optimization;
  }

  async computeRoute(input: ComputeRouteInput): Promise<RouteMatrixResult> {
    return this.computeMatrix({
      ...input,
      origins: [input.origin],
      destinations: [input.destination],
    });
  }

  async computeMatrix(input: ComputeMatrixInput): Promise<RouteMatrixResult> {
    const elements = input.origins.length * input.destinations.length;
    if (elements < 1 || elements > 100) {
      throw new Error("Google-routematrix moet 1 tot 100 elementen bevatten.");
    }
    const body = await googleJson<GoogleMatrixElement[]>(
      {
        url: "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
        apiKey: this.#routesApiKey(),
        fieldMask:
          "originIndex,destinationIndex,duration,distanceMeters,condition,status,fallbackInfo",
        body: {
          origins: input.origins.map(waypoint),
          destinations: input.destinations.map(waypoint),
          travelMode: "DRIVE",
          routingPreference: input.trafficAware
            ? "TRAFFIC_AWARE_OPTIMAL"
            : "TRAFFIC_UNAWARE",
          ...(input.departureTime
            ? { departureTime: input.departureTime }
            : {}),
        },
      },
      this.#fetcher,
    );
    if (!Array.isArray(body)) {
      throw new Error("Google-routematrix gaf geen elementlijst.");
    }
    const now = this.#clock().toISOString();
    const legs = body
      .map((element): RouteLeg | null => {
        const originIndex = element.originIndex ?? 0;
        const destinationIndex = element.destinationIndex ?? 0;
        if (
          originIndex < 0 ||
          originIndex >= input.origins.length ||
          destinationIndex < 0 ||
          destinationIndex >= input.destinations.length
        ) {
          return null;
        }
        const noRoute =
          element.condition === "ROUTE_NOT_FOUND" ||
          (element.status?.code ?? 0) !== 0;
        if (noRoute) {
          return Object.freeze({
            originIndex,
            destinationIndex,
            status: "NO_ROUTE",
            durationSeconds: null,
            distanceMeters: null,
            method: input.trafficAware ? "GOOGLE_TRAFFIC" : "GOOGLE_ROUTE",
            confidence: "HIGH",
            asOf: now,
            stale: false,
            explanationCodes: Object.freeze(["ROUTE_NOT_FOUND"]),
          });
        }
        const duration = durationSeconds(element.duration);
        if (
          duration === null ||
          !Number.isFinite(element.distanceMeters) ||
          (element.distanceMeters ?? -1) < 0
        ) {
          return null;
        }
        return Object.freeze({
          originIndex,
          destinationIndex,
          status: element.fallbackInfo ? "FALLBACK" : "SUCCESS",
          durationSeconds: duration,
          distanceMeters: element.distanceMeters!,
          method: input.trafficAware ? "GOOGLE_TRAFFIC" : "GOOGLE_ROUTE",
          confidence: element.fallbackInfo ? "MEDIUM" : "HIGH",
          asOf: now,
          stale: false,
          explanationCodes: Object.freeze(
            element.fallbackInfo ? ["GOOGLE_FALLBACK_INFO"] : [],
          ),
        });
      })
      .filter((leg): leg is RouteLeg => leg !== null);
    return Object.freeze({
      origins: input.origins.length,
      destinations: input.destinations.length,
      elements,
      legs: Object.freeze(legs),
      provider: "GOOGLE",
      status: legs.length === elements ? "SUCCESS" : "PARTIAL",
      correlationId: input.correlationId,
    });
  }

  async optimizeSingleVehicle(input: {
    tenantId: string;
    start: Coordinates;
    end: Coordinates;
    stops: readonly OptimizationStop[];
    correlationId: string;
  }): Promise<OptimizationResult> {
    return this.#optimize(input, false);
  }

  async optimizeFleet(input: {
    tenantId: string;
    vehicles: number;
    stops: readonly OptimizationStop[];
    correlationId: string;
  }): Promise<OptimizationResult> {
    if (!this.#optimization?.fleetEnabled) {
      throw new Error("Multi-instructeuroptimalisatie staat niet aan.");
    }
    if (!Number.isSafeInteger(input.vehicles) || input.vehicles < 1) {
      throw new Error("Optimalisatie vereist minimaal één voertuig.");
    }
    const origin = input.stops[0]?.coordinates;
    if (!origin) throw new Error("Optimalisatie vereist geselecteerde stops.");
    return this.#optimize(
      { ...input, start: origin, end: origin },
      true,
      input.vehicles,
    );
  }

  async #optimize(
    input: {
      tenantId: string;
      start: Coordinates;
      end: Coordinates;
      stops: readonly OptimizationStop[];
      correlationId: string;
    },
    fleet: boolean,
    vehicles = 1,
  ): Promise<OptimizationResult> {
    if (!this.#optimization) {
      throw new Error("Route Optimization is niet geconfigureerd.");
    }
    if (input.stops.some((stop) => stop.published || !stop.flexible)) {
      throw new Error(
        "Alleen geselecteerde flexibele, ongepubliceerde stops zijn toegestaan.",
      );
    }
    if (input.stops.length > 50 || vehicles > 10) {
      throw new Error(
        "Optimalisatieprobleem overschrijdt de veilige pilotlimiet.",
      );
    }
    const accessToken = await this.#optimization.accessToken();
    const response = await googleJson<{
      routes?: Array<{
        visits?: Array<{ shipmentIndex?: number }>;
        metrics?: { travelDuration?: string; travelDistanceMeters?: number };
      }>;
      skippedShipments?: unknown[];
    }>(
      {
        url: `https://routeoptimization.googleapis.com/v1/projects/${encodeURIComponent(this.#optimization.projectId)}:optimizeTours`,
        accessToken,
        body: {
          timeout: "10s",
          considerRoadTraffic: true,
          populatePolylines: false,
          model: {
            globalStartTime: minimumWindow(input.stops),
            globalEndTime: maximumWindow(input.stops),
            shipments: input.stops.map((stop, index) => ({
              label: String(index),
              deliveries: [
                {
                  arrivalLocation: latLng(stop.coordinates),
                  duration: `${stop.durationSeconds}s`,
                  timeWindows: [
                    {
                      startTime: stop.windowStart,
                      endTime: stop.windowEnd,
                    },
                  ],
                },
              ],
            })),
            vehicles: Array.from({ length: vehicles }, (_, index) => ({
              label: String(index),
              startLocation: latLng(input.start),
              endLocation: latLng(input.end),
            })),
          },
        },
        timeoutMs: 12_000,
      },
      this.#fetcher,
    );
    const orderedIndexes =
      response.routes?.flatMap(
        (route) =>
          route.visits
            ?.map((visit) => visit.shipmentIndex)
            .filter((index): index is number => Number.isInteger(index)) ?? [],
      ) ?? [];
    const proposedTravelSeconds =
      response.routes?.reduce(
        (sum, route) =>
          sum + (durationSeconds(route.metrics?.travelDuration) ?? 0),
        0,
      ) ?? null;
    const proposedEmptyMeters =
      response.routes?.reduce(
        (sum, route) => sum + (route.metrics?.travelDistanceMeters ?? 0),
        0,
      ) ?? null;
    return Object.freeze({
      status:
        orderedIndexes.length === input.stops.length &&
        !response.skippedShipments?.length
          ? "SUCCESS"
          : "PARTIAL",
      provider: "GOOGLE",
      orderedAppointmentIds: Object.freeze(
        orderedIndexes
          .map((index) => input.stops[index]?.appointmentId)
          .filter((id): id is string => Boolean(id)),
      ),
      currentTravelSeconds: null,
      proposedTravelSeconds,
      currentEmptyMeters: null,
      proposedEmptyMeters,
      explanations: Object.freeze([
        fleet
          ? "Multi-instructeurscenario achter featureflag."
          : "Eén-voertuigscenario.",
        "Google-voorstel; planner beoordeelt de diff en publiceert expliciet.",
      ]),
      automaticallyPublished: false,
    });
  }
}

function waypoint(coordinates: Coordinates) {
  return { waypoint: { location: { latLng: latLng(coordinates) } } };
}

function latLng(coordinates: Coordinates) {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
}

function minimumWindow(stops: readonly OptimizationStop[]) {
  return stops.reduce(
    (minimum, stop) =>
      !minimum || stop.windowStart < minimum ? stop.windowStart : minimum,
    "",
  );
}

function maximumWindow(stops: readonly OptimizationStop[]) {
  return stops.reduce(
    (maximum, stop) =>
      !maximum || stop.windowEnd > maximum ? stop.windowEnd : maximum,
    "",
  );
}
