import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRole, Tenant } from "@/lib/types";
import {
  ENTITLEMENT_LIMIT_LABELS,
  ENTITLEMENT_LIMIT_ORDER,
  formatEntitlementLimit,
  getPlanLimit,
  type EntitlementLimitKey,
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

export function isTenantAtLimit(
  tenant: Pick<Tenant, "plan"> | { plan: string | null | undefined },
  usage: TenantEntitlementUsage,
  key: EntitlementLimitKey,
): boolean {
  return getTenantLimitStatus(tenant, usage, key).isAtLimit;
}
