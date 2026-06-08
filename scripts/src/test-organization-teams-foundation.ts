/**
 * Static guardrails for Sprint 5B organization teams.
 *
 *   pnpm --filter @workspace/scripts run test-organization-teams-foundation
 *
 * Teams are a structural organization layer, not a replacement for RBAC. These
 * checks ensure the datamodel, RLS, RPCs and UI stay aligned with that canon.
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

const profileRpcMigration = source("supabase/migrations/0110_organization_profile_tenant_admin_upsert.sql");
const teamsMigration = source("supabase/migrations/0111_organization_teams.sql");
const teamsService = source("artifacts/nxtdrive/lib/organization/teams.ts");
const organizationIndex = source("artifacts/nxtdrive/lib/organization/index.ts");
const organizationPage = source("artifacts/nxtdrive/app/backoffice/organisatie/page.tsx");
const teamsPage = source("artifacts/nxtdrive/app/backoffice/organisatie/teams/page.tsx");
const teamsActions = source("artifacts/nxtdrive/app/backoffice/organisatie/teams/actions.ts");
const sidebar = source("artifacts/nxtdrive/components/backoffice/sidebar.tsx");
const docs = source("docs/SPRINT_5_ORGANIZATION_MANAGEMENT.md");

check(
  "organization profile RPC fix allows own tenant admins only",
  profileRpcMigration.includes("role in ('tenant_admin', 'franchise_admin')") &&
    profileRpcMigration.includes("m.tenant_id = p_tenant_id") &&
    profileRpcMigration.includes("to service_role"),
);
check(
  "teams migration creates team tables",
  teamsMigration.includes("create table if not exists public.organization_teams") &&
    teamsMigration.includes("create table if not exists public.organization_team_members"),
);
check(
  "teams support optional branch scope",
  teamsMigration.includes("branch_id uuid references public.branches") &&
    teamsMigration.includes("organization_team_validate_branch") &&
    teamsMigration.includes("teamvestiging hoort niet bij deze organisatie"),
);
check(
  "team members are constrained to staff in same organization",
  teamsMigration.includes("organization_team_member_validate_tenant") &&
    teamsMigration.includes("m.role not in ('student', 'parent')") &&
    teamsMigration.includes("teamlid moet een medewerker binnen deze organisatie zijn"),
);
check(
  "teams RLS and Data API grants are explicit",
  teamsMigration.includes("enable row level security") &&
    teamsMigration.includes("grant select on public.organization_teams to authenticated") &&
    teamsMigration.includes("grant select, insert, update, delete on public.organization_teams to service_role") &&
    teamsMigration.includes("current_user_can_access_optional_branch"),
);
check(
  "team writes are audited service-role RPCs",
  [
    "create_organization_team",
    "update_organization_team",
    "set_organization_team_members",
    "organization_team.created",
    "organization_team.updated",
    "organization_team.members_set",
  ].every((needle) => teamsMigration.includes(needle)) &&
    teamsMigration.includes("to service_role"),
);
check(
  "organization facade exports team helpers",
  organizationIndex.includes("listOrganizationTeams") &&
    organizationIndex.includes("OrganizationTeam") &&
    teamsService.includes("teamMemberIdsForTeam"),
);
check(
  "teams page uses team permission and existing staff/branch context",
  teamsPage.includes('requireOrganizationPermission("team:manage")') &&
    teamsPage.includes("listBranches") &&
    teamsPage.includes("listOrganizationTeams") &&
    teamsPage.includes("membership_ids[]"),
);
check(
  "team actions write through RPCs only",
  teamsActions.includes('requireOrganizationPermission("team:manage")') &&
    teamsActions.includes('rpc("create_organization_team"') &&
    teamsActions.includes('rpc("update_organization_team"') &&
    teamsActions.includes('rpc("set_organization_team_members"'),
);
check(
  "organization hub and sidebar link to teams",
  organizationPage.includes('/backoffice/organisatie/teams') &&
    organizationPage.includes("listOrganizationTeams") &&
    sidebar.includes('/backoffice/organisatie/teams') &&
    sidebar.includes('label: "Teams"'),
);
check(
  "Sprint documentation records 5B and leaves invitation/team assignment for 5C",
  docs.includes("Sprint 5B") &&
    docs.includes("organization_teams") &&
    docs.includes("Sprint 5C"),
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
console.log("All organization teams foundation guardrails passed.");
