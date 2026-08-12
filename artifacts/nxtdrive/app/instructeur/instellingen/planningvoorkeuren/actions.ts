"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadAppointmentTypePolicies } from "@/domains/planning/application/appointment-policy-service";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isInstructorPlanningType } from "@/lib/agenda/types";

export type InstructorPreferenceActionResult = {
  ok: boolean;
  error?: string;
};

function optionalInteger(
  formData: FormData,
  name: string,
  min: number,
  max: number,
): number | null | "INVALID" {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return "INVALID";
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : "INVALID";
}

export async function saveInstructorAppointmentPreference(
  formData: FormData,
): Promise<InstructorPreferenceActionResult> {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const code = String(formData.get("code") ?? "").trim();
  if (!isInstructorPlanningType(code)) {
    return { ok: false, error: "Kies een geldig afspraaktype." };
  }
  const durationMinutes = optionalInteger(formData, "duration_minutes", 5, 480);
  const bufferBeforeMinutes = optionalInteger(
    formData,
    "buffer_before_minutes",
    0,
    240,
  );
  const bufferAfterMinutes = optionalInteger(
    formData,
    "buffer_after_minutes",
    0,
    240,
  );
  if (
    durationMinutes === "INVALID" ||
    bufferBeforeMinutes === "INVALID" ||
    bufferAfterMinutes === "INVALID"
  ) {
    return { ok: false, error: "Gebruik geldige hele minuten." };
  }

  const service = createServiceRoleClient();
  const policies = await loadAppointmentTypePolicies(service, tenant.id);
  const policy = policies.find((item) => item.code === code);
  if (!policy || !policy.isActive) {
    return { ok: false, error: "Dit afspraaktype is niet actief." };
  }
  if (durationMinutes !== null) {
    if (!policy.instructorCanOverrideDuration) {
      return {
        ok: false,
        error: "De rijschool heeft de duur voor dit afspraaktype vergrendeld.",
      };
    }
    if (
      durationMinutes < policy.minDurationMinutes ||
      durationMinutes > policy.maxDurationMinutes ||
      (durationMinutes - policy.minDurationMinutes) %
        policy.durationStepMinutes !==
        0
    ) {
      return {
        ok: false,
        error: `Kies een duur tussen ${policy.minDurationMinutes} en ${policy.maxDurationMinutes} minuten in stappen van ${policy.durationStepMinutes}.`,
      };
    }
  }
  if (
    (bufferBeforeMinutes !== null || bufferAfterMinutes !== null) &&
    !policy.instructorCanOverrideBuffer
  ) {
    return {
      ok: false,
      error: "De rijschool heeft de buffers voor dit afspraaktype vergrendeld.",
    };
  }
  if (
    bufferBeforeMinutes !== null &&
    bufferBeforeMinutes < policy.minBufferBeforeMinutes
  ) {
    return {
      ok: false,
      error: `De buffer voor moet minimaal ${policy.minBufferBeforeMinutes} minuten zijn.`,
    };
  }
  if (
    bufferAfterMinutes !== null &&
    bufferAfterMinutes < policy.minBufferAfterMinutes
  ) {
    return {
      ok: false,
      error: `De buffer na moet minimaal ${policy.minBufferAfterMinutes} minuten zijn.`,
    };
  }

  const usesTenantDefaults =
    durationMinutes === null &&
    bufferBeforeMinutes === null &&
    bufferAfterMinutes === null;
  const mutation = usesTenantDefaults
    ? service
        .from("instructor_appointment_preferences")
        .delete()
        .eq("tenant_id", tenant.id)
        .eq("instructor_id", user.id)
        .eq("appointment_type_code", code)
    : service.from("instructor_appointment_preferences").upsert(
        {
          tenant_id: tenant.id,
          instructor_id: user.id,
          appointment_type_code: code,
          duration_minutes: durationMinutes,
          buffer_before_minutes: bufferBeforeMinutes,
          buffer_after_minutes: bufferAfterMinutes,
          preferred_vehicle_id: null,
        },
        {
          onConflict: "tenant_id,instructor_id,appointment_type_code",
        },
      );
  const { error } = await mutation;
  if (error) return { ok: false, error: error.message };

  const { error: auditError } = await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: usesTenantDefaults
      ? "planning.instructor_preference_reset"
      : "planning.instructor_preference_updated",
    target_type: "instructor_appointment_preference",
    target_id: user.id,
    payload: {
      appointment_type_code: code,
      duration_minutes: durationMinutes,
      buffer_before_minutes: bufferBeforeMinutes,
      buffer_after_minutes: bufferAfterMinutes,
    },
  });
  if (auditError) {
    return {
      ok: false,
      error: "De voorkeur is opgeslagen, maar de auditregistratie is mislukt.",
    };
  }

  revalidatePath("/instructeur/instellingen/planningvoorkeuren");
  revalidatePath("/instructeur/agenda");
  return { ok: true };
}
