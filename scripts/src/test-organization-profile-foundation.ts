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
const adminActionsSrc = source("artifacts/nxtdrive/app/admin/actions.ts");
const adminPageSrc = source("artifacts/nxtdrive/app/admin/page.tsx");
const newTenantFormSrc = source("artifacts/nxtdrive/app/admin/new-tenant-form.tsx");
const tenantActionsSrc = source("artifacts/nxtdrive/app/admin/tenants/[id]/actions.ts");
const tenantPageSrc = source("artifacts/nxtdrive/app/admin/tenants/[id]/page.tsx");
const tenantProfileFormSrc = source(
  "artifacts/nxtdrive/app/admin/tenants/[id]/organization-profile-form.tsx",
);

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
  "platform admin RLS helper is security definer",
  migration.includes("create or replace function public.is_current_user_platform_admin()") &&
    migration.includes("security definer") &&
    migration.includes("p.is_platform_admin") &&
    migration.includes("grant execute on function public.is_current_user_platform_admin() to authenticated"),
);
check(
  "platform admins can read profiles",
  migration.includes("public.is_current_user_platform_admin()"),
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
check(
  "platform create flow writes organization profiles",
  adminActionsSrc.includes("upsertOrganizationProfile") &&
    adminActionsSrc.includes("legalName") &&
    adminActionsSrc.includes("lifecycleStatus") &&
    adminActionsSrc.includes("onboardingStatus"),
);
check(
  "platform create flow records org type",
  adminActionsSrc.includes("VALID_ORG_TYPES") &&
    adminActionsSrc.includes("org_type: orgType"),
);
check(
  "platform create flow links franchise parent through RPC",
  adminActionsSrc.includes("set_franchisee_parent") &&
    adminActionsSrc.includes("p_franchisegever_tenant_id"),
);
check(
  "platform create UI exposes profile fields",
  adminPageSrc.includes("NewTenantForm") &&
    newTenantFormSrc.includes('name="org_type"') &&
    newTenantFormSrc.includes('name="billing_email"') &&
    newTenantFormSrc.includes('name="franchisegever_tenant_id"'),
);
check(
  "tenant detail exposes profile edit action",
  tenantActionsSrc.includes("updateOrganizationProfileAction") &&
    tenantPageSrc.includes("OrganizationProfileForm") &&
    tenantPageSrc.includes("loadOrganizationProfile") &&
    tenantProfileFormSrc.includes("updateOrganizationProfileAction") &&
    tenantProfileFormSrc.includes("Organisatieprofiel") &&
    tenantProfileFormSrc.includes('name="org_type"') &&
    tenantProfileFormSrc.includes('name="billing_email"'),
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
