import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole, Tenant } from "@/lib/types";
import {
  ENTITLEMENT_LIMIT_LABELS,
  ENTITLEMENT_LIMIT_ORDER,
  FEATURE_PLAN,
  formatEntitlementLimit,
  getPlanLimit,
  getRequiredPlanForFeature,
  getTenantEntitlements,
  type EntitlementLimitKey,
  type FeatureKey,
  type TenantForEntitlements,
  tenantHasFeature,
} from "@/lib/platform/features";

export const ENTITLEMENT_STAFF_ROLES: MemberRole[] = [
  "tenant_admin",
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "franchise_admin",
];

export type TenantEntitlementUsage = Record<EntitlementLimitKey, number>;

export type TenantLimitStatus = {
  key: EntitlementLimitKey;
  label: string;
  used: number;
  limit: number | null;
  limitLabel: string;
  remaining: number | null;
  isUnlimited: boolean;
  isAtLimit: boolean;
  isOverLimit: boolean;
};

export type FreshTenantEntitlementRecord = Pick<
  Tenant,
  "id" | "slug" | "name" | "plan" | "white_label_enabled" | "org_type" | "parent_tenant_id"
>;

export type TenantFeatureAccess = {
  feature: FeatureKey;
  requiredPlan: ReturnType<typeof getRequiredPlanForFeature>;
  hasPlanAccess: boolean;
  requiresEnabledFlag: boolean;
  enabledFlagActive: boolean;
  allowed: boolean;
  isDowngradedReadOnly: boolean;
};

export type TenantEntitlementSnapshot = {
  tenant: FreshTenantEntitlementRecord;
  entitlements: ReturnType<typeof getTenantEntitlements>;
  usage: TenantEntitlementUsage;
  limitStatuses: Record<EntitlementLimitKey, TenantLimitStatus>;
  featureAccess: Record<FeatureKey, TenantFeatureAccess>;
};

export async function loadTenantEntitlementTenant(
  service: SupabaseClient,
  tenantId: string,
): Promise<FreshTenantEntitlementRecord> {
  const { data, error } = await service
    .from("tenants")
    .select("id, slug, name, plan, white_label_enabled, org_type, parent_tenant_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      error?.message ?? `Tenant ${tenantId} kon niet worden geladen voor entitlement-checks.`,
    );
  }

  return data as FreshTenantEntitlementRecord;
}

export async function loadTenantEntitlementUsage(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantEntitlementUsage> {
  const [{ count: branchCount }, { count: staffCount }, { count: customDomainCount }] =
    await Promise.all([
    service
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    service
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("role", ENTITLEMENT_STAFF_ROLES),
    service
      .from("tenant_domains")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "custom"),
    ]);

  return {
    branches: branchCount ?? 0,
    staff_memberships: staffCount ?? 0,
    custom_domains: customDomainCount ?? 0,
  };
}

export function getTenantFeatureAccess(
  tenant: TenantForEntitlements,
  feature: FeatureKey,
  options: { requireEnabledFlag?: boolean } = {},
): TenantFeatureAccess {
  const hasPlanAccess = tenantHasFeature(tenant, feature);
  const requiresEnabledFlag = options.requireEnabledFlag === true;
  const enabledFlagActive =
    !requiresEnabledFlag || tenant.white_label_enabled === true;

  return {
    feature,
    requiredPlan: getRequiredPlanForFeature(feature),
    hasPlanAccess,
    requiresEnabledFlag,
    enabledFlagActive,
    allowed: hasPlanAccess && enabledFlagActive,
    isDowngradedReadOnly:
      requiresEnabledFlag &&
      tenant.white_label_enabled === true &&
      !hasPlanAccess,
  };
}

export function getTenantLimitStatus(
  tenant: Pick<Tenant, "plan"> | { plan: string | null | undefined },
  usage: TenantEntitlementUsage,
  key: EntitlementLimitKey,
): TenantLimitStatus {
  const used = usage[key];
  const limit = getPlanLimit(tenant.plan, key);
  const isUnlimited = limit === null;
  const remaining = isUnlimited ? null : Math.max(limit - used, 0);
  const isAtLimit = !isUnlimited && used >= limit;
  const isOverLimit = !isUnlimited && used > limit;

  return {
    key,
    label: ENTITLEMENT_LIMIT_LABELS[key],
    used,
    limit,
    limitLabel: formatEntitlementLimit(limit),
    remaining,
    isUnlimited,
    isAtLimit,
    isOverLimit,
  };
}

export function getTenantLimitStatuses(
  tenant: Pick<Tenant, "plan"> | { plan: string | null | undefined },
  usage: TenantEntitlementUsage,
): Record<EntitlementLimitKey, TenantLimitStatus> {
  return Object.fromEntries(
    ENTITLEMENT_LIMIT_ORDER.map((key) => [
      key,
      getTenantLimitStatus(tenant, usage, key),
    ]),
  ) as Record<EntitlementLimitKey, TenantLimitStatus>;
}

export async function loadTenantEntitlementSnapshot(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantEntitlementSnapshot> {
  const tenant = await loadTenantEntitlementTenant(service, tenantId);
  const usage = await loadTenantEntitlementUsage(service, tenantId);
  const limitStatuses = getTenantLimitStatuses(tenant, usage);
  const entitlements = getTenantEntitlements(tenant);
  const featureAccess = Object.fromEntries(
    (Object.keys(FEATURE_PLAN) as FeatureKey[]).map((feature) => [
      feature,
      getTenantFeatureAccess(tenant, feature),
    ]),
  ) as Record<FeatureKey, TenantFeatureAccess>;

  return {
    tenant,
    entitlements,
    usage,
    limitStatuses,
    featureAccess,
  };
}

export function canManageExistingBranches(
  snapshot: Pick<TenantEntitlementSnapshot, "usage" | "featureAccess">,
): boolean {
  return snapshot.featureAccess.multi_branch.allowed || snapshot.usage.branches > 0;
}

export function canViewExistingFranchiseNetwork(
  snapshot: Pick<TenantEntitlementSnapshot, "featureAccess">,
  franchiseeCount: number,
): boolean {
  return (
    snapshot.featureAccess.franchise_as_franchisegever.allowed ||
    franchiseeCount > 0
  );
}

export function isFranchiseNetworkReadOnly(
  snapshot: Pick<TenantEntitlementSnapshot, "featureAccess">,
  franchiseeCount: number,
): boolean {
  return (
    !snapshot.featureAccess.franchise_as_franchisegever.allowed &&
    franchiseeCount > 0
  );
}

export function isTenantAtLimit(
  tenant: Pick<Tenant, "plan"> | { plan: string | null | undefined },
  usage: TenantEntitlementUsage,
  key: EntitlementLimitKey,
): boolean {
  return getTenantLimitStatus(tenant, usage, key).isAtLimit;
}
