import "server-only";

import { redirect } from "next/navigation";
import { roleHomePath } from "@/lib/auth/role-home";
import { requireActiveOrganization } from "./context";
import {
  branchScopeForRoles,
  rolesForPermission,
  rolesGrantPermission,
  type BranchAccessScope,
  type Permission,
} from "@/lib/permissions";
import type { ActiveOrganizationContext } from "./context";
import type { MemberRole } from "@/lib/types";

export type AuthorizedOrganizationContext = ActiveOrganizationContext & {
  permission: Permission;
  branchScope: BranchAccessScope;
};

/**
 * Organization-domain permission guard for new server code.
 *
 * Existing pages can keep using role checks while they are migrated. New module
 * code should call this helper with a resource/action permission and use the
 * returned branchScope to apply explicit branch filters when needed.
 */
export async function requireOrganizationPermission(
  permission: Permission,
  options: { allowedRoles?: MemberRole[] } = {},
): Promise<AuthorizedOrganizationContext> {
  const allowedRoles = options.allowedRoles ?? rolesForPermission(permission);
  const context = await requireActiveOrganization(allowedRoles);

  if (
    !context.user.profile?.is_platform_admin &&
    !rolesGrantPermission(context.roles, permission)
  ) {
    redirect(roleHomePath(context.user, context.organization.id));
  }

  const branchScope = branchScopeForRoles(
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
