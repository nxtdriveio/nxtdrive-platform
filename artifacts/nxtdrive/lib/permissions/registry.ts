import type { MemberRole } from "@/lib/types";

export const PERMISSION_RESOURCES = [
  "organization",
  "branch",
  "team",
  "user",
  "student",
  "lead",
  "planning",
  "vehicle",
  "invoice",
  "task",
  "franchise",
  "report",
  "settings",
] as const;

export const PERMISSION_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "manage",
  "assign",
  "export",
] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type Permission = `${PermissionResource}:${PermissionAction}`;

export type PermissionScopeKind = "platform" | "organization" | "branch" | "own";

export type PermissionGrant = {
  permission: Permission;
  scopes: PermissionScopeKind[];
};

const TENANT_ADMIN_PERMISSIONS = [
  "organization:read",
  "organization:update",
  "branch:manage",
  "team:manage",
  "user:manage",
  "student:manage",
  "lead:manage",
  "planning:manage",
  "vehicle:manage",
  "invoice:manage",
  "task:manage",
  "report:read",
  "report:export",
  "settings:manage",
] as const satisfies readonly Permission[];

const FRANCHISE_ADMIN_PERMISSIONS = [
  ...TENANT_ADMIN_PERMISSIONS,
  "franchise:manage",
] as const satisfies readonly Permission[];

export const ROLE_PERMISSION_GRANTS: Record<MemberRole, readonly PermissionGrant[]> = {
  tenant_admin: TENANT_ADMIN_PERMISSIONS.map((permission) => ({
    permission,
    scopes: ["organization"],
  })),
  franchise_admin: FRANCHISE_ADMIN_PERMISSIONS.map((permission) => ({
    permission,
    scopes: ["organization"],
  })),
  branch_manager: [
    { permission: "branch:read", scopes: ["branch"] },
    { permission: "student:manage", scopes: ["branch"] },
    { permission: "lead:manage", scopes: ["branch"] },
    { permission: "planning:manage", scopes: ["branch"] },
    { permission: "vehicle:read", scopes: ["branch"] },
    { permission: "task:manage", scopes: ["branch"] },
    { permission: "report:read", scopes: ["branch"] },
  ],
  planner: [
    { permission: "branch:read", scopes: ["branch"] },
    { permission: "student:read", scopes: ["branch"] },
    { permission: "planning:manage", scopes: ["branch"] },
    { permission: "vehicle:read", scopes: ["branch"] },
    { permission: "task:read", scopes: ["branch"] },
  ],
  admin_staff: [
    { permission: "organization:read", scopes: ["organization"] },
    { permission: "student:read", scopes: ["branch"] },
    { permission: "planning:read", scopes: ["branch"] },
    { permission: "invoice:manage", scopes: ["branch"] },
    { permission: "task:manage", scopes: ["branch"] },
    { permission: "report:read", scopes: ["branch"] },
  ],
  marketing: [
    { permission: "organization:read", scopes: ["organization"] },
    { permission: "lead:manage", scopes: ["branch"] },
    { permission: "student:read", scopes: ["branch"] },
    { permission: "planning:read", scopes: ["branch"] },
    { permission: "task:read", scopes: ["branch"] },
    { permission: "report:read", scopes: ["branch"] },
  ],
  instructor: [
    { permission: "student:read", scopes: ["branch", "own"] },
    { permission: "planning:read", scopes: ["branch", "own"] },
    { permission: "task:read", scopes: ["own"] },
  ],
  student: [
    { permission: "student:read", scopes: ["own"] },
    { permission: "planning:read", scopes: ["own"] },
    { permission: "invoice:read", scopes: ["own"] },
    { permission: "task:read", scopes: ["own"] },
  ],
  parent: [
    { permission: "student:read", scopes: ["own"] },
    { permission: "planning:read", scopes: ["own"] },
    { permission: "invoice:read", scopes: ["own"] },
  ],
};

function splitPermission(permission: Permission): [PermissionResource, PermissionAction] {
  return permission.split(":") as [PermissionResource, PermissionAction];
}

function grantCoversPermission(
  grantedPermission: Permission,
  requestedPermission: Permission,
): boolean {
  if (grantedPermission === requestedPermission) return true;

  const [grantedResource, grantedAction] = splitPermission(grantedPermission);
  const [requestedResource, requestedAction] = splitPermission(requestedPermission);

  return (
    grantedResource === requestedResource &&
    grantedAction === "manage" &&
    requestedAction !== "manage"
  );
}

export function roleGrantsPermission(
  role: MemberRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSION_GRANTS[role].some((grant) =>
    grantCoversPermission(grant.permission, permission),
  );
}

export function rolesGrantPermission(
  roles: readonly MemberRole[],
  permission: Permission,
): boolean {
  return roles.some((role) => roleGrantsPermission(role, permission));
}

export function scopesForPermission(
  roles: readonly MemberRole[],
  permission: Permission,
): PermissionScopeKind[] {
  const scopes = new Set<PermissionScopeKind>();
  for (const role of roles) {
    for (const grant of ROLE_PERMISSION_GRANTS[role]) {
      if (grantCoversPermission(grant.permission, permission)) {
        for (const scope of grant.scopes) scopes.add(scope);
      }
    }
  }
  return Array.from(scopes);
}

export function rolesForPermission(permission: Permission): MemberRole[] {
  return (Object.keys(ROLE_PERMISSION_GRANTS) as MemberRole[]).filter((role) =>
    roleGrantsPermission(role, permission),
  );
}

export function assertRolesGrantPermission(
  roles: readonly MemberRole[],
  permission: Permission,
): void {
  if (!rolesGrantPermission(roles, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}
