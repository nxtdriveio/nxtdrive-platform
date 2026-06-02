"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadRefillPolicy } from "@/lib/lesson-refill/policy";
import { notifyLessonRefillInvitation } from "@/lib/notifications/dispatch";

export async function scheduleLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const instructorId = String(formData.get("instructor_id") ?? "");
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

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}
