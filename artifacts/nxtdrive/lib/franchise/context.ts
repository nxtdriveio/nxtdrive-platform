import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseeSummary = {
  id: string;
  name: string;
  slug: string;
  branch_count: number;
  active_branch_count: number;
};

export type FranchiseContext = {
  franchisegever_id: string;
  franchisegever_name: string;
  franchisees: FranchiseeSummary[];
};

export async function loadFranchiseContext(
  franchisegeverTenantId: string,
): Promise<FranchiseContext> {
  const service = createServiceRoleClient();

  const [{ data: franchisegever, error: franchisegeverError }, { data: franchisees, error: franchiseesError }] =
    await Promise.all([
      service
        .from("tenants")
        .select("id, name, parent_tenant_id")
        .eq("id", franchisegeverTenantId)
        .single(),
      service
        .from("tenants")
        .select("id, name, slug")
        .eq("parent_tenant_id", franchisegeverTenantId)
        .order("name"),
    ]);

  if (franchisegeverError || !franchisegever) {
    throw new Error(
      `Franchisegever laden mislukt: ${franchisegeverError?.message ?? "niet gevonden"}`,
    );
  }

  if (franchisegever.parent_tenant_id !== null) {
    throw new Error("Deze tenant is zelf franchisee en mag geen franchisenetwerk beheren.");
  }

  if (franchiseesError) {
    throw new Error(`Franchisees laden mislukt: ${franchiseesError.message}`);
  }

  const franchiseeIds = (franchisees ?? []).map((tenant) => tenant.id as string);
  const { data: branches, error: branchesError } =
    franchiseeIds.length === 0
      ? { data: [], error: null }
      : await service
          .from("branches")
          .select("id, tenant_id, is_active")
          .in("tenant_id", franchiseeIds);

  if (branchesError) {
    throw new Error(`Franchise-vestigingen laden mislukt: ${branchesError.message}`);
  }

  const branchCounts = new Map<string, number>();
  const activeBranchCounts = new Map<string, number>();

  for (const branch of branches ?? []) {
    const tenantId = branch.tenant_id as string;
    branchCounts.set(tenantId, (branchCounts.get(tenantId) ?? 0) + 1);
    if (branch.is_active) {
      activeBranchCounts.set(
        tenantId,
        (activeBranchCounts.get(tenantId) ?? 0) + 1,
      );
    }
  }

  return {
    franchisegever_id: franchisegever.id as string,
    franchisegever_name: franchisegever.name as string,
    franchisees: (franchisees ?? []).map((tenant) => ({
      id: tenant.id as string,
      name: tenant.name as string,
      slug: tenant.slug as string,
      branch_count: branchCounts.get(tenant.id as string) ?? 0,
      active_branch_count: activeBranchCounts.get(tenant.id as string) ?? 0,
    })),
  };
}
