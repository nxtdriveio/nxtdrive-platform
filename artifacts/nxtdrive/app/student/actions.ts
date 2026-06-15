"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadCancellationPolicy,
  DEFAULT_CANCELLATION_POLICY,
} from "@/lib/lessons/cancellation-policy";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
} from "@/lib/planning-core";
import type { Lesson } from "@/lib/lessons/types";

/**
 * Lets a student (or guardian) cancel their OWN planned, future lesson. The
 * staff `cancel_lesson` RPC only authorizes staff/platform-admin, so a separate
 * `student_cancel_lesson` RPC (migration 0077) re-validates ownership against
 * the acting user, enforces the tenant's `min_notice_hours`, applies the
 * configurable refund tier and writes the ledger + audit rows. This action
 * re-checks ownership/status and the notice window in app-code for a friendly
 * message, then forwards the actor; the RPC remains the source of truth.
 */
export async function cancelLesson(
  formData: FormData,
): Promise<{ error?: string; refundedCredits?: number }> {
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!lessonId) return { error: "lesson_id ontbreekt" };

  const { getActiveStudent } = await import("@/lib/students/access");
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student) return { error: "Geen toegang tot dit leerlingdossier." };

  const service = createServiceRoleClient();
  const { data: lessonRaw, error: loadErr } = await service
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (loadErr) return { error: loadErr.message };
  const lesson = lessonRaw as Lesson | null;
  if (!lesson) return { error: "Les niet gevonden." };
  if (lesson.status !== "planned") {
    return { error: "Deze les kan niet meer geannuleerd worden." };
  }

  const startsAt = new Date(lesson.starts_at).getTime();
  // Future-only invariant: a lesson at/after its start time can never be
  // self-cancelled, independent of the policy (incl. min_notice_hours = 0).
  // The RPC enforces the same guard as the source of truth.
  if (startsAt <= Date.now()) {
    return {
      error:
        "Deze les is al begonnen of voorbij en kan niet meer geannuleerd worden.",
    };
  }
  const hoursBefore = Math.max(0, (startsAt - Date.now()) / 3_600_000);
  const policy = await loadCancellationPolicy(service, tenant.id);
  const minNotice =
    policy.min_notice_hours ?? DEFAULT_CANCELLATION_POLICY.min_notice_hours;
  if (minNotice > 0 && hoursBefore < minNotice) {
    return {
      error: `Je kunt deze les niet meer zelf annuleren — dat moet uiterlijk ${minNotice} uur van tevoren. Neem contact op met je rijschool.`,
    };
  }

  const { data: refunded, error } = await service.rpc("student_cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason || "Geannuleerd door leerling",
  });
  if (error) return { error: error.message };

  revalidatePath("/student", "layout");
  return { refundedCredits: typeof refunded === "number" ? refunded : 0 };
}

/**
 * Lets a student (or guardian) reschedule their OWN planned, future lesson to a
 * new moment without losing credits. The locked `student_reschedule_lesson` RPC
 * (migration 0085) re-validates ownership, enforces the tenant's
 * `min_notice_hours` on the original lesson, keeps the same duration (so NO
 * credit ledger churn), checks the new slot is free for the instructor and
 * writes an audit row. This action re-checks ownership/status/notice in app-code
 * for a friendly message, then forwards the actor; the RPC is the source of
 * truth. The new time is sent as an ISO string (already converted to UTC by the
 * client from the student's local timezone).
 */
export async function rescheduleLesson(
  formData: FormData,
): Promise<{ error?: string; ok?: boolean; newStartsAt?: string }> {
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  const newStartsRaw = String(formData.get("new_starts_at") ?? "").trim();
  if (!lessonId) return { error: "lesson_id ontbreekt" };
  if (!newStartsRaw) return { error: "Kies een nieuwe datum en tijd." };
  const newStarts = new Date(newStartsRaw);
  if (Number.isNaN(newStarts.getTime())) {
    return { error: "Ongeldige datum of tijd." };
  }
  if (newStarts.getTime() <= Date.now()) {
    return { error: "Kies een moment in de toekomst." };
  }

  const { getActiveStudent } = await import("@/lib/students/access");
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student) return { error: "Geen toegang tot dit leerlingdossier." };

  const service = createServiceRoleClient();
  const { data: lessonRaw, error: loadErr } = await service
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (loadErr) return { error: loadErr.message };
  const lesson = lessonRaw as Lesson | null;
  if (!lesson) return { error: "Les niet gevonden." };
  if (lesson.status !== "planned") {
    return { error: "Deze les kan niet meer verzet worden." };
  }

  const startsAt = new Date(lesson.starts_at).getTime();
  // Future-only invariant on the original lesson: a lesson at/after its start
  // time can never be self-rescheduled. The RPC enforces the same guard.
  if (startsAt <= Date.now()) {
    return {
      error:
        "Deze les is al begonnen of voorbij en kan niet meer verzet worden.",
    };
  }
  const hoursBefore = Math.max(0, (startsAt - Date.now()) / 3_600_000);
  const policy = await loadCancellationPolicy(service, tenant.id);
  const minNotice =
    policy.min_notice_hours ?? DEFAULT_CANCELLATION_POLICY.min_notice_hours;
  if (minNotice > 0 && hoursBefore < minNotice) {
    return {
      error: `Je kunt deze les niet meer zelf verzetten — dat moet uiterlijk ${minNotice} uur van tevoren. Neem contact op met je rijschool.`,
    };
  }

  // Capture the OLD start time before the RPC overwrites the row — the
  // notification needs the previous moment, which is gone after the update.
  const previousStartsAt = lesson.starts_at;
  const oldStart = new Date(lesson.starts_at);
  const oldEnd = new Date(lesson.ends_at);
  const durationMs = oldEnd.getTime() - oldStart.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { error: "De oorspronkelijke lesduur is ongeldig." };
  }
  const newEnds = new Date(newStarts.getTime() + durationMs);
  const planningActor: PlanningActorAccess = {
    userId: user.id,
    roles,
    tenantIds: [],
    branchAccess: [{ tenantId: tenant.id, branchIds: "all" }],
  };
  const planningInput = {
    actor: planningActor,
    scope: lesson.branch_id
      ? { type: "branch" as const, tenantId: tenant.id, branchId: lesson.branch_id }
      : { type: "tenant" as const, tenantId: tenant.id },
    entityType: "lesson" as const,
    entityId: lessonId,
    tenantId: tenant.id,
    branchId: lesson.branch_id,
    instructorId: lesson.instructor_id,
    vehicleId: lesson.vehicle_id,
    startAt: newStarts,
    endAt: newEnds,
    pickupServiceAreaId: lesson.pickup_service_area_id,
  };
  const kernelData = await loadPlanningKernelData(service, planningInput);
  const validation = await getPlanningPreview(planningInput, kernelData);
  if (!validation.allowed) {
    return {
      error:
        validation.blockingReasons[0]?.message ??
        "Dat moment past niet binnen de planning. Kies een ander tijdstip.",
    };
  }

  const { error } = await service.rpc("student_reschedule_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_new_starts_at: newStarts.toISOString(),
  });
  if (error) {
    if (/overlaps an existing appointment/i.test(error.message)) {
      return {
        error:
          "Dat moment is niet meer beschikbaar bij je instructeur. Kies een ander tijdstip.",
      };
    }
    return { error: error.message };
  }

  // Notify the assigned instructor (their agenda changed) and confirm to the
  // student/guardian. Idempotent per reschedule (dedupe key embeds old+new
  // time); never blocks the reschedule itself.
  const { notifyLessonRescheduled } = await import(
    "@/lib/notifications/dispatch"
  );
  await notifyLessonRescheduled(service, tenant.id, lessonId, previousStartsAt);

  revalidatePath("/student", "layout");
  return { ok: true, newStartsAt: newStarts.toISOString() };
}

/**
 * Lets a student (or guardian) mark their own theory homework done or open
 * again (Leskaart L4). Cancelling is staff-only and rejected by the RPC. The
 * locked `set_theory_homework_status` RPC re-validates ownership against the
 * acting user and writes the audit row; this action only forwards the actor.
 */
export async function markHomeworkStatusAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["student", "parent"]);
  const homeworkId = String(formData.get("homework_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!homeworkId) return { error: "homework_id ontbreekt" };
  if (!["open", "done"].includes(status)) {
    return { error: "Ongeldige status" };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_theory_homework_status", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_homework_id: homeworkId,
    p_status: status,
  });
  if (error) return { error: error.message };

  revalidatePath("/student", "layout");
  return {};
}

const REFILL_DAYPARTS = ["morning", "afternoon", "evening", "weekend"] as const;

/**
 * Lets a student (or guardian) opt in/out of the wachtlijst — being invited when
 * a lesson moment frees up — and set optional preferred dayparts. The locked
 * `set_student_refill_preference` RPC re-validates ownership against the acting
 * user, validates the dayparts and writes the audit row; this action only
 * forwards the actor. Opting out clears the preferred dayparts server-side.
 */
export async function toggleRefillAvailability(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!studentId) return { error: "student_id ontbreekt" };
  const optIn = String(formData.get("opt_in") ?? "") === "true";
  const dayparts = formData
    .getAll("dayparts")
    .map((d) => String(d))
    .filter((d): d is (typeof REFILL_DAYPARTS)[number] =>
      (REFILL_DAYPARTS as readonly string[]).includes(d),
    );

  const { getActiveStudent } = await import("@/lib/students/access");
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student || student.id !== studentId) {
    return { error: "Geen toegang tot dit leerlingdossier." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_student_refill_preference", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: studentId,
    p_opt_in: optIn,
    p_dayparts: optIn ? dayparts : [],
  });
  if (error) return { error: error.message };

  revalidatePath("/student", "layout");
  return {};
}

/**
 * Lets a student (or guardian) accept or decline a refill invitation. The
 * locked `respond_lesson_refill_invitation` RPC re-validates ownership, lazily
 * expires stale invitations, and on accept books the lesson atomically
 * (balance check + ledger + audit + conflict check). This action only forwards
 * the actor and, on a successful accept, fires the confirmation email.
 */
export async function respondRefillInvitation(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["student", "parent"]);
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const response = String(formData.get("response") ?? "").trim();
  if (!invitationId) return { error: "invitation_id ontbreekt" };
  if (!["accept", "decline"].includes(response)) {
    return { error: "Ongeldige keuze" };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("respond_lesson_refill_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_accept: response === "accept",
  });
  if (error) return { error: error.message };

  if (response === "accept") {
    const { notifyLessonRefillConfirmed } = await import(
      "@/lib/notifications/dispatch"
    );
    await notifyLessonRefillConfirmed(service, tenant.id, invitationId);
  }

  revalidatePath("/student", "layout");
  return {};
}

/**
 * Lets a student (or guardian) accept or decline an exam-moment invitation. The
 * locked `respond_exam_invitation` RPC re-validates ownership, lazily expires
 * stale invitations, and on accept links the student to the exam appointment
 * after re-validating it is still open — NO credit ledger / NO lesson, because
 * an exam does not consume credit. This action only forwards the actor and, on a
 * successful accept, fires the confirmation email.
 */
export async function respondExamInvitation(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["student", "parent"]);
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  const response = String(formData.get("response") ?? "").trim();
  if (!invitationId) return { error: "invitation_id ontbreekt" };
  if (!["accept", "decline"].includes(response)) {
    return { error: "Ongeldige keuze" };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("respond_exam_invitation", {
    p_invitation_id: invitationId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_accept: response === "accept",
  });
  if (error) return { error: error.message };

  if (response === "accept") {
    const { notifyExamConfirmed } = await import(
      "@/lib/notifications/dispatch"
    );
    await notifyExamConfirmed(service, tenant.id, invitationId);
  }

  revalidatePath("/student", "layout");
  return {};
}

/**
 * Lets a student (or guardian) leave or edit their OWN internal review: a 1–5
 * star rating plus optional text. The mutation is server-side only via the
 * locked `upsert_student_review` RPC (migration 0080) — one review per student,
 * editable. Ownership is re-checked in app-code for a friendly message, then the
 * acting user is forwarded; the RPC remains the source of truth.
 */
export async function submitStudentReview(
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);

  const studentId = String(formData.get("student_id") ?? "").trim();
  const rating = Number(formData.get("rating"));
  const body = String(formData.get("body") ?? "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Kies een score van 1 tot 5 sterren." };
  }

  const { getActiveStudent } = await import("@/lib/students/access");
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student || student.id !== studentId) {
    return { error: "Geen toegang tot dit leerlingdossier." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_student_review", {
    p_tenant_id: tenant.id,
    p_student_id: studentId,
    p_actor: user.id,
    p_rating: rating,
    p_body: body || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/student/profile");
  return { ok: true };
}
