/**
 * Static guardrails for Sprint 6C role governance.
 *
 *   pnpm --filter @workspace/scripts run test-role-governance-foundation
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

const roleMetadata = source("artifacts/nxtdrive/lib/organization/roles.ts");
const organizationIndex = source("artifacts/nxtdrive/lib/organization/index.ts");
const rolesPage = source("artifacts/nxtdrive/app/backoffice/organisatie/rollen/page.tsx");
const organizationPage = source("artifacts/nxtdrive/app/backoffice/organisatie/page.tsx");
const staffPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/page.tsx");
const inviteForm = source("artifacts/nxtdrive/app/backoffice/medewerkers/invite-form.tsx");
const sidebar = source("artifacts/nxtdrive/components/backoffice/sidebar.tsx");
const docs = source("docs/SPRINT_6_MANAGEABLE_PERMISSIONS.md");
const scriptsPackage = source("scripts/package.json");

check(
  "role metadata defines governance roles and scope policy",
  roleMetadata.includes("STAFF_GOVERNANCE_ROLES") &&
    roleMetadata.includes("RoleScopePolicy") &&
    roleMetadata.includes("roleGovernanceDefinition") &&
    roleMetadata.includes("isBranchScopedGovernanceRole"),
);
check(
  "organization facade exports role governance helpers",
  organizationIndex.includes("governanceRoles") &&
    organizationIndex.includes("roleGovernanceDefinition") &&
    organizationIndex.includes("roleScopeLabel"),
);
check(
  "roles page exists with governance summaries and permission links",
  rolesPage.includes("Rolgovernance") &&
    rolesPage.includes("governanceRoles") &&
    rolesPage.includes("Permissies beheren") &&
    rolesPage.includes("effectieveRolePermissions".replace("effectieve", "effective")),
);
check(
  "organization hub links to roles page",
  organizationPage.includes("/backoffice/organisatie/rollen") &&
    organizationPage.includes("Rollen bekijken") &&
    organizationPage.includes("rolcanon"),
);
check(
  "staff page exposes role governance guidance",
  staffPage.includes("/backoffice/organisatie/rollen") &&
    staffPage.includes("Rolgovernance") &&
    staffPage.includes("roleGovernanceDefinition") &&
    staffPage.includes("isBranchScopedGovernanceRole"),
);
check(
  "invite form shows live role governance explanation",
  inviteForm.includes("roleGovernanceDefinition") &&
    inviteForm.includes("governance_note") &&
    inviteForm.includes("Vestiging-scoped") &&
    inviteForm.includes("Organisatiebreed"),
);
check(
  "sidebar exposes roles page under beheer",
  sidebar.includes('/backoffice/organisatie/rollen') &&
    sidebar.includes('label: "Rollen"') &&
    sidebar.includes("KeyRound"),
);
check(
  "docs record Sprint 6C role governance",
  docs.includes("Sprint 6C - Role Governance") &&
    docs.includes("test-role-governance-foundation") &&
    docs.includes("kies eerst de juiste basisrol"),
);
check(
  "scripts package registers role governance guardrail",
  scriptsPackage.includes("test-role-governance-foundation"),
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
console.log("All role governance guardrails passed.");
