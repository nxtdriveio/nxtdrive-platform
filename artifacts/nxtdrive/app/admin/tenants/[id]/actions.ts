"use server";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function createTenantAdminAccount(
  tenantId: string,
  formData: FormData,
) {
  await requirePlatformAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || password.length < 8) {
    redirect(`/admin/tenants/${tenantId}?error=missing_fields`);
  }

  const service = createServiceRoleClient();

  // Check if user already exists.
  const listResult = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const allUsers = (listResult.data?.users ?? []) as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>;
  const existing = allUsers.find((u) => u.email === email);

  let userId: string;

  if (existing) {
    userId = existing.id;
    // Update password + name for the existing account.
    await service.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { full_name: fullName },
    });
  } else {
    // Create a new confirmed account with the given password.
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createError || !created?.user) {
      redirect(`/admin/tenants/${tenantId}?error=create_failed`);
    }
    userId = created.user.id;
  }

  // Add tenant_admin membership (idempotent).
  const { error: memberError } = await service.from("memberships").upsert(
    { user_id: userId, tenant_id: tenantId, role: "tenant_admin" },
    { onConflict: "user_id,tenant_id,role" },
  );

  if (memberError) {
    redirect(`/admin/tenants/${tenantId}?error=membership_failed`);
  }

  redirect(`/admin/tenants/${tenantId}?created=${encodeURIComponent(email)}`);
}
