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

  if (!name || !slug) redirect("/admin?tab=tenant&error=missing_fields");

  const service = createServiceRoleClient();
  const { error } = await service.from("tenants").insert({
    name,
    slug,
    plan,
    white_label_enabled: false,
  });

  if (error) {
    if (error.code === "23505") redirect("/admin?tab=tenant&error=slug_exists");
    redirect("/admin?tab=tenant&error=unknown");
  }

  redirect("/admin?tab=tenant&created=" + slug);
}

export async function createTenantAdmin(formData: FormData) {
  await requirePlatformAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const tenantId = String(formData.get("tenant_id") ?? "");

  if (!email || !tenantId) redirect("/admin?tab=admin&error=missing_fields");

  const service = createServiceRoleClient();

  // Invite or look up existing user.
  let userId: string | null = null;

  // Try to find an existing user by email via auth.admin.listUsers.
  const { data: listData } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = listData?.users?.find((u) => u.email === email);

  if (existing) {
    userId = existing.id;
    // Update profile name if supplied and not yet set.
    if (fullName && !existing.user_metadata?.full_name) {
      await service.auth.admin.updateUserById(existing.id, {
        user_metadata: { full_name: fullName },
      });
    }
  } else {
    // Invite a new user — they get an email to set their password.
    const { data: inviteData, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(email);
    if (inviteError || !inviteData?.user) {
      redirect("/admin?tab=admin&error=invite_failed");
    }
    userId = inviteData!.user.id;
  }

  if (!userId) redirect("/admin?tab=admin&error=unknown");

  // Upsert membership (idempotent — unique on user_id + tenant_id + role).
  const { error: memberError } = await service.from("memberships").upsert(
    { user_id: userId, tenant_id: tenantId, role: "tenant_admin" },
    { onConflict: "user_id,tenant_id,role" },
  );

  if (memberError) redirect("/admin?tab=admin&error=membership_failed");

  redirect("/admin?tab=admin&invited=" + encodeURIComponent(email));
}
