"use server";

import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { ensureConversation } from "@/lib/chat/service";
import { requireInstructorStudentAccess } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function openInstructorConversationAction(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!studentId) {
    redirect("/instructor/berichten?error=missing-student");
  }

  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const service = createServiceRoleClient();
  const access = await requireInstructorStudentAccess(service, studentId);
  if (!access.student) {
    redirect("/instructor/berichten?error=forbidden");
  }

  const conversationId = await ensureConversation({
    tenantId: tenant.id,
    studentId,
    instructorId: user.id,
    actorId: user.id,
  });

  redirect(`/instructor/berichten?conversation=${conversationId}`);
}
