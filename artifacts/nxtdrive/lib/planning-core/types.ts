import type { AvailabilityException, WeeklyAvailability } from "@/lib/availability/types";
import type { MemberRole } from "@/lib/types";

export type PlanningScope =
  | { type: "tenant"; tenantId: string }
  | { type: "branch"; tenantId: string; branchId: string }
  | { type: "franchise_network"; franchiseRootTenantId: string }
  | {
      type: "franchisee";
      franchiseRootTenantId: string;
      tenantId: string;
      branchId?: string | null;
    };

export type PlanningActorAccess = {
  userId: string;
  roles: readonly MemberRole[];
  isPlatformAdmin?: boolean;
  tenantIds?: readonly string[];
  branchAccess?: readonly {
    tenantId: string;
    branchIds: "all" | readonly string[];
  }[];
  franchiseOperations?: readonly {
    franchiseRootTenantId: string;
    franchiseeTenantId: string;
    canViewPlanning: boolean;
    canManagePlanning: boolean;
  }[];
};

export type PlanningEntityType =
  | "lesson"
  | "trial_lesson"
  | "agenda_appointment"
  | "queue_item";

export type PlanningReasonCode =
  | "ACTOR_NOT_ALLOWED_FOR_SCOPE"
  | "INVALID_TIME_RANGE"
  | "INSTRUCTOR_NOT_FOUND"
  | "INSTRUCTOR_NOT_AVAILABLE"
  | "INSTRUCTOR_HAS_OVERLAP"
  | "INSUFFICIENT_TRAVEL_TIME_BEFORE"
  | "INSUFFICIENT_TRAVEL_TIME_AFTER"
  | "OUTSIDE_INSTRUCTOR_SERVICE_AREA"
  | "MISSING_REQUIRED_CAPABILITY"
  | "MISSING_REQUIRED_VEHICLE_CAPABILITY"
  | "VEHICLE_NOT_FOUND"
  | "VEHICLE_UNAVAILABLE"
  | "VEHICLE_APK_EXPIRED"
  | "VEHICLE_HAS_OVERLAP"
  | "VEHICLE_HAS_BLOCKING_DAMAGE"
  | "VEHICLE_HAS_BLOCKING_MAINTENANCE"
  | "TRANSMISSION_MISMATCH";

export type PlanningReason = {
  code: PlanningReasonCode;
  message: string;
  severity: "blocking" | "warning";
  meta?: Record<string, unknown>;
};

export type PlanningValidationResult = {
  allowed: boolean;
  blockingReasons: PlanningReason[];
  warnings: PlanningReason[];
};

export type PlanningCandidateInput = {
  actor: PlanningActorAccess;
  scope: PlanningScope;
  entityType: PlanningEntityType;
  entityId?: string | null;
  tenantId: string;
  branchId?: string | null;
  instructorId: string;
  vehicleId?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  pickupServiceAreaId?: string | null;
  requiredTransmission?: "schakel" | "automaat" | null;
  requiredInstructorCapabilityIds?: readonly string[];
  preferredInstructorCapabilityIds?: readonly string[];
  requiredVehicleCapabilityIds?: readonly string[];
};

export type PlanningBusyInterval = {
  id: string;
  entityType: PlanningEntityType;
  instructorId?: string | null;
  vehicleId?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  serviceAreaId?: string | null;
};

export type PlanningInstructorData = {
  id: string;
  tenantId: string;
  branchIds?: readonly string[];
  serviceAreaIds?: readonly string[];
  capabilityIds?: readonly string[];
  availabilityRules?: readonly WeeklyAvailability[];
  availabilityExceptions?: readonly AvailabilityException[];
};

export type PlanningVehicleData = {
  id: string;
  tenantId: string;
  branchId?: string | null;
  transmission?: "schakel" | "automaat" | null;
  status?: "active" | "inactive" | "maintenance" | "damaged" | "sold" | null;
  apkExpiresAt?: string | null;
  capabilityIds?: readonly string[];
  hasBlockingDamage?: boolean;
  blockingMaintenanceIntervals?: readonly {
    id: string;
    startsAt: string | Date;
    endsAt: string | Date;
  }[];
};

export type PlanningTravelMatrixEntry = {
  fromServiceAreaId: string;
  toServiceAreaId: string;
  estimatedMinutes: number;
};

export type PlanningSettings = {
  rayonPolicy?: "hard_block" | "warning_only" | "ignore";
  defaultTravelBufferMinutes?: number;
  sameAreaTravelMinutes?: number;
  differentAreaTravelMinutes?: number;
};

export type PlanningKernelData = {
  instructor: PlanningInstructorData | null;
  vehicle?: PlanningVehicleData | null;
  busyIntervals?: readonly PlanningBusyInterval[];
  serviceAreaTravelMatrix?: readonly PlanningTravelMatrixEntry[];
  settings?: PlanningSettings;
};

export type PlanningSuggestion = {
  candidate: PlanningCandidateInput;
  validation: PlanningValidationResult;
  score: number;
  reasons: string[];
  warnings: string[];
};

export class PlanningValidationError extends Error {
  readonly validation: PlanningValidationResult;

  constructor(validation: PlanningValidationResult) {
    super(
      validation.blockingReasons.map((reason) => reason.message).join("; ") ||
        "Planning validation failed",
    );
    this.name = "PlanningValidationError";
    this.validation = validation;
  }
}
