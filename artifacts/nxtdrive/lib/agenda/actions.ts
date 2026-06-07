"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  AGENDA_BACKOFFICE_MANAGE_ROLES,
  canManageAgendaForInstructor,
  requireAgendaAccessContext,
  requireAgendaAppointmentAccess,
} from "@/lib/agenda/access";
import { rolesGrantPermission } from "@/lib/permissions";
import { requireStudentBackofficeAccess } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  AGENDA_APPOINTMENT_TYPES,
  AGENDA_APPOINTMENT_RESULTS,
  isStudentLinkedType,
  type AgendaAppointmentType,
  type AgendaAppointmentResult,
} from "@/lib/agenda/types";

// Shared agenda-appointment server actions, used by both the backoffice agenda
// and the instructor PWA. Writes go exclusively through the SECURITY DEFINER
// RPCs as service_role; every write first resolves explicit agenda/student
// access so service_role never becomes the authorization boundary.

function parseType(raw: FormDataEntryValue | null): AgendaAppointmentType | null {
  const v = String(raw ?? "");
  return (AGENDA_APPOINTMENT_TYPES as readonly string[]).includes(v)
    ? (v as AgendaAppointmentType)
    : null;
}

function safeRedirect(raw: FormDataEntryValue | null, fallback: string): string {
  const v = String(raw ?? "").trim();
  // Only allow internal absolute paths to avoid open-redirects.
  return v.startsWith("/") ? v : fallback;
}

export async function createAppointment(formData: FormData) {
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);

  const type = parseType(formData.get("type"));
  if (!type) redirect(`${errorTo}?error=type`);

  const requestedInstructorId = String(formData.get("instructor_id") ?? "").trim();
  const studentIdRaw = String(formData.get("student_id") ?? "").trim();
  const studentId = isStudentLinkedType(type) && studentIdRaw
    ? studentIdRaw
    : null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);

  if (!date || !time) redirect(`${errorTo}?error=missing`);
  if (!Number.isFinite(duration) || duration < 5) {
    redirect(`${errorTo}?error=duration`);
  }
  const startsAt = new Date(`${date}T${time}:00`);
  if (isNaN(startsAt.getTime())) redirect(`${errorTo}?error=date`);

  const service = createServiceRoleClient();
  const access = studentId
    ? await requireStudentBackofficeAccess(service, studentId, "read", {
        allowedRoles: [...AGENDA_BACKOFFICE_MANAGE_ROLES],
      })
    : await requireAgendaAccessContext(service, AGENDA_BACKOFFICE_MANAGE_ROLES);
  if ("student" in access && !access.student) {
    redirect(`${errorTo}?error=forbidden`);
  }

  const { context } = access;
  const canAssignInstructor =
    context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "planning:manage");
  const instructorId = canAssignInstructor
    ? requestedInstructorId
    : context.user.id;
  if (!instructorId) redirect(`${errorTo}?error=missing`);
  if (!canManageAgendaForInstructor(context, instructorId)) {
    redirect(`${errorTo}?error=forbidden`);
  }

  const tenantLevelManage =
    context.user.profile?.is_platform_admin ||
    context.roles.includes("tenant_admin") ||
    context.roles.includes("franchise_admin");
  const instructorOwnBlock =
    context.roles.includes("instructor") && instructorId === context.user.id;
  if (!studentId && !tenantLevelManage && !instructorOwnBlock) {
    redirect(`${errorTo}?error=forbidden`);
  }

  const { data: newId, error } = await service.rpc("create_agenda_appointment", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_instructor_id: instructorId,
    p_type: type,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_student_id: studentId,
    p_title: title || null,
    p_location: location || null,
    p_notes: notes || null,
  });
  if (error) {
    redirect(`${errorTo}?error=${encodeURIComponent(error.message)}`);
  }

  // White-label-aware "exam scheduled" mail to the student. Idempotent per
  // appointment and best-effort; mail failures must never block planning.
  if (studentId && (type === "exam" || type === "interim_test") && newId) {
    await maybeNotifyExamPlanned(service, context.organization.id, String(newId));
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(redirectTo);
}

// Fire-and-forget wrapper: a notification failure must never block planning.
// The dispatch itself is already idempotent and degrades to 'skipped'.
async function maybeNotifyExamPlanned(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  appointmentId: string,
) {
  try {
    const { notifyExamPlanned } = await import("@/lib/notifications/dispatch");
    await notifyExamPlanned(service, tenantId, appointmentId);
  } catch {
    // Intentional no-op: notifications are best-effort, planning is leading.
  }
}

// Fire-and-forget wrapper for the result mail (passed/failed). Idempotent and
// best-effort; a mail failure must never block storing the result.
async function maybeNotifyExamResult(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  appointmentId: string,
) {
  try {
    const { notifyExamResult, maybeFireExamPassedReview } = await import(
      "@/lib/notifications/dispatch"
    );
    await notifyExamResult(service, tenantId, appointmentId);
    // Task #113 - review request after a passed driving exam. Idempotent per
    // appointment; no-op for failed/TTT or when disabled.
    await maybeFireExamPassedReview(service, tenantId, appointmentId);
  } catch {
    // Intentional no-op: notifications are best-effort, the result is leading.
  }
}

export async function updateAppointment(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);
  if (!appointmentId) redirect(redirectTo);

  const type = parseType(formData.get("type"));
  if (!type) redirect(`${errorTo}?error=type`);
  const studentIdRaw = String(formData.get("student_id") ?? "").trim();
  const studentId = isStudentLinkedType(type) && studentIdRaw
    ? studentIdRaw
    : null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);

  if (!date || !time) redirect(`${errorTo}?error=missing`);
  if (!Number.isFinite(duration) || duration < 5) {
    redirect(`${errorTo}?error=duration`);
  }
  const startsAt = new Date(`${date}T${time}:00`);
  if (isNaN(startsAt.getTime())) redirect(`${errorTo}?error=date`);

  const service = createServiceRoleClient();
  const appointmentAccess = await requireAgendaAppointmentAccess(
    service,
    appointmentId,
    "manage",
  );
  if (!appointmentAccess.appointment) {
    redirect(`${errorTo}?error=forbidden`);
  }
  const { context } = appointmentAccess;

  if (studentId) {
    const studentAccess = await requireStudentBackofficeAccess(
      service,
      studentId,
      "read",
      { allowedRoles: [...AGENDA_BACKOFFICE_MANAGE_ROLES] },
    );
    if (!studentAccess.student) redirect(`${errorTo}?error=forbidden`);
  }

  const { error } = await service.rpc("update_agenda_appointment", {
    p_appointment_id: appointmentId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_student_id: studentId,
    p_title: title || null,
    p_location: location || null,
    p_notes: notes || null,
  });
  if (error) {
    redirect(`${errorTo}?error=${encodeURIComponent(error.message)}`);
  }

  // Idempotent per appointment: later edits never re-send with the same dedupe
  // key, but an appointment made complete by this edit can still notify once.
  if (studentId && (type === "exam" || type === "interim_test")) {
    await maybeNotifyExamPlanned(service, context.organization.id, appointmentId);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(redirectTo);
}

export async function deleteAppointment(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  if (!appointmentId) redirect(redirectTo);

  const service = createServiceRoleClient();
  const { context, appointment } = await requireAgendaAppointmentAccess(
    service,
    appointmentId,
    "manage",
  );
  if (!appointment) redirect(`${redirectTo}?error=forbidden`);

  const { error } = await service.rpc("delete_agenda_appointment", {
    p_appointment_id: appointmentId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) {
    redirect(`${redirectTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  redirect(redirectTo);
}

function parseResult(
  raw: FormDataEntryValue | null,
): AgendaAppointmentResult | null {
  const v = String(raw ?? "");
  return (AGENDA_APPOINTMENT_RESULTS as readonly string[]).includes(v)
    ? (v as AgendaAppointmentResult)
    : null;
}

// Stores the result (passed/failed) for an exam or interim test. Server-side
// only via the SECURITY DEFINER RPC after scoped agenda access has been checked.
export async function setAppointmentResult(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);
  if (!appointmentId) redirect(redirectTo);

  const result = parseResult(formData.get("result"));
  if (!result) redirect(`${errorTo}?error=result`);
  const note = String(formData.get("result_note") ?? "").trim().slice(0, 1000);

  const service = createServiceRoleClient();
  const { context, appointment } = await requireAgendaAppointmentAccess(
    service,
    appointmentId,
    "manage",
  );
  if (!appointment) redirect(`${errorTo}?error=forbidden`);

  const { error } = await service.rpc("set_appointment_result", {
    p_appointment_id: appointmentId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_result: result,
    p_note: note || null,
  });
  if (error) {
    redirect(`${errorTo}?error=${encodeURIComponent(error.message)}`);
  }

  // Examenflow C: send the result mail (passed/failed). Idempotent per
  // (appointment, result) and best-effort - a mail failure blocks nothing.
  await maybeNotifyExamResult(service, context.organization.id, appointmentId);

  revalidatePath("/backoffice/agenda");
  revalidatePath("/backoffice/cbr");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  revalidatePath("/student", "layout");
  redirect(redirectTo);
}

// Stores exam-day preparation details for an exam or interim test. Server-side
// only via the SECURITY DEFINER RPC after scoped agenda access has been checked.
export async function setExamAppointmentDetails(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);
  if (!appointmentId) redirect(redirectTo);

  const pickupRaw = String(formData.get("pickup_at") ?? "").trim();
  const pickupAt = pickupRaw ? new Date(pickupRaw) : null;
  if (pickupAt && Number.isNaN(pickupAt.getTime())) {
    redirect(`${errorTo}?error=pickup_at`);
  }
  const pickupLocation = String(formData.get("pickup_location") ?? "")
    .trim()
    .slice(0, 500);
  const examDayNotes = String(formData.get("exam_day_notes") ?? "")
    .trim()
    .slice(0, 2000);

  // The document checklist comes in as JSON; validate into a clean array so a
  // malformed payload never leaks into the RPC.
  const documents: { code: string; label: string; checked: boolean }[] = [];
  const docsRaw = formData.get("required_documents");
  if (typeof docsRaw === "string" && docsRaw.trim()) {
    try {
      const parsed: unknown = JSON.parse(docsRaw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const r = item as Record<string, unknown>;
          const code = typeof r.code === "string" ? r.code.trim().slice(0, 60) : "";
          const label =
            typeof r.label === "string" ? r.label.trim().slice(0, 200) : "";
          if (!code || !label) continue;
          documents.push({ code, label, checked: r.checked === true });
        }
      }
    } catch {
      redirect(`${errorTo}?error=documents`);
    }
  }

  const service = createServiceRoleClient();
  const { context, appointment } = await requireAgendaAppointmentAccess(
    service,
    appointmentId,
    "manage",
  );
  if (!appointment) redirect(`${errorTo}?error=forbidden`);

  const { error } = await service.rpc("set_exam_appointment_details", {
    p_appointment_id: appointmentId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_pickup_at: pickupAt ? pickupAt.toISOString() : null,
    p_pickup_location: pickupLocation || null,
    p_required_documents: documents,
    p_exam_day_notes: examDayNotes || null,
  });
  if (error) {
    redirect(`${errorTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/backoffice/cbr");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  revalidatePath("/student", "layout");
  redirect(redirectTo);
}
