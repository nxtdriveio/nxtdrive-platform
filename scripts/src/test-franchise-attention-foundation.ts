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

const performanceFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "performance.ts");
const dashboardPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "page.tsx");
const attentionPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "aandacht", "page.tsx");
const planningPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "planning", "page.tsx");
const comparisonPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "vergelijking", "page.tsx");
const performancePage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "prestaties", "page.tsx");
const sidebarFile = repoPath("artifacts", "nxtdrive", "components", "backoffice", "sidebar.tsx");
const docsFile = repoPath("docs", "SPRINT_7_FRANCHISE_ARCHITECTURE.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(performanceFile, "attention_priority", "franchise attention priority metadata");
expectIncludes(performanceFile, "follow_up_route", "franchise follow-up route metadata");
expectIncludes(performanceFile, "next_step", "franchise next step metadata");
expectIncludes(dashboardPage, "/backoffice/franchise/aandacht", "dashboard attention link");
expectIncludes(attentionPage, "Franchise aandacht", "attention page title");
expectIncludes(attentionPage, "Volledige opvolgmatrix", "attention matrix section");
expectIncludes(planningPage, "/backoffice/franchise/aandacht", "planning attention link");
expectIncludes(comparisonPage, "/backoffice/franchise/aandacht", "comparison attention link");
expectIncludes(performancePage, "/backoffice/franchise/aandacht", "performance attention link");
expectIncludes(sidebarFile, 'href: "/backoffice/franchise/aandacht"', "sidebar attention item");
expectIncludes(docsFile, "# Sprint 7C - Franchise Attention Center", "sprint 7C docs");
expectIncludes(packageFile, '"test-franchise-attention-foundation"', "package script registration");

console.log("test-franchise-attention-foundation: ok");
