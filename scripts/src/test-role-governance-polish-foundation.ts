import { readFileSync } from "node:fs";
import path from "node:path";

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), "..", ...parts);
}

function expectIncludes(filePath: string, snippet: string, label: string) {
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(snippet)) {
    throw new Error(`Expected ${label} in ${filePath}`);
  }
}

const rolesFile = repoPath("artifacts", "nxtdrive", "lib", "organization", "roles.ts");
const indexFile = repoPath("artifacts", "nxtdrive", "lib", "organization", "index.ts");
const alertsComponent = repoPath("artifacts", "nxtdrive", "components", "organization", "governance-alerts.tsx");
const inviteForm = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "invite-form.tsx");
const accessPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "toegang", "page.tsx");
const branchesPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "vestigingen", "page.tsx");
const teamsPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "teams", "page.tsx");
const permissionsPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "organisatie", "permissies", "page.tsx");
const rolesPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "organisatie", "rollen", "page.tsx");
const docsFile = repoPath("docs", "SPRINT_6_MANAGEABLE_PERMISSIONS.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(rolesFile, "roleGovernanceAlerts(", "governance alert helper");
expectIncludes(rolesFile, "isStaffGovernanceRole(", "staff governance type guard");
expectIncludes(indexFile, "roleGovernanceAlerts", "role governance alert export");
expectIncludes(alertsComponent, "GovernanceAlerts", "shared governance alerts component");
expectIncludes(inviteForm, "GovernanceAlerts alerts={governanceAlerts}", "invite governance alerts");
expectIncludes(accessPage, "Governance context", "membership governance context card");
expectIncludes(branchesPage, "Governance bij branch-scope", "branch governance card");
expectIncludes(teamsPage, "Governance en teams", "team governance card");
expectIncludes(permissionsPage, "Governance eerst", "permission governance primer");
expectIncludes(permissionsPage, "Rollen bekijken", "permissions to roles cross-link");
expectIncludes(rolesPage, "Van canon naar uitvoering", "role page execution links");
expectIncludes(docsFile, "# Sprint 6D - Access Governance Polish", "Sprint 6D docs");
expectIncludes(packageFile, '"test-role-governance-polish-foundation"', "package script registration");

console.log("test-role-governance-polish-foundation: ok");
