import "server-only";

import type { MobileInstructorContext } from "@/lib/mobile/auth";
import { MobileApiError } from "@/lib/mobile/auth";

export async function requireMobileInstructorStudent(
  context: MobileInstructorContext,
  studentId: string,
) {
  const { data: student, error } = await context.service
    .from("students")
    .select("id, branch_id, full_name")
    .eq("id", studentId)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (error) {
    throw new MobileApiError(
      503,
      "Leerlingtoegang kon niet worden gecontroleerd.",
      "student_check_failed",
    );
  }
  if (!student) {
    throw new MobileApiError(
      403,
      "Geen toegang tot deze leerling.",
      "student_access_denied",
    );
  }
  if (context.isAdmin) return student;

  const [lesson, appointment, conversation] = await Promise.all([
    context.service
      .from("lessons")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
    context.service
      .from("agenda_appointments")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
    context.service
      .from("chat_conversations")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (!lesson.data && !appointment.data && !conversation.data) {
    throw new MobileApiError(
      403,
      "Geen toegang tot deze leerling.",
      "student_access_denied",
    );
  }
  return student;
}
