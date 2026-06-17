import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_PERMISSIONS,
  permissionAction,
  permissionResource,
  roleGrantsPermission,
  type Permission,
} from "@/lib/permissions";
import type { MemberRole } from "@/lib/types";

export const MANAGEABLE_PERMISSION_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

export type ManageablePermissionRole = (typeof MANAGEABLE_PERMISSION_ROLES)[number];
export type RolePermissionEffect = "allow" | "deny";

export type OrganizationRolePermissionOverride = {
  id: string;
  tenant_id: string;
  role: ManageablePermissionRole;
  permission: Permission;
  effect: RolePermissionEffect;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type RolePermissionClient = Pick<SupabaseClient, "from">;

function isMissingPermissionOverridesTableError(error: {
  message: string;
  details?: string | null;
  code?: string;
}): boolean {
  const combined = [error.code, error.message, error.details]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return (
    combined.includes("organization_role_permission_overrides") &&
    (combined.includes("does not exist") ||
      combined.includes("schema cache") ||
      combined.includes("Could not find the table") ||
      combined.includes("PGRST205") ||
      combined.includes("42P01"))
  );
}

function isManageablePermissionRole(
  role: MemberRole,
): role is ManageablePermissionRole {
  return MANAGEABLE_PERMISSION_ROLES.includes(role as ManageablePermissionRole);
}

export function manageableRoles(): readonly ManageablePermissionRole[] {
  return MANAGEABLE_PERMISSION_ROLES;
}

export function manageablePermissions(): readonly Permission[] {
  return ALL_PERMISSIONS;
}

export async function listOrganizationRolePermissionOverrides(
  client: RolePermissionClient,
  tenantId: string,
): Promise<OrganizationRolePermissionOverride[]> {
  const { data, error } = await client
    .from("organization_role_permission_overrides")
    .select(
      "id, tenant_id, role, permission, effect, created_by, updated_by, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("role", { ascending: true })
    .order("permission", { ascending: true });

  if (error) {
    // Production can briefly run code ahead of the organization-permissions
    // migration. In that case we fall back to the hardcoded registry instead of
    // crashing the whole backoffice on every permission-guarded page.
    if (isMissingPermissionOverridesTableError(error)) {
      return [];
    }
    throw new Error(`listOrganizationRolePermissionOverrides: ${error.message}`);
  }

  return (data ?? []) as unknown as OrganizationRolePermissionOverride[];
}

export function permissionOverridesForRole(
  overrides: readonly OrganizationRolePermissionOverride[],
  role: ManageablePermissionRole,
): OrganizationRolePermissionOverride[] {
  return overrides.filter((override) => override.role === role);
}

export function overrideMapForRole(
  overrides: readonly OrganizationRolePermissionOverride[],
  role: ManageablePermissionRole,
): Map<Permission, RolePermissionEffect> {
  return new Map(
    permissionOverridesForRole(overrides, role).map((override) => [
      override.permission,
      override.effect,
    ]),
  );
}

export function effectiveRolePermission(
  role: MemberRole,
  permission: Permission,
  overrides: readonly OrganizationRolePermissionOverride[],
): boolean {
  const effectMap = new Map<Permission, RolePermissionEffect>(
    overrides.map((override) => [override.permission, override.effect]),
  );

  const exact = effectMap.get(permission);
  if (exact === "allow") return true;
  if (exact === "deny") return false;

  if (permissionAction(permission) !== "manage") {
    const managePermission = `${permissionResource(permission)}:manage` as Permission;
    const manageOverride = effectMap.get(managePermission);
    if (manageOverride === "allow") return true;
    if (manageOverride === "deny") return false;
  }

  return roleGrantsPermission(role, permission);
}

export function effectiveRolePermissions(
  role: MemberRole,
  overrides: readonly OrganizationRolePermissionOverride[],
): Permission[] {
  const relevantOverrides = isManageablePermissionRole(role)
    ? permissionOverridesForRole(overrides, role)
    : [];

  return manageablePermissions().filter((permission) =>
    effectiveRolePermission(role, permission, relevantOverrides),
  );
}

export function effectiveRolesGrantPermission(
  roles: readonly MemberRole[],
  permission: Permission,
  overrides: readonly OrganizationRolePermissionOverride[],
): boolean {
  return roles.some((role) => {
    if (!isManageablePermissionRole(role)) {
      return effectiveRolePermission(role, permission, []);
    }

    const roleOverrides = permissionOverridesForRole(overrides, role);
    return effectiveRolePermission(role, permission, roleOverrides);
  });
}

export function defaultPermissionState(
  role: ManageablePermissionRole,
  permission: Permission,
): "allow" | "deny" {
  return roleGrantsPermission(role, permission) ? "allow" : "deny";
}

export function permissionOverrideValue(
  role: ManageablePermissionRole,
  permission: Permission,
  overrides: readonly OrganizationRolePermissionOverride[],
): "inherit" | RolePermissionEffect {
  const effect = overrideMapForRole(overrides, role).get(permission);
  return effect ?? "inherit";
}

export function sanitizeOverrideEntries(
  entries: readonly { permission: string; effect: string }[],
): Array<{ permission: Permission; effect: RolePermissionEffect }> {
  const validPermissions = new Set(ALL_PERMISSIONS);
  const sanitized = new Map<Permission, RolePermissionEffect>();

  for (const entry of entries) {
    if (!validPermissions.has(entry.permission as Permission)) continue;
    if (entry.effect !== "allow" && entry.effect !== "deny") continue;
    sanitized.set(entry.permission as Permission, entry.effect);
  }

  return Array.from(sanitized.entries()).map(([permission, effect]) => ({
    permission,
    effect,
  }));
}

export function permissionOverrideExplains(
  permission: Permission,
): string {
  if (permissionAction(permission) === "manage") {
    return "Beheerrechten omvatten automatisch lezen en onderliggende acties binnen hetzelfde domein.";
  }
  return "Deze permissie kan los van de standaardrol worden toegestaan of geweigerd.";
}
