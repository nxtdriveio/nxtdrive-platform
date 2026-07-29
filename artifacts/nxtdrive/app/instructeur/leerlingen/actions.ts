"use server";

import { revalidatePath } from "next/cache";
import { parseInstructorCreditInput } from "@/lib/instructor/credits";
import { requireInstructorStudentAccess } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type InstructorCreditActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addInstructorStudentCredits(
  formData: FormData,
): Promise<InstructorCreditActionResult> {
  const parsed = parseInstructorCreditInput({
    studentId: formData.get("student_id"),
    hours: formData.get("hours"),
    note: formData.get("note"),
  });
  if (!parsed.ok) return parsed;

  const service = createServiceRoleClient();
  const access = await requireInstructorStudentAccess(
    service,
    parsed.value.studentId,
  );
  if (!access.student) {
    return { ok: false, error: "Geen toegang tot deze leerling." };
  }

  const { error } = await service.rpc("add_instructor_student_credits", {
    p_student_id: parsed.value.studentId,
    p_tenant_id: access.tenantId,
    p_actor: access.userId,
    p_delta_minutes: parsed.value.deltaMinutes,
    p_note: parsed.value.note,
  });
  if (error) {
    return {
      ok: false,
      error: "Het lestegoed kon niet worden toegevoegd.",
    };
  }

  revalidatePath(`/instructeur/leerlingen/${parsed.value.studentId}`);
  revalidatePath("/instructeur/leerlingen");
  revalidatePath(`/backoffice/leerlingen/${parsed.value.studentId}`);
  return { ok: true };
}
