import type { AuthenticatedUser, MemberRole } from "@/lib/types";

/**
 * Picks the most appropriate landing route for a user when they're denied
 * access to another role's section. Priority mirrors the privilege ladder:
 * platform admin → tenant admin → instructor → student.
 */
export function roleHomePath(user: AuthenticatedUser, tenantId?: string): string {
  if (user.profile?.is_platform_admin) return "/admin";

  const roles = (
    tenantId
      ? user.memberships.filter((m) => m.tenant_id === tenantId)
      : user.memberships
  ).map((m) => m.role as MemberRole);

  if (roles.includes("tenant_admin")) return "/backoffice";
  if (roles.includes("instructor")) return "/instructor";
  if (roles.includes("student") || roles.includes("parent")) return "/student";
  return "/";
}
