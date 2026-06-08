/**
 * Static guardrails for Sprint 5C staff team assignment.
 *
 *   pnpm --filter @workspace/scripts run test-staff-team-assignment-foundation
 *
 * These checks keep team assignment operational and tenant-safe while roles and
 * branch scope remain the source of truth for permissions until Sprint 6.
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

const migration = source("supabase/migrations/0112_staff_team_assignment.sql");
const actions = source("artifacts/nxtdrive/app/backoffice/medewerkers/actions.ts");
const inviteForm = source("artifacts/nxtdrive/app/backoffice/medewerkers/invite-form.tsx");
const employeesPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/page.tsx");
const memberTeamsPage = source("artifacts/nxtdrive/app/backoffice/medewerkers/[membershipId]/teams/page.tsx");
const docs = source("docs/SPRINT_5_ORGANIZATION_MANAGEMENT.md");

check(
  "migration adds membership team assignment RPC with tenant and branch safety",
  migration.includes("set_membership_organization_teams") &&
    migration.includes("actor_can_manage_organization_team") &&
    migration.includes("een of meer teams vallen buiten de vestigingstoegang van deze medewerker") &&
    migration.includes("organization_team.membership_teams_set"),
);
check(
  "invite action accepts team ids and writes through audited RPC",
  actions.includes('formIds(formData, "team_ids[]")') &&
    actions.includes('rpc("set_membership_organization_teams"') &&
    actions.includes("Teamindeling instellen mislukt") &&
    actions.includes("export async function setMembershipTeams"),
);
check(
  "invite form exposes optional team selection",
  inviteForm.includes('name="team_ids[]"') &&
    inviteForm.includes("Teams") &&
    inviteForm.includes("Rollen en vestigingstoegang blijven"),
);
check(
  "employees overview loads teams and links to team management",
  employeesPage.includes("listOrganizationTeams") &&
    employeesPage.includes("listOrganizationTeamMembers") &&
    employeesPage.includes("teamIdsForMembership") &&
    employeesPage.includes("/teams") &&
    employeesPage.includes("Teamindeling bijgewerkt"),
);
check(
  "member teams page allows per-membership team management",
  memberTeamsPage.includes("listMembershipOrganizationTeamIds") &&
    memberTeamsPage.includes("setMembershipTeams") &&
    memberTeamsPage.includes('name="team_ids[]"'),
);
check(
  "Sprint documentation records 5C",
  docs.includes("Sprint 5C - Staff Team Assignment") &&
    docs.includes("set_membership_organization_teams") &&
    docs.includes("test-staff-team-assignment-foundation"),
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
console.log("All staff team assignment guardrails passed.");
