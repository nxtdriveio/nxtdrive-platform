import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Gauge,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import {
  FranchiseActionLink,
  FranchiseEmptyState,
  FranchiseErrorState,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseProgressBar,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
  FranchiseTableCell,
  FranchiseMiniTable,
  type FranchiseTone,
} from "@/components/backoffice/franchise/franchise-primitives";
import {
  formatDateTime,
  formatEuro,
  formatPercent,
  formatSignedPercent,
  priorityTone,
} from "@/components/backoffice/franchise/franchise-format";
import {
  buildFranchiseAIInsights,
  buildFranchiseControlCards,
  loadFranchiseAuditEvents,
  type FranchiseControlStatus,
} from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseBenchmarkActionsForRoot } from "@/lib/franchise/benchmark-actions";
import {
  buildCommandFlowItems,
  loadFranchiseBenchmarkTargets,
  loadFranchiseTemplateRolloutBatches,
} from "@/lib/franchise/command-center";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchiseOverview } from "@/lib/franchise/overview";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";
import { loadFranchiseDelegations } from "@/lib/franchise/steering";
import { loadFranchiseTemplates } from "@/lib/franchise/templates";
import { PLAN_LABELS } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

function controlTone(status: FranchiseControlStatus): FranchiseTone {
  if (status === "active" || status === "ready") return "success";
  if (status === "review") return "warning";
  if (status === "blocked") return "danger";
  return "readonly";
}

function formatTargetValue(value: number | null, unit: string) {
  if (value === null) return "-";
  if (unit === "euro_cents") return formatEuro(value);
  if (unit === "percent") return formatPercent(value);
  return `${value}`;
}

function rolloutModeLabel(mode: string) {
  if (mode === "dry_run") return "Dry-run";
  if (mode === "apply") return "Toegepast";
  if (mode === "rollback") return "Rollback";
  return mode;
}

export default async function FranchiseDashboardPage() {
  const { tenant, entitlementSnapshot, franchiseAccess, readOnlyDowngrade } =
    await requireFranchiseOperator();

  let data: {
    overview: Awaited<ReturnType<typeof loadFranchiseOverview>>;
    performance: Awaited<ReturnType<typeof loadFranchisePerformanceOverview>>;
    planning: Awaited<ReturnType<typeof loadFranchisePlanningOverview>>;
    governance: Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>;
    templates: Awaited<ReturnType<typeof loadFranchiseTemplates>>;
    auditEvents: Awaited<ReturnType<typeof loadFranchiseAuditEvents>>;
    commandItems: ReturnType<typeof buildCommandFlowItems>;
    benchmarkTargets: Awaited<ReturnType<typeof loadFranchiseBenchmarkTargets>>;
    rolloutBatches: Awaited<ReturnType<typeof loadFranchiseTemplateRolloutBatches>>;
  } | null = null;

  try {
    const [
      overview,
      performance,
      planning,
      governance,
      templates,
      auditEvents,
      benchmarkActions,
      delegations,
      rolloutBatches,
    ] = await Promise.all([
      loadFranchiseOverview(tenant.id),
      loadFranchisePerformanceOverview(tenant.id),
      loadFranchisePlanningOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
      loadFranchiseTemplates(tenant.id),
      loadFranchiseAuditEvents(tenant.id),
      loadFranchiseBenchmarkActionsForRoot(tenant.id),
      loadFranchiseDelegations(tenant.id),
      loadFranchiseTemplateRolloutBatches(tenant.id),
    ]);
    const benchmarkTargets = await loadFranchiseBenchmarkTargets(
      tenant.id,
      performance,
    );
    data = {
      overview,
      performance,
      planning,
      governance,
      templates,
      auditEvents,
      commandItems: buildCommandFlowItems({
        performance,
        benchmarkActions,
        delegations,
      }),
      benchmarkTargets,
      rolloutBatches,
    };
  } catch (error) {
    console.error("[franchise] cockpit load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Cockpit"
        description={`De franchisegegevens konden nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const {
    overview,
    performance,
    planning,
    governance,
    templates,
    auditEvents,
    commandItems,
    benchmarkTargets,
    rolloutBatches,
  } = data;
  const controlCards = buildFranchiseControlCards({
    governance,
    templates,
    entitlementSnapshot,
  });
  const aiInsights = buildFranchiseAIInsights({ performance, planning, governance });
  const activeFranchisees = overview.locations.filter((location) =>
    location.branches.some((branch) => branch.is_active),
  ).length;
  const avgLeadConversion =
    overview.locations.length === 0
      ? null
      : Math.round(
          overview.locations.reduce(
            (sum, location) => sum + (location.lead_conversion_rate ?? 0),
            0,
          ) / overview.locations.length,
        );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise cockpit"
        title="Franchise Cockpit"
        description={`Netwerkoverzicht en centrale aansturing voor ${governance.franchisegever_name}. Deze laag blijft tenant-overstijgend leesgericht, met expliciete delegatie en audit waar beheer nodig is.`}
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseModeBadge mode="network" />
            {readOnlyDowngrade ? (
              <FranchiseStatusBadge tone="warning">
                {PLAN_LABELS[franchiseAccess.requiredPlan]} vereist
              </FranchiseStatusBadge>
            ) : (
              <FranchiseStatusBadge tone="success">Elite toegang</FranchiseStatusBadge>
            )}
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/reports">
              Exporteren
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/aandacht" variant="primary">
              Signalen bekijken
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      {readOnlyDowngrade ? (
        <FranchiseDowngradeAlert
          planLabel={PLAN_LABELS[franchiseAccess.requiredPlan]}
        />
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <FranchiseKpiCard
          label="Franchisees actief"
          value={`${activeFranchisees}`}
          hint={`${overview.totals.franchisees} totaal`}
          icon={Building2}
          tone="primary"
          href="/backoffice/franchise/vergelijking"
        />
        <FranchiseKpiCard
          label="Vestigingen"
          value={overview.locations.reduce(
            (sum, location) => sum + location.branches.length,
            0,
          )}
          hint="franchisebreed"
          icon={Network}
          tone="info"
          href="/backoffice/franchise/vergelijking"
        />
        <FranchiseKpiCard
          label="Netwerkcapaciteit"
          value={performance.network.current_lessons}
          hint="lessen in 30 dagen"
          trend={formatSignedPercent(performance.network.revenue_delta_pct)}
          icon={CalendarDays}
          tone="delegated"
          href="/backoffice/franchise/planning"
        />
        <FranchiseKpiCard
          label="Leadconversie"
          value={formatPercent(avgLeadConversion)}
          hint="gemiddelde franchisee"
          icon={TrendingUp}
          tone="success"
          href="/backoffice/franchise/prestaties"
        />
        <FranchiseKpiCard
          label="Bezettingsgraad"
          value={formatPercent(governance.average_capacity_utilisation)}
          hint="beschikbaarheid vs lessen"
          icon={Gauge}
          tone="warning"
          href="/backoffice/franchise/planning"
        />
        <FranchiseKpiCard
          label="Open signalen"
          value={performance.network.attention_count}
          hint={`${performance.network.high_priority_count} hoog`}
          icon={AlertTriangle}
          tone={performance.network.high_priority_count > 0 ? "danger" : "success"}
          href="/backoffice/franchise/aandacht"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
        <FranchisePanel
          title="Command center"
          description="Vaste flow: signaal -> actie -> eigenaar -> status -> audit."
          actionHref="/backoffice/franchise/aandacht"
          actionLabel="Stuur signalen"
          contentClassName="p-0"
        >
          {commandItems.length === 0 ? (
            <div className="p-4">
              <FranchiseEmptyState
                icon={ShieldCheck}
                title="Geen actieve command-signalen"
                description="Het netwerk heeft nu geen signalen die centrale sturing vragen."
              />
            </div>
          ) : (
            <>
              <div className="space-y-3 p-3 xl:hidden">
                {commandItems.slice(0, 7).map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-brand-card-border bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground">
                          {item.signal}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {item.signal_detail}
                        </p>
                      </div>
                      <FranchiseStatusBadge tone={item.priority_tone}>
                        {item.delegation_ready ? "klaar" : "nodig"}
                      </FranchiseStatusBadge>
                    </div>

                    <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {[
                        ["Signaal", item.signal],
                        ["Actie", item.action],
                        ["Eigenaar", item.owner],
                        ["Status", item.status_label],
                        ["Audit", item.audit_at ? formatDateTime(item.audit_at) : "Nog geen audit"],
                      ].map(([label, value], index) => (
                        <div
                          key={`${item.id}-${label}`}
                          className="min-w-[9.25rem] snap-start rounded-xl border border-brand-card-border bg-brand-muted px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent text-[10px] font-black text-primary">
                              {index + 1}
                            </span>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                              {label}
                            </p>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs font-black leading-5 text-foreground">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="rounded-xl bg-brand-muted px-3 py-2">
                        <p className="text-xs font-black text-primary">
                          {item.suggested_delegation.label}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {item.suggested_delegation.reason}
                        </p>
                      </div>
                      <FranchiseStatusBadge tone={item.status_tone}>
                        {item.status_label}
                      </FranchiseStatusBadge>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden xl:block">
                <FranchiseMiniTable
                  columns={["Signaal", "Actie", "Eigenaar", "Status", "Audit"]}
                  minWidth="920px"
                >
                  {commandItems.slice(0, 7).map((item) => (
                    <tr key={item.id}>
                      <FranchiseTableCell>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-foreground">{item.signal}</p>
                            <FranchiseStatusBadge tone={item.priority_tone}>
                              {item.delegation_ready ? "delegatie klaar" : "delegatie nodig"}
                            </FranchiseStatusBadge>
                          </div>
                          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {item.signal_detail}
                          </p>
                        </div>
                      </FranchiseTableCell>
                      <FranchiseTableCell>
                        <p className="line-clamp-2 text-sm font-bold text-foreground">
                          {item.action}
                        </p>
                        <p className="mt-1 text-xs font-bold text-primary">
                          {item.suggested_delegation.label}
                        </p>
                      </FranchiseTableCell>
                      <FranchiseTableCell>
                        <p className="font-black text-foreground">{item.owner}</p>
                        <p className="text-xs text-muted-foreground">Lokale franchisee</p>
                      </FranchiseTableCell>
                      <FranchiseTableCell>
                        <FranchiseStatusBadge tone={item.status_tone}>
                          {item.status_label}
                        </FranchiseStatusBadge>
                      </FranchiseTableCell>
                      <FranchiseTableCell>
                        <p className="max-w-[220px] truncate text-sm font-bold text-foreground">
                          {item.audit_label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.audit_at ? formatDateTime(item.audit_at) : "Nog geen audit"}
                        </p>
                      </FranchiseTableCell>
                    </tr>
                  ))}
                </FranchiseMiniTable>
              </div>
            </>
          )}
        </FranchisePanel>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <FranchisePanel
            title="Benchmark targets"
            description="Doelwaarde per franchisee, gemonitord tegen actuele data."
            actionHref="/backoffice/franchise/aandacht"
            actionLabel="Targets"
          >
            <div className="space-y-3">
              {benchmarkTargets.length === 0 ? (
                <FranchiseEmptyState
                  icon={Target}
                  title="Nog geen targets"
                  description="Stel per franchisee een doelwaarde in vanuit Aandacht."
                />
              ) : (
                benchmarkTargets.slice(0, 4).map((target) => (
                  <div
                    key={target.id}
                    className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-foreground">
                          {target.franchisee_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {target.metric_label}: {formatTargetValue(target.current_value, target.unit)} / {formatTargetValue(target.target_value, target.unit)}
                        </p>
                      </div>
                      <FranchiseStatusBadge tone={target.tone}>
                        {target.status_label}
                      </FranchiseStatusBadge>
                    </div>
                    <div className="mt-3">
                      <FranchiseProgressBar
                        value={target.progress}
                        tone={target.tone}
                        label={target.progress === null ? "-" : `${target.progress}%`}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </FranchisePanel>

          <FranchisePanel
            title="Template rollouts"
            description="Dry-runs, batches en rollbacklog."
            actionHref="/backoffice/franchise/templates"
            actionLabel="Templates"
          >
            <div className="space-y-3">
              {rolloutBatches.length === 0 ? (
                <FranchiseEmptyState
                  title="Nog geen rollout batches"
                  description="Start een dry-run vanaf Templates voordat je franchisebreed toepast."
                />
              ) : (
                rolloutBatches.slice(0, 3).map((batch) => (
                  <div
                    key={batch.id}
                    className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-foreground">
                          {batch.template_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rolloutModeLabel(batch.mode)} - {batch.items.length} franchisees
                        </p>
                      </div>
                      <FranchiseStatusBadge
                        tone={batch.status === "completed" ? "success" : batch.status === "failed" ? "danger" : "info"}
                      >
                        {batch.status}
                      </FranchiseStatusBadge>
                    </div>
                    <p className="mt-2 text-xs font-bold text-muted-foreground">
                      Rollbackregels: {batch.rollback_log.length}
                    </p>
                  </div>
                ))
              )}
            </div>
          </FranchisePanel>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1.1fr_0.9fr_0.95fr]">
        <FranchisePanel
          title="Netwerkoverzicht"
          description="Echte franchisee-data, geaggregeerd over tenantgrenzen."
          actionHref="/backoffice/franchise/vergelijking"
          actionLabel="Vergelijk"
          contentClassName="p-0"
        >
          {overview.locations.length === 0 ? (
            <div className="p-4">
              <FranchiseEmptyState
                icon={Building2}
                title="Nog geen franchisees gekoppeld"
                description="Koppel franchisee-tenants via platformbeheer voordat deze cockpit netwerkdata kan tonen."
              />
            </div>
          ) : (
            <FranchiseMiniTable
              columns={["Franchisee", "Vest.", "Status", "Trend"]}
              minWidth="620px"
            >
              {performance.franchisees.slice(0, 7).map((row) => (
                <tr key={row.tenant_id}>
                  <FranchiseTableCell>
                    <p className="font-black text-foreground">{row.tenant_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.active_students} leerlingen, {row.current_lessons} lessen
                    </p>
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">{row.branch_count}</FranchiseTableCell>
                  <FranchiseTableCell>
                    <FranchiseStatusBadge tone={priorityTone(row.attention_priority)}>
                      {row.attention_label}
                    </FranchiseStatusBadge>
                  </FranchiseTableCell>
                  <FranchiseTableCell>
                    <FranchiseProgressBar
                      value={row.capacity_utilisation}
                      tone={row.capacity_utilisation !== null && row.capacity_utilisation < 45 ? "warning" : "primary"}
                    />
                  </FranchiseTableCell>
                </tr>
              ))}
            </FranchiseMiniTable>
          )}
        </FranchisePanel>

        <FranchisePanel
          title="Signalen & aandacht"
          description="Gerouteerd op prestatie, planning en kwaliteit."
          actionHref="/backoffice/franchise/aandacht"
          actionLabel="Alle signalen"
        >
          <div className="space-y-3">
            {performance.watchlists.attention.length === 0 ? (
              <FranchiseEmptyState
                title="Geen acute signalen"
                description="Het netwerk heeft op dit moment geen franchisees met directe follow-up."
              />
            ) : (
              performance.watchlists.attention.map((item) => (
                <div
                  key={item.tenant_id}
                  className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-foreground">{item.tenant_name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {item.attention_reason}
                      </p>
                    </div>
                    <FranchiseStatusBadge tone={priorityTone(item.attention_priority)}>
                      {item.attention_priority}
                    </FranchiseStatusBadge>
                  </div>
                  <p className="mt-2 text-xs font-bold text-primary">{item.next_step}</p>
                </div>
              ))
            )}
          </div>
        </FranchisePanel>

        <FranchisePanel
          title="Planning overzicht"
          description="Komende 7 dagen per vestiging."
          actionHref="/backoffice/franchise/planning"
          actionLabel="Planning"
        >
          <div className="space-y-3">
            {planning.branches.slice(0, 6).map((branch) => (
              <div key={branch.branch_id} className="rounded-xl border border-brand-card-border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">{branch.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {branch.branch_name}{branch.city ? `, ${branch.city}` : ""}
                    </p>
                  </div>
                  <FranchiseStatusBadge
                    tone={branch.upcoming_lessons_7d === 0 ? "warning" : "success"}
                  >
                    {branch.upcoming_lessons_7d} lessen
                  </FranchiseStatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-7 gap-1">
                  {branch.daily_lessons.map((day) => (
                    <div
                      key={day.date}
                      title={`${day.label}: ${day.lessons} lessen`}
                      className={`h-8 rounded-lg border border-white/70 text-center text-[10px] font-black leading-8 ${
                        day.pressure === "critical"
                          ? "bg-planning-critical text-red-900"
                          : day.pressure === "busy"
                            ? "bg-planning-busy text-orange-900"
                            : day.pressure === "normal"
                              ? "bg-planning-normal text-emerald-900"
                              : "bg-planning-calm text-slate-500"
                      }`}
                    >
                      {day.lessons}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FranchisePanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <FranchisePanel
          title="Prestaties vergelijking"
          description="Netwerkbrede omzet, lessen en capaciteit."
          actionHref="/backoffice/franchise/prestaties"
          actionLabel="KPI's"
        >
          <div className="space-y-3">
            {performance.franchisees.slice(0, 5).map((row, index) => (
              <div key={row.tenant_id} className="grid grid-cols-[2rem_1fr] items-center gap-3">
                <span className="text-center text-sm font-black text-muted-foreground">
                  {index + 1}
                </span>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-foreground">{row.tenant_name}</p>
                    <p className="text-sm font-black text-foreground">
                      {formatEuro(row.current_revenue_cents)}
                    </p>
                  </div>
                  <FranchiseProgressBar
                    value={row.capacity_utilisation}
                    tone="delegated"
                    label={formatPercent(row.capacity_utilisation)}
                  />
                </div>
              </div>
            ))}
          </div>
        </FranchisePanel>

        <FranchisePanel
          title="Governance & controles"
          description="Franchise werkt met expliciete read-only en delegatiegrenzen."
          actionHref="/backoffice/franchise/governance"
          actionLabel="Governance"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {controlCards.map((card) => (
              <div
                key={card.title}
                className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">{card.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                  <FranchiseStatusBadge tone={controlTone(card.status)}>
                    {card.value}
                  </FranchiseStatusBadge>
                </div>
                <p className="mt-2 text-xs font-bold text-primary">{card.detail}</p>
              </div>
            ))}
          </div>
        </FranchisePanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <FranchisePanel
          title="Recente activiteiten"
          description="Auditlog uit franchisegever en franchisee-tenants."
          actionHref="/backoffice/franchise/audit"
          actionLabel="Auditlog"
        >
          <div className="space-y-2">
            {auditEvents.length === 0 ? (
              <FranchiseEmptyState
                icon={ShieldCheck}
                title="Nog geen audit-events"
                description="Wanneer franchise-acties of tenantbeheer plaatsvinden verschijnen ze hier."
              />
            ) : (
              auditEvents.slice(0, 6).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">
                      {event.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.target_type ?? "tenant"} {event.target_id ? `- ${event.target_id}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {formatDateTime(event.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </FranchisePanel>

        <FranchisePanel
          title="AI-inzichten"
          description="AI zet signalen om naar opvolgbare acties, zonder autonome publicatie."
          actionHref="/backoffice/franchise/ai-insights"
          actionLabel="AI"
        >
          <div className="space-y-3">
            {aiInsights.slice(0, 4).map((insight) => (
              <div
                key={insight.title}
                className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-primary">
                    {insight.priority === "hoog" ? (
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                    ) : insight.priority === "middel" ? (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-foreground">{insight.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {insight.description}
                    </p>
                    <p className="mt-2 text-xs font-bold text-foreground">
                      {insight.action}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <FranchiseStatusBadge
                        tone={insight.action_type === "monitoring" ? "success" : "info"}
                      >
                        {insight.owner_label}
                      </FranchiseStatusBadge>
                      <FranchiseStatusBadge
                        tone={insight.priority === "hoog" ? "danger" : "warning"}
                      >
                        {insight.due_label}
                      </FranchiseStatusBadge>
                    </div>
                    <div className="mt-3">
                      <FranchiseActionLink href={insight.action_href} variant="primary">
                        {insight.action_label}
                      </FranchiseActionLink>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
