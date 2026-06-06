/**
 * Unit/static tests for the organization foundation hardening.
 *
 *   pnpm --filter @workspace/scripts run test-organization-foundation
 *
 * Covers:
 *  - role routing for franchise_admin and backoffice staff roles.
 *  - role priority for student/parent and empty roles.
 *  - source-level guardrails that auth bootstrap and host resolution keep
 *    selecting organization metadata (`org_type`, `parent_tenant_id`).
 *  - the tenant-backed Organization aliases and facade remain present.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as routingNs from "../../artifacts/nxtdrive/lib/auth/role-routing.ts";
import type { MemberRole } from "../../artifacts/nxtdrive/lib/types.ts";

const routingMod = ((routingNs as { default?: typeof routingNs }).default ??
  routingNs) as typeof routingNs;
const { homePathForRoles } = routingMod;

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function pathFor(roles: MemberRole[]): string {
  return homePathForRoles(roles);
}

// ---- pure role routing -----------------------------------------------------
check(
  "franchise_admin lands in /backoffice",
  pathFor(["franchise_admin"]) === "/backoffice",
);
check(
  "branch staff roles land in /backoffice",
  ["branch_manager", "planner", "admin_staff", "marketing"].every(
    (role) => pathFor([role as MemberRole]) === "/backoffice",
  ),
);
check(
  "instructor keeps dedicated PWA route",
  pathFor(["instructor"]) === "/instructor",
);
check(
  "student wins over parent for combined student+parent users",
  pathFor(["parent", "student"]) === "/student",
);
check("pure parent lands in /ouder", pathFor(["parent"]) === "/ouder");
check("empty role set falls back to /", pathFor([]) === "/");

// ---- organization metadata guardrails --------------------------------------
{
  const sessionSrc = source("artifacts/nxtdrive/lib/auth/session.ts");
  check(
    "auth bootstrap selects org_type",
    sessionSrc.includes("org_type"),
  );
  check(
    "auth bootstrap selects parent_tenant_id",
    sessionSrc.includes("parent_tenant_id"),
  );
}

{
  const resolveHostSrc = source("artifacts/nxtdrive/lib/tenant/resolve-host.ts");
  check(
    "host resolution selects org_type",
    resolveHostSrc.includes("org_type"),
  );
  check(
    "host resolution selects parent_tenant_id",
    resolveHostSrc.includes("parent_tenant_id"),
  );
}

{
  const typesSrc = source("artifacts/nxtdrive/lib/types.ts");
  check(
    "Organization alias is tenant-backed",
    typesSrc.includes("export type Organization = Tenant"),
  );
}

{
  const contextSrc = source("artifacts/nxtdrive/lib/organization/context.ts");
  check(
    "organization facade exposes requireActiveOrganization",
    contextSrc.includes("requireActiveOrganization"),
  );
  check(
    "organization facade exposes organizationsForUser",
    contextSrc.includes("organizationsForUser"),
  );
}

// ---- report ---------------------------------------------------------------
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
console.log("All organization foundation tests passed.");
