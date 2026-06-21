import { createServiceRoleClient } from "@/lib/supabase/service";
import type { TenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import type { FranchiseGovernanceOverview } from "@/lib/franchise/governance";
import type { FranchisePerformanceOverview } from "@/lib/franchise/performance";
import type { FranchisePlanningOverview } from "@/lib/franchise/planning";
import type { FranchiseTemplateWithActivations } from "@/lib/franchise/templates";

export type FranchiseAuditEvent = {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  action: string;
  action_label: string;
  category: FranchiseAuditCategory;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

export type FranchiseAuditCategory =
  | "tenant"
  | "template"
  | "delegation"
  | "lead_routing"
  | "benchmark"
  | "planning"
  | "other";

export type FranchiseAuditFilters = {
  category?: FranchiseAuditCategory;
  action?: string;
  tenantId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
};

export type FranchiseAuditTenantOption = {
  id: string;
  name: string;
};

type FranchiseAuditLoadOptions = {
  limit?: number;
  filters?: FranchiseAuditFilters;
};

export const FRANCHISE_AUDIT_CATEGORY_OPTIONS: Array<{
  value: FranchiseAuditCategory;
  label: string;
}> = [
  { value: "tenant", label: "Tenant" },
  { value: "template", label: "Templates" },
  { value: "delegation", label: "Delegaties" },
  { value: "lead_routing", label: "Lead routing" },
  { value: "benchmark", label: "Benchmark" },
  { value: "planning", label: "Planning" },
  { value: "other", label: "Overig" },
];

export const FRANCHISE_AUDIT_ACTION_OPTIONS: Array<{
  value: string;
  label: string;
  category: FranchiseAuditCategory;
}> = [
  { value: "franchise.parent_set", label: "Franchise parent gekoppeld", category: "tenant" },
  { value: "franchise_template.created", label: "Template aangemaakt", category: "template" },
  { value: "franchise_template.updated", label: "Template bijgewerkt", category: "template" },
  { value: "franchise_template.distributed", label: "Template gedistribueerd", category: "template" },
  { value: "franchise_template.activated", label: "Template lokaal geactiveerd", category: "template" },
  {
    value: "franchise_template.applied_by_franchisegever",
    label: "Template centraal toegepast",
    category: "template",
  },
  { value: "franchise.delegation.created", label: "Delegatie aangemaakt", category: "delegation" },
  { value: "franchise.delegation.updated", label: "Delegatie bijgewerkt", category: "delegation" },
  { value: "franchise.delegation.revoked", label: "Delegatie ingetrokken", category: "delegation" },
  { value: "franchise.delegation.reactivated", label: "Delegatie heractiveerd", category: "delegation" },
  { value: "franchise.delegation.deleted", label: "Delegatie verwijderd", category: "delegation" },
  { value: "franchise.lead_routed", label: "Lead gerouteerd", category: "lead_routing" },
  { value: "franchise.lead_route_confirmed", label: "Leadroute bevestigd", category: "lead_routing" },
  { value: "lead.routed_to_branch", label: "Lead naar vestiging", category: "lead_routing" },
  {
    value: "franchise.benchmark_action_created",
    label: "Benchmarkactie aangemaakt",
    category: "benchmark",
  },
  {
    value: "franchise.benchmark_action_accepted",
    label: "Benchmarkactie geaccepteerd",
    category: "benchmark",
  },
  {
    value: "franchise.benchmark_action_declined",
    label: "Benchmarkactie geweigerd",
    category: "benchmark",
  },
  {
    value: "franchise.benchmark_action_completed",
    label: "Benchmarkactie afgerond",
    category: "benchmark",
  },
  {
    value: "franchise.planning_action_created",
    label: "Planningactie aangemaakt",
    category: "planning",
  },
  {
    value: "franchise.planning_action_accepted",
    label: "Planningactie geaccepteerd",
    category: "planning",
  },
  {
    value: "franchise.planning_action_declined",
    label: "Planningactie geweigerd",
    category: "planning",
  },
  {
    value: "franchise.planning_action_completed",
    label: "Planningactie afgerond",
    category: "planning",
  },
];

const ACTION_BY_VALUE = new Map(
  FRANCHISE_AUDIT_ACTION_OPTIONS.map((option) => [option.value, option]),
);

const ACTIONS_BY_CATEGORY = FRANCHISE_AUDIT_CATEGORY_OPTIONS.reduce(
  (acc, category) => {
    acc[category.value] = FRANCHISE_AUDIT_ACTION_OPTIONS.filter(
      (option) => option.category === category.value,
    ).map((option) => option.value);
    return acc;
  },
  {} as Record<FranchiseAuditCategory, string[]>,
);

export function franchiseAuditCategoryLabel(category: FranchiseAuditCategory) {
  return (
    FRANCHISE_AUDIT_CATEGORY_OPTIONS.find((option) => option.value === category)
      ?.label ?? "Overig"
  );
}

export function franchiseAuditActionLabel(action: string) {
  return ACTION_BY_VALUE.get(action)?.label ?? action;
}

export function franchiseAuditCategoryForAction(
  action: string,
): FranchiseAuditCategory {
  return ACTION_BY_VALUE.get(action)?.category ?? "other";
}

export function isFranchiseAuditCategory(
  value: string | undefined,
): value is FranchiseAuditCategory {
  return FRANCHISE_AUDIT_CATEGORY_OPTIONS.some((option) => option.value === value);
}

export function isFranchiseAuditAction(value: string | undefined) {
  return Boolean(value && ACTION_BY_VALUE.has(value));
}

export type FranchiseControlStatus =
  | "active"
  | "ready"
  | "review"
  | "readonly"
  | "blocked";

export type FranchiseControlCard = {
  title: string;
  description: string;
  value: string;
  detail: string;
  status: FranchiseControlStatus;
  href: string;
};

export type FranchiseAIInsight = {
  title: string;
  description: string;
  priority: "hoog" | "middel" | "laag";
  source: string;
  action: string;
};

export async function loadFranchiseAuditEvents(
  franchisegeverTenantId: string,
  options: number | FranchiseAuditLoadOptions = 8,
): Promise<FranchiseAuditEvent[]> {
  const service = createServiceRoleClient();
  const limit = typeof options === "number" ? options : (options.limit ?? 8);
  const filters = typeof options === "number" ? undefined : options.filters;
  const tenantOptions = await loadFranchiseAuditTenantOptions(franchisegeverTenantId);
  const tenantIds = tenantOptions.map((tenant) => tenant.id);
  const tenantNameById = new Map(tenantOptions.map((tenant) => [tenant.id, tenant.name]));

  if (filters?.tenantId && !tenantIds.includes(filters.tenantId)) {
    return [];
  }

  let query = service
    .from("audit_log")
    .select("id, tenant_id, action, target_type, target_id, payload, created_at")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false });

  if (filters?.tenantId) query = query.eq("tenant_id", filters.tenantId);
  if (filters?.action && isFranchiseAuditAction(filters.action)) {
    query = query.eq("action", filters.action);
  } else if (filters?.category) {
    const actions = ACTIONS_BY_CATEGORY[filters.category];
    if (filters.category === "other") {
      query = query.not(
        "action",
        "in",
        `(${FRANCHISE_AUDIT_ACTION_OPTIONS.map((option) => `"${option.value}"`).join(",")})`,
      );
    } else if (actions.length > 0) {
      query = query.in("action", actions);
    }
  }
  if (filters?.targetType) query = query.eq("target_type", filters.targetType);
  if (filters?.targetId) query = query.ilike("target_id", `%${filters.targetId}%`);
  if (filters?.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  if (filters?.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(`Auditlog laden mislukt: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    tenant_id: (row.tenant_id as string | null) ?? null,
    tenant_name: row.tenant_id ? (tenantNameById.get(row.tenant_id as string) ?? null) : null,
    action: row.action as string,
    action_label: franchiseAuditActionLabel(row.action as string),
    category: franchiseAuditCategoryForAction(row.action as string),
    target_type: (row.target_type as string | null) ?? null,
    target_id: (row.target_id as string | null) ?? null,
    created_at: row.created_at as string,
    payload: ((row.payload as Record<string, unknown> | null) ?? {}),
  }));
}

export async function loadFranchiseAuditTenantOptions(
  franchisegeverTenantId: string,
): Promise<FranchiseAuditTenantOption[]> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("tenants")
    .select("id, name")
    .or(`id.eq.${franchisegeverTenantId},parent_tenant_id.eq.${franchisegeverTenantId}`)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Franchisees voor audit laden mislukt: ${error.message}`);
  }

  return ((data ?? []) as Array<{ id: string; name: string | null }>).map((tenant) => ({
    id: tenant.id,
    name: tenant.name ?? tenant.id,
  }));
}

export function buildFranchiseControlCards(input: {
  governance: FranchiseGovernanceOverview;
  templates: FranchiseTemplateWithActivations[];
  entitlementSnapshot: TenantEntitlementSnapshot;
}): FranchiseControlCard[] {
  const { governance, templates, entitlementSnapshot } = input;
  const activeTemplates = templates.filter((template) => template.is_active);
  const limitAlerts = Object.values(entitlementSnapshot.limitStatuses).filter(
    (status) => status.isAtLimit || status.isOverLimit,
  ).length;

  return [
    {
      title: "Standaarden",
      description: "Netwerkbrede afspraken, pakketten en kwaliteitsregels.",
      value: `${activeTemplates.length} actief`,
      detail: activeTemplates.length > 0
        ? "Klaar voor gecontroleerde franchise-uitrol."
        : "Maak minimaal een actieve template aan.",
      status: activeTemplates.length > 0 ? "ready" : "review",
      href: "/backoffice/franchise/templates",
    },
    {
      title: "Playbooks",
      description: "Werkwijzen voor intake, planning, RIS, finance en CBR.",
      value: `${governance.template_activation_rate}% adoptie`,
      detail: `${governance.franchisees_without_template_activation} franchisees zonder actieve template.`,
      status: governance.template_activation_rate >= 70 ? "ready" : "review",
      href: "/backoffice/franchise/playbook",
    },
    {
      title: "Capabilities",
      description: "Planning-core validaties en vereiste eigenschappen.",
      value: "Actief",
      detail: "Rayons, beschikbaarheid, voertuigen en planningchecks blijven lokaal gevalideerd.",
      status: "active",
      href: "/backoffice/eigenschappen",
    },
    {
      title: "Delegaties",
      description: "Mutaties blijven geblokkeerd zonder expliciete delegatie.",
      value: "Read-only",
      detail: "Cross-tenant schrijven vereist scope, geldigheid en audit.",
      status: "readonly",
      href: "/backoffice/franchise/delegaties",
    },
    {
      title: "Audit & veiligheid",
      description: "Gevoelige acties horen zichtbaar en insert-only te blijven.",
      value: "Guard actief",
      detail: "Recente audit-events worden vanuit franchisegever en franchisees gelezen.",
      status: "active",
      href: "/backoffice/franchise/audit",
    },
    {
      title: "Entitlements",
      description: "Plan, limieten en downgrade/read-only gedrag.",
      value: limitAlerts > 0 ? `${limitAlerts} alerts` : "Gezond",
      detail: limitAlerts > 0
        ? "Controleer planlimieten voordat je uitbreidt."
        : "Geen limietalerts op dit moment.",
      status: limitAlerts > 0 ? "review" : "active",
      href: "/backoffice/franchise/entitlements",
    },
  ];
}

export function buildFranchiseAIInsights(input: {
  performance: FranchisePerformanceOverview;
  planning: FranchisePlanningOverview;
  governance: FranchiseGovernanceOverview;
}): FranchiseAIInsight[] {
  const { performance, planning, governance } = input;
  const insights: FranchiseAIInsight[] = [];

  for (const item of performance.watchlists.high_priority.slice(0, 3)) {
    insights.push({
      title: `${item.tenant_name} vraagt directe opvolging`,
      description: item.attention_reason,
      priority: "hoog",
      source: "Prestaties",
      action: item.next_step,
    });
  }

  if (planning.branches_without_lessons > 0) {
    insights.push({
      title: "Planningsdruk is ongelijk verdeeld",
      description: `${planning.branches_without_lessons} vestigingen hebben geen lessen in de komende 7 dagen.`,
      priority: planning.branches_without_lessons > 3 ? "hoog" : "middel",
      source: "Planning",
      action: "Vraag lokale planners om beschikbare capaciteit en vraaguitval te controleren.",
    });
  }

  if (governance.franchisees_without_template_activation > 0) {
    insights.push({
      title: "Template-adoptie blijft achter",
      description: `${governance.franchisees_without_template_activation} franchisees hebben nog geen actieve template-activatie.`,
      priority: "middel",
      source: "Templates",
      action: "Bereid een gecontroleerde rollout voor en laat franchisees lokaal activeren.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Geen acute AI-signalen",
      description: "Het netwerk heeft op dit moment geen hoog risico op basis van prestaties, planning en governance.",
      priority: "laag",
      source: "Netwerk",
      action: "Blijf monitoren via de reguliere cockpit.",
    });
  }

  return insights;
}
