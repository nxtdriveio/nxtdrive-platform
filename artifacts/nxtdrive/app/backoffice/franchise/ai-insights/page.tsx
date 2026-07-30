import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Route,
  TriangleAlert,
} from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
  type FranchiseTone,
} from "@/components/backoffice/franchise/franchise-primitives";
import {
  buildFranchiseAIInsights,
  type FranchiseAIInsight,
} from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";

export const dynamic = "force-dynamic";

function insightTone(priority: FranchiseAIInsight["priority"]): FranchiseTone {
  if (priority === "hoog") return "danger";
  if (priority === "middel") return "warning";
  return "success";
}

function actionTypeLabel(actionType: FranchiseAIInsight["action_type"]) {
  if (actionType === "benchmark_action") return "Benchmarktaak";
  if (actionType === "planning_action") return "Planningactie";
  if (actionType === "template_rollout") return "Template-rollout";
  return "Monitoring";
}

export default async function FranchiseAIInsightsPage() {
  const { tenant } = await requireFranchiseOperator();
  const [performance, planning, governance] = await Promise.all([
    loadFranchisePerformanceOverview(tenant.id),
    loadFranchisePlanningOverview(tenant.id),
    loadFranchiseGovernanceOverview(tenant.id),
  ]);
  const insights = buildFranchiseAIInsights({ performance, planning, governance });
  const high = insights.filter((insight) => insight.priority === "hoog").length;
  const actionable = insights.filter((insight) => insight.action_type !== "monitoring");
  const dueToday = insights.filter((insight) =>
    insight.due_label.toLowerCase().includes("vandaag"),
  ).length;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Prioriteiten"
        title="Prioriteitsinzichten"
        description="Transparante regels vertalen franchise-data naar opvolgbare acties. Het systeem publiceert niets autonoom en maakt geen mutaties zonder expliciete beheeractie."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="info">
              Regelgestuurd
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/audit">
              Audit
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/aandacht" variant="primary">
              Actiequeue
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Acties klaar"
          value={actionable.length}
          hint="direct opvolgbaar"
          icon={ClipboardList}
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
          label="Vandaag"
          value={dueToday}
          hint="met directe deadline"
          icon={Clock3}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Mutaties"
          value="Bevestigd"
          hint="altijd via beheeractie"
          icon={CheckCircle2}
          tone="readonly"
        />
      </section>

      <FranchisePanel
        title="Actievoorstellen"
        description="Ieder signaal heeft een eigenaar, termijn en route naar de plek waar de actie uitgevoerd wordt."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {insights.map((insight) => (
            <article
              key={insight.signal_key}
              className="flex min-h-[18rem] flex-col rounded-2xl border border-brand-card-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-black text-foreground">{insight.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {insight.source} · {actionTypeLabel(insight.action_type)}
                  </p>
                </div>
                <FranchiseStatusBadge tone={insightTone(insight.priority)}>
                  {insight.priority}
                </FranchiseStatusBadge>
              </div>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {insight.description}
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Eigenaar
                  </p>
                  <p className="mt-1 text-sm font-black text-foreground">
                    {insight.owner_label}
                  </p>
                </div>
                <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    Termijn
                  </p>
                  <p className="mt-1 text-sm font-black text-foreground">
                    {insight.due_label}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-primary/15 bg-brand-accent px-3 py-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-primary">
                  <Route className="h-3.5 w-3.5" aria-hidden />
                  Voorstel
                </div>
                <p className="mt-1 text-sm font-bold text-foreground">{insight.action}</p>
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <FranchiseActionLink href={insight.action_href} variant="primary">
                  {insight.action_label}
                </FranchiseActionLink>
                {insight.secondary_action_href ? (
                  <FranchiseActionLink href={insight.secondary_action_href}>
                    {insight.secondary_action_label ?? "Bekijk context"}
                  </FranchiseActionLink>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </FranchisePanel>

      <FranchisePanel
        title="Actieregels"
        description="AI levert alleen voorstellen; daadwerkelijke wijzigingen blijven via bestaande schermen, validaties en auditlog lopen."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["1", "Bevestig", "Controleer het signaal en de brondata voordat je een actie start."],
            ["2", "Routeer", "Maak een benchmarktaak, planningactie of template-rollout via de juiste module."],
            ["3", "Borg", "Laat uitvoering, acceptatie en afronding zichtbaar terugkomen in audit en rapportage."],
          ].map(([step, title, description]) => (
            <div
              key={step}
              className="rounded-2xl border border-brand-card-border bg-white p-4"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-accent text-sm font-black text-primary">
                {step}
              </span>
              <h2 className="mt-3 font-black text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
