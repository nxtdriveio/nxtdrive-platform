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

const managementFile = repoPath("artifacts", "nxtdrive", "lib", "dashboard", "management.ts");
const organizationDashboard = repoPath(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "organisatie",
  "dashboard",
  "page.tsx",
);
const branchDashboard = repoPath(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "instellingen",
  "vestigingen",
  "[branchId]",
  "dashboard",
  "page.tsx",
);
const franchiseDashboard = repoPath(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "franchise",
  "page.tsx",
);
const docsFile = repoPath("docs", "SPRINT_9_DASHBOARDS_REPORTING.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(managementFile, "loadOrganizationManagementOverview", "organization management loader");
expectIncludes(managementFile, "loadBranchManagementOverview", "branch management loader");
expectIncludes(organizationDashboard, "Organisatiedashboard", "organization dashboard page");
expectIncludes(organizationDashboard, "Vestigingsritme", "organization branch rhythm section");
expectIncludes(branchDashboard, "Vestigingsdashboard", "branch dashboard page");
expectIncludes(branchDashboard, "Aandachtspunten", "branch watchlist section");
expectIncludes(franchiseDashboard, "Netwerkgezondheid", "franchise health section");
expectIncludes(franchiseDashboard, "Franchise playbook", "franchise governance routing");
expectIncludes(docsFile, "# Sprint 9 - Dashboards & Rapportages", "sprint 9 docs");
expectIncludes(packageFile, "\"test-management-dashboard-foundation\"", "package script registration");

console.log("test-management-dashboard-foundation: ok");
