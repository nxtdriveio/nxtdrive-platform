"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function saveCbrLocation(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "branch_manager",
    "planner",
  ]);
  const name = String(formData.get("name") ?? "").trim();
  const stableCode = String(formData.get("stable_code") ?? "")
    .trim()
    .toUpperCase();
  const address = String(formData.get("address") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  if (!name || !address || !source || !/^[A-Z0-9_-]{3,40}$/.test(stableCode)) {
    return;
  }
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("cbr_locations")
    .upsert(
      {
        tenant_id: tenant.id,
        stable_code: stableCode,
        name,
        location_type: "EXAM_CENTER",
        address_snapshot: address,
        official_source_reference: source,
        status: "REVIEW_REQUIRED",
        created_by: user.id,
      },
      { onConflict: "tenant_id,stable_code" },
    )
    .select("id")
    .single();
  if (!error && data) {
    await service.from("audit_log").insert({
      actor_user_id: user.id,
      tenant_id: tenant.id,
      action: "maps.cbr_location_submitted_for_review",
      target_type: "cbr_location",
      target_id: data.id,
      payload: { stable_code: stableCode, has_source: true },
    });
  }
  revalidatePath("/backoffice/locaties");
}
