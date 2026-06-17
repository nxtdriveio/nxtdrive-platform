import "server-only";

import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { getStudentExperience } from "./service";

export async function getStudentPwaContext() {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);
  const { student, accessible, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );

  if (needsChildPicker) redirect("/student/select-child");

  const displayName =
    student?.full_name ?? user.profile?.full_name ?? user.email ?? "Emma de Vries";

  const experience = await getStudentExperience({
    studentName: displayName,
    tenantName: tenant.name,
    email: student?.email ?? user.email,
    phone: student?.phone,
  });

  return {
    user,
    tenant,
    roles,
    student,
    accessible,
    experience,
  };
}
