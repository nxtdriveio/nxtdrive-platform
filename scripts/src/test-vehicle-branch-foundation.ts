/**
 * Static guardrails for Sprint 4A vehicle/location branch scope.
 *
 *   pnpm --filter @workspace/scripts run test-vehicle-branch-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rolesGrantPermission } from "../../artifacts/nxtdrive/lib/permissions/index.ts";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const vehiclesPageSrc = source("artifacts/nxtdrive/app/backoffice/voertuigen/page.tsx");
const vehicleActionsSrc = source("artifacts/nxtdrive/app/backoffice/voertuigen/actions.ts");
const contextDataSrc = source("artifacts/nxtdrive/lib/lessons/context-data.ts");
const lessonTypesSrc = source("artifacts/nxtdrive/lib/lessons/types.ts");
const vehicleBranchMigration = source("supabase/migrations/0103_vehicle_location_branch_scope.sql");

check(
  "vehicle permissions distinguish read and manage scope",
  rolesGrantPermission(["tenant_admin"], "vehicle:manage") &&
    rolesGrantPermission(["franchise_admin"], "vehicle:manage") &&
    rolesGrantPermission(["branch_manager"], "vehicle:read") &&
    rolesGrantPermission(["planner"], "vehicle:read") &&
    !rolesGrantPermission(["planner"], "vehicle:manage"),
);

check(
  "vehicles page uses organization permission and expanded branch scope",
  vehiclesPageSrc.includes('requireOrganizationPermission("vehicle:read")') &&
    vehiclesPageSrc.includes("loadOrganizationBranchScope") &&
    vehiclesPageSrc.includes("branchFilterIds") &&
    vehiclesPageSrc.includes("rolesGrantPermission(context.roles, \"vehicle:manage\")") &&
    vehiclesPageSrc.includes("includeShared: true") &&
    vehiclesPageSrc.includes("branchLabel") &&
    !vehiclesPageSrc.includes("requireActiveTenant"),
);

check(
  "vehicle actions use organization manage permission",
  vehicleActionsSrc.includes('requireOrganizationPermission("vehicle:manage")') &&
    vehicleActionsSrc.includes("createServiceRoleClient") &&
    !vehicleActionsSrc.includes("requireActiveTenant"),
);

check(
  "vehicle and location loaders select and filter branch ids",
  contextDataSrc.includes("branchIds?: readonly string[] | null") &&
    contextDataSrc.includes("includeShared?: boolean") &&
    contextDataSrc.includes("branch_id.is.null") &&
    contextDataSrc.includes("branch_id.in.") &&
    contextDataSrc.includes("id, tenant_id, branch_id, label") &&
    contextDataSrc.includes("id, tenant_id, branch_id, name"),
);

check(
  "vehicle and location types include branch ids",
  lessonTypesSrc.includes("export type Vehicle") &&
    lessonTypesSrc.includes("branch_id: string | null") &&
    lessonTypesSrc.includes("export type Location"),
);

check(
  "vehicle branch migration adds columns, indexes and tenant guard",
  vehicleBranchMigration.includes("add column if not exists branch_id") &&
    vehicleBranchMigration.includes("idx_vehicles_tenant_branch") &&
    vehicleBranchMigration.includes("idx_locations_tenant_branch") &&
    vehicleBranchMigration.includes("ensure_vehicle_location_branch_tenant") &&
    vehicleBranchMigration.includes("vehicles_branch_tenant_guard") &&
    vehicleBranchMigration.includes("locations_branch_tenant_guard") &&
    vehicleBranchMigration.includes("Null means shared across the organization"),
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
console.log("All vehicle branch foundation tests passed.");
