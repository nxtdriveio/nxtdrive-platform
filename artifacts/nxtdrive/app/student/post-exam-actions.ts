"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getActiveStudent } from "@/lib/students/access";

/**
 * Examenflow C — AVG-expliciete, self-service review-/social-media-toestemming.
 * De leerling (of diens voogd) zet de eigen toestemming. Ownership wordt eerst
 * server-side bevestigd via getActiveStudent; de schrijfactie loopt via de
 * geguarde SECURITY DEFINER RPC set_student_review_consent_self (geaudit).
 */
export async function setOwnReviewConsent(
  consent: boolean,
): Promise<{ ok: true; consent: boolean } | { ok: false; error: string }> {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student) {
    return { ok: false, error: "Geen leerlingdossier gevonden." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_student_review_consent_self", {
    p_student_id: student.id,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_consent: consent,
  });
  if (error) {
    return { ok: false, error: "Toestemming kon niet worden opgeslagen." };
  }

  revalidatePath("/leerling");
  return { ok: true, consent };
}
