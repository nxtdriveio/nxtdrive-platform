import type { AuthenticatedUser } from "@/lib/types";
import { uniqueTenants } from "./session";

/**
 * Returns the best landing path for a user after login. Priority:
 *  1. Platform admin → /admin
 *  2. Multiple tenants → /select-tenant
 *  3. Single tenant: tenant_admin → /backoffice, instructor → /instructor,
 *     student (or student+parent) → /student, pure parent → /ouder
 *  4. No memberships → /  (will show a "no access" prompt)
 */
export function landingPathFor(user: AuthenticatedUser): string {
  if (user.profile?.is_platform_admin) return "/admin";

  const tenants = uniqueTenants(user);
  if (tenants.length === 0) return "/";
  if (tenants.length > 1) return "/select-tenant";

  const tenantId = tenants[0]!.id;
  const roles = user.memberships
    .filter((m) => m.tenant_id === tenantId)
    .map((m) => m.role);

  if (roles.includes("tenant_admin")) return "/backoffice";
  if (roles.includes("instructor")) return "/instructor";
  if (roles.includes("student")) return "/student";
  if (roles.includes("parent")) return "/ouder";
  return "/";
}
