import { BrainCircuit, CheckCircle2, Sparkles, TriangleAlert } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { buildFranchiseAIInsights } from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";

export const dynamic = "force-dynamic";

export default async function FranchiseAIInsightsPage() {
  const { tenant, entitlementSnapshot } = await requireFranchiseOperator();
  const [performance, planning, governance] = await Promise.all([
    loadFranchisePerformanceOverview(tenant.id),
    loadFranchisePlanningOverview(tenant.id),
    loadFranchiseGovernanceOverview(tenant.id),
  ]);
  const insights = buildFranchiseAIInsights({ performance, planning, governance });
  const high = insights.filter((insight) => insight.priority === "hoog").length;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="AI-inzichten"
        title="AI-inzichten"
        description="AI vat franchise-data samen tot aandachtspunten. Het systeem publiceert niets autonoom en maakt geen mutaties zonder expliciete beheeractie."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone={entitlementSnapshot.featureAccess.ai_features.allowed ? "success" : "warning"}>
              {entitlementSnapshot.featureAccess.ai_features.allowed ? "AI beschikbaar" : "AI vereist Elite"}
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/aandacht">
              Aandacht
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/governance" variant="primary">
              Governance
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Inzichten"
          value={insights.length}
          hint="gegenereerd uit real data"
          icon={BrainCircuit}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Hoog risico"
          value={high}
          hint="directe opvolging"
          icon={TriangleAlert}
          tone={high > 0 ? "danger" : "success"}
        />
        <FranchiseKpiCard
          label="Bronnen"
          value="3"
          hint="prestaties, planning, governance"
          icon={Sparkles}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Publicatie"
          value="Nooit"
          hint="zonder bevestiging"
          icon={CheckCircle2}
          tone="readonly"
        />
      </section>

      <FranchisePanel title="AI-signalen" description="Conceptinzichten voor menselijke besluitvorming.">
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight) => (
            <article key={insight.title} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-foreground">{insight.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Bron: {insight.source}</p>
                </div>
                <FranchiseStatusBadge
                  tone={
                    insight.priority === "hoog"
                      ? "danger"
                      : insight.priority === "middel"
                        ? "warning"
                        : "success"
                  }
                >
                  {insight.priority}
                </FranchiseStatusBadge>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {insight.description}
              </p>
              <div className="mt-4 rounded-xl border border-primary/15 bg-brand-accent px-3 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
                  Voorstel
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">{insight.action}</p>
              </div>
            </article>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
