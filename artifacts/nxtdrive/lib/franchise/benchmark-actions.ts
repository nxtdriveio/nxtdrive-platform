import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseBenchmarkActionStatus =
  | "created"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type FranchiseBenchmarkAction = {
  id: string;
  franchise_root_tenant_id: string;
  franchise_root_name: string;
  franchisee_tenant_id: string;
  franchisee_name: string;
  central_task_id: string | null;
  local_task_id: string | null;
  signal_key: string;
  follow_up_route: string;
  attention_priority: string;
  title: string;
  description: string | null;
  status: FranchiseBenchmarkActionStatus;
  local_response: string | null;
  resolution: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
};

type BenchmarkActionRow = Omit<
  FranchiseBenchmarkAction,
  "franchise_root_name" | "franchisee_name"
>;

export function benchmarkSignalKey(
  franchiseeTenantId: string,
  followUpRoute: string,
  attentionPriority: string,
) {
  return [
    "benchmark",
    franchiseeTenantId,
    followUpRoute || "route",
    attentionPriority || "priority",
  ].join(":").slice(0, 180);
}

async function mapBenchmarkActions(rows: BenchmarkActionRow[]) {
  const service = createServiceRoleClient();
  const tenantIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.franchise_root_tenant_id,
        row.franchisee_tenant_id,
      ]),
    ),
  );

  const { data: tenants, error } = tenantIds.length
    ? await service.from("tenants").select("id, name").in("id", tenantIds)
    : { data: [], error: null };
  if (error) throw new Error(`Benchmark tenants laden mislukt: ${error.message}`);

  const tenantNameById = new Map(
    ((tenants ?? []) as Array<{ id: string; name: string }>).map((tenant) => [
      tenant.id,
      tenant.name,
    ]),
  );

  return rows.map((row) => ({
    ...row,
    franchise_root_name:
      tenantNameById.get(row.franchise_root_tenant_id) ?? "Franchisegever",
    franchisee_name:
      tenantNameById.get(row.franchisee_tenant_id) ?? "Franchisee",
  }));
}

export async function loadFranchiseBenchmarkActionsForRoot(
  franchiseRootTenantId: string,
) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_benchmark_actions")
    .select(
      "id, franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id, signal_key, follow_up_route, attention_priority, title, description, status, local_response, resolution, created_at, accepted_at, completed_at",
    )
    .eq("franchise_root_tenant_id", franchiseRootTenantId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    throw new Error(`Benchmark acties laden mislukt: ${error.message}`);
  }

  return mapBenchmarkActions((data ?? []) as BenchmarkActionRow[]);
}

export async function loadLocalFranchiseBenchmarkActions(franchiseeTenantId: string) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_benchmark_actions")
    .select(
      "id, franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id, signal_key, follow_up_route, attention_priority, title, description, status, local_response, resolution, created_at, accepted_at, completed_at",
    )
    .eq("franchisee_tenant_id", franchiseeTenantId)
    .in("status", ["created", "accepted", "in_progress", "declined"])
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(`Lokale benchmark acties laden mislukt: ${error.message}`);
  }

  return mapBenchmarkActions((data ?? []) as BenchmarkActionRow[]);
}
