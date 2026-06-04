"use server";

import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function createBranch(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;

  if (!name || !slug) {
    redirect("/backoffice/instellingen/vestigingen?error=missing_fields");
  }

  const service = createServiceRoleClient();

  const { error } = await service.rpc("create_branch", {
    p_tenant_id: tenant.id,
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
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  const city = String(formData.get("city") ?? "").trim() || null;
  const isActive = formData.get("is_active") === "true";

  if (!branchId || !name) {
    redirect("/backoffice/instellingen/vestigingen?error=missing_fields");
  }

  const service = createServiceRoleClient();

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
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const raw = formData.getAll("branch_ids[]");
  const branchIds = raw
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (!membershipId) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();

  const { data: membership } = await service
    .from("memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id)
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
