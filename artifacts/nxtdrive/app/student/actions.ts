"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

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
