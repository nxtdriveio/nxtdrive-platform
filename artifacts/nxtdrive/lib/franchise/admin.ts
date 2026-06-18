import { createServiceRoleClient } from "@/lib/supabase/service";
import type { TenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import type { FranchiseGovernanceOverview } from "@/lib/franchise/governance";
import type { FranchisePerformanceOverview } from "@/lib/franchise/performance";
import type { FranchisePlanningOverview } from "@/lib/franchise/planning";
import type { FranchiseTemplateWithActivations } from "@/lib/franchise/templates";

export type FranchiseAuditEvent = {
  id: string;
  tenant_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

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
  limit = 8,
): Promise<FranchiseAuditEvent[]> {
  const service = createServiceRoleClient();
  const { data: franchisees, error: franchiseesError } = await service
    .from("tenants")
    .select("id")
    .eq("parent_tenant_id", franchisegeverTenantId);

  if (franchiseesError) {
    throw new Error(`Franchisees voor audit laden mislukt: ${franchiseesError.message}`);
  }

  const tenantIds = [
    franchisegeverTenantId,
    ...((franchisees ?? []).map((row) => row.id as string)),
  ];

  const { data, error } = await service
    .from("audit_log")
    .select("id, tenant_id, action, target_type, target_id, payload, created_at")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Auditlog laden mislukt: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    tenant_id: (row.tenant_id as string | null) ?? null,
    action: row.action as string,
    target_type: (row.target_type as string | null) ?? null,
    target_id: (row.target_id as string | null) ?? null,
    created_at: row.created_at as string,
    payload: ((row.payload as Record<string, unknown> | null) ?? {}),
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
