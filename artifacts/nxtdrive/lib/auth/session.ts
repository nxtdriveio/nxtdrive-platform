import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type {
  AuthenticatedUser,
  MemberRole,
  Membership,
  Profile,
  Tenant,
} from "@/lib/types";

/**
 * Returns the current authenticated user with their profile and memberships,
 * or null if not logged in. Uses the service role to load profile + memberships
 * to avoid RLS recursion on the auth bootstrap path.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const service = createServiceRoleClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, full_name, is_platform_admin, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  const { data: memberships } = await service
    .from("memberships")
    .select(
      "id, user_id, tenant_id, role, created_at, tenant:tenants(id, slug, name, plan, white_label_enabled, parent_tenant_id)",
    )
    .eq("user_id", user.id);

  return {
    id: user.id,
    email: user.email ?? "",
    profile: profile ?? null,
    memberships: (memberships ?? []) as unknown as Array<
      Membership & { tenant: Tenant }
    >,
  };
}

export function rolesForTenant(
  user: AuthenticatedUser,
  tenantId: string,
): MemberRole[] {
  return user.memberships
    .filter((m) => m.tenant_id === tenantId)
    .map((m) => m.role);
}

export function uniqueTenants(
  user: AuthenticatedUser,
): Array<Tenant> {
  const seen = new Map<string, Tenant>();
  for (const m of user.memberships) {
    if (m.tenant && !seen.has(m.tenant.id)) {
      seen.set(m.tenant.id, m.tenant);
    }
  }
  return Array.from(seen.values());
}
