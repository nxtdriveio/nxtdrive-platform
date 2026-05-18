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
  if (roles.includes("student")) return "/student";
  // Parent role exists in the schema but the /student PWA is gated to
  // ["student"] only until a parent↔student linkage model lands (see
  // follow-up #9). Sending a parent to /student here would create a
  // self-redirect loop, so we bounce them to the public root for now.
  return "/";
}
