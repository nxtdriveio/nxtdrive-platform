import type { AuthenticatedUser, MemberRole } from "@/lib/types";

/**
 * Picks the most appropriate landing route for a user when they're denied
 * access to another role's section. Priority mirrors the privilege ladder:
 * platform admin → tenant admin → backoffice staff → student → parent.
 *
 * branch_manager, planner, admin_staff, and marketing all land in /backoffice
 * (same as instructor — they share the staff backoffice).
 */
export function roleHomePath(user: AuthenticatedUser, tenantId?: string): string {
  if (user.profile?.is_platform_admin) return "/admin";

  const roles = (
    tenantId
      ? user.memberships.filter((m) => m.tenant_id === tenantId)
      : user.memberships
  ).map((m) => m.role as MemberRole);

  if (roles.includes("tenant_admin")) return "/backoffice";
  if (roles.includes("branch_manager")) return "/backoffice";
  if (roles.includes("planner")) return "/backoffice";
  if (roles.includes("admin_staff")) return "/backoffice";
  if (roles.includes("marketing")) return "/backoffice";
  if (roles.includes("instructor")) return "/instructor";
  if (roles.includes("student")) return "/student";
  if (roles.includes("parent")) return "/ouder";
  return "/";
}
