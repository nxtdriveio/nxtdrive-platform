import {
  benchmarkSignalKey,
  type FranchiseBenchmarkAction,
} from "@/lib/franchise/benchmark-actions";
import type {
  FranchisePerformanceOverview,
  FranchisePerformanceRow,
  FranchiseFollowUpRoute,
} from "@/lib/franchise/performance";
import type {
  FranchiseDelegationState,
  FranchiseLeadRoutingBranch,
  FranchiseLeadRoutingLead,
  FranchiseLeadRoutingState,
} from "@/lib/franchise/steering";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseCommandTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "readonly"
  | "delegated";

export type FranchiseSuggestedDelegation = {
  label: string;
  reason: string;
  can_manage_planning: boolean;
  can_manage_leads: boolean;
  can_manage_templates: boolean;
  can_manage_fleet: boolean;
  can_manage_instructor_availability: boolean;
};

export type FranchiseCommandFlowItem = {
  id: string;
  signal: string;
  signal_detail: string;
  action: string;
  owner: string;
  owner_tenant_id: string;
  status_label: string;
  status_tone: FranchiseCommandTone;
  audit_label: string;
  audit_at: string | null;
  href: string;
  priority_tone: FranchiseCommandTone;
  suggested_delegation: FranchiseSuggestedDelegation;
  delegation_ready: boolean;
};

export type FranchiseRouteScore = {
  branch_id: string;
  branch_label: string;
  tenant_id: string;
  tenant_name: string;
  total_score: number;
  capacity_score: number;
  rayon_score: number;
  availability_score: number;
  conversion_score: number;
  response_score: number;
  reasons: string[];
};

export type FranchiseLeadRoutingRecommendation = FranchiseLeadRoutingLead & {
  route_scores: FranchiseRouteScore[];
  best_score: FranchiseRouteScore | null;
};

export type FranchiseBenchmarkMetricKey =
  | "capacity_utilisation"
  | "lead_conversion_rate"
  | "exam_pass_rate"
  | "current_lessons"
  | "current_revenue_cents";

export type FranchiseBenchmarkTarget = {
  id: string;
  franchise_root_tenant_id: string;
  franchisee_tenant_id: string;
  franchisee_name: string;
  metric_key: FranchiseBenchmarkMetricKey;
  metric_label: string;
  target_value: number;
  current_value: number | null;
  unit: "percent" | "count" | "euro_cents";
  status: "active" | "paused" | "achieved" | "at_risk" | "expired";
  status_label: string;
  tone: FranchiseCommandTone;
  progress: number | null;
  due_date: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FranchiseTemplateRolloutItem = {
  id: string;
  batch_id: string;
  franchisee_tenant_id: string;
  franchisee_name: string;
  action: string;
  status: string;
  message: string | null;
  resulting_activation_id: string | null;
  rollback_payload: Record<string, unknown>;
  created_at: string;
};

export type FranchiseTemplateRolloutBatch = {
  id: string;
  franchise_root_tenant_id: string;
  template_id: string;
  template_name: string;
  mode: "dry_run" | "apply" | "rollback";
  status: "pending" | "running" | "completed" | "failed" | "rolled_back";
  requested_by: string | null;
  summary: Record<string, unknown>;
  rollback_log: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: FranchiseTemplateRolloutItem[];
};

export const FRANCHISE_BENCHMARK_METRICS: Array<{
  key: FranchiseBenchmarkMetricKey;
  label: string;
  unit: "percent" | "count" | "euro_cents";
}> = [
  { key: "capacity_utilisation", label: "Bezettingsgraad", unit: "percent" },
  { key: "lead_conversion_rate", label: "Leadconversie", unit: "percent" },
  { key: "exam_pass_rate", label: "Slagingspercentage", unit: "percent" },
  { key: "current_lessons", label: "Lessen per 30 dagen", unit: "count" },
  { key: "current_revenue_cents", label: "Omzet per 30 dagen", unit: "euro_cents" },
];

const METRIC_BY_KEY = new Map(
  FRANCHISE_BENCHMARK_METRICS.map((metric) => [metric.key, metric]),
);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function responseScoreForLead(lead: FranchiseLeadRoutingLead) {
  const timestamp = lead.last_activity_at ?? lead.created_at;
  const ageMs = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ageMs)) return 50;
  const ageHours = ageMs / (60 * 60 * 1000);
  if (ageHours <= 4) return 100;
  if (ageHours <= 24) return 85;
  if (ageHours <= 72) return 65;
  if (ageHours <= 168) return 45;
  return 25;
}

function metricCurrentValue(
  row: FranchisePerformanceRow | undefined,
  metricKey: FranchiseBenchmarkMetricKey,
) {
  if (!row) return null;
  if (metricKey === "capacity_utilisation") return row.capacity_utilisation;
  if (metricKey === "lead_conversion_rate") return row.lead_conversion_rate;
  if (metricKey === "exam_pass_rate") return row.exam_pass_rate;
  if (metricKey === "current_lessons") return row.current_lessons;
  return row.current_revenue_cents;
}

function targetStatus(input: {
  configuredStatus: FranchiseBenchmarkTarget["status"];
  currentValue: number | null;
  targetValue: number;
  dueDate: string | null;
}) {
  if (input.configuredStatus === "paused") {
    return { status: "paused" as const, label: "Gepauzeerd", tone: "readonly" as const };
  }
  if (input.currentValue !== null && input.currentValue >= input.targetValue) {
    return { status: "achieved" as const, label: "Behaald", tone: "success" as const };
  }
  const due = input.dueDate ? Date.parse(`${input.dueDate}T23:59:59.999Z`) : null;
  if (due && Number.isFinite(due) && due < Date.now()) {
    return { status: "expired" as const, label: "Verlopen", tone: "danger" as const };
  }
  if (
    input.currentValue !== null &&
    input.targetValue > 0 &&
    input.currentValue / input.targetValue < 0.75
  ) {
    return { status: "at_risk" as const, label: "Risico", tone: "warning" as const };
  }
  return { status: "active" as const, label: "Actief", tone: "info" as const };
}

export function suggestedDelegationForRoute(
  route: FranchiseFollowUpRoute | string,
): FranchiseSuggestedDelegation {
  if (route === "lokale-planning") {
    return {
      label: "Planning + beschikbaarheid",
      reason: "Dit signaal vraagt lokale rooster- en capaciteitsaanpassing.",
      can_manage_planning: true,
      can_manage_leads: false,
      can_manage_templates: false,
      can_manage_fleet: false,
      can_manage_instructor_availability: true,
    };
  }
  if (route === "marketing") {
    return {
      label: "Leadbeheer",
      reason: "Dit signaal vraagt intake-opvolging en lokale leadrouting.",
      can_manage_planning: false,
      can_manage_leads: true,
      can_manage_templates: false,
      can_manage_fleet: false,
      can_manage_instructor_availability: false,
    };
  }
  if (route === "kwaliteit") {
    return {
      label: "Planning + templates",
      reason: "Kwaliteit vraagt vaak leskaart/playbook-afspraken en lokale planning.",
      can_manage_planning: true,
      can_manage_leads: false,
      can_manage_templates: true,
      can_manage_fleet: false,
      can_manage_instructor_availability: false,
    };
  }
  return {
    label: "Benchmark-opvolging",
    reason: "Centrale opvolging zonder directe lokale mutatie.",
    can_manage_planning: false,
    can_manage_leads: false,
    can_manage_templates: false,
    can_manage_fleet: false,
    can_manage_instructor_availability: false,
  };
}

export function delegationMatchesSuggestion(
  delegation: FranchiseDelegationState | undefined,
  suggestion: FranchiseSuggestedDelegation,
) {
  if (!delegation?.is_active) return false;
  if (suggestion.can_manage_planning && !delegation.can_manage_planning) return false;
  if (suggestion.can_manage_leads && !delegation.can_manage_leads) return false;
  if (suggestion.can_manage_templates && !delegation.can_manage_templates) return false;
  if (suggestion.can_manage_fleet && !delegation.can_manage_fleet) return false;
  if (
    suggestion.can_manage_instructor_availability &&
    !delegation.can_manage_instructor_availability
  ) {
    return false;
  }
  return true;
}

export function scoreLeadRoutes(
  leadRouting: FranchiseLeadRoutingState,
  performance: FranchisePerformanceOverview,
): FranchiseLeadRoutingRecommendation[] {
  const performanceByTenant = new Map(
    performance.franchisees.map((row) => [row.tenant_id, row]),
  );

  return leadRouting.leads.map((lead) => {
    const routeScores = leadRouting.branches
      .filter((branch) => lead.target_tenant_ids.includes(branch.tenant_id))
      .map((branch) => {
        const row = performanceByTenant.get(branch.tenant_id);
        const capacityScore = clampScore(
          row?.capacity_utilisation === null || row?.capacity_utilisation === undefined
            ? 55
            : 100 - row.capacity_utilisation,
        );
        const leadCity = normalize(lead.city);
        const branchCity = normalize(branch.city);
        const rayonScore =
          leadCity && branchCity
            ? leadCity === branchCity
              ? 100
              : lead.pickup_address?.toLowerCase().includes(branchCity)
                ? 75
                : 35
            : lead.postcode && branch.city
              ? 55
              : 50;
        const availabilityScore = clampScore(
          row ? 100 - Math.min(90, row.current_lessons * 2) : 55,
        );
        const conversionScore = clampScore(row?.lead_conversion_rate ?? 50);
        const responseScore = responseScoreForLead(lead);
        const totalScore = clampScore(
          capacityScore * 0.3 +
            rayonScore * 0.2 +
            availabilityScore * 0.2 +
            conversionScore * 0.2 +
            responseScore * 0.1,
        );
        const reasons = [
          `Capaciteit ${capacityScore}`,
          `Rayon ${rayonScore}`,
          `Beschikbaarheid ${availabilityScore}`,
          `Conversie ${conversionScore}`,
          `Responstijd ${responseScore}`,
        ];

        return {
          branch_id: branch.id,
          branch_label: `${branch.name}${branch.city ? `, ${branch.city}` : ""}`,
          tenant_id: branch.tenant_id,
          tenant_name: branch.tenant_name,
          total_score: totalScore,
          capacity_score: capacityScore,
          rayon_score: rayonScore,
          availability_score: availabilityScore,
          conversion_score: conversionScore,
          response_score: responseScore,
          reasons,
        };
      })
      .sort((left, right) => right.total_score - left.total_score);

    return {
      ...lead,
      route_scores: routeScores,
      best_score: routeScores[0] ?? null,
    };
  });
}

function commandStatusForBenchmarkAction(
  action: FranchiseBenchmarkAction | undefined,
): Pick<FranchiseCommandFlowItem, "status_label" | "status_tone" | "audit_label" | "audit_at"> {
  if (!action) {
    return {
      status_label: "Actie nodig",
      status_tone: "warning",
      audit_label: "Nog geen actie",
      audit_at: null,
    };
  }
  if (action.status === "created") {
    return {
      status_label: "Wacht op acceptatie",
      status_tone: "warning",
      audit_label: "Centrale actie aangemaakt",
      audit_at: action.created_at,
    };
  }
  if (action.status === "accepted" || action.status === "in_progress") {
    return {
      status_label: action.status === "accepted" ? "Geaccepteerd" : "In uitvoering",
      status_tone: "info",
      audit_label: action.local_response ?? "Lokale partij heeft geaccepteerd",
      audit_at: action.accepted_at ?? action.created_at,
    };
  }
  if (action.status === "completed") {
    return {
      status_label: "Afgerond",
      status_tone: "success",
      audit_label: action.resolution ?? "Afgerond door franchisee",
      audit_at: action.completed_at ?? action.created_at,
    };
  }
  if (action.status === "declined") {
    return {
      status_label: "Afgewezen",
      status_tone: "danger",
      audit_label: action.local_response ?? "Afgewezen door franchisee",
      audit_at: action.completed_at ?? action.created_at,
    };
  }
  return {
    status_label: action.status,
    status_tone: "readonly",
    audit_label: "Status bijgewerkt",
    audit_at: action.created_at,
  };
}

export function buildCommandFlowItems(input: {
  performance: FranchisePerformanceOverview;
  benchmarkActions: FranchiseBenchmarkAction[];
  delegations: FranchiseDelegationState[];
}): FranchiseCommandFlowItem[] {
  const actionBySignal = new Map(
    input.benchmarkActions.map((action) => [action.signal_key, action]),
  );
  const delegationByTenant = new Map(
    input.delegations.map((delegation) => [delegation.franchisee_tenant_id, delegation]),
  );

  return input.performance.watchlists.attention.map((item) => {
    const signalKey = benchmarkSignalKey(
      item.tenant_id,
      item.follow_up_route,
      item.attention_priority,
    );
    const action = actionBySignal.get(signalKey);
    const suggestion = suggestedDelegationForRoute(item.follow_up_route);
    const delegationReady = delegationMatchesSuggestion(
      delegationByTenant.get(item.tenant_id),
      suggestion,
    );
    const status = commandStatusForBenchmarkAction(action);
    const priorityTone: FranchiseCommandTone =
      item.attention_priority === "hoog"
        ? "danger"
        : item.attention_priority === "middel"
          ? "warning"
          : "info";

    return {
      id: signalKey,
      signal: `${item.tenant_name}: ${item.attention_label}`,
      signal_detail: item.attention_reason,
      action: action?.title ?? item.next_step,
      owner: item.tenant_name,
      owner_tenant_id: item.tenant_id,
      href: "/backoffice/franchise/aandacht",
      priority_tone: priorityTone,
      suggested_delegation: suggestion,
      delegation_ready: delegationReady,
      ...status,
    };
  });
}

export async function loadFranchiseBenchmarkTargets(
  franchiseRootTenantId: string,
  performance: FranchisePerformanceOverview,
): Promise<FranchiseBenchmarkTarget[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("franchise_benchmark_targets")
    .select("*")
    .eq("franchise_root_tenant_id", franchiseRootTenantId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Benchmarktargets laden mislukt: ${error.message}`);
  }

  const performanceByTenant = new Map(
    performance.franchisees.map((row) => [row.tenant_id, row]),
  );

  return ((data ?? []) as Array<{
    id: string;
    franchise_root_tenant_id: string;
    franchisee_tenant_id: string;
    metric_key: FranchiseBenchmarkMetricKey;
    target_value: number | string;
    current_value: number | string | null;
    unit: "percent" | "count" | "euro_cents";
    status: FranchiseBenchmarkTarget["status"];
    due_date: string | null;
    reason: string | null;
    created_at: string;
    updated_at: string;
  }>).map((row) => {
    const performanceRow = performanceByTenant.get(row.franchisee_tenant_id);
    const targetValue = Number(row.target_value);
    const currentValue =
      metricCurrentValue(performanceRow, row.metric_key) ?? (row.current_value === null ? null : Number(row.current_value));
    const status = targetStatus({
      configuredStatus: row.status,
      currentValue,
      targetValue,
      dueDate: row.due_date,
    });
    return {
      id: row.id,
      franchise_root_tenant_id: row.franchise_root_tenant_id,
      franchisee_tenant_id: row.franchisee_tenant_id,
      franchisee_name: performanceRow?.tenant_name ?? "Onbekende franchisee",
      metric_key: row.metric_key,
      metric_label: METRIC_BY_KEY.get(row.metric_key)?.label ?? row.metric_key,
      target_value: targetValue,
      current_value: currentValue,
      unit: row.unit,
      status: status.status,
      status_label: status.label,
      tone: status.tone,
      progress:
        currentValue === null || targetValue <= 0
          ? null
          : clampScore((currentValue / targetValue) * 100),
      due_date: row.due_date,
      reason: row.reason,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export async function loadFranchiseTemplateRolloutBatches(
  franchiseRootTenantId: string,
  limit = 8,
): Promise<FranchiseTemplateRolloutBatch[]> {
  const service = createServiceRoleClient();
  const { data: batches, error } = await service
    .from("franchise_template_rollout_batches")
    .select("*")
    .eq("franchise_root_tenant_id", franchiseRootTenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Template rollout batches laden mislukt: ${error.message}`);
  }

  if (!batches || batches.length === 0) return [];

  const batchIds = batches.map((batch) => batch.id as string);
  const templateIds = [...new Set(batches.map((batch) => batch.template_id as string))];
  const [{ data: items, error: itemError }, { data: templates, error: templateError }] =
    await Promise.all([
      service
        .from("franchise_template_rollout_items")
        .select("*")
        .in("batch_id", batchIds)
        .order("created_at", { ascending: true }),
      service
        .from("franchise_templates")
        .select("id, name")
        .in("id", templateIds),
    ]);

  if (itemError) {
    throw new Error(`Template rollout items laden mislukt: ${itemError.message}`);
  }
  if (templateError) {
    throw new Error(`Template namen laden mislukt: ${templateError.message}`);
  }

  const tenantIds = [
    ...new Set(((items ?? []) as Array<{ franchisee_tenant_id: string }>).map((item) => item.franchisee_tenant_id)),
  ];
  const { data: tenants, error: tenantError } =
    tenantIds.length === 0
      ? { data: [], error: null }
      : await service.from("tenants").select("id, name").in("id", tenantIds);

  if (tenantError) {
    throw new Error(`Franchisee namen laden mislukt: ${tenantError.message}`);
  }

  const templateNameById = new Map(
    ((templates ?? []) as Array<{ id: string; name: string }>).map((template) => [
      template.id,
      template.name,
    ]),
  );
  const tenantNameById = new Map(
    ((tenants ?? []) as Array<{ id: string; name: string }>).map((tenant) => [
      tenant.id,
      tenant.name,
    ]),
  );
  const itemsByBatch = new Map<string, FranchiseTemplateRolloutItem[]>();
  for (const item of (items ?? []) as Array<{
    id: string;
    batch_id: string;
    franchisee_tenant_id: string;
    action: string;
    status: string;
    message: string | null;
    resulting_activation_id: string | null;
    rollback_payload: Record<string, unknown> | null;
    created_at: string;
  }>) {
    const list = itemsByBatch.get(item.batch_id) ?? [];
    list.push({
      id: item.id,
      batch_id: item.batch_id,
      franchisee_tenant_id: item.franchisee_tenant_id,
      franchisee_name: tenantNameById.get(item.franchisee_tenant_id) ?? "Onbekende franchisee",
      action: item.action,
      status: item.status,
      message: item.message,
      resulting_activation_id: item.resulting_activation_id,
      rollback_payload: item.rollback_payload ?? {},
      created_at: item.created_at,
    });
    itemsByBatch.set(item.batch_id, list);
  }

  return (batches as Array<{
    id: string;
    franchise_root_tenant_id: string;
    template_id: string;
    mode: FranchiseTemplateRolloutBatch["mode"];
    status: FranchiseTemplateRolloutBatch["status"];
    requested_by: string | null;
    summary: Record<string, unknown> | null;
    rollback_log: Array<Record<string, unknown>> | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>).map((batch) => ({
    id: batch.id,
    franchise_root_tenant_id: batch.franchise_root_tenant_id,
    template_id: batch.template_id,
    template_name: templateNameById.get(batch.template_id) ?? "Onbekende template",
    mode: batch.mode,
    status: batch.status,
    requested_by: batch.requested_by,
    summary: batch.summary ?? {},
    rollback_log: batch.rollback_log ?? [],
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    completed_at: batch.completed_at,
    items: itemsByBatch.get(batch.id) ?? [],
  }));
}
