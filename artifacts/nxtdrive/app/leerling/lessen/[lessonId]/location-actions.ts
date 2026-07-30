"use server";

import { revalidatePath } from "next/cache";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { createServiceRoleClient } from "@/lib/supabase/service";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function confirmLessonLocation(formData: FormData) {
  const lessonId = text(formData.get("lesson_id"));
  const appointmentStopId = text(formData.get("appointment_stop_id"));
  if (!UUID.test(lessonId) || !UUID.test(appointmentStopId)) {
    throw new Error("Ongeldige leslocatie.");
  }
  const { user, tenant, student } = await getStudentPwaContext();
  if (!student) throw new Error("Geen actief leerlingprofiel.");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("confirm_student_appointment_stop", {
    p_tenant_id: tenant.id,
    p_student_id: student.id,
    p_appointment_stop_id: appointmentStopId,
    p_actor: user.id,
    p_entry_mode: "STUDENT",
  });
  if (error) throw new Error("De ophaallocatie kon niet worden bevestigd.");
  revalidatePath(`/leerling/lessen/${lessonId}`);
}

export async function proposeLessonLocation(formData: FormData) {
  const lessonId = text(formData.get("lesson_id"));
  const appointmentStopId = text(formData.get("appointment_stop_id"));
  const [locationRecordId = "", locationVersionId = ""] = text(
    formData.get("location"),
  ).split(":");
  const explanation = text(formData.get("explanation"));
  if (
    !UUID.test(lessonId) ||
    !UUID.test(appointmentStopId) ||
    !UUID.test(locationRecordId) ||
    !UUID.test(locationVersionId) ||
    explanation.length < 5 ||
    explanation.length > 500
  ) {
    throw new Error("Controleer de gekozen locatie en toelichting.");
  }
  const { user, tenant, student } = await getStudentPwaContext();
  if (!student) throw new Error("Geen actief leerlingprofiel.");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("propose_appointment_location_change", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: student.id,
    p_appointment_stop_id: appointmentStopId,
    p_location_record_id: locationRecordId,
    p_location_version_id: locationVersionId,
    p_explanation: explanation,
  });
  if (error) throw new Error("Het locatievoorstel kon niet worden opgeslagen.");
  revalidatePath(`/leerling/lessen/${lessonId}`);
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
