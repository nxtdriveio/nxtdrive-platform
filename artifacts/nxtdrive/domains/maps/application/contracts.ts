import type {
  Coordinates,
  FeatureAvailability,
  MapsFeatureCode,
  MapsUsageEventInput,
  RouteMatrixResult,
  RouteResultStatus,
} from "../domain/types";

export type AutocompleteInput = Readonly<{
  tenantId: string;
  query: string;
  sessionToken: string;
  countryCodes: readonly string[];
  locationBias?: Readonly<{
    center: Coordinates;
    radiusMeters: number;
  }> | null;
  correlationId: string;
}>;

export type AutocompleteSuggestion = Readonly<{
  providerReference: string;
  primaryText: string;
  secondaryText: string;
  types: readonly string[];
}>;

export type ResolvedPlace = Readonly<{
  formattedAddress: string;
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  countryCode: string;
  coordinates: Coordinates | null;
  provider: "GOOGLE";
  providerPlaceId: string;
  obtainedAt: string;
}>;

export type AddressValidationResult = Readonly<{
  status:
    | "VALID"
    | "PARTIAL"
    | "REVIEW_REQUIRED"
    | "INVALID"
    | "MANUALLY_CONFIRMED";
  corrected: ResolvedPlace | null;
  explanationCodes: readonly string[];
  provider: "GOOGLE" | "INTERNAL";
}>;

export type GeocodeResult = Readonly<{
  status: "MATCHED" | "AMBIGUOUS" | "NOT_FOUND" | "UNAVAILABLE";
  candidates: readonly ResolvedPlace[];
}>;

export interface LocationProvider {
  autocomplete(
    input: AutocompleteInput,
  ): Promise<readonly AutocompleteSuggestion[]>;
  resolvePlace(input: {
    tenantId: string;
    providerReference: string;
    sessionToken: string;
    correlationId: string;
  }): Promise<ResolvedPlace | null>;
  validateAddress(input: {
    tenantId: string;
    address: Omit<ResolvedPlace, "provider" | "providerPlaceId" | "obtainedAt">;
    correlationId: string;
  }): Promise<AddressValidationResult>;
  geocode(input: {
    tenantId: string;
    formattedAddress: string;
    correlationId: string;
  }): Promise<GeocodeResult>;
}

export type ComputeMatrixInput = Readonly<{
  tenantId: string;
  origins: readonly Coordinates[];
  destinations: readonly Coordinates[];
  departureTime: string | null;
  trafficAware: boolean;
  featureCode: MapsFeatureCode;
  correlationId: string;
  surface: MapsUsageEventInput["surface"];
}>;

export type ComputeRouteInput = Readonly<{
  tenantId: string;
  origin: Coordinates;
  destination: Coordinates;
  departureTime: string | null;
  trafficAware: boolean;
  featureCode: MapsFeatureCode;
  correlationId: string;
  surface: MapsUsageEventInput["surface"];
}>;

export type OptimizationStop = Readonly<{
  appointmentId: string;
  coordinates: Coordinates;
  windowStart: string;
  windowEnd: string;
  durationSeconds: number;
  published: boolean;
  flexible: boolean;
}>;

export type OptimizationResult = Readonly<{
  status: RouteResultStatus;
  provider: "GOOGLE" | "INTERNAL";
  orderedAppointmentIds: readonly string[];
  currentTravelSeconds: number | null;
  proposedTravelSeconds: number | null;
  currentEmptyMeters: number | null;
  proposedEmptyMeters: number | null;
  explanations: readonly string[];
  automaticallyPublished: false;
}>;

export interface RoutingProvider {
  computeRoute(input: ComputeRouteInput): Promise<RouteMatrixResult>;
  computeMatrix(input: ComputeMatrixInput): Promise<RouteMatrixResult>;
  optimizeSingleVehicle(input: {
    tenantId: string;
    start: Coordinates;
    end: Coordinates;
    stops: readonly OptimizationStop[];
    correlationId: string;
  }): Promise<OptimizationResult>;
  optimizeFleet(input: {
    tenantId: string;
    vehicles: number;
    stops: readonly OptimizationStop[];
    correlationId: string;
  }): Promise<OptimizationResult>;
}

export interface MapsMeter {
  record(input: MapsUsageEventInput): Promise<void>;
}

export interface MapsFeatureGate {
  evaluate(input: {
    tenantId: string;
    featureCode: MapsFeatureCode;
    requestedUnits: number;
    environment: MapsUsageEventInput["environment"];
  }): Promise<FeatureAvailability>;
}

export interface RouteCache {
  get(
    tenantId: string,
    featureCode: MapsFeatureCode,
    key: string,
  ): Promise<RouteMatrixResult | null>;
  set(
    tenantId: string,
    featureCode: MapsFeatureCode,
    key: string,
    value: RouteMatrixResult,
    ttlMs: number,
  ): Promise<void>;
  invalidateLocation(tenantId: string, locationRecordId: string): Promise<void>;
}
