import { BarChart3, CalendarDays, FileChartColumn, Gauge, TrendingUp } from "lucide-react";

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
            <FranchiseActionLink href="/backoffice/rapportages">
              Backoffice rapportages
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/prestaties" variant="primary">
              KPI detail
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Omzet huidig"
          value={formatEuro(performance.network.current_revenue_cents)}
          hint={formatSignedPercent(performance.network.revenue_delta_pct)}
          icon={TrendingUp}
          tone="success"
        />
        <FranchiseKpiCard
          label="Lessen huidig"
          value={performance.network.current_lessons}
          hint={`${performance.network.lesson_delta > 0 ? "+" : ""}${performance.network.lesson_delta} vs vorige`}
          icon={CalendarDays}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Planning 7 dagen"
          value={planning.total_upcoming_lessons}
          hint={`${planning.branches_without_lessons} gaten`}
          icon={FileChartColumn}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Template adoptie"
          value={`${governance.template_activation_rate}%`}
          hint="franchisees geactiveerd"
          icon={Gauge}
          tone="info"
        />
      </section>

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

      <FranchisePanel title="Rapportageblokken" description="Klaar voor export of management samenvatting.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Omzetoverzicht", "Betaalde omzet en delta per franchisee."],
            ["Capaciteit & bezetting", "Beschikbaarheid versus werkelijk gereden lessen."],
            ["Conversie leads", "Leadopvolging en intakeconversie per franchisee."],
            ["Examens & slagingspercentage", "Kwaliteitsindicatoren per netwerkdeel."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-black text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
