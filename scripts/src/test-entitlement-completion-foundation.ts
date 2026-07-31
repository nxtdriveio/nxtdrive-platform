/**
 * Static guardrails for Sprint 7 entitlement completion.
 *
 *   pnpm --filter @workspace/scripts run test-entitlement-completion-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const entitlements = source("artifacts/nxtdrive/lib/platform/entitlements.ts");
const branchActions = source("artifacts/nxtdrive/lib/branches/actions.ts");
const settingsActions = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/actions.ts",
);
const reportsPage = source(
  "artifacts/nxtdrive/app/backoffice/rapportages/page.tsx",
);
const reportExportRoute = source(
  "artifacts/nxtdrive/app/backoffice/rapportages/export/route.ts",
);
const leadActions = source(
  "artifacts/nxtdrive/app/backoffice/leads/actions.ts",
);
const leadDetailPage = source(
  "artifacts/nxtdrive/app/backoffice/leads/[id]/page.tsx",
);
const instructorAiActions = source(
  "artifacts/nxtdrive/app/instructeur/ai-actions.ts",
);
const notificationActions = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/notificaties/actions.ts",
);
const notificationOverviewPage = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/notificaties/page.tsx",
);
const notificationTemplatePage = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/notificaties/templates/[key]/[channel]/page.tsx",
);
const branchesPage = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/vestigingen/page.tsx",
);
const memberBranchesPage = source(
  "artifacts/nxtdrive/app/backoffice/medewerkers/[membershipId]/vestigingen/page.tsx",
);
const platformTenantActions = source(
  "artifacts/nxtdrive/app/admin/tenants/[id]/actions.ts",
);
const franchiseAccess = source("artifacts/nxtdrive/lib/franchise/access.ts");
const franchiseActions = source("artifacts/nxtdrive/lib/franchise/actions.ts");
const franchiseDashboardPage = source(
  "artifacts/nxtdrive/app/backoffice/franchise/page.tsx",
);
const franchiseTemplatesPage = source(
  "artifacts/nxtdrive/app/backoffice/franchise/templates/page.tsx",
);
const packagesPage = source(
  "artifacts/nxtdrive/app/backoffice/packages/page.tsx",
);
const accountingPage = source(
  "artifacts/nxtdrive/app/backoffice/boekhouding/page.tsx",
);
const commercialAccess = source(
  "artifacts/nxtdrive/lib/platform/commercial-access.ts",
);
const accountingInvoiceExportRoute = source(
  "artifacts/nxtdrive/app/backoffice/boekhouding/export/facturen/route.ts",
);
const accountingPaymentExportRoute = source(
  "artifacts/nxtdrive/app/backoffice/boekhouding/export/betalingen/route.ts",
);
const accountingCustomerExportRoute = source(
  "artifacts/nxtdrive/app/backoffice/boekhouding/export/klanten/route.ts",
);
const subscriptionPage = source(
  "artifacts/nxtdrive/app/backoffice/abonnement/page.tsx",
);
const docs = source("docs/SPRINT_7_ENTITLEMENTS_COMPLETION.md");
const scriptsPackage = source("scripts/package.json");

check(
  "entitlements expose shared fresh snapshot helpers",
  entitlements.includes("loadTenantEntitlementTenant") &&
    entitlements.includes("loadTenantEntitlementSnapshot") &&
    entitlements.includes("getTenantFeatureAccess") &&
    entitlements.includes("canManageExistingBranches"),
);

check(
  "branch actions rely on entitlement snapshot and cleanup-aware branch management",
  branchActions.includes("loadTenantEntitlementSnapshot") &&
    branchActions.includes("canManageExistingBranches") &&
    branchActions.includes("redirectPlanRequired"),
);

check(
  "settings actions use shared entitlement snapshot for white-label/domain gating",
  settingsActions.includes("loadTenantEntitlementSnapshot") &&
    settingsActions.includes("snapshot.featureAccess.white_label.allowed") &&
    settingsActions.includes("snapshot.limitStatuses.custom_domains"),
);

check(
  "AI and reporting screens rely on fresh entitlement snapshots instead of stale plan flags",
  reportsPage.includes("loadTenantEntitlementSnapshot") &&
    reportsPage.includes("featureAccess.advanced_reports.allowed") &&
    leadActions.includes("loadTenantEntitlementSnapshot") &&
    leadActions.includes("featureAccess.ai_features.allowed") &&
    leadDetailPage.includes("loadTenantEntitlementSnapshot") &&
    leadDetailPage.includes("featureAccess.ai_features.allowed") &&
    instructorAiActions.includes("loadTenantEntitlementSnapshot") &&
    instructorAiActions.includes("aiAllowed"),
);

check(
  "commercial export routes enforce advanced reporting entitlement server-side",
  commercialAccess.includes("requireAdvancedReportExportAccess") &&
    commercialAccess.includes("featureAccess.advanced_reports") &&
    commercialAccess.includes("NextResponse.json") &&
    reportExportRoute.includes("requireAdvancedReportExportAccess") &&
    accountingInvoiceExportRoute.includes(
      "requireAdvancedReportExportAccess",
    ) &&
    accountingPaymentExportRoute.includes(
      "requireAdvancedReportExportAccess",
    ) &&
    accountingCustomerExportRoute.includes("requireAdvancedReportExportAccess"),
);

check(
  "commercial backoffice surfaces locked export and franchise-template states",
  accountingPage.includes("exportsLocked") &&
    accountingPage.includes("Exports vallen onder uitgebreide rapportages") &&
    accountingPage.includes("featureAccess.advanced_reports") &&
    packagesPage.includes("franchiseTemplatesLocked") &&
    packagesPage.includes("featureAccess.franchise_as_franchisee") &&
    packagesPage.includes("Franchise-sjablonen zijn read-only"),
);

check(
  "notification actions and screens use the shared white-label feature gate",
  notificationActions.includes("loadTenantEntitlementTenant") &&
    notificationActions.includes("getTenantFeatureAccess") &&
    notificationActions.includes("requireEnabledFlag: true") &&
    notificationOverviewPage.includes("loadTenantEntitlementSnapshot") &&
    notificationOverviewPage.includes("getTenantFeatureAccess") &&
    notificationTemplatePage.includes("loadTenantEntitlementSnapshot") &&
    notificationTemplatePage.includes("getTenantFeatureAccess") &&
    notificationTemplatePage.includes("requireEnabledFlag: true"),
);

check(
  "branch settings page communicates downgrade cleanup instead of hard dead-end",
  branchesPage.includes("corrigeren of afschalen") &&
    branchesPage.includes("canManageExistingBranches"),
);

check(
  "membership branch scope page explains downgrade cleanup mode",
  memberBranchesPage.includes("onder het multi-branch plan") &&
    memberBranchesPage.includes("corrigeren of afschalen"),
);

check(
  "franchise screens keep downgraded existing networks visible but read-only",
  franchiseAccess.includes("canViewExistingFranchiseNetwork") &&
    franchiseAccess.includes("isFranchiseNetworkReadOnly") &&
    franchiseActions.includes("loadTenantEntitlementSnapshot") &&
    franchiseActions.includes("canManageExistingBranches") &&
    franchiseTemplatesPage.includes("readOnlyDowngrade") &&
    franchiseTemplatesPage.includes("controlsDisabled") &&
    franchiseDashboardPage.includes("FranchiseDowngradeAlert"),
);

check(
  "subscription page documents cleanup-friendly branch downgrade behavior",
  subscriptionPage.includes("corrigeren of afschalen") &&
    subscriptionPage.includes("White-label read-only"),
);

check(
  "platform admin tenant actions reuse shared entitlement feature access helpers",
  platformTenantActions.includes("getTenantFeatureAccess") &&
    platformTenantActions.includes("toggleWhiteLabelAction") &&
    platformTenantActions.includes("setFranchiseeParentAction"),
);

check(
  "sprint docs describe the entitlement completion slice",
  docs.includes("Entitlements Completion") &&
    docs.includes("Branch downgrade behavior") &&
    docs.includes("White-label downgrade behavior") &&
    docs.includes("Franchise downgrade behavior") &&
    docs.includes("AI and reporting gates"),
);

check(
  "scripts package registers entitlement completion guardrail",
  scriptsPackage.includes("test-entitlement-completion-foundation"),
);

console.log("");
let failed = 0;
for (const result of results) {
  const mark = result.ok ? "OK" : "FAIL";
  console.log(`${mark} ${result.name}`);
  if (!result.ok) failed++;
}
console.log("");

if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}

console.log("All entitlement completion guardrails passed.");
