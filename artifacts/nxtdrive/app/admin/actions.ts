"use server";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { setActiveTenantId } from "@/lib/auth/active-tenant";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function enterTenantBackoffice(formData: FormData) {
  await requirePlatformAdmin();
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) redirect("/admin");
  await setActiveTenantId(tenantId);
  redirect("/backoffice");
}

export async function createTenant(formData: FormData) {
  await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const plan = String(formData.get("plan") ?? "start");

  if (!name || !slug) redirect("/admin?error=missing_fields");

  const service = createServiceRoleClient();

  const { error } = await service.from("tenants").insert({
    name,
    slug,
    plan,
    white_label_enabled: false,
  });

  if (error) {
    if (error.code === "23505") redirect("/admin?error=slug_exists");
    redirect("/admin?error=unknown");
  }

  redirect("/admin?created=" + slug);
}
