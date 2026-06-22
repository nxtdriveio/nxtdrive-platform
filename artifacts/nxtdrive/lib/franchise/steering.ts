import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseDelegationState = {
  permission_id: string | null;
  franchisee_tenant_id: string;
  franchisee_name: string;
  franchisee_slug: string;
  scope_type: FranchiseDelegationScopeType;
  scope_refs: string[];
  valid_from: string | null;
  valid_until: string | null;
  grant_reason: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  status: FranchiseDelegationStatus;
  is_active: boolean;
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

export type FranchiseDelegationScopeType =
  | "tenant"
  | "branches"
  | "rayons"
  | "capabilities"
  | "custom";

export type FranchiseDelegationStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "revoked"
  | "readonly";

export type FranchiseLeadRoutingLead = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  full_name: string;
  status: string;
  source: string;
  city: string | null;
  postcode: string | null;
  neighborhood: string | null;
  pickup_address: string | null;
  lead_score: number;
  last_activity_at: string | null;
  created_at: string;
  can_manage: boolean;
  target_tenant_ids: string[];
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
  scope_type: FranchiseDelegationScopeType | null;
  scope_refs: unknown;
  valid_from: string | null;
  valid_until: string | null;
  grant_reason: string | null;
  granted_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
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

function normalizeScopeRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function delegationStatus(permission: PermissionRow | undefined): FranchiseDelegationStatus {
  if (!permission) return "readonly";
  const now = Date.now();
  const validFrom = permission.valid_from ? Date.parse(permission.valid_from) : null;
  const validUntil = permission.valid_until ? Date.parse(permission.valid_until) : null;
  if (permission.revoked_at) return "revoked";
  if (validFrom && Number.isFinite(validFrom) && validFrom > now) return "scheduled";
  if (validUntil && Number.isFinite(validUntil) && validUntil <= now) return "expired";
  return "active";
}

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
    const status = delegationStatus(permission);
    const isActive = status === "active";
    return {
      permission_id: permission?.id ?? null,
      franchisee_tenant_id: franchisee.id,
      franchisee_name: franchisee.name,
      franchisee_slug: franchisee.slug,
      scope_type: permission?.scope_type ?? "tenant",
      scope_refs: normalizeScopeRefs(permission?.scope_refs),
      valid_from: permission?.valid_from ?? null,
      valid_until: permission?.valid_until ?? null,
      grant_reason: permission?.grant_reason ?? null,
      granted_by: permission?.granted_by ?? null,
      revoked_at: permission?.revoked_at ?? null,
      revoked_by: permission?.revoked_by ?? null,
      revoke_reason: permission?.revoke_reason ?? null,
      status,
      is_active: isActive,
      can_view_planning: isActive ? (permission?.can_view_planning ?? false) : false,
      can_manage_planning: isActive ? (permission?.can_manage_planning ?? false) : false,
      can_manage_leads: isActive ? (permission?.can_manage_leads ?? false) : false,
      can_manage_templates: isActive ? (permission?.can_manage_templates ?? false) : false,
      can_view_fleet: isActive ? (permission?.can_view_fleet ?? false) : false,
      can_manage_fleet: isActive ? (permission?.can_manage_fleet ?? false) : false,
      can_view_instructor_availability:
        isActive ? (permission?.can_view_instructor_availability ?? false) : false,
      can_manage_instructor_availability:
        isActive ? (permission?.can_manage_instructor_availability ?? false) : false,
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

  const [
    { data: rootTenant },
    { data: leads, error: leadError },
    { data: branches, error: branchError },
    { data: assignments, error: assignmentError },
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, name, slug")
      .eq("id", franchiseRootTenantId)
      .maybeSingle(),
    tenantIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : service
          .from("leads")
          .select(
            "id, tenant_id, status, source, full_name, branch_id, city, postcode, neighborhood, pickup_address, lead_score, last_activity_at, created_at",
          )
          .in("tenant_id", tenantIds)
          .in("status", ["new", "contacted", "package_advised"])
          .is("branch_id", null)
          .order("created_at", { ascending: false })
          .limit(40),
    tenantIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : service
          .from("branches")
          .select("id, tenant_id, name, city, is_active")
          .in("tenant_id", tenantIds)
          .eq("is_active", true)
          .order("name"),
    service
      .from("franchise_lead_assignments")
      .select("id, lead_id, owner_tenant_id, branch_id, status")
      .eq("franchise_root_tenant_id", franchiseRootTenantId)
      .in("status", ["assigned", "accepted"]),
  ]);

  if (leadError) {
    throw new Error(`Leads voor routing laden mislukt: ${leadError.message}`);
  }
  if (branchError) {
    throw new Error(`Vestigingen voor routing laden mislukt: ${branchError.message}`);
  }
  if (assignmentError) {
    throw new Error(`Lead assignments laden mislukt: ${assignmentError.message}`);
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
  const manageableLeadTenantIds = new Set<string>([franchiseRootTenantId]);
  for (const delegation of delegations) {
    if (delegation.can_manage_leads) {
      manageableLeadTenantIds.add(delegation.franchisee_tenant_id);
    }
  }
  const activeAssignmentLeadIds = new Set(
    ((assignments ?? []) as Array<{ lead_id: string }>).map(
      (assignment) => assignment.lead_id,
    ),
  );

  return {
    leads: ((leads ?? []) as Array<{
      id: string;
      tenant_id: string;
      status: string;
      source: string;
      full_name: string;
      created_at: string;
      city: string | null;
      postcode: string | null;
      neighborhood: string | null;
      pickup_address: string | null;
      lead_score: number | null;
      last_activity_at: string | null;
    }>)
      .filter((lead) => !activeAssignmentLeadIds.has(lead.id))
      .slice(0, 12)
      .map((lead) => {
        const delegation = delegationByTenant.get(lead.tenant_id);
        const canManage =
          lead.tenant_id === franchiseRootTenantId ||
          Boolean(delegation?.can_manage_leads);
        return {
          id: lead.id,
          tenant_id: lead.tenant_id,
          tenant_name: tenantNameById.get(lead.tenant_id) ?? "Onbekende tenant",
          full_name: lead.full_name,
          status: lead.status,
          source: lead.source,
          city: lead.city,
          postcode: lead.postcode,
          neighborhood: lead.neighborhood,
          pickup_address: lead.pickup_address,
          lead_score: lead.lead_score ?? 0,
          last_activity_at: lead.last_activity_at,
          created_at: lead.created_at,
          can_manage: canManage,
          target_tenant_ids: canManage ? Array.from(manageableLeadTenantIds) : [],
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
