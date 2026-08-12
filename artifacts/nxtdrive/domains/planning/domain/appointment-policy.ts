import type { InstructorPlanningType } from "@/lib/agenda/types";
import type { AppointmentCalendarTone } from "../application/appointment-type-catalog";

export type AppointmentCategory = "STUDENT" | "PRIVATE" | "OPERATIONAL";
export type StudentRequirement = "REQUIRED" | "OPTIONAL" | "FORBIDDEN";
export type LocationRequirement =
  | "NONE"
  | "OPTIONAL"
  | "PICKUP"
  | "DESTINATION"
  | "PICKUP_AND_DESTINATION";
export type VehicleRequirement = "NONE" | "AUTO" | "REQUIRED";
export type StudentVisibility = "HIDDEN" | "AFTER_CONFIRMATION" | "PUBLISHED";
export type StudentSelectionScope =
  | "OWN_ACTIVE"
  | "OWN_AND_REPLACEMENT"
  | "BRANCH_ACTIVE"
  | "TENANT_ACTIVE";
export type VehicleSelectionMode =
  | "AUTO_DEFAULT"
  | "AUTO_WITH_OVERRIDE"
  | "ALWAYS_SELECT";

export type AppointmentTypePolicy = Readonly<{
  code: InstructorPlanningType;
  version: number;
  label: string;
  shortLabel: string;
  category: AppointmentCategory;
  studentRequirement: StudentRequirement;
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  durationStepMinutes: number;
  defaultBufferBeforeMinutes: number;
  defaultBufferAfterMinutes: number;
  minBufferBeforeMinutes: number;
  minBufferAfterMinutes: number;
  locationRequirement: LocationRequirement;
  vehicleRequirement: VehicleRequirement;
  routeValidationEnabled: boolean;
  blocksInstructorAvailability: boolean;
  blocksVehicleAvailability: boolean;
  instructorCanOverrideDuration: boolean;
  instructorCanOverrideBuffer: boolean;
  instructorCanOverrideLocation: boolean;
  instructorCanOverrideVehicle: boolean;
  notifyStudentOnCreate: boolean;
  notifyStudentOnChange: boolean;
  studentVisibility: StudentVisibility;
  calendarTone: AppointmentCalendarTone;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
}>;

export type AppointmentWizardSettings = Readonly<{
  studentScope: StudentSelectionScope;
  allowStudentHomeAsPickup: boolean;
  allowDefaultPickupUpdate: boolean;
  vehicleRequired: boolean;
  vehicleSelectionMode: VehicleSelectionMode;
  instructorMayOverrideVehicle: boolean;
  validateVehicleAvailability: boolean;
  routeOverrideRequiresReason: boolean;
}>;

export type InstructorAppointmentPreference = Readonly<{
  appointmentTypeCode: InstructorPlanningType;
  durationMinutes?: number | null;
  bufferBeforeMinutes?: number | null;
  bufferAfterMinutes?: number | null;
  preferredVehicleId?: string | null;
}>;

export type AppointmentValueSource =
  | "STUDENT"
  | "INSTRUCTOR"
  | "TENANT"
  | "PLATFORM";

export type ResolvedDuration = Readonly<{
  minutes: number;
  source: AppointmentValueSource;
  locked: boolean;
}>;

export type ResolvedBuffer = Readonly<{
  beforeMinutes: number;
  afterMinutes: number;
  source: Exclude<AppointmentValueSource, "STUDENT">;
  locked: boolean;
}>;

export type WizardStep =
  | "TYPE"
  | "STUDENT"
  | "PICKUP"
  | "PRIVATE_DETAILS"
  | "DESTINATION"
  | "SCHEDULE"
  | "VEHICLE"
  | "SUMMARY";

export type VehicleCandidate = Readonly<{
  id: string;
  label: string;
  branchId?: string | null;
  status?: string | null;
  transmission?: string | null;
  defaultInstructorId?: string | null;
  isBranchDefault?: boolean;
  isTenantDefault?: boolean;
  available: boolean;
  capabilityMatch?: boolean;
}>;

export type VehicleResolutionSource =
  | "FIXED_INSTRUCTOR"
  | "INSTRUCTOR_PREFERENCE"
  | "BRANCH_DEFAULT"
  | "TENANT_DEFAULT"
  | "ONLY_AVAILABLE"
  | "MANUAL"
  | "NONE";

export type VehicleResolutionResult = Readonly<{
  status: "RESOLVED" | "SELECTION_REQUIRED" | "NOT_REQUIRED";
  vehicle?: VehicleCandidate;
  candidates: readonly VehicleCandidate[];
  source: VehicleResolutionSource;
  reason?: string;
}>;

const policy = (value: AppointmentTypePolicy): AppointmentTypePolicy =>
  Object.freeze(value);

export const PLATFORM_APPOINTMENT_TYPE_POLICIES: Readonly<
  Record<InstructorPlanningType, AppointmentTypePolicy>
> = Object.freeze({
  lesson: policy({
    code: "lesson",
    version: 1,
    label: "Rijles",
    shortLabel: "Rijles",
    category: "STUDENT",
    studentRequirement: "REQUIRED",
    defaultDurationMinutes: 50,
    minDurationMinutes: 30,
    maxDurationMinutes: 180,
    durationStepMinutes: 10,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 10,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "PICKUP",
    vehicleRequirement: "AUTO",
    routeValidationEnabled: true,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: true,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: true,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: true,
    notifyStudentOnCreate: true,
    notifyStudentOnChange: true,
    studentVisibility: "PUBLISHED",
    calendarTone: "BLUE",
    iconKey: "car",
    isActive: true,
    sortOrder: 10,
  }),
  exam: policy({
    code: "exam",
    version: 1,
    label: "Praktijkexamen",
    shortLabel: "Examen",
    category: "STUDENT",
    studentRequirement: "REQUIRED",
    defaultDurationMinutes: 120,
    minDurationMinutes: 90,
    maxDurationMinutes: 240,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 30,
    defaultBufferAfterMinutes: 30,
    minBufferBeforeMinutes: 30,
    minBufferAfterMinutes: 30,
    locationRequirement: "PICKUP_AND_DESTINATION",
    vehicleRequirement: "REQUIRED",
    routeValidationEnabled: true,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: true,
    instructorCanOverrideDuration: false,
    instructorCanOverrideBuffer: false,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: true,
    notifyStudentOnCreate: true,
    notifyStudentOnChange: true,
    studentVisibility: "PUBLISHED",
    calendarTone: "ROSE",
    iconKey: "flag",
    isActive: true,
    sortOrder: 20,
  }),
  interim_test: policy({
    code: "interim_test",
    version: 1,
    label: "Tussentijdse toets",
    shortLabel: "TTT",
    category: "STUDENT",
    studentRequirement: "REQUIRED",
    defaultDurationMinutes: 90,
    minDurationMinutes: 60,
    maxDurationMinutes: 180,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 20,
    defaultBufferAfterMinutes: 20,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "PICKUP_AND_DESTINATION",
    vehicleRequirement: "REQUIRED",
    routeValidationEnabled: true,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: true,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: true,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: true,
    notifyStudentOnCreate: true,
    notifyStudentOnChange: true,
    studentVisibility: "PUBLISHED",
    calendarTone: "AMBER",
    iconKey: "clipboard",
    isActive: true,
    sortOrder: 30,
  }),
  theory_guidance: policy({
    code: "theory_guidance",
    version: 1,
    label: "Overige leerlingafspraak",
    shortLabel: "Leerling",
    category: "STUDENT",
    studentRequirement: "OPTIONAL",
    defaultDurationMinutes: 60,
    minDurationMinutes: 15,
    maxDurationMinutes: 240,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "OPTIONAL",
    vehicleRequirement: "NONE",
    routeValidationEnabled: false,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: false,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: true,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: false,
    notifyStudentOnCreate: false,
    notifyStudentOnChange: false,
    studentVisibility: "AFTER_CONFIRMATION",
    calendarTone: "TEAL",
    iconKey: "book",
    isActive: true,
    sortOrder: 40,
  }),
  break: policy({
    code: "break",
    version: 1,
    label: "Pauze",
    shortLabel: "Pauze",
    category: "PRIVATE",
    studentRequirement: "FORBIDDEN",
    defaultDurationMinutes: 30,
    minDurationMinutes: 15,
    maxDurationMinutes: 120,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "NONE",
    vehicleRequirement: "NONE",
    routeValidationEnabled: false,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: false,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: false,
    instructorCanOverrideLocation: false,
    instructorCanOverrideVehicle: false,
    notifyStudentOnCreate: false,
    notifyStudentOnChange: false,
    studentVisibility: "HIDDEN",
    calendarTone: "NEUTRAL",
    iconKey: "coffee",
    isActive: true,
    sortOrder: 60,
  }),
  private_block: policy({
    code: "private_block",
    version: 1,
    label: "Privé",
    shortLabel: "Privé",
    category: "PRIVATE",
    studentRequirement: "FORBIDDEN",
    defaultDurationMinutes: 60,
    minDurationMinutes: 15,
    maxDurationMinutes: 480,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "OPTIONAL",
    vehicleRequirement: "NONE",
    routeValidationEnabled: false,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: false,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: false,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: false,
    notifyStudentOnCreate: false,
    notifyStudentOnChange: false,
    studentVisibility: "HIDDEN",
    calendarTone: "GREEN",
    iconKey: "user",
    isActive: true,
    sortOrder: 70,
  }),
  free_block: generic(
    "free_block",
    "Beschikbaarheid blokkeren",
    "Blokkade",
    "SAND",
    "calendar",
    50,
  ),
  admin: generic("admin", "Administratie", "Admin", "TEAL", "clipboard", 80),
  maintenance: policy({
    ...generic("maintenance", "Onderhoud", "Onderhoud", "AMBER", "tools", 90),
    vehicleRequirement: "REQUIRED",
    blocksVehicleAvailability: true,
  }),
  vacation: generic(
    "vacation",
    "Vakantie",
    "Vakantie",
    "SAND",
    "calendar",
    100,
  ),
});

function generic(
  code: InstructorPlanningType,
  label: string,
  shortLabel: string,
  calendarTone: AppointmentCalendarTone,
  iconKey: string,
  sortOrder: number,
): AppointmentTypePolicy {
  return policy({
    code,
    version: 1,
    label,
    shortLabel,
    category: "OPERATIONAL",
    studentRequirement: "FORBIDDEN",
    defaultDurationMinutes: 60,
    minDurationMinutes: 15,
    maxDurationMinutes: 480,
    durationStepMinutes: 15,
    defaultBufferBeforeMinutes: 0,
    defaultBufferAfterMinutes: 0,
    minBufferBeforeMinutes: 0,
    minBufferAfterMinutes: 0,
    locationRequirement: "OPTIONAL",
    vehicleRequirement: "NONE",
    routeValidationEnabled: false,
    blocksInstructorAvailability: true,
    blocksVehicleAvailability: false,
    instructorCanOverrideDuration: true,
    instructorCanOverrideBuffer: true,
    instructorCanOverrideLocation: true,
    instructorCanOverrideVehicle: false,
    notifyStudentOnCreate: false,
    notifyStudentOnChange: false,
    studentVisibility: "HIDDEN",
    calendarTone,
    iconKey,
    isActive: true,
    sortOrder,
  });
}

export const DEFAULT_APPOINTMENT_WIZARD_SETTINGS: AppointmentWizardSettings =
  Object.freeze({
    studentScope: "OWN_ACTIVE",
    allowStudentHomeAsPickup: true,
    allowDefaultPickupUpdate: false,
    vehicleRequired: true,
    vehicleSelectionMode: "AUTO_WITH_OVERRIDE",
    instructorMayOverrideVehicle: true,
    validateVehicleAvailability: true,
    routeOverrideRequiresReason: true,
  });

export function clampDuration(
  value: number,
  policyValue: AppointmentTypePolicy,
): number {
  const bounded = Math.min(
    policyValue.maxDurationMinutes,
    Math.max(policyValue.minDurationMinutes, Math.round(value)),
  );
  const steps = Math.round(
    (bounded - policyValue.minDurationMinutes) /
      policyValue.durationStepMinutes,
  );
  return Math.min(
    policyValue.maxDurationMinutes,
    policyValue.minDurationMinutes + steps * policyValue.durationStepMinutes,
  );
}

export function resolveAppointmentDuration(input: {
  policy: AppointmentTypePolicy;
  studentMinutes?: number | null;
  instructorMinutes?: number | null;
}): ResolvedDuration {
  const selected = input.policy.instructorCanOverrideDuration
    ? input.studentMinutes != null
      ? { value: input.studentMinutes, source: "STUDENT" as const }
      : input.instructorMinutes != null
        ? { value: input.instructorMinutes, source: "INSTRUCTOR" as const }
        : {
            value: input.policy.defaultDurationMinutes,
            source: "TENANT" as const,
          }
    : { value: input.policy.defaultDurationMinutes, source: "TENANT" as const };
  return Object.freeze({
    minutes: clampDuration(selected.value, input.policy),
    source: selected.source,
    locked: !input.policy.instructorCanOverrideDuration,
  });
}

export function resolveAppointmentBuffer(input: {
  policy: AppointmentTypePolicy;
  instructorBeforeMinutes?: number | null;
  instructorAfterMinutes?: number | null;
}): ResolvedBuffer {
  const canOverride = input.policy.instructorCanOverrideBuffer;
  const before = canOverride
    ? (input.instructorBeforeMinutes ?? input.policy.defaultBufferBeforeMinutes)
    : input.policy.defaultBufferBeforeMinutes;
  const after = canOverride
    ? (input.instructorAfterMinutes ?? input.policy.defaultBufferAfterMinutes)
    : input.policy.defaultBufferAfterMinutes;
  return Object.freeze({
    beforeMinutes: Math.max(input.policy.minBufferBeforeMinutes, before),
    afterMinutes: Math.max(input.policy.minBufferAfterMinutes, after),
    source:
      canOverride &&
      (input.instructorBeforeMinutes != null ||
        input.instructorAfterMinutes != null)
        ? "INSTRUCTOR"
        : "TENANT",
    locked: !canOverride,
  });
}

export function resolveVehicle(input: {
  policy: AppointmentTypePolicy;
  settings: AppointmentWizardSettings;
  instructorId: string;
  branchId?: string | null;
  instructorPreferenceVehicleId?: string | null;
  vehicles: readonly VehicleCandidate[];
}): VehicleResolutionResult {
  if (input.policy.vehicleRequirement === "NONE") {
    return Object.freeze({
      status: "NOT_REQUIRED",
      candidates: [],
      source: "NONE",
    });
  }
  const candidates = input.vehicles.filter(
    (vehicle) =>
      vehicle.available &&
      vehicle.status !== "maintenance" &&
      vehicle.status !== "damaged" &&
      vehicle.status !== "inactive" &&
      vehicle.status !== "sold" &&
      vehicle.capabilityMatch !== false &&
      (!input.branchId ||
        !vehicle.branchId ||
        vehicle.branchId === input.branchId),
  );
  if (input.settings.vehicleSelectionMode === "ALWAYS_SELECT") {
    return Object.freeze({
      status: "SELECTION_REQUIRED",
      candidates,
      source: "NONE",
      reason: "De rijschool vereist een expliciete voertuigkeuze.",
    });
  }
  const priorities: ReadonlyArray<
    readonly [VehicleResolutionSource, (vehicle: VehicleCandidate) => boolean]
  > = [
    [
      "FIXED_INSTRUCTOR",
      (vehicle) => vehicle.defaultInstructorId === input.instructorId,
    ],
    [
      "INSTRUCTOR_PREFERENCE",
      (vehicle) => vehicle.id === input.instructorPreferenceVehicleId,
    ],
    ["BRANCH_DEFAULT", (vehicle) => vehicle.isBranchDefault === true],
    ["TENANT_DEFAULT", (vehicle) => vehicle.isTenantDefault === true],
  ];
  for (const [source, matches] of priorities) {
    const matching = candidates.filter(matches);
    if (matching.length === 1) {
      return Object.freeze({
        status: "RESOLVED",
        vehicle: matching[0],
        candidates,
        source,
      });
    }
  }
  if (candidates.length === 1) {
    return Object.freeze({
      status: "RESOLVED",
      vehicle: candidates[0],
      candidates,
      source: "ONLY_AVAILABLE",
    });
  }
  return Object.freeze({
    status: "SELECTION_REQUIRED",
    candidates,
    source: "NONE",
    reason:
      candidates.length === 0
        ? "Er is geen beschikbaar passend voertuig gevonden."
        : "Kies één van de beschikbare voertuigen.",
  });
}

export function buildWizardSteps(input: {
  policy: AppointmentTypePolicy;
  vehicleResolution?: VehicleResolutionResult | null;
}): readonly WizardStep[] {
  const steps: WizardStep[] = ["TYPE"];
  if (input.policy.studentRequirement !== "FORBIDDEN") steps.push("STUDENT");
  if (
    input.policy.locationRequirement === "PICKUP" ||
    input.policy.locationRequirement === "PICKUP_AND_DESTINATION"
  ) {
    steps.push("PICKUP");
  }
  if (input.policy.category === "PRIVATE" && input.policy.code !== "break") {
    steps.push("PRIVATE_DETAILS");
  }
  if (
    input.policy.locationRequirement === "DESTINATION" ||
    input.policy.locationRequirement === "PICKUP_AND_DESTINATION"
  ) {
    steps.push("DESTINATION");
  }
  steps.push("SCHEDULE");
  if (input.vehicleResolution?.status === "SELECTION_REQUIRED") {
    steps.push("VEHICLE");
  }
  steps.push("SUMMARY");
  return Object.freeze(steps);
}

export function durationOptions(
  policyValue: AppointmentTypePolicy,
): readonly number[] {
  const values: number[] = [];
  for (
    let minutes = policyValue.minDurationMinutes;
    minutes <= policyValue.maxDurationMinutes;
    minutes += policyValue.durationStepMinutes
  ) {
    values.push(minutes);
  }
  return Object.freeze(values);
}
