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

const actionsFile = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "actions.ts");
const membersPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "page.tsx");
const rolePage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "rol", "page.tsx");
const roleForm = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "rol", "role-form.tsx");
const accessPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "medewerkers", "[membershipId]", "toegang", "page.tsx");
const organizationPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "organisatie", "page.tsx");
const docsFile = repoPath("docs", "SPRINT_6_MANAGEABLE_PERMISSIONS.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(actionsFile, "return_to", "role change return target support");
expectIncludes(actionsFile, "redirectToRoleTarget", "role redirect helper");
expectIncludes(membersPage, "Rol veilig wijzigen", "staff list role management link");
expectIncludes(rolePage, "Rol beheren voor", "dedicated role management page");
expectIncludes(rolePage, "Een rolwijziging is een governance-keuze", "role change governance stat");
expectIncludes(roleForm, "Nieuwe basisrol", "role management form select");
expectIncludes(roleForm, "GovernanceAlerts alerts={governanceAlerts}", "role management governance alerts");
expectIncludes(accessPage, "Rol beheren", "access overview role management link");
expectIncludes(organizationPage, "Access blueprint", "organization access blueprint card");
expectIncludes(docsFile, "# Sprint 6E - Role Management Wrap-up", "Sprint 6E docs");
expectIncludes(packageFile, '"test-role-management-wrapup-foundation"', "package script registration");

console.log("test-role-management-wrapup-foundation: ok");
