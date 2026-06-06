/**
 * Static tests for the organization profile foundation (Sprint 2).
 *
 *   pnpm --filter @workspace/scripts run test-organization-profile-foundation
 *
 * These checks protect the architecture contract without requiring a live
 * Supabase project: organization_profiles must stay tenant-backed, RLS-enabled,
 * auditable, and exposed through the organization domain facade.
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

const migration = source("supabase/migrations/0098_organization_profiles.sql");
const profileSrc = source("artifacts/nxtdrive/lib/organization/profile.ts");
const indexSrc = source("artifacts/nxtdrive/lib/organization/index.ts");

check(
  "migration creates organization_profiles",
  migration.includes("create table if not exists public.organization_profiles"),
);
check(
  "profile table is 1:1 with tenants",
  migration.includes("tenant_id uuid primary key references public.tenants(id) on delete cascade"),
);
check(
  "profile owner references auth users",
  migration.includes("owner_user_id uuid references auth.users(id) on delete set null"),
);
check(
  "lifecycle statuses are constrained",
  ["prospect", "onboarding", "active", "paused", "churned"].every((status) =>
    migration.includes(`'${status}'`),
  ),
);
check(
  "onboarding statuses are constrained",
  ["not_started", "in_progress", "ready", "blocked"].every((status) =>
    migration.includes(`'${status}'`),
  ),
);
check(
  "RLS is enabled",
  migration.includes("alter table public.organization_profiles enable row level security"),
);
check(
  "platform admins can read profiles",
  migration.includes("public.is_platform_admin()"),
);
check(
  "tenant/franchise admins can read own profile",
  migration.includes("m.role in ('tenant_admin', 'franchise_admin')"),
);
check(
  "existing tenants are backfilled",
  migration.includes("on conflict (tenant_id) do nothing"),
);
check(
  "profile writes use audited RPC",
  migration.includes("create or replace function public.upsert_organization_profile") &&
    migration.includes("organization_profile.upserted") &&
    migration.includes("insert into public.audit_log"),
);
check(
  "profile RPC is service-role only",
  migration.includes("revoke all on function public.upsert_organization_profile") &&
    migration.includes("grant execute on function public.upsert_organization_profile") &&
    migration.includes("to service_role"),
);
check(
  "profile module exposes lifecycle constants",
  profileSrc.includes("ORGANIZATION_LIFECYCLE_STATUSES") &&
    profileSrc.includes("ORGANIZATION_ONBOARDING_STATUSES"),
);
check(
  "profile module exposes load and upsert helpers",
  profileSrc.includes("loadOrganizationProfile") &&
    profileSrc.includes("upsertOrganizationProfile"),
);
check(
  "organization facade exports profile helpers",
  indexSrc.includes("loadOrganizationProfile") &&
    indexSrc.includes("upsertOrganizationProfile") &&
    indexSrc.includes("OrganizationProfile"),
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
console.log("All organization profile foundation tests passed.");
