"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hoursToMinutes } from "@/lib/students/types";

export async function grantPackageToStudent(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("grant_package", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_package_id: packageId,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}

export async function adjustCredits(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  // Admin enters a number of hours (may be decimal); tegoed is stored in minutes.
  const deltaHours = parseFloat(String(formData.get("delta") ?? "0"));
  const delta = hoursToMinutes(deltaHours);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!studentId || !Number.isFinite(delta) || delta === 0 || !note) {
    redirect(`/backoffice/leerlingen/${studentId || ""}`);
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("adjust_credits", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_delta: delta,
    p_note: note,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}
