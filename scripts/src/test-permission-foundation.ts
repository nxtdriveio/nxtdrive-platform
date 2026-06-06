/**
 * Static/unit tests for Sprint 3 permission and scope foundation.
 *
 *   pnpm --filter @workspace/scripts run test-permission-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  branchScopeForMembership,
  branchScopeForRoles,
  canAccessBranch,
  rolesForPermission,
  rolesGrantPermission,
  scopesForPermission,
} from "../../artifacts/nxtdrive/lib/permissions/index.ts";
import type { MemberRole } from "../../artifacts/nxtdrive/lib/types.ts";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const permissionIndex = source("artifacts/nxtdrive/lib/permissions/index.ts");
const registrySrc = source("artifacts/nxtdrive/lib/permissions/registry.ts");
const scopeSrc = source("artifacts/nxtdrive/lib/permissions/scope.ts");
const organizationIndex = source("artifacts/nxtdrive/lib/organization/index.ts");
const organizationPermissionSrc = source("artifacts/nxtdrive/lib/organization/permissions.ts");
const typesSrc = source("artifacts/nxtdrive/lib/types.ts");
const sessionSrc = source("artifacts/nxtdrive/lib/auth/session.ts");
const migration = source("supabase/migrations/0099_permission_scope_foundation.sql");

check(
  "tenant_admin can manage organization settings",
  rolesGrantPermission(["tenant_admin"], "settings:manage"),
);
check(
  "franchise_admin can manage franchise",
  rolesGrantPermission(["franchise_admin"], "franchise:manage"),
);
check(
  "branch_manager can manage branch students",
  rolesGrantPermission(["branch_manager"], "student:manage"),
);
check(
  "planner can manage planning but not invoices",
  rolesGrantPermission(["planner"], "planning:manage") &&
    !rolesGrantPermission(["planner"], "invoice:manage"),
);
check(
  "admin_staff can manage invoices",
  rolesGrantPermission(["admin_staff"], "invoice:manage"),
);
check(
  "marketing can manage leads but not settings",
  rolesGrantPermission(["marketing"], "lead:manage") &&
    !rolesGrantPermission(["marketing"], "settings:manage"),
);
check(
  "instructor is scoped to student/planning read",
  rolesGrantPermission(["instructor"], "student:read") &&
    rolesGrantPermission(["instructor"], "planning:read") &&
    !rolesGrantPermission(["instructor"], "student:manage"),
);
check(
  "student and parent get own-scoped read permissions",
  rolesGrantPermission(["student"], "student:read") &&
    rolesGrantPermission(["parent"], "student:read") &&
    scopesForPermission(["student"], "student:read").includes("own") &&
    scopesForPermission(["parent"], "student:read").includes("own"),
);
check(
  "rolesForPermission exposes allowed roles",
  rolesForPermission("planning:manage").includes("planner") &&
    rolesForPermission("planning:manage").includes("tenant_admin"),
);

const allScope = branchScopeForRoles(["tenant_admin"], []);
check(
  "tenant_admin implies all branch access",
  allScope.scope_type === "all" && canAccessBranch(allScope, "branch-a"),
);

const branchScope = branchScopeForMembership({
  id: "membership-a",
  tenant_id: "tenant-a",
  role: "planner",
  branch_scope_type: "branches",
  branch_ids: ["branch-a", "branch-b", "branch-a"],
});
check(
  "branch-scoped membership deduplicates explicit branch ids",
  branchScope.scope_type === "branches" &&
    branchScope.branch_ids.length === 2 &&
    canAccessBranch(branchScope, "branch-a") &&
    !canAccessBranch(branchScope, "branch-c"),
);

const emptyBranchScope = branchScopeForMembership({
  id: "membership-empty",
  tenant_id: "tenant-a",
  role: "planner",
  branch_scope_type: "branches",
});
check(
  "empty explicit branch scope is deny-by-default",
  emptyBranchScope.scope_type === "branches" &&
    emptyBranchScope.branch_ids.length === 0 &&
    !canAccessBranch(emptyBranchScope, "branch-a"),
);

const legacyAllScope = branchScopeForMembership({
  id: "membership-b",
  tenant_id: "tenant-a",
  role: "planner",
  branch_scope_type: "all",
});
check(
  "explicit all branch scope remains all-access",
  legacyAllScope.scope_type === "all" && canAccessBranch(legacyAllScope, null),
);

const combinedScope = branchScopeForRoles(
  ["planner", "marketing"],
  [
    {
      id: "membership-c",
      tenant_id: "tenant-a",
      role: "planner",
      branch_scope_type: "branches",
      branch_ids: ["branch-a"],
    },
    {
      id: "membership-d",
      tenant_id: "tenant-a",
      role: "marketing",
      branch_scope_type: "branches",
      branch_ids: ["branch-b"],
    },
  ],
);
check(
  "multiple branch-scoped roles merge branch access",
  combinedScope.scope_type === "branches" &&
    canAccessBranch(combinedScope, "branch-a") &&
    canAccessBranch(combinedScope, "branch-b") &&
    !canAccessBranch(combinedScope, "branch-c"),
);

check(
  "permission package exports registry and scope APIs",
  permissionIndex.includes("rolesGrantPermission") &&
    permissionIndex.includes("branchScopeForRoles") &&
    registrySrc.includes("ROLE_PERMISSION_GRANTS") &&
    scopeSrc.includes("BranchAccessScope"),
);
check(
  "organization facade exports permission guard",
  organizationIndex.includes("requireOrganizationPermission") &&
    organizationPermissionSrc.includes("rolesGrantPermission") &&
    organizationPermissionSrc.includes("branchScopeForRoles"),
);
check(
  "membership type and auth bootstrap include branch_scope_type",
  typesSrc.includes("export type BranchScopeType") &&
    typesSrc.includes("branch_scope_type: BranchScopeType") &&
    sessionSrc.includes("branch_scope_type"),
);
check(
  "migration adds explicit membership branch scope",
  migration.includes("add column if not exists branch_scope_type") &&
    migration.includes("memberships_branch_scope_type_check") &&
    migration.includes("check (branch_scope_type in ('all', 'branches'))"),
);
check(
  "migration syncs branch scope from membership_branches",
  migration.includes("refresh_membership_branch_scope") &&
    migration.includes("membership_branches_sync_scope") &&
    migration.includes("after insert or update or delete on public.membership_branches"),
);

console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "OK" : "FAIL";
  console.log(`${mark} ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All permission foundation tests passed.");
