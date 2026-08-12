export type Coordinates = Readonly<{ latitude: number; longitude: number }>;

export type LocationSource =
  | "USER_ENTERED"
  | "USER_CONFIRMED"
  | "GOOGLE_PLACES"
  | "GOOGLE_VALIDATION"
  | "CSV_IMPORT"
  | "ADMIN_CORRECTION"
  | "LEGACY_MIGRATION";

export type LocationValidationStatus =
  | "UNVALIDATED"
  | "VALID"
  | "PARTIAL"
  | "REVIEW_REQUIRED"
  | "MANUALLY_CONFIRMED"
  | "INVALID"
  | "PROVIDER_EXPIRED";

export type EntityLocationRole =
  | "STUDENT_HOME"
  | "STUDENT_PICKUP_DEFAULT"
  | "STUDENT_DROPOFF_DEFAULT"
  | "STUDENT_FAVORITE"
  | "INSTRUCTOR_DAY_START"
  | "INSTRUCTOR_DAY_END"
  | "BRANCH_ADDRESS"
  | "VEHICLE_BASE"
  | "OPERATIONAL_LOCATION";

export type LocationRecord = Readonly<{
  id: string;
  tenantId: string;
  status: "ACTIVE" | "ARCHIVED" | "MERGED";
  canonicalVersionId: string | null;
  mergedIntoLocationId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}>;

export type LocationVersion = Readonly<{
  id: string;
  tenantId: string;
  locationRecordId: string;
  versionNumber: number;
  label: string;
  formattedAddress: string;
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  countryCode: string;
  coordinates: Coordinates | null;
  source: LocationSource;
  provider: "GOOGLE" | null;
  providerPlaceId: string | null;
  validationStatus: LocationValidationStatus;
  providerObtainedAt: string | null;
  providerExpiresAt: string | null;
  userConfirmedAt: string | null;
  confirmedBy: string | null;
  changeReason: string | null;
  createdAt: string;
  createdBy: string | null;
}>;

export type AppointmentStop = Readonly<{
  id: string;
  tenantId: string;
  appointmentType:
    | "LESSON"
    | "TRIAL_LESSON"
    | "AGENDA_APPOINTMENT"
    | "EXAM"
    | "MODULE_TEST";
  appointmentId: string;
  stopType: "PICKUP" | "DROPOFF" | "DESTINATION" | "START" | "END";
  sequenceNumber: number;
  sourceLocationRecordId: string | null;
  sourceLocationVersionId: string | null;
  labelSnapshot: string;
  formattedAddressSnapshot: string;
  coordinatesSnapshot: Coordinates | null;
  publicationStatus: "DRAFT" | "PUBLISHED" | "SUPERSEDED" | "CANCELLED";
  publishedAt: string | null;
  supersededAt: string | null;
}>;

export type RouteMethod =
  | "GOOGLE_TRAFFIC"
  | "GOOGLE_ROUTE"
  | "CACHE"
  | "RAYON_MATRIX"
  | "HAVERSINE"
  | "UNKNOWN";

export type RouteConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type RouteResultStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "NO_ROUTE"
  | "FALLBACK"
  | "BLOCKED";

export type RouteLeg = Readonly<{
  originIndex: number;
  destinationIndex: number;
  status: RouteResultStatus;
  durationSeconds: number | null;
  distanceMeters: number | null;
  method: RouteMethod;
  confidence: RouteConfidence;
  asOf: string;
  stale: boolean;
  explanationCodes: readonly string[];
}>;

export type RouteMatrixResult = Readonly<{
  origins: number;
  destinations: number;
  elements: number;
  legs: readonly RouteLeg[];
  provider: "GOOGLE" | "INTERNAL";
  status: "SUCCESS" | "PARTIAL" | "FALLBACK" | "BLOCKED";
  correlationId: string;
}>;

export type TravelConflictStatus =
  | "FEASIBLE"
  | "TIGHT"
  | "INFEASIBLE"
  | "UNKNOWN"
  | "FALLBACK_ESTIMATE";

export type TravelConflictDecision = Readonly<{
  status: TravelConflictStatus;
  action: "ALLOW" | "WARN" | "BLOCK";
  availableSeconds: number;
  requiredSeconds: number | null;
  shortageSeconds: number | null;
  bufferSeconds: number;
  route: RouteLeg | null;
  explanation: readonly string[];
  overrideAllowed: boolean;
}>;

export type MapsFeatureCode =
  | "ADDRESS_AUTOCOMPLETE"
  | "PLACE_DETAILS"
  | "ADDRESS_VALIDATION"
  | "GEOCODING"
  | "MAP_LOAD"
  | "EXTERNAL_NAVIGATION"
  | "ROUTE_CALCULATION"
  | "ROUTE_MATRIX"
  | "ROUTE_CONFLICT_CHECK"
  | "INSTRUCTOR_RECOMMENDATION"
  | "VEHICLE_LOCATION_RECOMMENDATION"
  | "SINGLE_VEHICLE_OPTIMIZATION"
  | "FLEET_OPTIMIZATION"
  | "CANCELLATION_OPTIMIZATION"
  | "WORK_AREA_MAP"
  | "POSTCODE_ANALYTICS"
  | "EMPTY_MILE_ANALYSIS"
  | "EXAM_DEPARTURE_ADVICE";

export type FeatureAvailability = Readonly<{
  featureCode: MapsFeatureCode;
  state:
    | "ENABLED"
    | "PILOT"
    | "DISABLED"
    | "DEGRADED"
    | "LIMIT_REACHED"
    | "SUSPENDED";
  mode:
    | "PROVIDER"
    | "CACHE"
    | "NON_TRAFFIC"
    | "RAYON"
    | "HAVERSINE"
    | "MANUAL"
    | "LIST_ONLY"
    | "LOCAL_HEURISTIC"
    | "UNAVAILABLE";
  reason: string;
  remainingUnits: number | null;
}>;

export type MapsUsageEventInput = Readonly<{
  tenantId: string;
  environment: "LOCAL" | "STAGING" | "PRODUCTION";
  featureCode: MapsFeatureCode;
  surface:
    | "INTAKE"
    | "STUDENT_PROFILE"
    | "STUDENT_APP"
    | "INSTRUCTOR_APP"
    | "INSTRUCTOR_APPOINTMENT_WIZARD"
    | "LESSON_PLANNER"
    | "PLANNING_BOARD"
    | "PLATFORM_ADMIN"
    | "EXAM"
    | "BACKGROUND_JOB";
  provider: "GOOGLE" | "INTERNAL";
  skuCode: string | null;
  unitType:
    | "REQUEST"
    | "SESSION"
    | "MAP_LOAD"
    | "MATRIX_ELEMENT"
    | "SHIPMENT"
    | "VEHICLE"
    | "DESTINATION"
    | "PRODUCT_ACTION";
  units: number;
  cacheStatus: "HIT" | "MISS" | "NOT_APPLICABLE";
  resultStatus: "SUCCESS" | "PARTIAL" | "FALLBACK" | "FAILED" | "BLOCKED";
  correlationId: string;
  latencyMs: number | null;
  fallbackMethod: string | null;
}>;
