"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  manageablePermissions,
  manageableRoles,
  requireOrganizationPermission,
  sanitizeOverrideEntries,
  type ManageablePermissionRole,
  type RolePermissionEffect,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";

function permissionsUrl(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/backoffice/organisatie/permissies${query ? `?${query}` : ""}`;
}

function parseRole(value: FormDataEntryValue | null): ManageablePermissionRole | null {
  if (typeof value !== "string") return null;
  const role = value.trim() as ManageablePermissionRole;
  return manageableRoles().includes(role) ? role : null;
}

export async function saveOrganizationRolePermissionsAction(
  formData: FormData,
): Promise<void> {
  const { user, organization } = await requireOrganizationPermission("settings:manage");
  const role = parseRole(formData.get("role"));

  if (!role) {
    redirect(permissionsUrl({ error: "invalid_role" }));
  }

  const entries = manageablePermissions().flatMap((permission) => {
    const value = formData.get(`perm:${permission}`);
    if (value !== "allow" && value !== "deny") return [];
    return [{ permission, effect: value as RolePermissionEffect }];
  });

  const overrides = sanitizeOverrideEntries(entries);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_organization_role_permission_overrides", {
    p_tenant_id: organization.id,
    p_role: role,
    p_actor: user.id,
    p_overrides: overrides,
  });

  if (error) {
    redirect(
      permissionsUrl({
        error: "save_failed",
        role,
        reason: error.message,
      }),
    );
  }

  revalidatePath("/backoffice/organisatie");
  revalidatePath("/backoffice/organisatie/permissies");
  redirect(permissionsUrl({ success: "saved", role }));
}
