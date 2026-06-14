"use server";

import { redirect } from "next/navigation";
import { requireOrganizationPermission } from "@/lib/organization";
import {
  canManageExistingBranches,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PLAN_LABELS } from "@/lib/platform/features";

function redirectPlanRequired(path: string): never {
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}error=plan_required&plan=${encodeURIComponent(PLAN_LABELS.pro)}`,
  );
}

export async function createBranch(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("branch:manage");

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;

  if (!name || !slug) {
    redirect("/backoffice/instellingen/vestigingen?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, organization.id);
  if (!snapshot.featureAccess.multi_branch.allowed) {
    redirectPlanRequired("/backoffice/instellingen/vestigingen");
  }
  const branchLimit = snapshot.limitStatuses.branches;

  if (branchLimit.isAtLimit) {
    redirect(
      "/backoffice/instellingen/vestigingen?error=branch_limit_reached&limit=" +
        encodeURIComponent(branchLimit.limitLabel),
    );
  }

  const { error } = await service.rpc("create_branch", {
    p_tenant_id: organization.id,
    p_name: name,
    p_slug: slug,
    p_address: address,
    p_city: city,
    p_actor: user.id,
  });

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      redirect(
        "/backoffice/instellingen/vestigingen?error=slug_taken&slug=" +
          encodeURIComponent(slug),
      );
    }
    redirect(
      "/backoffice/instellingen/vestigingen?error=create_failed&reason=" +
        encodeURIComponent(error.message),
    );
  }

  redirect("/backoffice/instellingen/vestigingen?success=created&name=" + encodeURIComponent(name));
}

export async function updateBranch(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("branch:manage");

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const isActive = formData.get("is_active") === "true";

  if (!branchId || !name) {
    redirect("/backoffice/instellingen/vestigingen?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, organization.id);

  if (!canManageExistingBranches(snapshot)) {
    redirectPlanRequired("/backoffice/instellingen/vestigingen");
  }

  const { error } = await service.rpc("update_branch", {
    p_branch_id: branchId,
    p_name: name,
    p_address: address,
    p_city: city,
    p_is_active: isActive,
    p_actor: user.id,
  });

  if (error) {
    redirect(
      "/backoffice/instellingen/vestigingen?error=update_failed&reason=" +
        encodeURIComponent(error.message),
    );
  }

  redirect("/backoffice/instellingen/vestigingen?success=updated&name=" + encodeURIComponent(name));
}

export async function setMembershipBranches(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("user:manage");

  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const raw = formData.getAll("branch_ids[]");
  const branchIds = raw
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (!membershipId) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, organization.id);

  if (!canManageExistingBranches(snapshot)) {
    redirectPlanRequired(
      `/backoffice/medewerkers/${membershipId}/vestigingen`,
    );
  }

  const { data: membership } = await service
    .from("memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!membership) {
    redirect("/backoffice/medewerkers?error=not_found");
  }

  const { error } = await service.rpc("set_membership_branches", {
    p_membership_id: membershipId,
    p_branch_ids: branchIds,
    p_actor: user.id,
  });

  if (error) {
    redirect(
      `/backoffice/medewerkers/${membershipId}/vestigingen?error=update_failed&reason=` +
        encodeURIComponent(error.message),
    );
  }

  redirect(
    `/backoffice/medewerkers/${membershipId}/vestigingen?success=updated`,
  );
}
