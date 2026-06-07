/**
 * Static tests for the lead/CRM branch-scope foundation slice.
 *
 *   pnpm --filter @workspace/scripts run test-lead-scope-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  rolesGrantPermission,
  scopesForPermission,
} from "../../artifacts/nxtdrive/lib/permissions/index.ts";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const registrySrc = source("artifacts/nxtdrive/lib/permissions/registry.ts");
const leadAccessSrc = source("artifacts/nxtdrive/lib/leads/access.ts");
const leadServiceSrc = source("artifacts/nxtdrive/lib/leads/lead-service.ts");
const leadsPageSrc = source("artifacts/nxtdrive/app/backoffice/leads/page.tsx");
const leadDetailLayoutSrc = source("artifacts/nxtdrive/app/backoffice/leads/[id]/layout.tsx");

check(
  "instructors have explicit own/branch lead read permission",
  rolesGrantPermission(["instructor"], "lead:read") &&
    !rolesGrantPermission(["instructor"], "lead:manage") &&
    scopesForPermission(["instructor"], "lead:read").includes("branch") &&
    scopesForPermission(["instructor"], "lead:read").includes("own") &&
    registrySrc.includes('{ permission: "lead:read", scopes: ["branch", "own"] }'),
);
check(
  "lead access helper centralizes branch and instructor assignment checks",
  leadAccessSrc.includes("requireLeadBackofficeAccess") &&
    leadAccessSrc.includes("requireLeadAccessContext") &&
    leadAccessSrc.includes("LEAD_BACKOFFICE_READ_ROLES") &&
    leadAccessSrc.includes("canReadLeadRow") &&
    leadAccessSrc.includes("canCollaborateOnLeadRow") &&
    leadAccessSrc.includes("canAccessBranch(branchScope, lead.branch_id)") &&
    leadAccessSrc.includes("lead.assigned_instructor_id === context.user.id") &&
    leadAccessSrc.includes('requireOrganizationPermission("lead:read"'),
);
check(
  "lead dashboard read layer accepts expanded branch and own-assignment scope",
  leadServiceSrc.includes("type LeadQueryOptions") &&
    leadServiceSrc.includes("branchScope?: BranchAccessScope") &&
    leadServiceSrc.includes("assignedUserId?: string | null") &&
    leadServiceSrc.includes("applyBranchScope") &&
    leadServiceSrc.includes("hasNoLeadVisibility") &&
    leadServiceSrc.includes("assignedLeadFilter") &&
    leadServiceSrc.includes('"id, tenant_id, branch_id') &&
    leadServiceSrc.includes('.in("branch_id", branchIds)') &&
    leadServiceSrc.includes("getLeadKpis(") &&
    leadServiceSrc.includes("options: LeadQueryOptions = {}"),
);
check(
  "leads overview uses organization permission and scoped query options",
  leadsPageSrc.includes('requireOrganizationPermission("lead:read",') &&
    leadsPageSrc.includes("LEAD_BACKOFFICE_READ_ROLES") &&
    leadsPageSrc.includes("loadOrganizationBranchScope") &&
    leadsPageSrc.includes('assignedUserId: context.roles.includes("instructor") ? context.user.id : null') &&
    leadsPageSrc.includes("getLeadKpis(supabase, tenant.id, now, scorePolicy.bands.hot, leadQueryOptions)") &&
    leadsPageSrc.includes("getLeadsForTab(supabase, tenant.id, tab, now, filters, leadQueryOptions)") &&
    !leadsPageSrc.includes("requireActiveTenant"),
);
check(
  "lead detail route validates access before the existing detail component renders",
  leadDetailLayoutSrc.includes("requireLeadBackofficeAccess") &&
    leadDetailLayoutSrc.includes("createServiceRoleClient") &&
    leadDetailLayoutSrc.includes('id,\n    "read"') &&
    leadDetailLayoutSrc.includes("if (!lead) notFound()"),
);

console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "OK" : "FAIL";
  console.log(`${mark} ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All lead scope foundation tests passed.");
