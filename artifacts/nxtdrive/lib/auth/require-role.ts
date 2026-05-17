import { redirect } from "next/navigation";
import { getCurrentUser, rolesForTenant } from "./session";
import { resolveActiveTenant } from "./active-tenant";
import type { AuthenticatedUser, MemberRole, Tenant } from "@/lib/types";

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!user.profile?.is_platform_admin) redirect("/");
  return user;
}

export async function requireTenantRole(
  tenantId: string,
  allowedRoles: MemberRole[],
): Promise<{ user: AuthenticatedUser; roles: MemberRole[] }> {
  const user = await requireUser();
  const roles = rolesForTenant(user, tenantId);
  const hasRole = roles.some((r) => allowedRoles.includes(r));
  if (!hasRole && !user.profile?.is_platform_admin) redirect("/");
  return { user, roles };
}

/**
 * Resolves the active tenant via cookie / auto-pick, then asserts that the
 * user holds at least one of `allowedRoles` in that tenant. Redirects to
 * /select-tenant when the active tenant is ambiguous, and to / when the user
 * has no matching access.
 */
export async function requireActiveTenant(
  allowedRoles: MemberRole[],
): Promise<{ user: AuthenticatedUser; tenant: Tenant; roles: MemberRole[] }> {
  const user = await requireUser();
  const tenant = await resolveActiveTenant(user);
  if (!tenant) redirect("/select-tenant");

  const roles = user.memberships
    .filter((m) => m.tenant_id === tenant.id)
    .map((m) => m.role);

  const hasRole = roles.some((r) => allowedRoles.includes(r));
  if (!hasRole && !user.profile?.is_platform_admin) redirect("/");

  return { user, tenant, roles };
}
