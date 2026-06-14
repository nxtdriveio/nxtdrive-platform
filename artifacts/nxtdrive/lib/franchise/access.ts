import { notFound } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  canViewExistingFranchiseNetwork,
  isFranchiseNetworkReadOnly,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function requireFranchiseOperator() {
  const context = await requireActiveTenant(["tenant_admin", "franchise_admin"]);

  if (context.tenant.parent_tenant_id) {
    notFound();
  }

  const service = createServiceRoleClient();
  const [snapshot, { count }] = await Promise.all([
    loadTenantEntitlementSnapshot(service, context.tenant.id),
    service
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("parent_tenant_id", context.tenant.id),
  ]);
  const franchiseeCount = count ?? 0;

  if (!canViewExistingFranchiseNetwork(snapshot, franchiseeCount)) {
    notFound();
  }

  return {
    ...context,
    entitlementSnapshot: snapshot,
    franchiseAccess: snapshot.featureAccess.franchise_as_franchisegever,
    franchiseeCount,
    readOnlyDowngrade: isFranchiseNetworkReadOnly(snapshot, franchiseeCount),
  };
}
