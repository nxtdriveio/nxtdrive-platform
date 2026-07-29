import type { TenantPlan } from "@/lib/types";

/**
 * Canonical subscription / entitlement model for NXTDRIVE.
 *
 * This file is intentionally pure so it can be imported from both server and
 * client code. Server-side usage counts and enforcement helpers live in
 * `lib/platform/entitlements.ts`.
 */

export const PLAN_ORDER: TenantPlan[] = ["start", "pro", "elite"];

export const PLAN_LABELS: Record<TenantPlan, string> = {
  start: "Start",
  pro: "Pro",
  elite: "Elite",
};

export const PLAN_DESCRIPTIONS: Record<TenantPlan, string> = {
  start:
    "Voor zelfstandige instructeurs en compacte rijscholen die vooral leerlingen, planning en facturatie strak willen runnen.",
  pro:
    "Voor groeiende rijscholen met meerdere medewerkers, vestigingen en behoefte aan extra managementinzicht.",
  elite:
    "Voor multi-vestiging, franchise, white-label en centrale governance.",
};

export const PLAN_HIGHLIGHTS: Record<TenantPlan, string[]> = {
  start: [
    "CRM, planning, facturatie en leerlingbeheer",
    "Instructeur- en leerling-PWA",
    "Basisrapportages en takenworkflow",
  ],
  pro: [
    "Multi-vestiging en hogere teamcapaciteit",
    "Uitgebreide rapportages",
    "Franchise-deelnemer en extra operationele schaal",
  ],
  elite: [
    "White-label branding en custom domains",
    "Franchise-netwerksturing",
    "Centrale governance en uitgebreide controle",
  ],
};

export type FeatureKey =
  | "crm_leads"
  | "student_management"
  | "scheduling"
  | "packages_credits"
  | "invoicing"
  | "instructor_pwa"
  | "student_pwa"
  | "parent_portal"
  | "basic_reports"
  | "tasks_workflow"
  | "multi_branch"
  | "advanced_reports"
  | "franchise_as_franchisee"
  | "white_label"
  | "franchise_as_franchisegever"
  | "ai_features";

export const FEATURE_PLAN: Record<FeatureKey, TenantPlan> = {
  crm_leads: "start",
  student_management: "start",
  scheduling: "start",
  packages_credits: "start",
  invoicing: "start",
  instructor_pwa: "start",
  student_pwa: "start",
  parent_portal: "start",
  basic_reports: "start",
  tasks_workflow: "start",
  multi_branch: "pro",
  advanced_reports: "pro",
  franchise_as_franchisee: "pro",
  white_label: "elite",
  franchise_as_franchisegever: "elite",
  ai_features: "elite",
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  crm_leads: "CRM & Leads",
  student_management: "Leerlingenbeheer",
  scheduling: "Planning & Agenda",
  packages_credits: "Pakketten & Tegoed",
  invoicing: "Facturatie",
  instructor_pwa: "Instructeur-app",
  student_pwa: "Leerling-app",
  parent_portal: "Ouderportaal",
  basic_reports: "Basisrapportages",
  tasks_workflow: "Taken & Workflow",
  multi_branch: "Multi-vestiging",
  advanced_reports: "Uitgebreide rapportages",
  franchise_as_franchisee: "Franchise (deelnemer)",
  white_label: "White-label huisstijl",
  franchise_as_franchisegever: "Franchise (netwerk beheer)",
  ai_features: "Toekomstige assistentiefuncties",
};

export type EntitlementLimitKey =
  | "branches"
  | "staff_memberships"
  | "custom_domains";

export const ENTITLEMENT_LIMIT_ORDER: EntitlementLimitKey[] = [
  "branches",
  "staff_memberships",
  "custom_domains",
];

export const ENTITLEMENT_LIMIT_LABELS: Record<EntitlementLimitKey, string> = {
  branches: "Vestigingen",
  staff_memberships: "Medewerkers",
  custom_domains: "Eigen domeinen",
};

/**
 * Initial commercial limits for Stream 2.
 *
 * Assumptions:
 * - Start is optimized for one-school / one-location setups.
 * - Pro unlocks real multi-branch operation and a larger staff pool.
 * - Elite remains effectively unbounded for these first two resources.
 *
 * When product finalizes these numbers later, only this map should need to
 * change; all gating and UI read from the same source.
 */
export const PLAN_LIMITS: Record<
  TenantPlan,
  Record<EntitlementLimitKey, number | null>
> = {
  start: {
    branches: 1,
    staff_memberships: 10,
    custom_domains: 0,
  },
  pro: {
    branches: 5,
    staff_memberships: 40,
    custom_domains: 0,
  },
  elite: {
    branches: null,
    staff_memberships: null,
    custom_domains: 5,
  },
};

export type TenantForEntitlements = {
  plan: TenantPlan | string | null | undefined;
  white_label_enabled?: boolean | null;
};

function planIndex(plan: TenantPlan): number {
  const idx = PLAN_ORDER.indexOf(plan);
  return idx === -1 ? 0 : idx;
}

export function normalizeTenantPlan(
  plan: TenantPlan | string | null | undefined,
): TenantPlan {
  return PLAN_ORDER.includes(plan as TenantPlan) ? (plan as TenantPlan) : "start";
}

export function planMeets(
  plan: TenantPlan | string | null | undefined,
  requiredPlan: TenantPlan,
): boolean {
  return planIndex(normalizeTenantPlan(plan)) >= planIndex(requiredPlan);
}

export function getRequiredPlanForFeature(feature: FeatureKey): TenantPlan {
  return FEATURE_PLAN[feature];
}

export function getPlanLimit(
  plan: TenantPlan | string | null | undefined,
  key: EntitlementLimitKey,
): number | null {
  return PLAN_LIMITS[normalizeTenantPlan(plan)][key];
}

export function formatEntitlementLimit(limit: number | null): string {
  return limit === null ? "Onbeperkt" : String(limit);
}

/**
 * Returns true when the tenant's plan meets or exceeds the minimum plan
 * required for the given feature.
 */
export function tenantHasFeature(
  tenant: { plan: TenantPlan | string | null | undefined },
  feature: FeatureKey,
): boolean {
  return planMeets(tenant.plan, FEATURE_PLAN[feature]);
}

/**
 * Returns true when the tenant is eligible for white-label branding.
 *
 * Both conditions must be met:
 *   1. The tenant's plan is Elite.
 *   2. The `white_label_enabled` flag is true (opt-in per tenant).
 *
 * Use this everywhere white-label visuals are applied (layouts, emails,
 * PDFs, notification templates). Never check `white_label_enabled` alone.
 */
export function isWhiteLabelEligible(
  tenant: TenantForEntitlements | null,
): boolean {
  if (!tenant) return false;
  return (
    tenantHasFeature({ plan: tenant.plan }, "white_label") &&
    tenant.white_label_enabled === true
  );
}

/**
 * Returns every feature key that the tenant's plan unlocks.
 */
export function unlockedFeatures(tenant: {
  plan: TenantPlan | string | null | undefined;
}): FeatureKey[] {
  return (Object.keys(FEATURE_PLAN) as FeatureKey[]).filter((f) =>
    tenantHasFeature(tenant, f),
  );
}

/**
 * Returns every feature key that requires a higher plan than the tenant
 * currently has.
 */
export function lockedFeatures(tenant: {
  plan: TenantPlan | string | null | undefined;
}): FeatureKey[] {
  return (Object.keys(FEATURE_PLAN) as FeatureKey[]).filter(
    (f) => !tenantHasFeature(tenant, f),
  );
}

export function getTenantEntitlements(tenant: TenantForEntitlements) {
  const plan = normalizeTenantPlan(tenant.plan);
  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    unlocked: unlockedFeatures({ plan }),
    locked: lockedFeatures({ plan }),
    limits: PLAN_LIMITS[plan],
    whiteLabelEligible: isWhiteLabelEligible(tenant),
  };
}
