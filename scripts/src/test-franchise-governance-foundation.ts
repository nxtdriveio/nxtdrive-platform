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

const governanceFile = repoPath("artifacts", "nxtdrive", "lib", "franchise", "governance.ts");
const dashboardPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "page.tsx");
const playbookPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "playbook", "page.tsx");
const templatesPage = repoPath("artifacts", "nxtdrive", "app", "backoffice", "franchise", "templates", "page.tsx");
const sidebarFile = repoPath("artifacts", "nxtdrive", "components", "backoffice", "sidebar.tsx");
const docsFile = repoPath("docs", "SPRINT_7_FRANCHISE_ARCHITECTURE.md");
const packageFile = repoPath("scripts", "package.json");

expectIncludes(governanceFile, "loadFranchiseGovernanceOverview", "franchise governance loader");
expectIncludes(governanceFile, "template_activation_rate", "template activation rate");
expectIncludes(governanceFile, "rollout_gaps", "rollout gap summary");
expectIncludes(dashboardPage, "/backoffice/franchise/playbook", "dashboard playbook link");
expectIncludes(playbookPage, "Franchise playbook", "playbook page title");
expectIncludes(playbookPage, "Rollout gaps", "playbook rollout gaps section");
expectIncludes(playbookPage, "Coaching targets", "playbook coaching section");
expectIncludes(templatesPage, "/backoffice/franchise/playbook", "templates playbook link");
expectIncludes(sidebarFile, 'href: "/backoffice/franchise/playbook"', "sidebar playbook item");
expectIncludes(docsFile, "# Sprint 7D - Franchise Governance Wrap-up", "sprint 7D docs");
expectIncludes(packageFile, '"test-franchise-governance-foundation"', "package script registration");

console.log("test-franchise-governance-foundation: ok");
