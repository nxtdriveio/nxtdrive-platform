"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PRODUCT_OPS_ROLES } from "@/lib/product-ops";

function text(formData: FormData, key: string, max = 500) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function updateChecklistItemStatus(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const checklistItemId = text(formData, "checklist_item_id", 80);
  const status = text(formData, "status", 40) || "not_started";
  const note = text(formData, "note", 1000) || null;
  const evidenceUrl = text(formData, "evidence_url", 500) || null;
  if (!checklistItemId) return;

  const service = createServiceRoleClient();
  await service.from("tenant_checklist_item_statuses").upsert(
    {
      tenant_id: tenant.id,
      checklist_item_id: checklistItemId,
      status,
      note,
      evidence_url: evidenceUrl,
      updated_by: user.id,
      completed_at: status === "done" ? new Date().toISOString() : null,
    },
    { onConflict: "tenant_id,checklist_item_id" },
  );

  revalidatePath("/backoffice/checklists");
}
