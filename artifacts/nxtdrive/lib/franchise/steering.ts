import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseDelegationState = {
  permission_id: string | null;
  franchisee_tenant_id: string;
  franchisee_name: string;
  franchisee_slug: string;
  can_view_planning: boolean;
  can_manage_planning: boolean;
  can_manage_leads: boolean;
  can_manage_templates: boolean;
  can_view_fleet: boolean;
  can_manage_fleet: boolean;
  can_view_instructor_availability: boolean;
  can_manage_instructor_availability: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type FranchiseLeadRoutingLead = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  full_name: string;
  status: string;
  source: string;
  created_at: string;
  can_manage: boolean;
};

export type FranchiseLeadRoutingBranch = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  name: string;
  city: string | null;
};

export type FranchiseLeadRoutingState = {
  leads: FranchiseLeadRoutingLead[];
  branches: FranchiseLeadRoutingBranch[];
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
};

type PermissionRow = {
  id: string;
  franchisee_tenant_id: string;
  can_view_planning: boolean;
  can_manage_planning: boolean;
  can_manage_leads: boolean;
  can_manage_templates: boolean;
  can_view_fleet: boolean;
  can_manage_fleet: boolean;
  can_view_instructor_availability: boolean;
  can_manage_instructor_availability: boolean;
  created_at: string;
  updated_at: string;
};

export async function loadFranchiseDelegations(
  franchiseRootTenantId: string,
): Promise<FranchiseDelegationState[]> {
  const service = createServiceRoleClient();

  const [{ data: franchisees, error: franchiseeError }, { data: permissions, error }] =
    await Promise.all([
      service
        .from("tenants")
        .select("id, name, slug")
        .eq("parent_tenant_id", franchiseRootTenantId)
        .order("name"),
      service
        .from("franchise_operations_permissions")
        .select("*")
        .eq("franchise_root_tenant_id", franchiseRootTenantId),
    ]);

  if (franchiseeError) {
    throw new Error(`Franchisees laden mislukt: ${franchiseeError.message}`);
  }
  if (error) {
    throw new Error(`Delegaties laden mislukt: ${error.message}`);
  }

  const permissionByTenant = new Map(
    ((permissions ?? []) as PermissionRow[]).map((permission) => [
      permission.franchisee_tenant_id,
      permission,
    ]),
  );

  return ((franchisees ?? []) as TenantRow[]).map((franchisee) => {
    const permission = permissionByTenant.get(franchisee.id);
    return {
      permission_id: permission?.id ?? null,
      franchisee_tenant_id: franchisee.id,
      franchisee_name: franchisee.name,
      franchisee_slug: franchisee.slug,
      can_view_planning: permission?.can_view_planning ?? false,
      can_manage_planning: permission?.can_manage_planning ?? false,
      can_manage_leads: permission?.can_manage_leads ?? false,
      can_manage_templates: permission?.can_manage_templates ?? false,
      can_view_fleet: permission?.can_view_fleet ?? false,
      can_manage_fleet: permission?.can_manage_fleet ?? false,
      can_view_instructor_availability:
        permission?.can_view_instructor_availability ?? false,
      can_manage_instructor_availability:
        permission?.can_manage_instructor_availability ?? false,
      created_at: permission?.created_at ?? null,
      updated_at: permission?.updated_at ?? null,
    };
  });
}

export async function loadFranchiseLeadRoutingState(
  franchiseRootTenantId: string,
): Promise<FranchiseLeadRoutingState> {
  const service = createServiceRoleClient();
  const delegations = await loadFranchiseDelegations(franchiseRootTenantId);
  const tenantIds = [
    franchiseRootTenantId,
    ...delegations.map((delegation) => delegation.franchisee_tenant_id),
  ];

  const [{ data: rootTenant }, { data: leads, error: leadError }, { data: branches, error: branchError }] =
    await Promise.all([
      service
        .from("tenants")
        .select("id, name, slug")
        .eq("id", franchiseRootTenantId)
        .maybeSingle(),
      tenantIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : service
            .from("leads")
            .select("id, tenant_id, status, source, full_name, branch_id, created_at")
            .in("tenant_id", tenantIds)
            .in("status", ["new", "contacted", "package_advised"])
            .is("branch_id", null)
            .order("created_at", { ascending: false })
            .limit(12),
      tenantIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : service
            .from("branches")
            .select("id, tenant_id, name, city, is_active")
            .in("tenant_id", tenantIds)
            .eq("is_active", true)
            .order("name"),
    ]);

  if (leadError) {
    throw new Error(`Leads voor routing laden mislukt: ${leadError.message}`);
  }
  if (branchError) {
    throw new Error(`Vestigingen voor routing laden mislukt: ${branchError.message}`);
  }

  const tenantNameById = new Map<string, string>();
  if (rootTenant) {
    tenantNameById.set(rootTenant.id as string, rootTenant.name as string);
  }
  for (const delegation of delegations) {
    tenantNameById.set(delegation.franchisee_tenant_id, delegation.franchisee_name);
  }

  const delegationByTenant = new Map(
    delegations.map((delegation) => [
      delegation.franchisee_tenant_id,
      delegation,
    ]),
  );

  return {
    leads: ((leads ?? []) as Array<{
      id: string;
      tenant_id: string;
      status: string;
      source: string;
      full_name: string;
      created_at: string;
    }>).map((lead) => {
      const delegation = delegationByTenant.get(lead.tenant_id);
      return {
        id: lead.id,
        tenant_id: lead.tenant_id,
        tenant_name: tenantNameById.get(lead.tenant_id) ?? "Onbekende tenant",
        full_name: lead.full_name,
        status: lead.status,
        source: lead.source,
        created_at: lead.created_at,
        can_manage:
          lead.tenant_id === franchiseRootTenantId ||
          Boolean(delegation?.can_manage_leads),
      };
    }),
    branches: ((branches ?? []) as Array<{
      id: string;
      tenant_id: string;
      name: string;
      city: string | null;
    }>).map((branch) => ({
      id: branch.id,
      tenant_id: branch.tenant_id,
      tenant_name: tenantNameById.get(branch.tenant_id) ?? "Onbekende tenant",
      name: branch.name,
      city: branch.city,
    })),
  };
}
