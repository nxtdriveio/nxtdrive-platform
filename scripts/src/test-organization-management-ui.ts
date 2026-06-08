/**
 * Static guardrails for Sprint 5A organization management UI.
 *
 *   pnpm --filter @workspace/scripts run test-organization-management-ui
 *
 * These checks protect the product canon that Organization is the primary
 * operational container, while branches, staff, roles and teams sit below it.
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
const organizationActions = source("artifacts/nxtdrive/app/backoffice/organisatie/actions.ts");
const sidebar = source("artifacts/nxtdrive/components/backoffice/sidebar.tsx");
const employeesPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/page.tsx");
const inviteForm = source("artifacts/nxtdrive/app/backoffice/medewerkers/invite-form.tsx");
const branchesPage = source("artifacts/nxtdrive/app/backoffice/instellingen/vestigingen/page.tsx");
const profileModule = source("artifacts/nxtdrive/lib/organization/profile.ts");
const docs = source("docs/SPRINT_5_ORGANIZATION_MANAGEMENT.md");

check(
  "organization page uses canonical permission guard",
  organizationPage.includes("requireOrganizationPermission") &&
    organizationPage.includes('"organization:update"') &&
    organizationActions.includes("requireOrganizationPermission") &&
    organizationActions.includes('"organization:update"'),
);
check(
  "organization page loads and saves organization profile",
  organizationPage.includes("loadOrganizationProfile") &&
    organizationActions.includes("upsertOrganizationProfile") &&
    profileModule.includes("upsertOrganizationProfile"),
);
check(
  "organization page exposes core management sections",
  [
    "Organisatiebeheer",
    "Organisatieprofiel",
    "Vestigingen",
    "Medewerkers en rollen",
    "Teams",
  ].every((needle) => organizationPage.includes(needle)),
);
check(
  "organization page links to existing branch and staff flows",
  organizationPage.includes('/backoffice/instellingen/vestigingen') &&
    organizationPage.includes('/backoffice/medewerkers'),
);
check(
  "owner selection is validated against organization staff",
  organizationPage.includes('name="owner_user_id"') &&
    organizationActions.includes("invalid_owner") &&
    organizationActions.includes('.eq("tenant_id", organization.id)') &&
    organizationActions.includes('.eq("user_id", ownerUserId)'),
);
check(
  "sidebar exposes organization management under beheer",
  sidebar.includes("Building2") &&
    sidebar.includes('/backoffice/organisatie') &&
    sidebar.includes('label: "Organisatie"'),
);
check(
  "staff invite flow keeps temporary-password onboarding",
  employeesPage.includes("InviteForm") &&
    inviteForm.includes("tijdelijk wachtwoord") &&
    inviteForm.includes("Inloggegevens versturen"),
);
check(
  "staff invite flow keeps role and branch assignment",
  inviteForm.includes('name="role"') &&
    inviteForm.includes('name="branch_ids[]"') &&
    inviteForm.includes("Geen selectie = toegang tot alle vestigingen"),
);
check(
  "branch management remains the canonical branch UI",
  branchesPage.includes("Vestigingen") &&
    branchesPage.includes("BranchForm") &&
    branchesPage.includes("listBranches"),
);
check(
  "Sprint 5 documentation records remaining team/RBAC follow-up",
  docs.includes("Sprint 5A") &&
    docs.includes("Teams") &&
    docs.includes("Sprint 6"),
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
console.log("All organization management UI guardrails passed.");
