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

const accessFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "access.ts");
const performanceFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "performance.ts");
const dashboardPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "page.tsx");
const planningPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "planning", "page.tsx");
const comparisonPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "vergelijking", "page.tsx");
const performancePage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "prestaties", "page.tsx");
const sidebarFile = repoPath("artifacts", "nxtdrive", "components", "backoffice", "sidebar.tsx");
const docsFile = repoPath("docs", "SPRINT_7_FRANCHISE_ARCHITECTURE.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(accessFile, "export async function requireFranchiseOperator", "shared franchise access guard");
expectIncludes(performanceFile, "export async function loadFranchisePerformanceOverview", "franchise performance loader");
expectIncludes(dashboardPage, "/backoffice/franchise/prestaties", "dashboard performance link");
expectIncludes(planningPage, "/backoffice/franchise/prestaties", "planning performance link");
expectIncludes(comparisonPage, "/backoffice/franchise/prestaties", "comparison performance link");
expectIncludes(performancePage, "Franchiseprestaties", "performance page title");
expectIncludes(performancePage, "90 dagen trend", "performance page trend badge");
expectIncludes(sidebarFile, 'href: "/backoffice/franchise/prestaties"', "sidebar performance item");
expectIncludes(docsFile, "# Sprint 7B - Franchise Performance Cockpit", "sprint 7B docs");
expectIncludes(packageFile, '"test-franchise-performance-foundation"', "package script registration");

console.log("test-franchise-performance-foundation: ok");
