import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

const risData = source("artifacts/nxtdrive/lib/ris/data.ts");
const risPage = source("artifacts/nxtdrive/app/backoffice/ris/page.tsx");
const sidebar = source("artifacts/nxtdrive/components/backoffice/sidebar.tsx");
const routeInfo = source("artifacts/nxtdrive/components/navigation/RouteInfoBubble.tsx");
const docs = source("docs/RIS_LESKAART_IMPLEMENTATION.md");
const packageJson = source("scripts/package.json");

check(
  "RIS backoffice loader is branch-scope aware",
  risData.includes("loadBackofficeRisOverview") &&
    risData.includes("branchScope?: BranchAccessScope") &&
    risData.includes(".in(\"branch_id\", options.branchScope.branch_ids)") &&
    risData.includes("emptyBackofficeRisOverview"),
);

check(
  "RIS backoffice loader exposes operational rows",
  risData.includes("BackofficeRisStudentSummary") &&
    risData.includes("BackofficeRisAttentionRow") &&
    risData.includes("BackofficeRisDraftCard") &&
    risData.includes("BackofficeRisModuleTest") &&
    risData.includes("BackofficeRisInstructorFollowup"),
);

check(
  "RIS backoffice page uses permission, branch scope and service-role batch loading",
  risPage.includes('requireOrganizationPermission("student:read"') &&
    risPage.includes("loadOrganizationBranchScope") &&
    risPage.includes("createServiceRoleClient") &&
    risPage.includes("loadBackofficeRisOverview"),
);

check(
  "RIS backoffice page renders RIS-6 sections",
  risPage.includes("Leerlingen per module") &&
    risPage.includes("Aandachtspunten") &&
    risPage.includes("Niet-gepubliceerde leskaarten") &&
    risPage.includes("Moduletoetsen") &&
    risPage.includes("Instructeur-opvolging"),
);

check(
  "RIS backoffice page is reachable from navigation and route info",
  sidebar.includes('/backoffice/ris') &&
    sidebar.includes("RIS-leskaart") &&
    routeInfo.includes('/backoffice/ris') &&
    routeInfo.includes("Volg RIS-moduleprogressie"),
);

check(
  "RIS documentation marks backoffice sprint as implemented",
  docs.includes("RIS-6: Admin/backoffice") &&
    docs.includes("RIS-overzichten") &&
    docs.includes("niet-gepubliceerde leskaarten"),
);

check("package script exposes RIS backoffice guard", packageJson.includes('"test-ris-backoffice-overview"'));

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS backoffice overview check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-backoffice-overview: ok");
