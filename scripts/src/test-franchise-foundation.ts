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

const contextFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "context.ts");
const planningFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "planning.ts");
const dashboardPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "page.tsx");
const planningPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "planning", "page.tsx");
const comparisonPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "vergelijking", "page.tsx");
const sidebarFile = repoPath("artifacts", "nxtdrive", "components", "backoffice", "sidebar.tsx");
const docsFile = repoPath("docs", "SPRINT_7_FRANCHISE_ARCHITECTURE.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(contextFile, "export async function loadFranchiseContext", "franchise context loader");
expectIncludes(planningFile, "export async function loadFranchisePlanningOverview", "franchise planning loader");
expectIncludes(dashboardPage, "Franchise is geen multi-vestiging", "franchise canon callout");
expectIncludes(dashboardPage, "/backoffice/franchise/planning", "dashboard planning link");
expectIncludes(dashboardPage, "/backoffice/franchise/vergelijking", "dashboard comparison link");
expectIncludes(planningPage, "Centrale planning", "franchise planning page");
expectIncludes(planningPage, "Read-only over tenants heen", "planning read-only badge");
expectIncludes(comparisonPage, "Franchisevergelijking", "comparison page title");
expectIncludes(comparisonPage, "Franchise versus multi-vestiging", "comparison governance explainer");
expectIncludes(sidebarFile, 'href: "/backoffice/franchise/planning"', "sidebar planning item");
expectIncludes(sidebarFile, 'href: "/backoffice/franchise/vergelijking"', "sidebar comparison item");
expectIncludes(docsFile, "# Sprint 7A - Franchise Foundation", "sprint 7 docs");
expectIncludes(packageFile, '"test-franchise-foundation"', "package script registration");

console.log("test-franchise-foundation: ok");
