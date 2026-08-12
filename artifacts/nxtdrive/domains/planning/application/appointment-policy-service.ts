import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
  PLATFORM_APPOINTMENT_TYPE_POLICIES,
  type AppointmentTypePolicy,
  type AppointmentWizardSettings,
  type InstructorAppointmentPreference,
} from "../domain/appointment-policy";
import {
  INSTRUCTOR_PLANNING_TYPES,
  type InstructorPlanningType,
} from "@/lib/agenda/types";

type PolicyRow = Record<string, unknown> & { code: string };

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integer(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function text<T extends string>(value: unknown, fallback: T): T {
  return typeof value === "string" && value ? (value as T) : fallback;
}

export function mergeAppointmentTypePolicy(
  code: InstructorPlanningType,
  row?: PolicyRow | null,
): AppointmentTypePolicy {
  const fallback = PLATFORM_APPOINTMENT_TYPE_POLICIES[code];
  if (!row) return fallback;
  return Object.freeze({
    code,
    version: integer(row.version, fallback.version),
    label: text(row.label, fallback.label),
    shortLabel: text(row.short_label, fallback.shortLabel),
    category: text(row.category, fallback.category),
    studentRequirement: text(
      row.student_requirement,
      fallback.studentRequirement,
    ),
    defaultDurationMinutes: integer(
      row.default_duration_minutes,
      fallback.defaultDurationMinutes,
    ),
    minDurationMinutes: integer(
      row.min_duration_minutes,
      fallback.minDurationMinutes,
    ),
    maxDurationMinutes: integer(
      row.max_duration_minutes,
      fallback.maxDurationMinutes,
    ),
    durationStepMinutes: integer(
      row.duration_step_minutes,
      fallback.durationStepMinutes,
    ),
    defaultBufferBeforeMinutes: integer(
      row.default_buffer_before_minutes,
      fallback.defaultBufferBeforeMinutes,
    ),
    defaultBufferAfterMinutes: integer(
      row.default_buffer_after_minutes,
      fallback.defaultBufferAfterMinutes,
    ),
    minBufferBeforeMinutes: integer(
      row.min_buffer_before_minutes,
      fallback.minBufferBeforeMinutes,
    ),
    minBufferAfterMinutes: integer(
      row.min_buffer_after_minutes,
      fallback.minBufferAfterMinutes,
    ),
    locationRequirement: text(
      row.location_requirement,
      fallback.locationRequirement,
    ),
    vehicleRequirement: text(
      row.vehicle_requirement,
      fallback.vehicleRequirement,
    ),
    routeValidationEnabled: boolean(
      row.route_validation_enabled,
      fallback.routeValidationEnabled,
    ),
    blocksInstructorAvailability: boolean(
      row.blocks_instructor_availability,
      fallback.blocksInstructorAvailability,
    ),
    blocksVehicleAvailability: boolean(
      row.blocks_vehicle_availability,
      fallback.blocksVehicleAvailability,
    ),
    instructorCanOverrideDuration: boolean(
      row.instructor_can_override_duration,
      fallback.instructorCanOverrideDuration,
    ),
    instructorCanOverrideBuffer: boolean(
      row.instructor_can_override_buffer,
      fallback.instructorCanOverrideBuffer,
    ),
    instructorCanOverrideLocation: boolean(
      row.instructor_can_override_location,
      fallback.instructorCanOverrideLocation,
    ),
    instructorCanOverrideVehicle: boolean(
      row.instructor_can_override_vehicle,
      fallback.instructorCanOverrideVehicle,
    ),
    notifyStudentOnCreate: boolean(
      row.notify_student_on_create,
      fallback.notifyStudentOnCreate,
    ),
    notifyStudentOnChange: boolean(
      row.notify_student_on_change,
      fallback.notifyStudentOnChange,
    ),
    studentVisibility: text(row.student_visibility, fallback.studentVisibility),
    calendarTone: text(row.calendar_tone, fallback.calendarTone),
    iconKey: text(row.icon_key, fallback.iconKey),
    isActive: boolean(row.is_active, fallback.isActive),
    sortOrder: integer(row.sort_order, fallback.sortOrder),
  });
}

export async function loadAppointmentTypePolicies(
  client: SupabaseClient,
  tenantId: string,
): Promise<readonly AppointmentTypePolicy[]> {
  const [policyResult, legacyPlanningResult] = await Promise.all([
    client
      .from("appointment_type_policies")
      .select("*")
      .eq("tenant_id", tenantId),
    client
      .from("planning_settings")
      .select("default_lesson_duration_minutes, default_lesson_buffer_minutes")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);
  const { data, error } = policyResult;
  if (error) {
    // Additive rollout: platform defaults remain available before migration is
    // applied in preview/local environments.
    if (/does not exist|schema cache/i.test(error.message)) {
      const policies = { ...PLATFORM_APPOINTMENT_TYPE_POLICIES };
      if (legacyPlanningResult.data) {
        const legacy = legacyPlanningResult.data as Record<string, unknown>;
        policies.lesson = Object.freeze({
          ...policies.lesson,
          defaultDurationMinutes: integer(
            legacy.default_lesson_duration_minutes,
            policies.lesson.defaultDurationMinutes,
          ),
          minDurationMinutes: 10,
          maxDurationMinutes: 240,
          durationStepMinutes: 10,
          defaultBufferAfterMinutes: integer(
            legacy.default_lesson_buffer_minutes,
            policies.lesson.defaultBufferAfterMinutes,
          ),
        });
      }
      return Object.values(policies).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    throw new Error(`Afspraaktypebeleid laden mislukt: ${error.message}`);
  }
  const byCode = new Map(
    ((data ?? []) as PolicyRow[]).map((row) => [row.code, row]),
  );
  if (!byCode.has("lesson") && legacyPlanningResult.data) {
    const legacy = legacyPlanningResult.data as Record<string, unknown>;
    const duration = integer(
      legacy.default_lesson_duration_minutes,
      PLATFORM_APPOINTMENT_TYPE_POLICIES.lesson.defaultDurationMinutes,
    );
    const bufferAfter = integer(
      legacy.default_lesson_buffer_minutes,
      PLATFORM_APPOINTMENT_TYPE_POLICIES.lesson.defaultBufferAfterMinutes,
    );
    // Existing tenants already use ten-minute lesson durations. Preserve those
    // semantics until the tenant deliberately saves the new appointment policy.
    byCode.set("lesson", {
      code: "lesson",
      default_duration_minutes: duration,
      min_duration_minutes: 10,
      max_duration_minutes: 240,
      duration_step_minutes: 10,
      default_buffer_after_minutes: bufferAfter,
    });
  }
  return INSTRUCTOR_PLANNING_TYPES.map((code) =>
    mergeAppointmentTypePolicy(code, byCode.get(code)),
  ).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadAppointmentWizardSettings(
  client: SupabaseClient,
  tenantId: string,
): Promise<AppointmentWizardSettings> {
  const { data, error } = await client
    .from("appointment_wizard_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    throw new Error(
      `Afspraakwizardinstellingen laden mislukt: ${error.message}`,
    );
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return Object.freeze({
    studentScope: text(
      row.student_scope,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.studentScope,
    ),
    allowStudentHomeAsPickup: boolean(
      row.allow_student_home_as_pickup,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.allowStudentHomeAsPickup,
    ),
    allowDefaultPickupUpdate: boolean(
      row.allow_default_pickup_update,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.allowDefaultPickupUpdate,
    ),
    vehicleRequired: boolean(
      row.vehicle_required,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.vehicleRequired,
    ),
    vehicleSelectionMode: text(
      row.vehicle_selection_mode,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.vehicleSelectionMode,
    ),
    instructorMayOverrideVehicle: boolean(
      row.instructor_may_override_vehicle,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.instructorMayOverrideVehicle,
    ),
    validateVehicleAvailability: boolean(
      row.validate_vehicle_availability,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.validateVehicleAvailability,
    ),
    routeOverrideRequiresReason: boolean(
      row.route_override_requires_reason,
      DEFAULT_APPOINTMENT_WIZARD_SETTINGS.routeOverrideRequiresReason,
    ),
  });
}

export async function loadInstructorAppointmentPreferences(
  client: SupabaseClient,
  tenantId: string,
  instructorId: string,
): Promise<readonly InstructorAppointmentPreference[]> {
  const { data, error } = await client
    .from("instructor_appointment_preferences")
    .select(
      "appointment_type_code, duration_minutes, buffer_before_minutes, buffer_after_minutes, preferred_vehicle_id",
    )
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(`Planningvoorkeuren laden mislukt: ${error.message}`);
  }
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) =>
      (INSTRUCTOR_PLANNING_TYPES as readonly string[]).includes(
        String(row.appointment_type_code),
      ),
    )
    .map((row) => ({
      appointmentTypeCode: String(
        row.appointment_type_code,
      ) as InstructorPlanningType,
      durationMinutes:
        row.duration_minutes == null ? null : Number(row.duration_minutes),
      bufferBeforeMinutes:
        row.buffer_before_minutes == null
          ? null
          : Number(row.buffer_before_minutes),
      bufferAfterMinutes:
        row.buffer_after_minutes == null
          ? null
          : Number(row.buffer_after_minutes),
      preferredVehicleId:
        typeof row.preferred_vehicle_id === "string"
          ? row.preferred_vehicle_id
          : null,
    }));
}

export function serializePolicyForDatabase(policyValue: AppointmentTypePolicy) {
  return {
    code: policyValue.code,
    label: policyValue.label,
    short_label: policyValue.shortLabel,
    category: policyValue.category,
    student_requirement: policyValue.studentRequirement,
    default_duration_minutes: policyValue.defaultDurationMinutes,
    min_duration_minutes: policyValue.minDurationMinutes,
    max_duration_minutes: policyValue.maxDurationMinutes,
    duration_step_minutes: policyValue.durationStepMinutes,
    default_buffer_before_minutes: policyValue.defaultBufferBeforeMinutes,
    default_buffer_after_minutes: policyValue.defaultBufferAfterMinutes,
    min_buffer_before_minutes: policyValue.minBufferBeforeMinutes,
    min_buffer_after_minutes: policyValue.minBufferAfterMinutes,
    location_requirement: policyValue.locationRequirement,
    vehicle_requirement: policyValue.vehicleRequirement,
    route_validation_enabled: policyValue.routeValidationEnabled,
    blocks_instructor_availability: policyValue.blocksInstructorAvailability,
    blocks_vehicle_availability: policyValue.blocksVehicleAvailability,
    instructor_can_override_duration: policyValue.instructorCanOverrideDuration,
    instructor_can_override_buffer: policyValue.instructorCanOverrideBuffer,
    instructor_can_override_location: policyValue.instructorCanOverrideLocation,
    instructor_can_override_vehicle: policyValue.instructorCanOverrideVehicle,
    notify_student_on_create: policyValue.notifyStudentOnCreate,
    notify_student_on_change: policyValue.notifyStudentOnChange,
    student_visibility: policyValue.studentVisibility,
    calendar_tone: policyValue.calendarTone,
    icon_key: policyValue.iconKey,
    is_active: policyValue.isActive,
    sort_order: policyValue.sortOrder,
  };
}
