"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  upsertOrganizationProfile,
  type OrganizationLifecycleStatus,
  type OrganizationOnboardingStatus,
} from "@/lib/organization";
import { normalizeTenantPlan, tenantHasFeature } from "@/lib/platform/features";
import type { OrgType, TenantPlan } from "@/lib/types";

const VALID_PLANS: TenantPlan[] = ["start", "pro", "elite"];
const VALID_ORG_TYPES: OrgType[] = [
  "zzp",
  "rijschool",
  "groot",
  "multi_vestiging",
  "franchise",
];
const VALID_LIFECYCLE_STATUSES: OrganizationLifecycleStatus[] = [
  "prospect",
  "onboarding",
  "active",
  "paused",
  "churned",
];
const VALID_ONBOARDING_STATUSES: OrganizationOnboardingStatus[] = [
  "not_started",
  "in_progress",
  "ready",
  "blocked",
];

function trimmed(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateTenantIdentityAction(formData: FormData) {
  const actor = await requirePlatformAdmin();

  const tenantId = trimmed(formData, "tenant_id");
  const name = trimmed(formData, "name");

  if (!tenantId || !name) {
    redirect(`/admin/tenants/${tenantId}?identity_error=missing_fields`);
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("tenants")
    .update({ name })
    .eq("id", tenantId);

  if (error) {
    redirect(
      `/admin/tenants/${tenantId}?identity_error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  await service.from("audit_log").insert({
    actor_user_id: actor.id,
    tenant_id: tenantId,
    action: "tenant.name_changed",
    target_type: "tenant",
    target_id: tenantId,
    payload: { name },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
  redirect(`/admin/tenants/${tenantId}?identity_saved=1`);
}

/** Platform admin: update a tenant's subscription plan. */
export async function updateTenantPlanAction(formData: FormData) {
  const actor = await requirePlatformAdmin();

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const plan = String(formData.get("plan") ?? "").trim() as TenantPlan;

  if (!tenantId || !VALID_PLANS.includes(plan)) {
    redirect(`/admin/tenants/${tenantId}?plan_error=invalid`);
  }

  const service = createServiceRoleClient();
  const { error } = await service
    .from("tenants")
    .update({ plan })
    .eq("id", tenantId);

  if (error) {
    redirect(
      `/admin/tenants/${tenantId}?plan_error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  // Audit log: record the plan change.
  await service.from("audit_log").insert({
    actor_user_id: actor.id,
    tenant_id: tenantId,
    action: "tenant.plan_changed",
    target_type: "tenant",
    target_id: tenantId,
    payload: { plan },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
  redirect(`/admin/tenants/${tenantId}?plan_saved=1`);
}

/** Platform admin: update organization commercial/profile metadata. */
export async function updateOrganizationProfileAction(formData: FormData) {
  const actor = await requirePlatformAdmin();

  const tenantId = trimmed(formData, "tenant_id");
  const orgType = (trimmed(formData, "org_type") || "rijschool") as OrgType;
  const lifecycleStatus = (trimmed(formData, "lifecycle_status") ||
    "onboarding") as OrganizationLifecycleStatus;
  const onboardingStatus = (trimmed(formData, "onboarding_status") ||
    "not_started") as OrganizationOnboardingStatus;
  const ownerEmail = trimmed(formData, "owner_email").toLowerCase();

  if (!tenantId) redirect("/admin?tab=tenants");
  if (!VALID_ORG_TYPES.includes(orgType)) {
    redirect(`/admin/tenants/${tenantId}?profile_error=invalid_org_type`);
  }
  if (!VALID_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    redirect(`/admin/tenants/${tenantId}?profile_error=invalid_lifecycle_status`);
  }
  if (!VALID_ONBOARDING_STATUSES.includes(onboardingStatus)) {
    redirect(`/admin/tenants/${tenantId}?profile_error=invalid_onboarding_status`);
  }

  const service = createServiceRoleClient();

  let ownerUserId: string | null = null;
  if (ownerEmail) {
    const listResult = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const allUsers = (listResult.data?.users ?? []) as Array<{ id: string; email?: string }>;
    ownerUserId = allUsers.find((u) => u.email?.toLowerCase() === ownerEmail)?.id ?? null;

    if (!ownerUserId) {
      redirect(`/admin/tenants/${tenantId}?profile_error=owner_not_found`);
    }
  }

  const { error: tenantError } = await service
    .from("tenants")
    .update({ org_type: orgType })
    .eq("id", tenantId);

  if (tenantError) {
    redirect(
      `/admin/tenants/${tenantId}?profile_error=` +
        encodeURIComponent(tenantError.message.slice(0, 200)),
    );
  }

  await service.from("audit_log").insert({
    actor_user_id: actor.id,
    tenant_id: tenantId,
    action: "tenant.org_type_changed",
    target_type: "tenant",
    target_id: tenantId,
    payload: { org_type: orgType },
  });

  try {
    await upsertOrganizationProfile(service, {
      tenantId,
      actorId: actor.id,
      legalName: trimmed(formData, "legal_name") || null,
      billingEmail: trimmed(formData, "billing_email") || null,
      supportEmail: trimmed(formData, "support_email") || null,
      kvkNumber: trimmed(formData, "kvk_number") || null,
      vatNumber: trimmed(formData, "vat_number") || null,
      ownerUserId,
      lifecycleStatus,
      onboardingStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Organisatieprofiel opslaan mislukt";
    redirect(
      `/admin/tenants/${tenantId}?profile_error=` +
        encodeURIComponent(msg.slice(0, 200)),
    );
  }

  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin");
  redirect(`/admin/tenants/${tenantId}?profile_saved=1`);
}

/** Platform admin: toggle white_label_enabled for a tenant. */
export async function toggleWhiteLabelAction(formData: FormData) {
  const actor = await requirePlatformAdmin();

  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const enabled = formData.get("white_label_enabled") === "true";

  if (!tenantId) {
    redirect(`/admin/tenants/${tenantId}?plan_error=invalid`);
  }

  const service = createServiceRoleClient();
  if (enabled) {
    const { data: tenant } = await service
      .from("tenants")
      .select("plan")
      .eq("id", tenantId)
      .maybeSingle();

    const tenantPlan = normalizeTenantPlan(tenant?.plan as string | undefined);
    if (!tenantHasFeature({ plan: tenantPlan }, "white_label")) {
      redirect(
        `/admin/tenants/${tenantId}?plan_error=` +
          encodeURIComponent("White-label vereist het Elite-abonnement."),
      );
    }
  }

  const { error } = await service
    .from("tenants")
    .update({ white_label_enabled: enabled })
    .eq("id", tenantId);

  if (error) {
    redirect(
      `/admin/tenants/${tenantId}?plan_error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  await service.from("audit_log").insert({
    actor_user_id: actor.id,
    tenant_id: tenantId,
    action: "tenant.white_label_changed",
    target_type: "tenant",
    target_id: tenantId,
    payload: { white_label_enabled: enabled },
  });

  revalidatePath(`/admin/tenants/${tenantId}`);
  redirect(`/admin/tenants/${tenantId}?plan_saved=1`);
}

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

/** Platform admin: link or unlink a tenant as a franchisee of a franchisegever. */
export async function setFranchiseeParentAction(formData: FormData) {
  const user = await requirePlatformAdmin();

  const franchisee_id    = String(formData.get("franchisee_id") ?? "").trim();
  const franchisegever_id = String(formData.get("franchisegever_id") ?? "").trim();

  if (!franchisee_id) {
    redirect(`/admin/tenants/${franchisee_id}?error=missing_fields`);
  }

  const service = createServiceRoleClient();
  if (franchisegever_id) {
    const [{ data: franchiseeTenant }, { data: franchisegeverTenant }] =
      await Promise.all([
        service
          .from("tenants")
          .select("id, plan")
          .eq("id", franchisee_id)
          .maybeSingle(),
        service
          .from("tenants")
          .select("id, plan")
          .eq("id", franchisegever_id)
          .maybeSingle(),
      ]);

    if (!franchiseeTenant || !franchisegeverTenant) {
      redirect(
        `/admin/tenants/${franchisee_id}?franchise_error=` +
          encodeURIComponent("Franchise-koppeling verwijst naar een onbekende tenant."),
      );
    }

    if (!tenantHasFeature(franchiseeTenant, "franchise_as_franchisee")) {
      redirect(
        `/admin/tenants/${franchisee_id}?franchise_error=` +
          encodeURIComponent("De franchisee heeft minimaal Pro nodig."),
      );
    }

    if (!tenantHasFeature(franchisegeverTenant, "franchise_as_franchisegever")) {
      redirect(
        `/admin/tenants/${franchisee_id}?franchise_error=` +
          encodeURIComponent("De franchisegever heeft het Elite-abonnement nodig."),
      );
    }
  }

  const { error } = await service.rpc("set_franchisee_parent", {
    p_franchisee_tenant_id:    franchisee_id,
    p_franchisegever_tenant_id: franchisegever_id || null,
    p_actor: user.id,
  });

  if (error) {
    redirect(
      `/admin/tenants/${franchisee_id}?franchise_error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath(`/admin/tenants/${franchisee_id}`);
  redirect(`/admin/tenants/${franchisee_id}?franchise_saved=1`);
}
