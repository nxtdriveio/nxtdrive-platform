"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PRODUCT_OPS_ROLES } from "@/lib/product-ops";

function text(formData: FormData, key: string, max = 500) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function acknowledgeRelease(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const releaseId = text(formData, "release_id", 80);
  if (!releaseId) return;

  const service = createServiceRoleClient();
  await service.from("tenant_release_acknowledgements").upsert(
    {
      tenant_id: tenant.id,
      release_id: releaseId,
      acknowledged_by: user.id,
      acknowledged_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,release_id" },
  );

  revalidatePath("/backoffice/releases");
}

export async function promoteReleaseToProduction(formData: FormData) {
  const { user } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  if (!user.profile?.is_platform_admin) return;

  const releaseId = text(formData, "release_id", 80);
  if (!releaseId) return;

  const service = createServiceRoleClient();
  await service
    .from("product_releases")
    .update({
      status: "production",
      production_released_at: new Date().toISOString(),
      published_by: user.id,
    })
    .eq("id", releaseId);

  revalidatePath("/backoffice/releases");
}

export async function createRelease(formData: FormData) {
  const { user } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  if (!user.profile?.is_platform_admin) return;

  const version = text(formData, "version", 80);
  const title = text(formData, "title", 160);
  const summary = text(formData, "summary", 2000);
  const status = text(formData, "status", 40) || "staging";
  if (!version || !title) return;

  const service = createServiceRoleClient();
  await service.from("product_releases").upsert(
    {
      version,
      title,
      summary,
      status,
      audience: "all",
      staging_merged_at: status === "staging" ? new Date().toISOString() : null,
      published_by: user.id,
    },
    { onConflict: "version" },
  );

  revalidatePath("/backoffice/releases");
}
