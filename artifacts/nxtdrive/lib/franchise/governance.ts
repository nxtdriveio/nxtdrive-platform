import { loadFranchiseContext } from "@/lib/franchise/context";
import { loadFranchiseOverview } from "@/lib/franchise/overview";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";
import { loadFranchiseTemplates } from "@/lib/franchise/templates";

export type FranchiseGovernanceOverview = {
  franchisegever_name: string;
  franchisees_total: number;
  franchisees_with_active_templates: number;
  franchisees_without_template_activation: number;
  inactive_templates: number;
  active_templates: number;
  branches_without_lessons: number;
  high_priority_count: number;
  attention_count: number;
  average_capacity_utilisation: number | null;
  franchisees_without_active_branches: number;
  template_activation_rate: number;
  coaching_targets: Array<{
    tenant_id: string;
    tenant_name: string;
    reason: string;
    next_step: string;
  }>;
  rollout_gaps: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

export async function loadFranchiseGovernanceOverview(
  franchisegeverTenantId: string,
): Promise<FranchiseGovernanceOverview> {
  const [context, overview, performance, planning, templates] = await Promise.all([
    loadFranchiseContext(franchisegeverTenantId),
    loadFranchiseOverview(franchisegeverTenantId),
    loadFranchisePerformanceOverview(franchisegeverTenantId),
    loadFranchisePlanningOverview(franchisegeverTenantId),
    loadFranchiseTemplates(franchisegeverTenantId),
  ]);

  const activeTemplates = templates.filter((template) => template.is_active);
  const activatedFranchiseeIds = new Set(
    activeTemplates.flatMap((template) =>
      template.activations.map((activation) => activation.franchisee_tenant_id),
    ),
  );

  const capacityValues = overview.locations
    .map((location) => location.capacity_utilisation)
    .filter((value): value is number => value !== null);

  const averageCapacityUtilisation =
    capacityValues.length === 0
      ? null
      : Math.round(
          capacityValues.reduce((sum, value) => sum + value, 0) / capacityValues.length,
        );

  const franchiseesWithoutActiveBranches = context.franchisees.filter(
    (franchisee) => franchisee.active_branch_count === 0,
  ).length;

  const coachingTargets = performance.watchlists.high_priority.map((item) => ({
    tenant_id: item.tenant_id,
    tenant_name: item.tenant_name,
    reason: item.attention_reason,
    next_step: item.next_step,
  }));

  const rolloutGaps = [
    {
      label: "Template adoptie",
      value: `${Math.max(0, context.franchisees.length - activatedFranchiseeIds.size)}`,
      detail: "franchisees zonder actieve template-activatie",
    },
    {
      label: "Planningsgaten",
      value: `${planning.branches_without_lessons}`,
      detail: "vestigingen zonder lessen in de komende 7 dagen",
    },
    {
      label: "Directe aandacht",
      value: `${performance.network.high_priority_count}`,
      detail: "franchisees die direct centrale opvolging nodig hebben",
    },
    {
      label: "Vestigingsbasis",
      value: `${franchiseesWithoutActiveBranches}`,
      detail: "franchisees zonder actieve vestigingen in hun netwerkmodel",
    },
  ];

  return {
    franchisegever_name: context.franchisegever_name,
    franchisees_total: context.franchisees.length,
    franchisees_with_active_templates: activatedFranchiseeIds.size,
    franchisees_without_template_activation: Math.max(
      0,
      context.franchisees.length - activatedFranchiseeIds.size,
    ),
    inactive_templates: templates.filter((template) => !template.is_active).length,
    active_templates: activeTemplates.length,
    branches_without_lessons: planning.branches_without_lessons,
    high_priority_count: performance.network.high_priority_count,
    attention_count: performance.network.attention_count,
    average_capacity_utilisation: averageCapacityUtilisation,
    franchisees_without_active_branches: franchiseesWithoutActiveBranches,
    template_activation_rate:
      context.franchisees.length === 0
        ? 0
        : Math.round((activatedFranchiseeIds.size / context.franchisees.length) * 100),
    coaching_targets: coachingTargets,
    rollout_gaps: rolloutGaps,
  };
}
