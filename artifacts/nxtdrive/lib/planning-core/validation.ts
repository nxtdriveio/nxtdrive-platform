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
};

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

function actorCanManageScope(
  actor: PlanningActorAccess,
  scope: PlanningScope,
): boolean {
  if (actor.isPlatformAdmin) return true;
  if (scope.type === "tenant") {
    if (actor.tenantIds?.includes(scope.tenantId)) return true;
    return Boolean(
      actor.branchAccess?.some(
        (entry) => entry.tenantId === scope.tenantId && entry.branchIds === "all",
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
): number {
  if (!fromServiceAreaId || !toServiceAreaId) {
    return settings.defaultTravelBufferMinutes;
  }
  if (fromServiceAreaId === toServiceAreaId) {
    return settings.sameAreaTravelMinutes;
  }
  const direct = data.serviceAreaTravelMatrix?.find(
    (entry) =>
      entry.fromServiceAreaId === fromServiceAreaId &&
      entry.toServiceAreaId === toServiceAreaId,
  );
  if (direct) return direct.estimatedMinutes;
  return settings.differentAreaTravelMinutes;
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
): PlanningReason[] {
  const blockers: PlanningReason[] = [];
  if (!input.vehicleId) return blockers;
  const vehicle = data.vehicle;
  if (!vehicle || vehicle.id !== input.vehicleId) {
    return [
      reason(
        "VEHICLE_NOT_FOUND",
        "Voertuig kon niet binnen deze planningcontext worden gevonden.",
      ),
    ];
  }

  if (vehicle.status && vehicle.status !== "active") {
    blockers.push(
      reason(
        "VEHICLE_UNAVAILABLE",
        `Voertuig heeft status ${vehicle.status} en kan niet ingepland worden.`,
        "blocking",
        { status: vehicle.status },
      ),
    );
  }

  if (vehicle.apkExpiresAt && vehicle.apkExpiresAt < amsterdamYmd(start)) {
    blockers.push(
      reason(
        "VEHICLE_APK_EXPIRED",
        "Voertuig heeft een verlopen APK op de afspraakdatum.",
        "blocking",
        { apkExpiresAt: vehicle.apkExpiresAt },
      ),
    );
  }

  if (vehicle.hasBlockingDamage) {
    blockers.push(
      reason(
        "VEHICLE_HAS_BLOCKING_DAMAGE",
        "Voertuig heeft open schade die planning blokkeert.",
      ),
    );
  }

  if (
    vehicle.blockingMaintenanceIntervals?.some((interval) =>
      overlaps(start, end, toDate(interval.startsAt), toDate(interval.endsAt)),
    )
  ) {
    blockers.push(
      reason(
        "VEHICLE_HAS_BLOCKING_MAINTENANCE",
        "Voertuig staat in onderhoud tijdens dit tijdslot.",
      ),
    );
  }

  if (
    input.requiredTransmission &&
    vehicle.transmission &&
    input.requiredTransmission !== vehicle.transmission
  ) {
    blockers.push(
      reason(
        "TRANSMISSION_MISMATCH",
        "Voertuigtransmissie past niet bij deze afspraak.",
        "blocking",
        {
          requiredTransmission: input.requiredTransmission,
          vehicleTransmission: vehicle.transmission,
        },
      ),
    );
  }

  const missingVehicleCapabilities = includesAll(
    vehicle.capabilityIds,
    input.requiredVehicleCapabilityIds,
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

  return blockers;
}

function validateTravel(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  start: Date,
  end: Date,
  settings: Required<PlanningSettings>,
): PlanningReason[] {
  const intervals = activeBusyIntervals(input, data)
    .filter((interval) => interval.instructorId === input.instructorId)
    .sort(
      (a, b) =>
        toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime(),
    );

  const previous = [...intervals]
    .reverse()
    .find((interval) => toDate(interval.endsAt) <= start);
  const next = intervals.find((interval) => toDate(interval.startsAt) >= end);
  const blockers: PlanningReason[] = [];

  if (previous) {
    const travel = matrixTravelMinutes(
      previous.serviceAreaId,
      input.pickupServiceAreaId,
      data,
      settings,
    );
    const availableGap = Math.round(
      (start.getTime() - toDate(previous.endsAt).getTime()) / 60000,
    );
    if (availableGap < travel) {
      blockers.push(
        reason(
          "INSUFFICIENT_TRAVEL_TIME_BEFORE",
          "Er is te weinig reistijd vanaf de vorige afspraak.",
          "blocking",
          { availableGapMinutes: availableGap, requiredTravelMinutes: travel },
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
    const availableGap = Math.round(
      (toDate(next.startsAt).getTime() - end.getTime()) / 60000,
    );
    if (availableGap < travel) {
      blockers.push(
        reason(
          "INSUFFICIENT_TRAVEL_TIME_AFTER",
          "Er is te weinig reistijd naar de volgende afspraak.",
          "blocking",
          { availableGapMinutes: availableGap, requiredTravelMinutes: travel },
        ),
      );
    }
  }

  return blockers;
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

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
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
        overlaps(start, end, toDate(interval.startsAt), toDate(interval.endsAt)),
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
    input.requiredInstructorCapabilityIds,
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
    if (settings.rayonPolicy === "hard_block") blockingReasons.push(rayonReason);
  }

  blockingReasons.push(...validateVehicle(input, data, start, end));
  blockingReasons.push(...validateTravel(input, data, start, end, settings));

  return {
    allowed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  };
}

export function scoreValidationResult(result: PlanningValidationResult): number {
  if (!result.allowed) return -1000 - result.blockingReasons.length * 100;
  return 100 - result.warnings.length * 10;
}
