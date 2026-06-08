"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTemporaryPassword } from "@/lib/auth/generate-password";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { loadEmailBranding } from "@/lib/notifications/branding";
import { sendEmail } from "@/lib/notifications/provider";
import { renderStaffWelcome } from "@/lib/notifications/staff-welcome";
import { requireOrganizationPermission } from "@/lib/organization";
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

const ROLE_LABEL: Partial<Record<MemberRole, string>> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
};

function blockPlatformAdmin(isPlatformAdmin: boolean | undefined) {
  if (isPlatformAdmin) redirect("/backoffice/medewerkers?error=forbidden");
}

function formIds(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function appendQuery(url: string, key: string, value: string | null | undefined): string {
  if (!value) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

function redirectToRoleTarget(
  formData: FormData,
  fallback: string,
  params?: Record<string, string>,
): never {
  const raw = String(formData.get("return_to") ?? "").trim();
  let target = raw || fallback;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      target = appendQuery(target, key, value);
    }
  }
  redirect(target);
}

/** Find an existing auth user id by email, paging through the admin list. */
async function findUserIdByEmail(
  service: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function rollbackNewStaffUser(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
  membershipId?: string,
) {
  if (membershipId) {
    await service
      .from("memberships")
      .delete()
      .eq("id", membershipId)
      .eq("tenant_id", tenantId);
  }
  await service.from("profiles").delete().eq("id", userId);
  await service.auth.admin.deleteUser(userId).catch(() => {});
}

async function removeMembership(
  service: SupabaseClient,
  tenantId: string,
  membershipId: string,
) {
  await service
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("tenant_id", tenantId);
}

async function setMembershipTeamsOrThrow(
  service: SupabaseClient,
  membershipId: string,
  tenantId: string,
  actorId: string,
  teamIds: string[],
) {
  const { error } = await service.rpc("set_membership_organization_teams", {
    p_membership_id: membershipId,
    p_tenant_id: tenantId,
    p_actor: actorId,
    p_team_ids: teamIds,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function inviteInstructor(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("user:manage");
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as MemberRole;
  const branchIds = formIds(formData, "branch_ids[]");
  const teamIds = formIds(formData, "team_ids[]");

  if (!email || !STAFF_ROLES.includes(role)) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();

  const { data: profileRow } = await service
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let userId = (profileRow?.id as string | undefined) ?? null;
  if (!userId) {
    try {
      userId = await findUserIdByEmail(service, email);
    } catch (err) {
      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(
            err instanceof Error ? err.message : "Account opzoeken mislukt.",
          ),
      );
    }
  }

  let temporaryPassword: string | null = null;
  let createdNewUser = false;

  if (!userId) {
    temporaryPassword = generateTemporaryPassword();
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          must_change_password: true,
          ...(fullName ? { full_name: fullName } : {}),
        },
      });

    if (createError || !created.user) {
      const msg = createError?.message ?? "Accountaanmaak mislukt.";
      if (
        msg.toLowerCase().includes("already registered") ||
        msg.toLowerCase().includes("already been registered")
      ) {
        redirect(
          "/backoffice/medewerkers?error=invite_failed&reason=" +
            encodeURIComponent("Dit e-mailadres bestaat al als account."),
        );
      }
      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(msg),
      );
    }

    userId = created.user.id;
    createdNewUser = true;
  }

  const { data: existingAny } = await service
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", organization.id)
    .limit(1)
    .maybeSingle();

  if (existingAny) {
    redirect(
      "/backoffice/medewerkers?error=already_member&email=" +
        encodeURIComponent(email),
    );
  }

  const profilePayload: { id: string; email: string; full_name?: string } = {
    id: userId,
    email,
  };
  if (fullName) profilePayload.full_name = fullName;

  const { error: profileError } = await service.from("profiles").upsert(
    profilePayload,
    { onConflict: "id" },
  );

  if (profileError) {
    if (createdNewUser) {
      await rollbackNewStaffUser(service, organization.id, userId);
    }
    redirect(
      "/backoffice/medewerkers?error=invite_failed&reason=" +
        encodeURIComponent(profileError.message),
    );
  }

  const { data: memberRow, error: memberError } = await service
    .from("memberships")
    .insert({ user_id: userId, tenant_id: organization.id, role })
    .select("id")
    .maybeSingle();

  if (memberError || !memberRow) {
    if (createdNewUser) {
      await rollbackNewStaffUser(service, organization.id, userId);
    }
    if (memberError?.code === "23505") {
      redirect(
        "/backoffice/medewerkers?error=already_member&email=" +
          encodeURIComponent(email),
      );
    }
    redirect("/backoffice/medewerkers?error=membership_failed");
  }

  if (branchIds.length > 0) {
    const { error: branchError } = await service.rpc("set_membership_branches", {
      p_membership_id: memberRow.id,
      p_branch_ids: branchIds,
      p_actor: user.id,
    });

    if (branchError) {
      await removeMembership(service, organization.id, memberRow.id as string);

      if (createdNewUser) {
        await rollbackNewStaffUser(service, organization.id, userId, memberRow.id as string);
      }

      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(
            `Vestigingstoegang instellen mislukt: ${branchError.message}`,
          ),
      );
    }
  }

  if (teamIds.length > 0) {
    try {
      await setMembershipTeamsOrThrow(
        service,
        memberRow.id as string,
        organization.id,
        user.id,
        teamIds,
      );
    } catch (err) {
      if (createdNewUser) {
        await rollbackNewStaffUser(service, organization.id, userId, memberRow.id as string);
      } else {
        await removeMembership(service, organization.id, memberRow.id as string);
      }

      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(
            `Teamindeling instellen mislukt: ${err instanceof Error ? err.message : "Onbekende fout"}`,
          ),
      );
    }
  }

  if (temporaryPassword) {
    let emailError: string | null = null;
    try {
      const [branding, platformConfig] = await Promise.all([
        loadEmailBranding(service, organization.id),
        getPlatformEmailConfig(service).catch(() => null),
      ]);
      const appUrl =
        process.env["NEXT_PUBLIC_APP_URL"] ??
        process.env["NEXTAUTH_URL"] ??
        "https://app.nxtdrive.io";
      const loginUrl = `${appUrl}/login`;
      const emailContent = renderStaffWelcome(branding, {
        staffName: fullName || email,
        email,
        temporaryPassword,
        loginUrl,
        roleLabel: ROLE_LABEL[role] ?? role,
      });
      const emailResult = await sendEmail({
        to: email,
        fromName: branding.tenantName,
        email: emailContent,
        platformConfig: platformConfig ?? undefined,
      });
      if (!emailResult.ok) {
        emailError = emailResult.skipped
          ? "E-mailprovider is niet geconfigureerd voor deze omgeving."
          : `E-mail versturen mislukt: ${emailResult.error}`;
        console.error("[inviteInstructor] sendEmail failed:", emailResult.error);
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : "E-mail versturen mislukt.";
    }

    if (emailError) {
      await rollbackNewStaffUser(service, organization.id, userId, memberRow.id as string);
      redirect(
        "/backoffice/medewerkers?error=invite_failed&reason=" +
          encodeURIComponent(emailError),
      );
    }
  }

  redirect(
    `/backoffice/medewerkers?success=${temporaryPassword ? "credentials_sent" : "added"}&email=` +
      encodeURIComponent(email),
  );
}

export async function removeMember(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("user:manage");
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) redirect("/backoffice/medewerkers?error=missing_fields");

  const service = createServiceRoleClient();

  const { data: row } = await service
    .from("memberships")
    .select("user_id")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!row) redirect("/backoffice/medewerkers?error=not_found");

  if ((row.user_id as string) === user.id) {
    redirect("/backoffice/medewerkers?error=cannot_remove_self");
  }

  const { error } = await service
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("tenant_id", organization.id);

  if (error) redirect("/backoffice/medewerkers?error=remove_failed");

  redirect("/backoffice/medewerkers?success=removed");
}

export async function changeRole(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("user:manage");
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const membershipId = String(formData.get("membership_id") ?? "");
  const newRole = String(formData.get("role") ?? "") as MemberRole;

  if (!membershipId || !STAFF_ROLES.includes(newRole)) {
    redirectToRoleTarget(formData, "/backoffice/medewerkers", {
      error: "missing_fields",
    });
  }

  const service = createServiceRoleClient();

  const { data: row } = await service
    .from("memberships")
    .select("user_id")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!row) {
    redirectToRoleTarget(formData, "/backoffice/medewerkers", {
      error: "not_found",
    });
  }

  if ((row.user_id as string) === user.id) {
    redirectToRoleTarget(formData, "/backoffice/medewerkers", {
      error: "cannot_change_own_role",
    });
  }

  const { error } = await service
    .from("memberships")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("tenant_id", organization.id);

  if (error) {
    if (error.code === "23505") {
      redirectToRoleTarget(formData, "/backoffice/medewerkers", {
        error: "role_conflict",
      });
    }
    redirectToRoleTarget(formData, "/backoffice/medewerkers", {
      error: "update_failed",
    });
  }

  redirectToRoleTarget(formData, "/backoffice/medewerkers", {
    success: "role_changed",
  });
}

export async function setMembershipTeams(formData: FormData) {
  const { user, organization } = await requireOrganizationPermission("user:manage");
  blockPlatformAdmin(user.profile?.is_platform_admin);

  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const teamIds = formIds(formData, "team_ids[]");

  if (!membershipId) {
    redirect("/backoffice/medewerkers?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const { data: membershipRow } = await service
    .from("memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!membershipRow) {
    redirect("/backoffice/medewerkers?error=not_found");
  }

  try {
    await setMembershipTeamsOrThrow(service, membershipId, organization.id, user.id, teamIds);
  } catch (err) {
    redirect(
      `/backoffice/medewerkers/${membershipId}/teams?error=save_failed&reason=` +
        encodeURIComponent(err instanceof Error ? err.message : "Onbekende fout"),
    );
  }

  redirect(`/backoffice/medewerkers/${membershipId}/teams?success=updated`);
}
