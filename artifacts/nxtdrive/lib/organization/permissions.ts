import "server-only";

import { redirect } from "next/navigation";
import { roleHomePath } from "@/lib/auth/role-home";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveOrganization } from "./context";
import {
  branchScopeForRoles,
  type BranchAccessScope,
  type Permission,
} from "@/lib/permissions";
import {
  effectiveRolesGrantPermission,
  listOrganizationRolePermissionOverrides,
} from "./role-permissions";
import type { ActiveOrganizationContext } from "./context";
import type { MemberRole } from "@/lib/types";

export type AuthorizedOrganizationContext = ActiveOrganizationContext & {
  permission: Permission;
  branchScope: BranchAccessScope;
};

const ALL_MEMBER_ROLES: MemberRole[] = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
  "student",
  "parent",
];

/**
 * Organization-domain permission guard for new server code.
 *
 * Existing pages can keep using role checks while they are migrated. New module
 * code should call this helper with a resource/action permission. Branch-scoped
 * modules must still load membership branch IDs before applying data filters;
 * this guard exposes the safe scope type from the authenticated organization
 * context and returns an empty branch list when IDs have not been expanded.
 */
export async function requireOrganizationPermission(
  permission: Permission,
  options: { allowedRoles?: MemberRole[] } = {},
): Promise<AuthorizedOrganizationContext> {
  const allowedRoles = options.allowedRoles ?? ALL_MEMBER_ROLES;
  const context = await requireActiveOrganization(allowedRoles);

  if (!context.user.profile?.is_platform_admin) {
    const service = createServiceRoleClient();
    const overrides = await listOrganizationRolePermissionOverrides(
      service,
      context.organization.id,
    );

    if (!effectiveRolesGrantPermission(context.roles, permission, overrides)) {
      redirect(roleHomePath(context.user, context.organization.id));
    }
  }

  const branchScope: BranchAccessScope = context.user.profile?.is_platform_admin
    ? { scope_type: "all", branch_ids: null }
    : branchScopeForRoles(
        context.roles,
        context.user.memberships.filter(
          (membership) => membership.tenant_id === context.organization.id,
        ),
      );

  return {
    ...context,
    permission,
    branchScope,
  };
}
