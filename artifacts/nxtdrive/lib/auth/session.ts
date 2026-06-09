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

  const profileSelect =
    "id, email, full_name, is_platform_admin, calendar_start_hour, calendar_end_hour, created_at";
  const legacyProfileSelect = "id, email, full_name, is_platform_admin, created_at";

  const { data: profileRaw, error: profileError } = await service
    .from("profiles")
    .select(profileSelect)
    .eq("id", user.id)
    .maybeSingle();

  let profile = profileRaw as Profile | null;
  if (profileError) {
    const missingCalendarColumns =
      profileError.message.includes("calendar_start_hour") ||
      profileError.message.includes("calendar_end_hour");

    if (!missingCalendarColumns) {
      throw profileError;
    }

    const { data: legacyProfile, error: legacyProfileError } = await service
      .from("profiles")
      .select(legacyProfileSelect)
      .eq("id", user.id)
      .maybeSingle();

    if (legacyProfileError) {
      throw legacyProfileError;
    }

    profile = legacyProfile
      ? ({
          ...legacyProfile,
          calendar_start_hour: 6,
          calendar_end_hour: 22,
        } as Profile)
      : null;
  }

  const { data: memberships } = await service
    .from("memberships")
    .select(
      "id, user_id, tenant_id, role, branch_scope_type, created_at, tenant:tenants(id, slug, name, plan, white_label_enabled, org_type, parent_tenant_id)",
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
