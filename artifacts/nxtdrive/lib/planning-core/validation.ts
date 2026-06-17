import { computeFreeIntervals } from "@/lib/availability/compute";
import { amsterdamYmd, startOfAmsterdamDayUtc } from "@/lib/datetime";
import type {
  PlanningActorAccess,
  PlanningBusyInterval,
  PlanningCandidateInput,
  PlanningKernelData,
  PlanningReason,
  PlanningReasonCode,
  PlanningScope,
  PlanningSettings,
  PlanningValidationResult,
  PlanningVehicleData,
} from "@/lib/planning-core/types";

const DEFAULT_SETTINGS: Required<PlanningSettings> = {
  rayonPolicy: "hard_block",
  defaultTravelBufferMinutes: 15,
  sameAreaTravelMinutes: 10,
  differentAreaTravelMinutes: 30,
  unknownTravelTimePolicy: "fallback_warning",
};

const VEHICLE_BLOCKING_STATUSES = new Set(["inactive", "maintenance", "sold"]);
const WARNING_WINDOW_DAYS = 30;
const ODOMETER_STALE_DAYS = 45;

function reason(
  code: PlanningReasonCode,
  message: string,
  severity: PlanningReason["severity"] = "blocking",
  meta?: Record<string, unknown>,
): PlanningReason {
  return { code, message, severity, meta };
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function ymdMinutes(date: Date): { ymd: string; minutes: number } {
  const ymd = amsterdamYmd(date);
  const midnight = startOfAmsterdamDayUtc(ymd);
  return {
    ymd,
    minutes: Math.round((date.getTime() - midnight.getTime()) / 60000),
  };
}

function weekdayForYmd(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function includesAll(
  haystack: readonly string[] | undefined,
  needles: readonly string[] | undefined,
): string[] {
  const values = new Set(haystack ?? []);
  return (needles ?? []).filter((needle) => !values.has(needle));
}

function normalizeTransmission(
  value: PlanningCandidateInput["requiredTransmission"],
): "schakel" | "automaat" | null {
  if (value === "manual") return "schakel";
  if (value === "automatic") return "automaat";
  if (value === "schakel" || value === "automaat") return value;
  return null;
}

function daysBetween(left: Date, right: Date): number {
  return Math.ceil((right.getTime() - left.getTime()) / 86400000);
}

function actorCanManageScope(
  actor: PlanningActorAccess,
  scope: PlanningScope,
): boolean {
  if (actor.isPlatformAdmin) return true;
  if (scope.type === "tenant") {
    if (actor.tenantIds?.includes(scope.tenantId)) return true;
    return Boolean(
      actor.branchAccess?.some(
        (entry) =>
          entry.tenantId === scope.tenantId && entry.branchIds === "all",
      ),
    );
  }
  if (scope.type === "branch") {
    if (actor.tenantIds?.includes(scope.tenantId)) return true;
    return Boolean(
      actor.branchAccess?.some((entry) => {
        if (entry.tenantId !== scope.tenantId) return false;
        return (
          entry.branchIds === "all" || entry.branchIds.includes(scope.branchId)
        );
      }),
    );
  }
  if (scope.type === "franchise_network") {
    return Boolean(
      actor.franchiseOperations?.some(
        (entry) =>
          entry.franchiseRootTenantId === scope.franchiseRootTenantId &&
          entry.canManagePlanning,
      ),
    );
  }
  return Boolean(
    actor.franchiseOperations?.some(
      (entry) =>
        entry.franchiseRootTenantId === scope.franchiseRootTenantId &&
        entry.franchiseeTenantId === scope.tenantId &&
        entry.canManagePlanning,
    ),
  );
}

function matrixTravelMinutes(
  fromServiceAreaId: string | null | undefined,
  toServiceAreaId: string | null | undefined,
  data: PlanningKernelData,
  settings: Required<PlanningSettings>,
): { minutes: number; known: boolean } {
  if (!fromServiceAreaId || !toServiceAreaId) {
    return { minutes: settings.defaultTravelBufferMinutes, known: true };
  }
  if (fromServiceAreaId === toServiceAreaId) {
    return { minutes: settings.sameAreaTravelMinutes, known: true };
  }
  const direct = data.serviceAreaTravelMatrix?.find(
    (entry) =>
      entry.fromServiceAreaId === fromServiceAreaId &&
      entry.toServiceAreaId === toServiceAreaId,
  );
  if (direct) return { minutes: direct.estimatedMinutes, known: true };
  return { minutes: settings.differentAreaTravelMinutes, known: false };
}

function activeBusyIntervals(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
): PlanningBusyInterval[] {
  return (data.busyIntervals ?? []).filter((interval) => {
    if (input.entityId && interval.id === input.entityId) return false;
    return true;
  });
}

function validateAvailability(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  start: Date,
  end: Date,
): PlanningReason | null {
  const instructor = data.instructor;
  if (!instructor) return null;

  const startParts = ymdMinutes(start);
  const endParts = ymdMinutes(end);
  if (startParts.ymd !== endParts.ymd) {
    return reason(
      "INSTRUCTOR_NOT_AVAILABLE",
      "Afspraken over meerdere dagen worden nog niet ondersteund door de beschikbaarheidscontrole.",
    );
  }

  const weekday = weekdayForYmd(startParts.ymd);
  const appliesToBranch = (row: { branch_id?: string | null }) => {
    if (!row.branch_id) return true;
    return Boolean(input.branchId && row.branch_id === input.branchId);
  };
  const rules = (instructor.availabilityRules ?? []).filter(
    (row) => row.weekday === weekday && appliesToBranch(row),
  );
  const exceptions = (instructor.availabilityExceptions ?? []).filter(
    (row) => row.exception_date === startParts.ymd && appliesToBranch(row),
  );
  const free = computeFreeIntervals([...rules], [...exceptions]);
  const inside = free.some(
    (interval) =>
      interval.start_min <= startParts.minutes &&
      interval.end_min >= endParts.minutes,
  );
  if (inside) return null;
  return reason(
    "INSTRUCTOR_NOT_AVAILABLE",
    "Instructeur is niet beschikbaar binnen dit tijdslot.",
    "blocking",
    { date: startParts.ymd },
  );
}

function validateVehicle(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  start: Date,
  end: Date,
): { blockers: PlanningReason[]; warnings: PlanningReason[] } {
  const blockers: PlanningReason[] = [];
  const warnings: PlanningReason[] = [];
  const requiredVehicleCapabilityIds = [
    ...(input.requiredVehicleCapabilityIds ?? []),
    ...(data.requirements?.requiredVehicleCapabilityIds ?? []),
  ];
  if (!input.vehicleId) {
    if (requiredVehicleCapabilityIds.length > 0) {
      blockers.push(
        reason(
          "MISSING_REQUIRED_VEHICLE_CAPABILITY",
          "Deze planning vereist een voertuig met verplichte eigenschappen.",
          "blocking",
          { missingCapabilityIds: requiredVehicleCapabilityIds },
        ),
      );
    }
    return { blockers, warnings };
  }
  const vehicle = data.vehicle;
  if (!vehicle || vehicle.id !== input.vehicleId) {
    return {
      blockers: [
        reason(
          "VEHICLE_NOT_FOUND",
          "Voertuig kon niet binnen deze planningcontext worden gevonden.",
        ),
      ],
      warnings,
    };
  }

  if (vehicle.status && VEHICLE_BLOCKING_STATUSES.has(vehicle.status)) {
    blockers.push(
      reason(
        "VEHICLE_UNAVAILABLE",
        `Voertuig heeft status ${vehicle.status} en kan niet ingepland worden.`,
        "blocking",
        { status: vehicle.status },
      ),
    );
  }

  if (
    vehicle.branchId &&
    input.branchId &&
    vehicle.branchId !== input.branchId
  ) {
    blockers.push(
      reason(
        "VEHICLE_OUTSIDE_BRANCH_SCOPE",
        "Voertuig valt buiten de vestigingsscope van deze afspraak.",
        "blocking",
        {
          vehicleBranchId: vehicle.branchId,
          appointmentBranchId: input.branchId,
        },
      ),
    );
  }

  if (vehicle.apkExpiresAt) {
    const apkDate = startOfAmsterdamDayUtc(vehicle.apkExpiresAt);
    if (vehicle.apkExpiresAt < amsterdamYmd(start)) {
      blockers.push(
        reason(
          "VEHICLE_APK_EXPIRED",
          "Voertuig heeft verlopen APK.",
          "blocking",
          { apkExpiresAt: vehicle.apkExpiresAt },
        ),
      );
    } else {
      const days = daysBetween(start, apkDate);
      if (days <= WARNING_WINDOW_DAYS) {
        warnings.push(
          reason(
            "VEHICLE_APK_EXPIRING_SOON",
            "APK verloopt binnenkort.",
            "warning",
            { apkExpiresAt: vehicle.apkExpiresAt, daysUntilExpiry: days },
          ),
        );
      }
    }
  }

  if (vehicle.hasBlockingDamage) {
    blockers.push(
      reason(
        "VEHICLE_HAS_BLOCKING_DAMAGE",
        "Voertuig heeft open schade die planning blokkeert.",
      ),
    );
  }

  if ((vehicle.nonBlockingDamageCount ?? 0) > 0) {
    warnings.push(
      reason(
        "VEHICLE_HAS_NON_BLOCKING_DAMAGE",
        "Voertuig heeft open schade die planning niet blokkeert.",
        "warning",
        { count: vehicle.nonBlockingDamageCount },
      ),
    );
  }

  if (
    vehicle.blockingMaintenanceIntervals?.some((interval) =>
      overlaps(start, end, toDate(interval.startsAt), toDate(interval.endsAt)),
    )
  ) {
    blockers.push(
      reason("VEHICLE_MAINTENANCE_BLOCK", "Voertuig staat in onderhoud."),
    );
  }

  const upcomingMaintenance = vehicle.upcomingMaintenanceIntervals?.find(
    (interval) => {
      const startsAt = toDate(interval.startsAt);
      return (
        startsAt >= end && daysBetween(start, startsAt) <= WARNING_WINDOW_DAYS
      );
    },
  );
  if (upcomingMaintenance) {
    warnings.push(
      reason(
        "VEHICLE_MAINTENANCE_UPCOMING",
        "Onderhoud staat binnenkort gepland.",
        "warning",
        { maintenanceId: upcomingMaintenance.id },
      ),
    );
  }

  const requiredTransmission = normalizeTransmission(
    input.requiredTransmission,
  );
  const vehicleTransmission = normalizeTransmission(vehicle.transmission);
  if (
    requiredTransmission &&
    vehicleTransmission &&
    requiredTransmission !== vehicleTransmission
  ) {
    blockers.push(
      reason(
        "VEHICLE_TRANSMISSION_MISMATCH",
        "Voertuigtransmissie past niet bij deze afspraak.",
        "blocking",
        {
          requiredTransmission,
          vehicleTransmission,
        },
      ),
    );
  }

  const missingVehicleCapabilities = includesAll(
    vehicle.capabilityIds,
    requiredVehicleCapabilityIds,
  );
  if (missingVehicleCapabilities.length > 0) {
    blockers.push(
      reason(
        "MISSING_REQUIRED_VEHICLE_CAPABILITY",
        "Voertuig mist een verplichte eigenschap voor deze afspraak.",
        "blocking",
        { missingCapabilityIds: missingVehicleCapabilities },
      ),
    );
  }

  if (!vehicle.latestOdometerRecordedAt) {
    warnings.push(
      reason(
        "VEHICLE_ODOMETER_STALE",
        "Kilometerstand is onbekend.",
        "warning",
      ),
    );
  } else if (
    daysBetween(toDate(vehicle.latestOdometerRecordedAt), start) >
    ODOMETER_STALE_DAYS
  ) {
    warnings.push(
      reason("VEHICLE_ODOMETER_STALE", "Kilometerstand is oud.", "warning", {
        latestOdometerRecordedAt: vehicle.latestOdometerRecordedAt,
      }),
    );
  }

  return { blockers, warnings };
}

function validateTravel(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  start: Date,
  end: Date,
  settings: Required<PlanningSettings>,
): { blockers: PlanningReason[]; warnings: PlanningReason[] } {
  const intervals = activeBusyIntervals(input, data)
    .filter((interval) => interval.instructorId === input.instructorId)
    .sort(
      (a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime(),
    );

  const previous = [...intervals]
    .reverse()
    .find((interval) => toDate(interval.endsAt) <= start);
  const next = intervals.find((interval) => toDate(interval.startsAt) >= end);
  const blockers: PlanningReason[] = [];
  const warnings: PlanningReason[] = [];

  if (previous) {
    const travel = matrixTravelMinutes(
      previous.serviceAreaId,
      input.pickupServiceAreaId,
      data,
      settings,
    );
    if (
      !travel.known &&
      settings.unknownTravelTimePolicy === "fallback_warning"
    ) {
      warnings.push(
        reason(
          "UNKNOWN_SERVICE_AREA_TRAVEL_TIME",
          "Reistijd tussen rayons is onbekend; fallback reistijd gebruikt.",
          "warning",
          {
            fromServiceAreaId: previous.serviceAreaId,
            toServiceAreaId: input.pickupServiceAreaId,
            fallbackMinutes: travel.minutes,
          },
        ),
      );
    }
    const availableGap = Math.round(
      (start.getTime() - toDate(previous.endsAt).getTime()) / 60000,
    );
    if (availableGap < travel.minutes) {
      blockers.push(
        reason(
          "INSUFFICIENT_TRAVEL_TIME_BEFORE",
          "Er is te weinig reistijd vanaf de vorige afspraak.",
          "blocking",
          {
            availableGapMinutes: availableGap,
            requiredTravelMinutes: travel.minutes,
          },
        ),
      );
    }
  }

  if (next) {
    const travel = matrixTravelMinutes(
      input.pickupServiceAreaId,
      next.serviceAreaId,
      data,
      settings,
    );
    if (
      !travel.known &&
      settings.unknownTravelTimePolicy === "fallback_warning"
    ) {
      warnings.push(
        reason(
          "UNKNOWN_SERVICE_AREA_TRAVEL_TIME",
          "Reistijd tussen rayons is onbekend; fallback reistijd gebruikt.",
          "warning",
          {
            fromServiceAreaId: input.pickupServiceAreaId,
            toServiceAreaId: next.serviceAreaId,
            fallbackMinutes: travel.minutes,
          },
        ),
      );
    }
    const availableGap = Math.round(
      (toDate(next.startsAt).getTime() - end.getTime()) / 60000,
    );
    if (availableGap < travel.minutes) {
      blockers.push(
        reason(
          "INSUFFICIENT_TRAVEL_TIME_AFTER",
          "Er is te weinig reistijd naar de volgende afspraak.",
          "blocking",
          {
            availableGapMinutes: availableGap,
            requiredTravelMinutes: travel.minutes,
          },
        ),
      );
    }
  }

  return { blockers, warnings };
}

function validatePreferredCapabilities(
  available: readonly string[] | undefined,
  preferred: readonly string[] | undefined,
  entity: "instructor" | "vehicle" | "mixed",
): PlanningReason[] {
  const missing = includesAll(available, preferred);
  if (missing.length === 0) return [];
  return [
    reason(
      "PREFERRED_CAPABILITY_MISSING",
      "Een voorkeurseigenschap ontbreekt voor deze planning.",
      "warning",
      { entity, missingCapabilityIds: missing },
    ),
  ];
}

export function validateScheduleCandidate(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
): PlanningValidationResult {
  const settings: Required<PlanningSettings> = {
    ...DEFAULT_SETTINGS,
    ...(data.settings ?? {}),
  };
  const blockingReasons: PlanningReason[] = [];
  const warnings: PlanningReason[] = [];
  const start = toDate(input.startAt);
  const end = toDate(input.endAt);

  if (!actorCanManageScope(input.actor, input.scope)) {
    blockingReasons.push(
      reason(
        "ACTOR_NOT_ALLOWED_FOR_SCOPE",
        "Je hebt geen planningsrechten binnen deze scope.",
      ),
    );
  }

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start >= end
  ) {
    blockingReasons.push(
      reason("INVALID_TIME_RANGE", "Het gekozen tijdslot is ongeldig."),
    );
    return { allowed: false, blockingReasons, warnings };
  }

  if (!data.instructor || data.instructor.id !== input.instructorId) {
    blockingReasons.push(
      reason(
        "INSTRUCTOR_NOT_FOUND",
        "Instructeur kon niet binnen deze planningcontext worden gevonden.",
      ),
    );
    return { allowed: false, blockingReasons, warnings };
  }

  const availabilityBlocker = validateAvailability(input, data, start, end);
  if (availabilityBlocker) blockingReasons.push(availabilityBlocker);

  const instructorOverlap = activeBusyIntervals(input, data).find(
    (interval) =>
      interval.instructorId === input.instructorId &&
      overlaps(start, end, toDate(interval.startsAt), toDate(interval.endsAt)),
  );
  if (instructorOverlap) {
    blockingReasons.push(
      reason(
        "INSTRUCTOR_HAS_OVERLAP",
        "Instructeur heeft al een afspraak in dit tijdslot.",
        "blocking",
        { overlapId: instructorOverlap.id },
      ),
    );
  }

  if (input.vehicleId) {
    const vehicleOverlap = activeBusyIntervals(input, data).find(
      (interval) =>
        interval.vehicleId === input.vehicleId &&
        overlaps(
          start,
          end,
          toDate(interval.startsAt),
          toDate(interval.endsAt),
        ),
    );
    if (vehicleOverlap) {
      blockingReasons.push(
        reason(
          "VEHICLE_HAS_OVERLAP",
          "Voertuig is al ingepland in dit tijdslot.",
          "blocking",
          { overlapId: vehicleOverlap.id },
        ),
      );
    }
  }

  const missingInstructorCapabilities = includesAll(
    data.instructor.capabilityIds,
    [
      ...(input.requiredInstructorCapabilityIds ?? []),
      ...(input.studentRequirementCapabilityIds ?? []),
      ...(data.requirements?.requiredInstructorCapabilityIds ?? []),
    ],
  );
  if (missingInstructorCapabilities.length > 0) {
    blockingReasons.push(
      reason(
        "MISSING_REQUIRED_CAPABILITY",
        "Instructeur mist een verplichte eigenschap voor deze afspraak.",
        "blocking",
        { missingCapabilityIds: missingInstructorCapabilities },
      ),
    );
  }

  warnings.push(
    ...validatePreferredCapabilities(
      data.instructor.capabilityIds,
      [
        ...(input.preferredInstructorCapabilityIds ?? []),
        ...(input.preferredCapabilityIds ?? []),
        ...(data.requirements?.preferredInstructorCapabilityIds ?? []),
      ],
      "instructor",
    ),
  );

  if (
    input.pickupServiceAreaId &&
    data.instructor.serviceAreaIds?.length &&
    !data.instructor.serviceAreaIds.includes(input.pickupServiceAreaId)
  ) {
    const rayonReason = reason(
      "OUTSIDE_INSTRUCTOR_SERVICE_AREA",
      "Afspraak valt buiten het rayon van deze instructeur.",
      settings.rayonPolicy === "warning_only" ? "warning" : "blocking",
      { pickupServiceAreaId: input.pickupServiceAreaId },
    );
    if (settings.rayonPolicy === "warning_only") warnings.push(rayonReason);
    if (settings.rayonPolicy === "hard_block")
      blockingReasons.push(rayonReason);
  }

  const vehicleValidation = validateVehicle(input, data, start, end);
  blockingReasons.push(...vehicleValidation.blockers);
  warnings.push(...vehicleValidation.warnings);
  if (input.vehicleId && data.vehicle) {
    warnings.push(
      ...validatePreferredCapabilities(
        data.vehicle.capabilityIds,
        [
          ...(input.preferredVehicleCapabilityIds ?? []),
          ...(data.requirements?.preferredVehicleCapabilityIds ?? []),
        ],
        "vehicle",
      ),
    );
  }
  const travelValidation = validateTravel(input, data, start, end, settings);
  blockingReasons.push(...travelValidation.blockers);
  warnings.push(...travelValidation.warnings);

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  };
}

export function scoreValidationResult(
  result: PlanningValidationResult,
): number {
  if (!result.allowed) return -1000 - result.blockingReasons.length * 100;
  return 100 - result.warnings.length * 10;
}
