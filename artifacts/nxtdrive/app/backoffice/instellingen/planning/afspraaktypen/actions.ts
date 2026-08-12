"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { serializePolicyForDatabase } from "@/domains/planning/application/appointment-policy-service";
import type {
  AppointmentCategory,
  AppointmentTypePolicy,
  LocationRequirement,
  StudentRequirement,
  StudentSelectionScope,
  StudentVisibility,
  VehicleRequirement,
  VehicleSelectionMode,
} from "@/domains/planning/domain/appointment-policy";
import type { AppointmentCalendarTone } from "@/domains/planning/application/appointment-type-catalog";
import { isInstructorPlanningType } from "@/lib/agenda/types";

export type AppointmentPolicyActionResult = {
  ok: boolean;
  error?: string;
};

const CATEGORIES = ["STUDENT", "PRIVATE", "OPERATIONAL"] as const;
const STUDENT_REQUIREMENTS = ["REQUIRED", "OPTIONAL", "FORBIDDEN"] as const;
const LOCATION_REQUIREMENTS = [
  "NONE",
  "OPTIONAL",
  "PICKUP",
  "DESTINATION",
  "PICKUP_AND_DESTINATION",
] as const;
const VEHICLE_REQUIREMENTS = ["NONE", "AUTO", "REQUIRED"] as const;
const STUDENT_VISIBILITIES = [
  "HIDDEN",
  "AFTER_CONFIRMATION",
  "PUBLISHED",
] as const;
const CALENDAR_TONES = [
  "BLUE",
  "VIOLET",
  "ROSE",
  "AMBER",
  "GREEN",
  "TEAL",
  "NEUTRAL",
  "SAND",
] as const;
const ICON_KEYS = [
  "car",
  "graduation",
  "flag",
  "clipboard",
  "coffee",
  "user",
  "calendar",
  "tools",
  "book",
] as const;
const STUDENT_SCOPES = [
  "OWN_ACTIVE",
  "OWN_AND_REPLACEMENT",
  "BRANCH_ACTIVE",
  "TENANT_ACTIVE",
] as const;
const VEHICLE_SELECTION_MODES = [
  "AUTO_DEFAULT",
  "AUTO_WITH_OVERRIDE",
  "ALWAYS_SELECT",
] as const;

function stringValue(formData: FormData, name: string, maxLength = 120) {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maxLength);
}

function integerValue(formData: FormData, name: string): number | null {
  const raw = stringValue(formData, name, 12);
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function booleanValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "true" || formData.get(name) === "on";
}

function enumValue<T extends string>(
  formData: FormData,
  name: string,
  values: readonly T[],
): T | null {
  const value = stringValue(formData, name, 80);
  return values.includes(value as T) ? (value as T) : null;
}

function parsePolicy(
  formData: FormData,
): { policy: AppointmentTypePolicy } | { error: string } {
  const code = stringValue(formData, "code", 80);
  if (!isInstructorPlanningType(code)) {
    return { error: "Kies een geldig afspraaktype." };
  }
  const label = stringValue(formData, "label", 80);
  const shortLabel = stringValue(formData, "short_label", 40);
  if (label.length < 2 || shortLabel.length < 2) {
    return {
      error: "Naam en korte naam moeten minimaal twee tekens bevatten.",
    };
  }

  const category = enumValue(formData, "category", CATEGORIES);
  const studentRequirement = enumValue(
    formData,
    "student_requirement",
    STUDENT_REQUIREMENTS,
  );
  const locationRequirement = enumValue(
    formData,
    "location_requirement",
    LOCATION_REQUIREMENTS,
  );
  const vehicleRequirement = enumValue(
    formData,
    "vehicle_requirement",
    VEHICLE_REQUIREMENTS,
  );
  const studentVisibility = enumValue(
    formData,
    "student_visibility",
    STUDENT_VISIBILITIES,
  );
  const calendarTone = enumValue(formData, "calendar_tone", CALENDAR_TONES);
  const iconKey = enumValue(formData, "icon_key", ICON_KEYS);
  if (
    !category ||
    !studentRequirement ||
    !locationRequirement ||
    !vehicleRequirement ||
    !studentVisibility ||
    !calendarTone ||
    !iconKey
  ) {
    return { error: "Een van de beleidskeuzes is ongeldig." };
  }
  if (category !== "STUDENT" && studentRequirement !== "FORBIDDEN") {
    return {
      error:
        "Alleen leerlingafspraken mogen een leerling vragen of verplichten.",
    };
  }
  if (category === "STUDENT" && studentRequirement === "FORBIDDEN") {
    return { error: "Een leerlingafspraak moet een leerling toestaan." };
  }

  const defaultDurationMinutes = integerValue(
    formData,
    "default_duration_minutes",
  );
  const minDurationMinutes = integerValue(formData, "min_duration_minutes");
  const maxDurationMinutes = integerValue(formData, "max_duration_minutes");
  const durationStepMinutes = integerValue(formData, "duration_step_minutes");
  const defaultBufferBeforeMinutes = integerValue(
    formData,
    "default_buffer_before_minutes",
  );
  const defaultBufferAfterMinutes = integerValue(
    formData,
    "default_buffer_after_minutes",
  );
  const minBufferBeforeMinutes = integerValue(
    formData,
    "min_buffer_before_minutes",
  );
  const minBufferAfterMinutes = integerValue(
    formData,
    "min_buffer_after_minutes",
  );
  const sortOrder = integerValue(formData, "sort_order");
  if (
    defaultDurationMinutes === null ||
    minDurationMinutes === null ||
    maxDurationMinutes === null ||
    durationStepMinutes === null ||
    defaultBufferBeforeMinutes === null ||
    defaultBufferAfterMinutes === null ||
    minBufferBeforeMinutes === null ||
    minBufferAfterMinutes === null ||
    sortOrder === null ||
    sortOrder > 1000
  ) {
    return { error: "Gebruik hele minuten en een geldige sorteervolgorde." };
  }
  if (
    minDurationMinutes < 5 ||
    maxDurationMinutes > 480 ||
    minDurationMinutes > defaultDurationMinutes ||
    defaultDurationMinutes > maxDurationMinutes
  ) {
    return {
      error:
        "De standaardduur moet tussen minimum en maximum (5–480 min) liggen.",
    };
  }
  if (
    durationStepMinutes < 5 ||
    durationStepMinutes > 120 ||
    (defaultDurationMinutes - minDurationMinutes) % durationStepMinutes !== 0
  ) {
    return {
      error: "De standaardduur moet op de ingestelde stapgrootte aansluiten.",
    };
  }
  if (
    defaultBufferBeforeMinutes > 240 ||
    defaultBufferAfterMinutes > 240 ||
    minBufferBeforeMinutes > defaultBufferBeforeMinutes ||
    minBufferAfterMinutes > defaultBufferAfterMinutes ||
    [
      defaultBufferBeforeMinutes,
      defaultBufferAfterMinutes,
      minBufferBeforeMinutes,
      minBufferAfterMinutes,
    ].some((minutes) => minutes % 10 !== 0)
  ) {
    return {
      error:
        "Buffers moeten in stappen van 10 minuten tussen 0 en 240 liggen; een minimum mag niet hoger zijn dan de standaard.",
    };
  }

  const studentForbidden = studentRequirement === "FORBIDDEN";
  const vehicleNone = vehicleRequirement === "NONE";
  return {
    policy: {
      code,
      version: 1,
      label,
      shortLabel,
      category: category as AppointmentCategory,
      studentRequirement: studentRequirement as StudentRequirement,
      defaultDurationMinutes,
      minDurationMinutes,
      maxDurationMinutes,
      durationStepMinutes,
      defaultBufferBeforeMinutes,
      defaultBufferAfterMinutes,
      minBufferBeforeMinutes,
      minBufferAfterMinutes,
      locationRequirement: locationRequirement as LocationRequirement,
      vehicleRequirement: vehicleRequirement as VehicleRequirement,
      routeValidationEnabled: booleanValue(
        formData,
        "route_validation_enabled",
      ),
      blocksInstructorAvailability: booleanValue(
        formData,
        "blocks_instructor_availability",
      ),
      blocksVehicleAvailability:
        !vehicleNone && booleanValue(formData, "blocks_vehicle_availability"),
      instructorCanOverrideDuration: booleanValue(
        formData,
        "instructor_can_override_duration",
      ),
      instructorCanOverrideBuffer: booleanValue(
        formData,
        "instructor_can_override_buffer",
      ),
      instructorCanOverrideLocation: booleanValue(
        formData,
        "instructor_can_override_location",
      ),
      instructorCanOverrideVehicle:
        !vehicleNone &&
        booleanValue(formData, "instructor_can_override_vehicle"),
      notifyStudentOnCreate:
        !studentForbidden && booleanValue(formData, "notify_student_on_create"),
      notifyStudentOnChange:
        !studentForbidden && booleanValue(formData, "notify_student_on_change"),
      studentVisibility: studentForbidden
        ? "HIDDEN"
        : (studentVisibility as StudentVisibility),
      calendarTone: calendarTone as AppointmentCalendarTone,
      iconKey,
      isActive: booleanValue(formData, "is_active"),
      sortOrder,
    },
  };
}

export async function saveAppointmentTypePolicy(
  formData: FormData,
): Promise<AppointmentPolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const parsed = parsePolicy(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const service = createServiceRoleClient();
  const serialized = serializePolicyForDatabase(parsed.policy);
  const { error } = await service.from("appointment_type_policies").upsert(
    {
      tenant_id: tenant.id,
      ...serialized,
    },
    { onConflict: "tenant_id,code" },
  );
  if (error) return { ok: false, error: error.message };

  const { error: auditError } = await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "planning.appointment_type_policy_updated",
    target_type: "appointment_type_policy",
    target_id: parsed.policy.code,
    payload: serialized,
  });
  if (auditError) {
    return {
      ok: false,
      error: "Het beleid is opgeslagen, maar de auditregistratie is mislukt.",
    };
  }

  revalidatePath("/backoffice/instellingen/planning/afspraaktypen");
  revalidatePath("/instructeur/agenda");
  revalidatePath("/instructeur/instellingen/planningvoorkeuren");
  return { ok: true };
}

export async function saveAppointmentWizardSettings(
  formData: FormData,
): Promise<AppointmentPolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentScope = enumValue(formData, "student_scope", STUDENT_SCOPES);
  const vehicleSelectionMode = enumValue(
    formData,
    "vehicle_selection_mode",
    VEHICLE_SELECTION_MODES,
  );
  if (!studentScope || !vehicleSelectionMode) {
    return { ok: false, error: "Kies geldige wizardinstellingen." };
  }
  const settings = {
    student_scope: studentScope as StudentSelectionScope,
    allow_student_home_as_pickup: booleanValue(
      formData,
      "allow_student_home_as_pickup",
    ),
    allow_default_pickup_update: booleanValue(
      formData,
      "allow_default_pickup_update",
    ),
    vehicle_required: booleanValue(formData, "vehicle_required"),
    vehicle_selection_mode: vehicleSelectionMode as VehicleSelectionMode,
    instructor_may_override_vehicle: booleanValue(
      formData,
      "instructor_may_override_vehicle",
    ),
    validate_vehicle_availability: booleanValue(
      formData,
      "validate_vehicle_availability",
    ),
    route_override_requires_reason: booleanValue(
      formData,
      "route_override_requires_reason",
    ),
  };

  const service = createServiceRoleClient();
  const { error } = await service
    .from("appointment_wizard_settings")
    .upsert({ tenant_id: tenant.id, ...settings }, { onConflict: "tenant_id" });
  if (error) return { ok: false, error: error.message };

  const { error: auditError } = await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "planning.appointment_wizard_settings_updated",
    target_type: "appointment_wizard_settings",
    target_id: tenant.id,
    payload: settings,
  });
  if (auditError) {
    return {
      ok: false,
      error:
        "De instellingen zijn opgeslagen, maar de auditregistratie is mislukt.",
    };
  }

  revalidatePath("/backoffice/instellingen/planning/afspraaktypen");
  revalidatePath("/instructeur/agenda");
  return { ok: true };
}
