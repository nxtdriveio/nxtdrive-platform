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
const organizationBranchScopeSrc = source("artifacts/nxtdrive/lib/organization/branch-scope.ts");
const studentAccessSrc = source("artifacts/nxtdrive/lib/students/access.ts");
const studentsPageSrc = source("artifacts/nxtdrive/app/backoffice/leerlingen/page.tsx");
const studentDetailSrc = source("artifacts/nxtdrive/app/backoffice/leerlingen/[id]/page.tsx");
const studentActionsSrc = source("artifacts/nxtdrive/app/backoffice/leerlingen/actions.ts");
const typesSrc = source("artifacts/nxtdrive/lib/types.ts");
const studentTypesSrc = source("artifacts/nxtdrive/lib/students/types.ts");
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
  "manage grants cover same-resource read checks",
  rolesGrantPermission(["tenant_admin"], "student:read") &&
    rolesGrantPermission(["franchise_admin"], "student:read") &&
    rolesGrantPermission(["branch_manager"], "student:read") &&
    rolesForPermission("student:read").includes("tenant_admin") &&
    rolesForPermission("student:read").includes("branch_manager") &&
    scopesForPermission(["branch_manager"], "student:read").includes("branch"),
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
    registrySrc.includes("grantCoversPermission") &&
    registrySrc.includes("ROLE_PERMISSION_GRANTS") &&
    scopeSrc.includes("BranchAccessScope"),
);
check(
  "organization facade exports permission and branch scope guards",
  organizationIndex.includes("requireOrganizationPermission") &&
    organizationIndex.includes("loadOrganizationBranchScope") &&
    organizationPermissionSrc.includes("rolesGrantPermission") &&
    organizationPermissionSrc.includes("branchScopeForRoles") &&
    organizationBranchScopeSrc.includes("membership_branches") &&
    organizationBranchScopeSrc.includes("branch_scope_type === \"branches\""),
);
check(
  "student backoffice access guard centralizes role and branch checks",
  studentAccessSrc.includes("requireStudentBackofficeAccess") &&
    studentAccessSrc.includes("STUDENT_BACKOFFICE_READ_ROLES") &&
    studentAccessSrc.includes("STUDENT_BACKOFFICE_COLLABORATE_ROLES") &&
    studentAccessSrc.includes("canAccessBranch(branchScope, student.branch_id)") &&
    studentAccessSrc.includes('mode === "admin" ? "student:manage" : "student:read"'),
);
check(
  "students list consumes shared organization permission branch scope",
  studentsPageSrc.includes('requireOrganizationPermission("student:read",') &&
    studentsPageSrc.includes("STUDENT_BACKOFFICE_READ_ROLES") &&
    !studentsPageSrc.includes('"student",') &&
    !studentsPageSrc.includes('"parent",') &&
    studentsPageSrc.includes("loadOrganizationBranchScope") &&
    studentsPageSrc.includes('.in("branch_id", branchScope.branch_ids)') &&
    studentsPageSrc.includes("Alle toegestane vestigingen"),
);
check(
  "student detail uses backoffice access guard before dossier reads",
  studentDetailSrc.includes("requireStudentBackofficeAccess") &&
    !studentDetailSrc.includes("requireActiveTenant") &&
    studentDetailSrc.indexOf("requireStudentBackofficeAccess") <
      studentDetailSrc.indexOf("loadStudentDossier") &&
    studentDetailSrc.includes("if (!student) notFound()"),
);
check(
  "student actions use backoffice access guard before protected writes",
  studentActionsSrc.includes("requireStudentBackofficeAccess") &&
    studentActionsSrc.includes("requireOrganizationPermission") &&
    !studentActionsSrc.includes("requireActiveTenant") &&
    studentActionsSrc.includes('"collaborate"') &&
    studentActionsSrc.includes('"admin"'),
);
check(
  "membership type and auth bootstrap include branch_scope_type",
  typesSrc.includes("export type BranchScopeType") &&
    typesSrc.includes("branch_scope_type: BranchScopeType") &&
    sessionSrc.includes("branch_scope_type"),
);
check(
  "student type includes branch id",
  studentTypesSrc.includes("branch_id: string | null"),
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
