"use server";

import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";

const STAFF_ROLES: MemberRole[] = [
  "tenant_admin",
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
];

function blockPlatformAdmin(isPlatformAdmin: boolean | undefined) {
  if (isPlatformAdmin) redirect("/backoffice/medewerkers?error=forbidden");
}

export async function inviteInstructor(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as MemberRole;
  const rawBranchIds = formData.getAll("branch_ids[]");
  const branchIds = rawBranchIds
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  if (!email || !STAFF_ROLES.includes(role)) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();

  const { data: profileRow } = await service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let userId: string;

  if (profileRow) {
    userId = profileRow.id as string;

    const { data: existingAny } = await service
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenant.id)
      .limit(1)
      .maybeSingle();

    if (existingAny) {
      redirect(
        "/backoffice/medewerkers?error=already_member&email=" +
          encodeURIComponent(email),
      );
    }
  } else {
    const { data: inviteData, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(email, {
        data: fullName ? { full_name: fullName } : undefined,
      });

    if (inviteError || !inviteData?.user) {
      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(inviteError?.message ?? "onbekende fout"),
      );
    }

    userId = inviteData!.user.id;
  }

  const { data: memberRow, error: memberError } = await service
    .from("memberships")
    .insert({ user_id: userId, tenant_id: tenant.id, role })
    .select("id")
    .maybeSingle();

  if (memberError) {
    if (memberError.code === "23505") {
      redirect(
        "/backoffice/medewerkers?error=already_member&email=" +
          encodeURIComponent(email),
      );
    }
    redirect("/backoffice/medewerkers?error=membership_failed");
  }

  // If branch IDs were specified, scope the membership.
  // Failure here is blocking — a failed scope leaves the membership
  // unrestricted, violating least-privilege. Roll back by deleting the
  // membership and surfacing the error.
  if (memberRow && branchIds.length > 0) {
    const { error: branchError } = await service.rpc("set_membership_branches", {
      p_membership_id: memberRow.id,
      p_branch_ids: branchIds,
      p_actor: user.id,
    });

    if (branchError) {
      // Roll back: remove the newly-created membership so the user stays outside.
      await service
        .from("memberships")
        .delete()
        .eq("id", memberRow.id)
        .eq("tenant_id", tenant.id);

      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(
            `Vestigingstoegang instellen mislukt: ${branchError.message}`,
          ),
      );
    }
  }

  redirect(
    "/backoffice/medewerkers?success=invited&email=" +
      encodeURIComponent(email),
  );
}

export async function removeMember(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) redirect("/backoffice/medewerkers?error=missing_fields");

  const service = createServiceRoleClient();

  const { data: row } = await service
    .from("memberships")
    .select("user_id")
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!row) redirect("/backoffice/medewerkers?error=not_found");

  if ((row.user_id as string) === user.id) {
    redirect("/backoffice/medewerkers?error=cannot_remove_self");
  }

  const { error } = await service
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id);

  if (error) redirect("/backoffice/medewerkers?error=remove_failed");

  redirect("/backoffice/medewerkers?success=removed");
}

export async function changeRole(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const membershipId = String(formData.get("membership_id") ?? "");
  const newRole = String(formData.get("role") ?? "") as MemberRole;

  if (!membershipId || !STAFF_ROLES.includes(newRole)) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();

  const { data: row } = await service
    .from("memberships")
    .select("user_id")
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!row) redirect("/backoffice/medewerkers?error=not_found");

  if ((row.user_id as string) === user.id) {
    redirect("/backoffice/medewerkers?error=cannot_change_own_role");
  }

  const { error } = await service
    .from("memberships")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id);

  if (error) {
    if (error.code === "23505") {
      redirect("/backoffice/medewerkers?error=role_conflict");
    }
    redirect("/backoffice/medewerkers?error=update_failed");
  }

  redirect("/backoffice/medewerkers?success=role_changed");
}
