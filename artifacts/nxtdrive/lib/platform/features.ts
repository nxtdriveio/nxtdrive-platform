import type { TenantPlan } from "@/lib/types";

/**
 * Feature gating layer for NXTDRIVE subscription tiers.
 *
 * Every guarded feature is listed here with its minimum required plan.
 * Use `tenantHasFeature(tenant, feature)` in server components / server
 * actions to decide whether to expose a capability.
 *
 * Rules:
 *  - `start`  — available to every tenant (the default plan).
 *  - `pro`    — requires Pro or Elite.
 *  - `elite`  — requires Elite only.
 *
 * Existing tenants on a lower plan degrade gracefully: gated UI is hidden or
 * shows a "plan upgrade required" notice; no hard errors are thrown.
 */

export const PLAN_ORDER: TenantPlan[] = ["start", "pro", "elite"];

function planIndex(plan: TenantPlan): number {
  const idx = PLAN_ORDER.indexOf(plan);
  return idx === -1 ? 0 : idx;
}

export const FEATURE_PLAN = {
  // ── Start (all plans) ────────────────────────────────────────────────────
  crm_leads:           "start",
  student_management:  "start",
  scheduling:          "start",
  packages_credits:    "start",
  invoicing:           "start",
  instructor_pwa:      "start",
  student_pwa:         "start",
  parent_portal:       "start",
  basic_reports:       "start",
  tasks_workflow:      "start",

  // ── Pro (Pro + Elite) ────────────────────────────────────────────────────
  multi_branch:              "pro",
  advanced_reports:          "pro",
  franchise_as_franchisee:   "pro",

  // ── Elite (Elite only) ───────────────────────────────────────────────────
  white_label:                 "elite",
  franchise_as_franchisegever: "elite",
  ai_features:                 "elite",
} as const satisfies Record<string, TenantPlan>;

export type FeatureKey = keyof typeof FEATURE_PLAN;

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  crm_leads:                   "CRM & Leads",
  student_management:          "Leerlingenbeheer",
  scheduling:                  "Planning & Agenda",
  packages_credits:            "Pakketten & Tegoed",
  invoicing:                   "Facturatie",
  instructor_pwa:              "Instructeur-app",
  student_pwa:                 "Leerling-app",
  parent_portal:               "Ouderportaal",
  basic_reports:               "Basisrapportages",
  tasks_workflow:              "Taken & Workflow",
  multi_branch:                "Multi-vestiging",
  advanced_reports:            "Uitgebreide rapportages",
  franchise_as_franchisee:     "Franchise (deelnemer)",
  white_label:                 "White-label huisstijl",
  franchise_as_franchisegever: "Franchise (netwerk beheer)",
  ai_features:                 "AI-functies",
};

/**
 * Returns true when the tenant's plan meets or exceeds the minimum plan
 * required for the given feature.
 */
export function tenantHasFeature(
  tenant: { plan: TenantPlan },
  feature: FeatureKey,
): boolean {
  const required = FEATURE_PLAN[feature] as TenantPlan;
  return planIndex(tenant.plan) >= planIndex(required);
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
export function isWhiteLabelEligible(tenant: {
  plan: TenantPlan;
  white_label_enabled?: boolean | null;
}): boolean {
  return (
    tenantHasFeature({ plan: tenant.plan }, "white_label") &&
    tenant.white_label_enabled === true
  );
}

/**
 * Returns every feature key that the tenant's plan unlocks.
 */
export function unlockedFeatures(tenant: { plan: TenantPlan }): FeatureKey[] {
  return (Object.keys(FEATURE_PLAN) as FeatureKey[]).filter((f) =>
    tenantHasFeature(tenant, f),
  );
}

/**
 * Returns every feature key that requires a higher plan than the tenant
 * currently has.
 */
export function lockedFeatures(tenant: { plan: TenantPlan }): FeatureKey[] {
  return (Object.keys(FEATURE_PLAN) as FeatureKey[]).filter(
    (f) => !tenantHasFeature(tenant, f),
  );
}
