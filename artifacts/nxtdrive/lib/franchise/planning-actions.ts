import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchisePlanningActionStatus =
  | "created"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type FranchisePlanningActionType =
  | "capacity_request"
  | "planning_task"
  | "open_local_planboard"
  | "branch_directive"
  | "instructor_directive";

export type FranchisePlanningAction = {
  id: string;
  franchise_root_tenant_id: string;
  franchise_root_name: string;
  franchisee_tenant_id: string;
  franchisee_name: string;
  branch_id: string | null;
  branch_name: string | null;
  instructor_user_id: string | null;
  instructor_name: string | null;
  central_task_id: string | null;
  local_task_id: string | null;
  action_type: FranchisePlanningActionType;
  status: FranchisePlanningActionStatus;
  request_key: string;
  title: string;
  description: string | null;
  requested_capacity_hours: number | null;
  requested_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  local_response: string | null;
  resolution: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
};

type PlanningActionRow = Omit<
  FranchisePlanningAction,
  "franchise_root_name" | "franchisee_name" | "branch_name" | "instructor_name"
>;

const SELECT_COLUMNS =
  "id, franchise_root_tenant_id, franchisee_tenant_id, branch_id, instructor_user_id, central_task_id, local_task_id, action_type, status, request_key, title, description, requested_capacity_hours, requested_date, priority, local_response, resolution, created_at, accepted_at, completed_at";

async function mapPlanningActions(rows: PlanningActionRow[]) {
  const service = createServiceRoleClient();
  const tenantIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.franchise_root_tenant_id,
        row.franchisee_tenant_id,
      ]),
    ),
  );
  const branchIds = Array.from(
    new Set(rows.map((row) => row.branch_id).filter(Boolean) as string[]),
  );
  const instructorIds = Array.from(
    new Set(
      rows.map((row) => row.instructor_user_id).filter(Boolean) as string[],
    ),
  );

  const [
    { data: tenants, error: tenantsError },
    { data: branches, error: branchesError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    tenantIds.length
      ? service.from("tenants").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [], error: null }),
    branchIds.length
      ? service.from("branches").select("id, name, city").in("id", branchIds)
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length
      ? service
          .from("profiles")
          .select("id, full_name, email")
          .in("id", instructorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (tenantsError) {
    throw new Error(
      `Planningactie tenants laden mislukt: ${tenantsError.message}`,
    );
  }
  if (branchesError) {
    throw new Error(
      `Planningactie vestigingen laden mislukt: ${branchesError.message}`,
    );
  }
  if (profilesError) {
    throw new Error(
      `Planningactie instructeurs laden mislukt: ${profilesError.message}`,
    );
  }

  const tenantNameById = new Map(
    ((tenants ?? []) as Array<{ id: string; name: string }>).map((tenant) => [
      tenant.id,
      tenant.name,
    ]),
  );
  const branchNameById = new Map(
    (
      (branches ?? []) as Array<{
        id: string;
        name: string;
        city: string | null;
      }>
    ).map((branch) => [
      branch.id,
      `${branch.name}${branch.city ? `, ${branch.city}` : ""}`,
    ]),
  );
  const instructorNameById = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [
      profile.id,
      profile.full_name ?? profile.email ?? "Instructeur",
    ]),
  );

  return rows.map((row) => ({
    ...row,
    franchise_root_name:
      tenantNameById.get(row.franchise_root_tenant_id) ?? "Franchisegever",
    franchisee_name:
      tenantNameById.get(row.franchisee_tenant_id) ?? "Franchisee",
    branch_name: row.branch_id
      ? (branchNameById.get(row.branch_id) ?? null)
      : null,
    instructor_name: row.instructor_user_id
      ? (instructorNameById.get(row.instructor_user_id) ?? null)
      : null,
  }));
}

export async function loadFranchisePlanningActionsForRoot(
  franchiseRootTenantId: string,
) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_planning_actions")
    .select(SELECT_COLUMNS)
    .eq("franchise_root_tenant_id", franchiseRootTenantId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    throw new Error(`Planningacties laden mislukt: ${error.message}`);
  }

  return mapPlanningActions((data ?? []) as PlanningActionRow[]);
}

export async function loadLocalFranchisePlanningActions(
  franchiseeTenantId: string,
) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_planning_actions")
    .select(SELECT_COLUMNS)
    .eq("franchisee_tenant_id", franchiseeTenantId)
    .in("status", ["created", "accepted", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(`Lokale planningacties laden mislukt: ${error.message}`);
  }

  return mapPlanningActions((data ?? []) as PlanningActionRow[]);
}

export function planningActionTypeLabel(type: FranchisePlanningActionType) {
  const labels: Record<FranchisePlanningActionType, string> = {
    capacity_request: "Capaciteit aanvragen",
    planning_task: "Planningtaak",
    open_local_planboard: "Planboard openen",
    branch_directive: "Sturing op vestiging",
    instructor_directive: "Sturing op instructeur",
  };
  return labels[type] ?? type;
}
