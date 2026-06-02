"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
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
// RPCs as service_role; non-admin actors are always pinned to their own
// instructor_id so an instructor can only manage their own time.

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
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);

  const type = parseType(formData.get("type"));
  if (!type) redirect(`${errorTo}?error=type`);

  const instructorId = isAdmin
    ? String(formData.get("instructor_id") ?? "")
    : user.id;
  const studentIdRaw = String(formData.get("student_id") ?? "").trim();
  const studentId = isStudentLinkedType(type!) && studentIdRaw
    ? studentIdRaw
    : null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);

  if (!instructorId || !date || !time) redirect(`${errorTo}?error=missing`);
  if (!Number.isFinite(duration) || duration < 5) {
    redirect(`${errorTo}?error=duration`);
  }
  const startsAt = new Date(`${date}T${time}:00`);
  if (isNaN(startsAt.getTime())) redirect(`${errorTo}?error=date`);

  const service = createServiceRoleClient();
  const { data: newId, error } = await service.rpc("create_agenda_appointment", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
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

  // White-label-bewuste "examen ingepland"-mail naar de leerling. Idempotent
  // per afspraak (dedupe op appointment id) en faalt nooit de planactie:
  // degradeert stil naar 'skipped' zonder mailprovider of leerling-e-mail.
  if (studentId && (type === "exam" || type === "interim_test") && newId) {
    await maybeNotifyExamPlanned(service, tenant.id, String(newId));
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(redirectTo);
}

// Fire-and-forget wrapper: een mislukte notificatie mag de planning nooit
// blokkeren. De dispatch zelf is al idempotent en degradeert naar 'skipped'.
async function maybeNotifyExamPlanned(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  appointmentId: string,
) {
  try {
    const { notifyExamPlanned } = await import("@/lib/notifications/dispatch");
    await notifyExamPlanned(service, tenantId, appointmentId);
  } catch {
    // Bewust ingeslikt: notificaties zijn best-effort, planning is leidend.
  }
}

// Fire-and-forget wrapper voor de uitslag-mail (geslaagd/gezakt). Idempotent en
// degradeert naar 'skipped'; een mislukte mail mag het vastleggen van de uitslag
// nooit blokkeren.
async function maybeNotifyExamResult(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  appointmentId: string,
) {
  try {
    const { notifyExamResult } = await import("@/lib/notifications/dispatch");
    await notifyExamResult(service, tenantId, appointmentId);
  } catch {
    // Bewust ingeslikt: notificaties zijn best-effort, de uitslag is leidend.
  }
}

export async function updateAppointment(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  const errorTo = safeRedirect(formData.get("error_to"), redirectTo);
  if (!appointmentId) redirect(redirectTo);

  const type = parseType(formData.get("type"));
  const studentIdRaw = String(formData.get("student_id") ?? "").trim();
  const studentId = type && isStudentLinkedType(type) && studentIdRaw
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

  // Non-admins may only edit their own appointments.
  const service = createServiceRoleClient();
  if (!isAdmin) {
    const { data: row } = await service
      .from("agenda_appointments")
      .select("instructor_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!row || row.instructor_id !== user.id) {
      redirect(`${errorTo}?error=forbidden`);
    }
  }

  const { error } = await service.rpc("update_agenda_appointment", {
    p_appointment_id: appointmentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
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

  // Idempotent per afspraak: een latere wijziging her-zendt nooit (zelfde
  // dedupe key). Stuurt alleen alsnog als planning→examen met leerling pas
  // bij deze edit compleet werd.
  if (studentId && (type === "exam" || type === "interim_test")) {
    await maybeNotifyExamPlanned(service, tenant.id, appointmentId);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(redirectTo);
}

export async function deleteAppointment(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const appointmentId = String(formData.get("appointment_id") ?? "");
  const redirectTo = safeRedirect(
    formData.get("redirect_to"),
    "/backoffice/agenda",
  );
  if (!appointmentId) redirect(redirectTo);

  const service = createServiceRoleClient();
  if (!isAdmin) {
    const { data: row } = await service
      .from("agenda_appointments")
      .select("instructor_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!row || row.instructor_id !== user.id) {
      redirect(`${redirectTo}?error=forbidden`);
    }
  }

  const { error } = await service.rpc("delete_agenda_appointment", {
    p_appointment_id: appointmentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
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

// Legt de uitslag (geslaagd/gezakt) van een examen of tussentijdse toets vast.
// Server-side only via de SECURITY DEFINER RPC; non-admins worden — net als de
// overige agenda-mutaties — gecontroleerd tegen hun eigen instructor_id.
export async function setAppointmentResult(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

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
  if (!isAdmin) {
    const { data: row } = await service
      .from("agenda_appointments")
      .select("instructor_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!row || row.instructor_id !== user.id) {
      redirect(`${errorTo}?error=forbidden`);
    }
  }

  const { error } = await service.rpc("set_appointment_result", {
    p_appointment_id: appointmentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_result: result,
    p_note: note || null,
  });
  if (error) {
    redirect(`${errorTo}?error=${encodeURIComponent(error.message)}`);
  }

  // Examenflow C: stuur de uitslag-mail (geslaagd/gezakt). Idempotent per
  // (afspraak, uitslag) en best-effort — een mislukte mail blokkeert niets.
  await maybeNotifyExamResult(service, tenant.id, appointmentId);

  revalidatePath("/backoffice/agenda");
  revalidatePath("/backoffice/cbr");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  revalidatePath("/student", "layout");
  redirect(redirectTo);
}

// Legt de examenvoorbereiding (ophaaltijd/-locatie, afvinkbare documentenlijst,
// aandachtspunten) van een examen of tussentijdse toets vast. Server-side only
// via de SECURITY DEFINER RPC; non-admins worden gecontroleerd tegen hun eigen
// instructor_id, net als de overige agenda-mutaties.
export async function setExamAppointmentDetails(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

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

  // Afvinkbare documentenlijst komt als JSON-string binnen; valideer naar een
  // schone {code,label,checked}[] zodat een malformede waarde nooit doorlekt.
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
  if (!isAdmin) {
    const { data: row } = await service
      .from("agenda_appointments")
      .select("instructor_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!row || row.instructor_id !== user.id) {
      redirect(`${errorTo}?error=forbidden`);
    }
  }

  const { error } = await service.rpc("set_exam_appointment_details", {
    p_appointment_id: appointmentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
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
