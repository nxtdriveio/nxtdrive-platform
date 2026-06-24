import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseBenchmarkActionStatus =
  | "created"
  | "accepted"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type FranchiseBenchmarkResultStatus =
  | "open"
  | "on_track"
  | "at_risk"
  | "achieved"
  | "not_achieved"
  | "cancelled";

export type FranchiseBenchmarkMetricKey =
  | "capacity_utilisation"
  | "lead_conversion_rate"
  | "exam_pass_rate"
  | "current_lessons"
  | "current_revenue_cents";

export type FranchiseBenchmarkCheckIn = {
  id: string;
  action_id: string;
  franchise_root_tenant_id: string;
  franchisee_tenant_id: string;
  checkin_type: "central" | "local" | "joint";
  status: "planned" | "done" | "blocked";
  owner_label: string;
  note: string;
  measured_value: number | null;
  next_check_in_date: string | null;
  created_by: string | null;
  created_at: string;
};

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
  goal: string | null;
  action_plan: string | null;
  coaching_owner_label: string;
  target_metric_key: FranchiseBenchmarkMetricKey | null;
  target_value: number | null;
  baseline_value: number | null;
  latest_value: number | null;
  target_due_date: string | null;
  next_check_in_date: string | null;
  result_status: FranchiseBenchmarkResultStatus;
  result_summary: string | null;
  result_recorded_at: string | null;
  created_at: string;
  accepted_at: string | null;
  completed_at: string | null;
  checkins: FranchiseBenchmarkCheckIn[];
};

type BenchmarkActionRow = Omit<
  FranchiseBenchmarkAction,
  "franchise_root_name" | "franchisee_name" | "checkins"
>;

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const actionIds = rows.map((row) => row.id);
  const { data: checkins, error: checkinsError } = actionIds.length
    ? await service
        .from("franchise_benchmark_checkins")
        .select(
          "id, action_id, franchise_root_tenant_id, franchisee_tenant_id, checkin_type, status, owner_label, note, measured_value, next_check_in_date, created_by, created_at",
        )
        .in("action_id", actionIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (checkinsError) {
    throw new Error(`Benchmark check-ins laden mislukt: ${checkinsError.message}`);
  }

  const tenantNameById = new Map(
    ((tenants ?? []) as Array<{ id: string; name: string }>).map((tenant) => [
      tenant.id,
      tenant.name,
    ]),
  );
  const checkinsByAction = new Map<string, FranchiseBenchmarkCheckIn[]>();
  for (const checkin of (checkins ?? []) as Array<FranchiseBenchmarkCheckIn>) {
    const current = checkinsByAction.get(checkin.action_id) ?? [];
    current.push({
      ...checkin,
      measured_value: nullableNumber(checkin.measured_value),
    });
    checkinsByAction.set(checkin.action_id, current);
  }

  return rows.map((row) => ({
    ...row,
    target_value: nullableNumber(row.target_value),
    baseline_value: nullableNumber(row.baseline_value),
    latest_value: nullableNumber(row.latest_value),
    franchise_root_name:
      tenantNameById.get(row.franchise_root_tenant_id) ?? "Franchisegever",
    franchisee_name:
      tenantNameById.get(row.franchisee_tenant_id) ?? "Franchisee",
    checkins: checkinsByAction.get(row.id) ?? [],
  }));
}

export async function loadFranchiseBenchmarkActionsForRoot(
  franchiseRootTenantId: string,
) {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_benchmark_actions")
    .select(
      "id, franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id, signal_key, follow_up_route, attention_priority, title, description, status, local_response, resolution, goal, action_plan, coaching_owner_label, target_metric_key, target_value, baseline_value, latest_value, target_due_date, next_check_in_date, result_status, result_summary, result_recorded_at, created_at, accepted_at, completed_at",
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
      "id, franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id, signal_key, follow_up_route, attention_priority, title, description, status, local_response, resolution, goal, action_plan, coaching_owner_label, target_metric_key, target_value, baseline_value, latest_value, target_due_date, next_check_in_date, result_status, result_summary, result_recorded_at, created_at, accepted_at, completed_at",
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
