import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileChartColumn,
  Gauge,
  TrendingUp,
} from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseProgressBar,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { formatEuro, formatPercent, formatSignedPercent } from "@/components/backoffice/franchise/franchise-format";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { buildFranchiseAIInsights } from "@/lib/franchise/admin";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";

export const dynamic = "force-dynamic";

export default async function FranchiseReportsPage() {
  const { tenant } = await requireFranchiseOperator();
  const [performance, planning, governance] = await Promise.all([
    loadFranchisePerformanceOverview(tenant.id),
    loadFranchisePlanningOverview(tenant.id),
    loadFranchiseGovernanceOverview(tenant.id),
  ]);
  const insights = buildFranchiseAIInsights({ performance, planning, governance });
  const actionableInsights = insights.filter(
    (insight) => insight.action_type !== "monitoring",
  );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise rapportages"
        title="Rapportages"
        description="Zakelijke rapportagekaart voor netwerkprestaties, planningdruk, rollout en governance. Exportacties kunnen hierop aansluiten zonder de datalaag te dupliceren."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="info">Real-data snapshot</FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/ai-insights">
              AI actieplan
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/prestaties" variant="primary">
              KPI detail
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FranchiseKpiCard
          label="Omzet huidig"
          value={formatEuro(performance.network.current_revenue_cents)}
          hint={formatSignedPercent(performance.network.revenue_delta_pct)}
          icon={TrendingUp}
          tone="success"
          href="/backoffice/franchise/prestaties"
        />
        <FranchiseKpiCard
          label="Lessen huidig"
          value={performance.network.current_lessons}
          hint={`${performance.network.lesson_delta > 0 ? "+" : ""}${performance.network.lesson_delta} vs vorige`}
          icon={CalendarDays}
          tone="primary"
          href="/backoffice/franchise/prestaties"
        />
        <FranchiseKpiCard
          label="Planning 7 dagen"
          value={planning.total_upcoming_lessons}
          hint={`${planning.branches_without_lessons} gaten`}
          icon={FileChartColumn}
          tone="delegated"
          href="/backoffice/franchise/planning"
        />
        <FranchiseKpiCard
          label="Template adoptie"
          value={`${governance.template_activation_rate}%`}
          hint="franchisees geactiveerd"
          icon={Gauge}
          tone="info"
          href="/backoffice/franchise/templates"
        />
        <FranchiseKpiCard
          label="Acties open"
          value={actionableInsights.length}
          hint="uit rapportage-signalen"
          icon={ClipboardList}
          tone={actionableInsights.length > 0 ? "warning" : "success"}
          href="/backoffice/franchise/ai-insights"
        />
      </section>

      <FranchisePanel
        title="Actieplan uit rapportage"
        description="Belangrijkste rapportage-signalen met eigenaar, termijn en directe opvolgroute."
        actionHref="/backoffice/franchise/ai-insights"
        actionLabel="Alle acties"
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.slice(0, 3).map((insight) => (
            <article
              key={insight.signal_key}
              className="flex min-h-[14rem] flex-col rounded-2xl border border-brand-card-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                    {insight.source}
                  </p>
                  <h2 className="mt-2 font-black text-foreground">{insight.title}</h2>
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
                {insight.action}
              </p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-muted-foreground">
                    {insight.owner_label}
                  </p>
                  <p className="truncate text-xs font-black text-foreground">
                    {insight.due_label}
                  </p>
                </div>
                <FranchiseActionLink href={insight.action_href} variant="primary">
                  {insight.action_label}
                </FranchiseActionLink>
              </div>
            </article>
          ))}
        </div>
      </FranchisePanel>

      <section className="grid gap-4 xl:grid-cols-3">
        <FranchisePanel title="Omzetvensters" description="90 dagen benchmark.">
          <div className="space-y-4">
            {[
              ["Laatste 30 dagen", performance.network.current_revenue_cents],
              ["31-60 dagen", performance.network.previous_revenue_cents],
              ["61-90 dagen", performance.network.baseline_revenue_cents],
            ].map(([label, cents]) => (
              <div key={String(label)} className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <p className="text-xs font-bold text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-black text-foreground">
                  {formatEuro(Number(cents))}
                </p>
              </div>
            ))}
          </div>
        </FranchisePanel>

        <FranchisePanel title="Lesvensters" description="Volumeontwikkeling.">
          <div className="space-y-4">
            {[
              ["Laatste 30 dagen", performance.network.current_lessons],
              ["31-60 dagen", performance.network.previous_lessons],
              ["61-90 dagen", performance.network.baseline_lessons],
            ].map(([label, count]) => (
              <div key={String(label)} className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <p className="text-xs font-bold text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-black text-foreground">{count}</p>
              </div>
            ))}
          </div>
        </FranchisePanel>

        <FranchisePanel title="Governance rapport" description="Rollout en aandacht.">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-black text-foreground">Template adoptie</span>
                <span className="text-xs font-bold text-muted-foreground">
                  {formatPercent(governance.template_activation_rate)}
                </span>
              </div>
              <FranchiseProgressBar value={governance.template_activation_rate} tone="delegated" />
            </div>
            <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
              <p className="text-xs font-bold text-muted-foreground">Directe aandacht</p>
              <p className="mt-1 text-2xl font-black text-foreground">
                {governance.high_priority_count}
              </p>
            </div>
            <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
              <p className="text-xs font-bold text-muted-foreground">Planningsgaten</p>
              <p className="mt-1 text-2xl font-black text-foreground">
                {governance.branches_without_lessons}
              </p>
            </div>
          </div>
        </FranchisePanel>
      </section>

      <FranchisePanel title="Rapportageblokken" description="Klaar voor export, management samenvatting en directe opvolging.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Omzetoverzicht",
              description: "Betaalde omzet en delta per franchisee.",
              href: "/backoffice/franchise/prestaties",
              action: "Bekijk KPI's",
            },
            {
              title: "Capaciteit & bezetting",
              description: "Beschikbaarheid versus werkelijk gereden lessen.",
              href: "/backoffice/franchise/planning",
              action: "Stuur planning",
            },
            {
              title: "Conversie leads",
              description: "Leadopvolging en intakeconversie per franchisee.",
              href: "/backoffice/franchise/aandacht",
              action: "Routeer leads",
            },
            {
              title: "Examens & slagingspercentage",
              description: "Kwaliteitsindicatoren per netwerkdeel.",
              href: "/backoffice/franchise/governance",
              action: "Borg kwaliteit",
            },
          ].map(({ title, description, href, action }) => (
            <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-black text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <div className="mt-4">
                <FranchiseActionLink href={href}>{action}</FranchiseActionLink>
              </div>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
