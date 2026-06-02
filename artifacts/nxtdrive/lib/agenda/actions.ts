"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  AGENDA_APPOINTMENT_TYPES,
  isStudentLinkedType,
  type AgendaAppointmentType,
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
  const { error } = await service.rpc("create_agenda_appointment", {
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

  revalidatePath("/backoffice/agenda");
  revalidatePath("/instructor/week");
  revalidatePath("/instructor");
  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(redirectTo);
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
