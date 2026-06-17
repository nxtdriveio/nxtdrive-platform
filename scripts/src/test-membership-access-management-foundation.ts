/**
 * Static guardrails for Sprint 6B membership access management.
 *
 *   pnpm --filter @workspace/scripts run test-membership-access-management-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const rolePermissions = source("artifacts/nxtdrive/lib/organization/role-permissions.ts");
const organizationIndex = source("artifacts/nxtdrive/lib/organization/index.ts");
const staffActions = source("artifacts/nxtdrive/app/backoffice/medewerkers/actions.ts");
const staffPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/page.tsx");
const branchActions = source("artifacts/nxtdrive/lib/branches/actions.ts");
const accessPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/[membershipId]/toegang/page.tsx");
const branchPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/[membershipId]/vestigingen/page.tsx");
const teamPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/[membershipId]/teams/page.tsx");
const docs = source("docs/SPRINT_6_MANAGEABLE_PERMISSIONS.md");
const scriptsPackage = source("scripts/package.json");

check(
  "role permission helpers expose effective role listing",
  rolePermissions.includes("effectiveRolePermissions") &&
    rolePermissions.includes("isManageablePermissionRole") &&
    rolePermissions.includes("manageablePermissions().filter"),
);
check(
  "organization facade exports effective role permission listing",
  organizationIndex.includes("effectiveRolePermissions"),
);
check(
  "staff management actions use organization permission guard",
  staffActions.includes('requireOrganizationPermission("user:manage")') &&
    !staffActions.includes("requireActiveTenant"),
);
check(
  "branch actions use organization permission guards",
  branchActions.includes('requireOrganizationPermission("branch:manage")') &&
    branchActions.includes('requireOrganizationPermission("user:manage")') &&
    !branchActions.includes("requireActiveTenant"),
);
check(
  "staff page links to access overview and permissions hub",
  staffPage.includes('/backoffice/medewerkers/${member.id}/toegang') &&
    staffPage.includes("Toegangsoverzicht") &&
    staffPage.includes("/backoffice/organisatie/permissies"),
);
check(
  "membership access page shows role scope teams and effective permissions",
  accessPage.includes("Toegang voor") &&
    accessPage.includes("effectiveRolePermissions") &&
    accessPage.includes("Vestigingsscope") &&
    accessPage.includes("Effectieve permissies"),
);
check(
  "branch page links back to access overview",
  branchPage.includes("Terug naar toegangsoverzicht") &&
    branchPage.includes("scope") &&
    branchPage.includes("Vestigingen beheren"),
);
check(
  "team page links back to access overview",
  teamPage.includes("Terug naar toegangsoverzicht") &&
    teamPage.includes("Teams voor") &&
    teamPage.includes("Vestigingen beheren"),
);
check(
  "Sprint 6 docs describe membership access management",
  docs.includes("Sprint 6B - Membership Access Management") &&
    docs.includes("test-membership-access-management-foundation") &&
    docs.includes("branch-scope bepaalt waar branch-gebonden rechten mogen gelden"),
);
check(
  "scripts package includes membership access management guardrail",
  scriptsPackage.includes("test-membership-access-management-foundation"),
);

console.log("");
let failed = 0;
for (const result of results) {
  const mark = result.ok ? "OK" : "FAIL";
  console.log(`${mark} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  if (!result.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All membership access management guardrails passed.");
