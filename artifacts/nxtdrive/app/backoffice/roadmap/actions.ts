"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PRODUCT_OPS_ROLES } from "@/lib/product-ops";

function text(formData: FormData, key: string, max = 500) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function registerRoadmapInterest(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const roadmapItemId = text(formData, "roadmap_item_id", 80);
  const interestLevel = text(formData, "interest_level", 40) || "interested";
  const note = text(formData, "note", 1000) || null;
  if (!roadmapItemId) return;

  const service = createServiceRoleClient();
  await service.from("product_roadmap_interest").upsert(
    {
      roadmap_item_id: roadmapItemId,
      tenant_id: tenant.id,
      user_id: user.id,
      interest_level: interestLevel,
      note,
    },
    { onConflict: "roadmap_item_id,tenant_id" },
  );

  revalidatePath("/backoffice/roadmap");
}

export async function moveRoadmapItem(formData: FormData) {
  const { user } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  if (!user.profile?.is_platform_admin) return;

  const roadmapItemId = text(formData, "roadmap_item_id", 80);
  const category = text(formData, "category", 40);
  const status = text(formData, "status", 40);
  if (!roadmapItemId || !category || !status) return;

  const service = createServiceRoleClient();
  await service
    .from("product_roadmap_items")
    .update({
      category,
      status,
      moved_by: user.id,
      moved_at: new Date().toISOString(),
    })
    .eq("id", roadmapItemId);

  revalidatePath("/backoffice/roadmap");
}

export async function createRoadmapIdea(formData: FormData) {
  const { user } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  if (!user.profile?.is_platform_admin) return;

  const title = text(formData, "title", 160);
  const description = text(formData, "description", 2000);
  const surface = text(formData, "surface", 80) || "platform";
  if (!title) return;

  const service = createServiceRoleClient();
  await service.from("product_roadmap_items").insert({
    title,
    description,
    surface,
    category: "ideas",
    status: "idea",
    priority: "medium",
    is_public: true,
    created_by: user.id,
  });

  revalidatePath("/backoffice/roadmap");
}
