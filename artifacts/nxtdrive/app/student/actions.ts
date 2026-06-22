"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  completeInstructorNextLessonBooking,
  respondBookingConfirmation,
} from "@/lib/smart-booking/service";
import { loadLessonSelfServicePreview } from "@/lib/lessons/student-self-service";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
} from "@/lib/planning-core";
import type { Lesson } from "@/lib/lessons/types";

function bookingErrorRedirect(message: string): never {
  redirect(`/student/lessons/book?error=${encodeURIComponent(message.slice(0, 220))}`);
}

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
  const preview = await loadLessonSelfServicePreview(service, tenant.id, lesson);
  if (!preview.canCancel) {
    return {
      error:
        preview.cancelBlockedReason ??
        "Deze les kan niet meer geannuleerd worden.",
    };
  }
  const { data: refunded, error } = await service.rpc("student_cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason || "Geannuleerd door leerling",
  });
  if (error) return { error: error.message };

  const { notifyLessonCancelled } = await import(
    "@/lib/notifications/dispatch"
  );
  await notifyLessonCancelled(service, tenant.id, lessonId);

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
  const preview = await loadLessonSelfServicePreview(service, tenant.id, lesson);
  if (!preview.canReschedule) {
    return {
      error:
        preview.rescheduleBlockedReason ??
        "Deze les kan niet meer verzet worden.",
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
 * Existing-student self-booking. The UI only sends a selected candidate; the
 * locked RPC re-checks ownership, tenant policy, package rules, credit,
 * invoices, instructor scope and overlap before it creates a lesson or a
 * pending booking request.
 */
export async function selfBookLesson(formData: FormData): Promise<void> {
  const { tenant, user, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { getActiveStudent } = await import("@/lib/students/access");
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student) bookingErrorRedirect("Geen toegang tot dit leerlingdossier.");

  const instructorId = String(formData.get("instructor_id") ?? "").trim();
  const startsAtRaw = String(formData.get("starts_at") ?? "").trim();
  const durationMin = Number(formData.get("duration_min"));
  const location = String(formData.get("location") ?? "").trim();
  const score = Number(formData.get("score"));
  const reason = String(formData.get("reason") ?? "").trim();
  let warnings: unknown = [];
  const warningsRaw = String(formData.get("warnings") ?? "[]");
  try {
    warnings = JSON.parse(warningsRaw);
  } catch {
    warnings = [];
  }

  if (!instructorId) bookingErrorRedirect("Kies een instructeur.");
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
    bookingErrorRedirect("Kies een geldig moment in de toekomst.");
  }
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 240) {
    bookingErrorRedirect("De gekozen lesduur is ongeldig.");
  }

  const service = createServiceRoleClient();
  const { loadStudentSelfBookingState } = await import(
    "@/lib/student-booking/service"
  );
  const state = await loadStudentSelfBookingState(service, {
    tenantId: tenant.id,
    tenantTimeZone: tenant.timezone,
    student,
    actorUserId: user.id,
    roles,
    requestedDurationMin: durationMin,
  });
  const selected = state.suggestions.find(
    (suggestion) =>
      suggestion.instructorId === instructorId &&
      suggestion.startsAt === startsAt.toISOString() &&
      suggestion.durationMin === durationMin,
  );
  if (!selected) {
    bookingErrorRedirect(
      state.blockingReasons[0] ??
        "Dit lesmoment is niet meer beschikbaar. Kies een ander moment.",
    );
  }

  const { data, error } = await service.rpc("student_self_book_lesson", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: student.id,
    p_instructor_id: instructorId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: durationMin,
    p_location: location || null,
    p_location_lat: null,
    p_location_lng: null,
    p_location_place_id: null,
    p_score: Number.isFinite(score) ? Math.round(score) : selected.score,
    p_reason: reason || selected.reasons.join(", "),
    p_warnings: Array.isArray(warnings) ? warnings : selected.warnings,
  });
  if (error) {
    if (/insufficient tegoed/i.test(error.message)) {
      bookingErrorRedirect(
        "Je hebt onvoldoende tegoed om deze les direct te boeken.",
      );
    }
    if (/overlaps/i.test(error.message)) {
      bookingErrorRedirect(
        "Dit moment is net bezet geraakt. Kies een ander moment.",
      );
    }
    bookingErrorRedirect(error.message);
  }

  const result = data as { status?: string; lesson_id?: string } | null;
  revalidatePath("/student", "layout");
  if (result?.status === "confirmed" && result.lesson_id) {
    redirect(`/student/lessons/${result.lesson_id}?self_booking=confirmed`);
  }
  redirect("/student/lessons/book?status=requested");
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
 * Phase 7 slot recovery: the student/guardian only shows interest in a freed
 * slot. Staff/instructor acceptance and optional final confirmation decide
 * whether a lesson is created, so this never books directly from the PWA.
 */
export async function expressSlotRecoveryInterestAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["student", "parent"]);
  const bookingCandidateId = String(
    formData.get("booking_candidate_id") ?? "",
  ).trim();
  if (!bookingCandidateId) return { error: "booking_candidate_id ontbreekt" };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("express_slot_recovery_interest", {
    p_booking_candidate_id: bookingCandidateId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_metadata: { surface: "student_pwa" },
  });
  if (error) return { error: error.message };

  revalidatePath("/student", "layout");
  return {};
}

export async function respondInstructorNextLessonProposalAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["student", "parent"]);
  const bookingConfirmationId = String(
    formData.get("booking_confirmation_id") ?? "",
  ).trim();
  const bookingCandidateId = String(
    formData.get("booking_candidate_id") ?? "",
  ).trim();
  const response = String(formData.get("response") ?? "").trim();
  if (!bookingConfirmationId) {
    return { error: "booking_confirmation_id ontbreekt" };
  }
  if (!bookingCandidateId) return { error: "booking_candidate_id ontbreekt" };
  if (!["accept", "decline"].includes(response)) {
    return { error: "Ongeldige keuze" };
  }

  const service = createServiceRoleClient();
  const status = await respondBookingConfirmation(service, {
    tenantId: tenant.id,
    bookingConfirmationId,
    actor: user.id,
    response: response === "accept" ? "accepted" : "declined",
    metadata: { surface: "student_pwa", source: "instructor_next_lesson" },
  }).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Voorstel beantwoorden mislukt.";
    return `error:${message}`;
  });
  if (status.startsWith("error:")) {
    return { error: status.slice("error:".length) };
  }

  if (response === "accept" && status === "candidates_ready") {
    try {
      await completeInstructorNextLessonBooking(service, {
        tenantId: tenant.id,
        bookingCandidateId,
        actor: user.id,
      });
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Les bevestigen is mislukt.",
      };
    }
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
