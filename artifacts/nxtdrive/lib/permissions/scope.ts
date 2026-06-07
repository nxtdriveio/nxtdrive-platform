import type { MemberRole, Membership } from "@/lib/types";

export type BranchScopeType = "all" | "branches";

export type BranchAccessScope =
  | {
      scope_type: "all";
      branch_ids: null;
    }
  | {
      scope_type: "branches";
      branch_ids: string[];
    };

export type BranchScopedMembership = Pick<
  Membership,
  "id" | "tenant_id" | "role" | "branch_scope_type"
> & {
  branch_ids?: string[] | null;
};

const ORGANIZATION_WIDE_BRANCH_ROLES: readonly MemberRole[] = [
  "tenant_admin",
  "franchise_admin",
];

export function rolesImplyAllBranches(roles: readonly MemberRole[]): boolean {
  return roles.some((role) => ORGANIZATION_WIDE_BRANCH_ROLES.includes(role));
}

export function normalizeBranchScopeType(
  value: string | null | undefined,
): BranchScopeType {
  return value === "branches" ? "branches" : "all";
}

export function branchScopeFromIds(branchIds: readonly string[]): BranchAccessScope {
  const uniqueIds = Array.from(new Set(branchIds.filter(Boolean)));
  return { scope_type: "branches", branch_ids: uniqueIds };
}

export function mergeBranchAccessScopes(
  scopes: readonly BranchAccessScope[],
): BranchAccessScope {
  if (scopes.some((scope) => scope.scope_type === "all")) {
    return { scope_type: "all", branch_ids: null };
  }

  return branchScopeFromIds(
    scopes.flatMap((scope) =>
      scope.scope_type === "branches" ? scope.branch_ids : [],
    ),
  );
}

export function branchScopeForMembership(
  membership: BranchScopedMembership,
): BranchAccessScope {
  const scopeType = normalizeBranchScopeType(membership.branch_scope_type);
  if (scopeType === "all") return { scope_type: "all", branch_ids: null };

  // Empty explicit branch scopes are intentionally deny-by-default.
  return branchScopeFromIds(membership.branch_ids ?? []);
}

export function branchScopeForRoles(
  roles: readonly MemberRole[],
  memberships: readonly BranchScopedMembership[],
): BranchAccessScope {
  if (rolesImplyAllBranches(roles)) {
    return { scope_type: "all", branch_ids: null };
  }

  const roleSet = new Set(roles);
  const scopes = memberships
    .filter((membership) => roleSet.has(membership.role))
    .map((membership) => branchScopeForMembership(membership));

  if (scopes.length === 0) return { scope_type: "branches", branch_ids: [] };
  return mergeBranchAccessScopes(scopes);
}

export function canAccessBranch(
  scope: BranchAccessScope,
  branchId: string | null | undefined,
): boolean {
  if (scope.scope_type === "all") return true;
  if (!branchId) return false;
  return scope.branch_ids.includes(branchId);
}

export function scopeRequiresBranchFilter(scope: BranchAccessScope): boolean {
  return scope.scope_type === "branches";
}
