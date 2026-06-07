import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  branchScopeForRoles,
  rolesImplyAllBranches,
  type BranchAccessScope,
  type BranchScopedMembership,
} from "@/lib/permissions";
import type { ActiveOrganizationContext } from "./context";

/**
 * Expands the branch scope in an organization context with membership_branches.
 *
 * The auth session intentionally carries only branch_scope_type. Branch-scoped
 * modules must call this before applying branch filters, otherwise an explicit
 * branch scope without loaded IDs stays deny-by-default.
 */
export async function loadOrganizationBranchScope(
  client: SupabaseClient,
  context: ActiveOrganizationContext,
): Promise<BranchAccessScope> {
  if (context.user.profile?.is_platform_admin || rolesImplyAllBranches(context.roles)) {
    return { scope_type: "all", branch_ids: null };
  }

  const roleSet = new Set(context.roles);
  const memberships = context.user.memberships.filter(
    (membership) =>
      membership.tenant_id === context.organization.id && roleSet.has(membership.role),
  );

  const branchScopedMembershipIds = memberships
    .filter((membership) => membership.branch_scope_type === "branches")
    .map((membership) => membership.id);

  if (branchScopedMembershipIds.length === 0) {
    return branchScopeForRoles(context.roles, memberships);
  }

  const { data, error } = await client
    .from("membership_branches")
    .select("membership_id, branch_id")
    .in("membership_id", branchScopedMembershipIds);

  if (error) throw new Error(`loadOrganizationBranchScope: ${error.message}`);

  const branchIdsByMembership = new Map<string, string[]>();
  for (const row of data ?? []) {
    const membershipId = String(row.membership_id);
    const branchId = String(row.branch_id);
    const branchIds = branchIdsByMembership.get(membershipId) ?? [];
    branchIds.push(branchId);
    branchIdsByMembership.set(membershipId, branchIds);
  }

  const expandedMemberships: BranchScopedMembership[] = memberships.map(
    (membership) => ({
      ...membership,
      branch_ids: branchIdsByMembership.get(membership.id) ?? [],
    }),
  );

  return branchScopeForRoles(context.roles, expandedMemberships);
}
