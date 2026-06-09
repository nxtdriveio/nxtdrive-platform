import { notFound } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { tenantHasFeature } from "@/lib/platform/features";

export async function requireFranchiseOperator() {
  const context = await requireActiveTenant(["tenant_admin", "franchise_admin"]);

  if (!tenantHasFeature(context.tenant, "franchise_as_franchisegever")) {
    notFound();
  }

  if (context.tenant.parent_tenant_id) {
    notFound();
  }

  return context;
}
