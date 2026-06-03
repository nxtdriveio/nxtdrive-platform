"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadRefillPolicy } from "@/lib/lesson-refill/policy";
import { loadExamInvitationPolicy } from "@/lib/exam-invitations/policy";
import {
  notifyLessonRefillInvitation,
  notifyExamInvitation,
  notifyLessonCancelled,
  notifyParentsLessonScheduled,
} from "@/lib/notifications/dispatch";

export async function scheduleLesson(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  // Admins may schedule for any instructor; a plain instructor is always pinned
  // to themselves, regardless of what the form submitted.
  const instructorId = isAdmin
    ? String(formData.get("instructor_id") ?? "")
    : user.id;
  const studentId = String(formData.get("student_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);

  // Fase 3 — optional precise location coordinates (graceful: null without Places).
  const parseCoord = (raw: FormDataEntryValue | null, max: number) => {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= -max && n <= max ? n : null;
  };
  const locationLat = parseCoord(formData.get("location_lat"), 90);
  const locationLng = parseCoord(formData.get("location_lng"), 180);
  const hasCoords = locationLat !== null && locationLng !== null;
  const locationPlaceId = hasCoords
    ? String(formData.get("location_place_id") ?? "").trim().slice(0, 300) || null
    : null;

  if (!instructorId || !studentId || !date || !time) {
    redirect("/backoffice/agenda/nieuw?error=missing");
  }
  if (!Number.isFinite(duration) || duration < 15) {
    redirect("/backoffice/agenda/nieuw?error=duration");
  }

  // Combine local datetime as ISO string. Browser submits date as YYYY-MM-DD
  // and time as HH:mm; we keep it in the server's TZ which is UTC. For demo
  // purposes this is acceptable; later we'll attach a tenant TZ.
  const startsAt = new Date(`${date}T${time}:00`);
  if (isNaN(startsAt.getTime())) {
    redirect("/backoffice/agenda/nieuw?error=date");
  }

  const service = createServiceRoleClient();
  const { data: lessonId, error } = await service.rpc("schedule_lesson", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
    p_student_id: studentId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_location: location || null,
    p_notes: notes || null,
    p_location_lat: locationLat,
    p_location_lng: locationLng,
    p_location_place_id: locationPlaceId,
  });
  if (error || !lessonId) {
    const code = encodeURIComponent(error?.message ?? "unknown");
    redirect(`/backoffice/agenda/nieuw?error=${code}`);
  }

  // Task #131 — meld de gekoppelde voogd(en) dat er een rijles voor hun kind is
  // ingepland. Best-effort + idempotent per (les, voogd); respecteert de per-
  // school zichtbaarheid van de 'planning'-sectie in het ouderportaal. Een
  // mislukte melding mag de planning nooit blokkeren.
  try {
    await notifyParentsLessonScheduled(service, tenant.id, lessonId as string);
  } catch (err) {
    console.error("[agenda] notifyParentsLessonScheduled failed", err);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(`/backoffice/agenda/${lessonId as string}`);
}

export async function completeLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "");
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("complete_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=complete`);

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}

export type RefillActionResult = { ok: boolean; error?: string };

/**
 * Invite a single opted-in student to a freed slot (wachtlijst). Staff-only.
 * Loads the tenant's refill policy and forwards enabled / validity / max-
 * concurrent to the locked create RPC, which re-validates the slot is free,
 * enforces the rules and prevents duplicate pendings. On success the student is
 * notified by email (degrades gracefully). Nothing is booked here — the student
 * confirms in their PWA.
 */
export async function inviteStudentToSlot(
  formData: FormData,
): Promise<RefillActionResult> {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);

  const studentId = String(formData.get("student_id") ?? "").trim();
  const instructorId = String(formData.get("instructor_id") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const duration = parseInt(String(formData.get("duration_min") ?? "0"), 10);
  const sourceLessonId =
    String(formData.get("source_lesson_id") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const scoreRaw = parseInt(String(formData.get("score") ?? "0"), 10);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

  if (!studentId || !instructorId || !startsAt) {
    return { ok: false, error: "Ontbrekende gegevens voor de uitnodiging." };
  }
  if (!Number.isFinite(duration) || duration < 15) {
    return { ok: false, error: "Ongeldige lesduur." };
  }
  const startsDate = new Date(startsAt);
  if (Number.isNaN(startsDate.getTime())) {
    return { ok: false, error: "Ongeldig tijdstip." };
  }

  const service = createServiceRoleClient();
  const policy = await loadRefillPolicy(service, tenant.id);
  if (!policy.enabled) {
    return {
      ok: false,
      error: "Herbezet-uitnodigingen staan uit in de instellingen.",
    };
  }

  const { data: invitationId, error } = await service.rpc(
    "create_lesson_refill_invitation",
    {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_student_id: studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsDate.toISOString(),
      p_duration_min: duration,
      p_enabled: policy.enabled,
      p_valid_minutes: policy.valid_minutes,
      p_max_candidates: policy.max_candidates,
      p_location: location || null,
      p_source_lesson_id: sourceLessonId,
      p_score: score,
      p_reason: reason || null,
    },
  );
  if (error || !invitationId) {
    return { ok: false, error: error?.message ?? "Uitnodigen mislukt." };
  }

  await notifyLessonRefillInvitation(
    service,
    tenant.id,
    invitationId as string,
  );

  revalidatePath("/backoffice/agenda");
  if (sourceLessonId) revalidatePath(`/backoffice/agenda/${sourceLessonId}`);
  return { ok: true };
}

/**
 * Cancel an open refill invitation (staff-only). The locked cancel RPC marks it
 * cancelled and writes the audit row, freeing the slot to be offered again.
 */
export async function cancelRefillInvitation(
  formData: FormData,
): Promise<RefillActionResult> {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const sourceLessonId =
    String(formData.get("source_lesson_id") ?? "").trim() || null;
  if (!invitationId) return { ok: false, error: "Uitnodiging ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("cancel_lesson_refill_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/agenda");
  if (sourceLessonId) revalidatePath(`/backoffice/agenda/${sourceLessonId}`);
  return { ok: true };
}

/**
 * Invite a single suitable student to an open exam moment (Task #102). Loads the
 * tenant's exam-invitation policy and forwards enabled / validity / max-
 * concurrent to the locked create RPC, which re-validates the moment is still
 * open, enforces the rules and prevents duplicate invitations. On success the
 * student is notified by email (degrades gracefully). Nothing is booked here —
 * the student confirms in their PWA, and an exam never consumes credit.
 */
export async function inviteExamCandidate(
  formData: FormData,
): Promise<RefillActionResult> {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);

  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const scoreRaw = parseInt(String(formData.get("score") ?? "0"), 10);
  const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;

  if (!appointmentId || !studentId) {
    return { ok: false, error: "Ontbrekende gegevens voor de uitnodiging." };
  }

  const service = createServiceRoleClient();
  const policy = await loadExamInvitationPolicy(service, tenant.id);
  if (!policy.enabled) {
    return {
      ok: false,
      error: "Examenuitnodigingen staan uit in de instellingen.",
    };
  }

  const { data: invitationId, error } = await service.rpc(
    "create_exam_invitation",
    {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_appointment_id: appointmentId,
      p_student_id: studentId,
      p_enabled: policy.enabled,
      p_valid_minutes: policy.valid_minutes,
      p_max_candidates: policy.max_candidates,
      p_score: score,
      p_reason: reason || null,
    },
  );
  if (error || !invitationId) {
    return { ok: false, error: error?.message ?? "Uitnodigen mislukt." };
  }

  await notifyExamInvitation(service, tenant.id, invitationId as string);

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/afspraak/${appointmentId}`);
  return { ok: true };
}

/**
 * Cancel an open exam invitation (staff-only). The locked cancel RPC marks it
 * cancelled and writes the audit row.
 */
export async function cancelExamInvitation(
  formData: FormData,
): Promise<RefillActionResult> {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const appointmentId = String(formData.get("appointment_id") ?? "").trim();
  if (!invitationId) return { ok: false, error: "Uitnodiging ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("cancel_exam_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/agenda");
  if (appointmentId) {
    revalidatePath(`/backoffice/agenda/afspraak/${appointmentId}`);
  }
  return { ok: true };
}

export async function cancelLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason || null,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=cancel`);

  // Task #107 — meld de leerling dat de les is geannuleerd (incl. wel/geen
  // tegoedrestitutie). Best-effort + idempotent; een fout hier mag de annulering
  // nooit laten mislukken en moet vóór de redirect() (die throwt) draaien.
  try {
    await notifyLessonCancelled(service, tenant.id, lessonId);
  } catch (e) {
    console.error("[agenda] notifyLessonCancelled failed", e);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}
