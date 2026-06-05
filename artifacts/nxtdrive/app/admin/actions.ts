"use server";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { setActiveTenantId } from "@/lib/auth/active-tenant";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  setPlatformSendgridKey,
  setPlatformFromEmail,
} from "@/lib/email/platform-config";
import { getAiConfigStatus, setPlatformAiKey } from "@/lib/ai/platform-config";

export async function savePlatformEmailConfig(formData: FormData) {
  await requirePlatformAdmin();
  const rawKey = String(formData.get("sg_api_key") ?? "").trim();
  const fromEmail = String(formData.get("from_email") ?? "").trim();

  if (!fromEmail) {
    redirect("/admin?tab=email&emailError=" + encodeURIComponent("Vul een afzenderadres in."));
  }

  const service = createServiceRoleClient();
  try {
    if (rawKey) {
      await setPlatformSendgridKey(service, rawKey);
    }
    await setPlatformFromEmail(service, fromEmail);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout bij opslaan";
    redirect("/admin?tab=email&emailError=" + encodeURIComponent(msg.slice(0, 200)));
  }

  redirect("/admin?tab=email&emailSaved=1");
}

export async function savePlatformAiConfig(formData: FormData) {
  await requirePlatformAdmin();
  const rawKey = String(formData.get("openai_api_key") ?? "").trim();

  const service = createServiceRoleClient();

  // Empty field = no-op when a key is already configured (same pattern as
  // the SendGrid key in savePlatformEmailConfig). Only reject empty when
  // nothing is stored yet.
  if (!rawKey) {
    const { configured } = await getAiConfigStatus(service);
    if (!configured) {
      redirect("/admin?tab=ai&aiError=" + encodeURIComponent("Vul een OpenAI API-sleutel in."));
    }
    redirect("/admin?tab=ai&aiSaved=1");
  }

  try {
    await setPlatformAiKey(service, rawKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout bij opslaan";
    redirect("/admin?tab=ai&aiError=" + encodeURIComponent(msg.slice(0, 200)));
  }

  redirect("/admin?tab=ai&aiSaved=1");
}

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
  const listResult = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const allUsers = (listResult.data?.users ?? []) as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>;
  const existing = allUsers.find((u) => u.email === email);

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
