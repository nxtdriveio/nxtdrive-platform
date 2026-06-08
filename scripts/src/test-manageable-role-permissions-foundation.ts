/**
 * Static guardrails for Sprint 6A manageable role permissions.
 *
 *   pnpm --filter @workspace/scripts run test-manageable-role-permissions-foundation
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

const migration = source("supabase/migrations/0113_manageable_role_permission_overrides.sql");
const organizationIndex = source("artifacts/nxtdrive/lib/organization/index.ts");
const organizationPermissions = source("artifacts/nxtdrive/lib/organization/permissions.ts");
const rolePermissions = source("artifacts/nxtdrive/lib/organization/role-permissions.ts");
const permissionsPage = source("artifacts/nxtdrive/app/backoffice/organisatie/permissies/page.tsx");
const permissionsActions = source("artifacts/nxtdrive/app/backoffice/organisatie/permissies/actions.ts");
const organizationPage = source("artifacts/nxtdrive/app/backoffice/organisatie/page.tsx");
const sidebar = source("artifacts/nxtdrive/components/backoffice/sidebar.tsx");
const docs = source("docs/SPRINT_6_MANAGEABLE_PERMISSIONS.md");
const scriptsPackage = source("scripts/package.json");

check(
  "migration creates override table and rpc",
  migration.includes("organization_role_permission_overrides") &&
    migration.includes("set_organization_role_permission_overrides") &&
    migration.includes("tenant_admin") &&
    migration.includes("franchise_admin"),
);
check(
  "organization facade exports manageable permission helpers",
  organizationIndex.includes("manageablePermissions") &&
    organizationIndex.includes("manageableRoles") &&
    organizationIndex.includes("sanitizeOverrideEntries") &&
    organizationIndex.includes("RolePermissionEffect"),
);
check(
  "organization permission guard resolves tenant overrides server-side",
  organizationPermissions.includes("ALL_MEMBER_ROLES") &&
    organizationPermissions.includes("listOrganizationRolePermissionOverrides") &&
    organizationPermissions.includes("effectiveRolesGrantPermission") &&
    organizationPermissions.includes("createServiceRoleClient"),
);
check(
  "role permission module exposes defaults and override explanations",
  rolePermissions.includes("defaultPermissionState") &&
    rolePermissions.includes("permissionOverrideValue") &&
    rolePermissions.includes("permissionOverrideExplains"),
);
check(
  "permissions page exposes role switcher and override form",
  permissionsPage.includes("Rolpermissies beheren") &&
    permissionsPage.includes("saveOrganizationRolePermissionsAction") &&
    permissionsPage.includes("manageablePermissions") &&
    permissionsPage.includes("permissionOverrideValue") &&
    permissionsPage.includes("settings:manage"),
);
check(
  "permissions action persists overrides through rpc",
  permissionsActions.includes("set_organization_role_permission_overrides") &&
    permissionsActions.includes("sanitizeOverrideEntries") &&
    permissionsActions.includes("revalidatePath") &&
    permissionsActions.includes("settings:manage"),
);
check(
  "organization hub links to permissions management",
  organizationPage.includes("/backoffice/organisatie/permissies") &&
    organizationPage.includes("Permissies beheren") &&
    organizationPage.includes("permission registry"),
);
check(
  "sidebar exposes permissions under beheer",
  sidebar.includes("/backoffice/organisatie/permissies") &&
    sidebar.includes('label: "Permissies"') &&
    sidebar.includes("ShieldCheck"),
);
check(
  "documentation records sprint 6A scope",
  docs.includes("Sprint 6A - Manageable Role Permissions") &&
    docs.includes("test-manageable-role-permissions-foundation") &&
    docs.includes("de standaard registry blijft leidend"),
);
check(
  "scripts package includes the new guardrail command",
  scriptsPackage.includes("test-manageable-role-permissions-foundation"),
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
console.log("All manageable role permissions guardrails passed.");
