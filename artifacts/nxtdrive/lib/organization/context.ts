import "server-only";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { uniqueTenants } from "@/lib/auth/session";
import type {
  AuthenticatedUser,
  MemberRole,
  Organization,
} from "@/lib/types";

export type ActiveOrganizationContext = {
  user: AuthenticatedUser;
  organization: Organization;
  /** Backward-compatible alias while existing code still speaks tenant. */
  tenant: Organization;
  roles: MemberRole[];
};

/**
 * Organization-domain wrapper around requireActiveTenant.
 *
 * The database still uses tenants as the physical isolation boundary, but new
 * product-facing code should depend on this helper so Organization stays the
 * canonical domain language.
 */
export async function requireActiveOrganization(
  allowedRoles: MemberRole[],
): Promise<ActiveOrganizationContext> {
  const { user, tenant, roles } = await requireActiveTenant(allowedRoles);
  return {
    user,
    organization: tenant,
    tenant,
    roles,
  };
}

export function organizationsForUser(user: AuthenticatedUser): Organization[] {
  return uniqueTenants(user) as Organization[];
}

export function organizationForUser(
  user: AuthenticatedUser,
  organizationId: string,
): Organization | null {
  return organizationsForUser(user).find((org) => org.id === organizationId) ?? null;
}
