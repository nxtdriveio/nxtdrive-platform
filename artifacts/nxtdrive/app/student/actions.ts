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
