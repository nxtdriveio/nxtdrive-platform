/**
 * Static guardrails for Sprint 5D management UX consistency.
 *
 *   pnpm --filter @workspace/scripts run test-organization-management-ux-consistency
 *
 * These checks keep organization, branches, teams and staff pages aligned as
 * one management flow instead of drifting back into isolated admin screens.
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

const organizationPage = source("artifacts/nxtdrive/app/backoffice/organisatie/page.tsx");
const branchesPage = source("artifacts/nxtdrive/app/backoffice/instellingen/vestigingen/page.tsx");
const teamsPage = source("artifacts/nxtdrive/app/backoffice/organisatie/teams/page.tsx");
const staffPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/page.tsx");
const docs = source("docs/SPRINT_5_ORGANIZATION_MANAGEMENT.md");

check(
  "organization hub exposes operational readiness and quick links",
  organizationPage.includes("Operationele voortgang") &&
    organizationPage.includes("Vestigingen beheren") &&
    organizationPage.includes("Medewerkers beheren") &&
    organizationPage.includes("Teams beheren"),
);
check(
  "branches page has stat cards, back link and optional-structure guidance",
  branchesPage.includes("Terug naar organisatiebeheer") &&
    branchesPage.includes("Actieve vestigingen") &&
    branchesPage.includes("Vestigingen zijn optioneel") &&
    branchesPage.includes("Nog geen vestigingen"),
);
check(
  "teams page has stat cards and cross-links to related management screens",
  teamsPage.includes("Medewerkers in teams") &&
    teamsPage.includes("Organisatiebreed") &&
    teamsPage.includes("/backoffice/medewerkers") &&
    teamsPage.includes("/backoffice/instellingen/vestigingen"),
);
check(
  "staff page has summary stats and contextual setup guidance",
  staffPage.includes("Vestiging-scoped") &&
    staffPage.includes("In teams") &&
    staffPage.includes("Beheercontext") &&
    staffPage.includes("Nog geen medewerkers"),
);
check(
  "Sprint documentation records 5D UX consistency",
  docs.includes("Sprint 5D - Management UX Consistency") &&
    docs.includes("test-organization-management-ux-consistency"),
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
console.log("All organization management UX consistency guardrails passed.");
