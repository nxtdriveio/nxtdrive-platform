import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  ClipboardList,
  Megaphone,
  Route,
  ShieldCheck,
  Target,
} from "lucide-react";

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
} from "@/components/backoffice/franchise/franchise-primitives";
import { Button } from "@/components/ui/button";
import {
  formatEuro,
  formatPercent,
  priorityTone,
} from "@/components/backoffice/franchise/franchise-format";
import {
  addFranchiseBenchmarkCheckIn,
  createFranchiseBenchmarkTask,
  recordFranchiseBenchmarkResult,
  routeFranchiseLead,
  saveFranchiseBenchmarkCoachingPlan,
  upsertFranchiseBenchmarkTarget,
  upsertFranchiseDelegation,
} from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  FRANCHISE_BENCHMARK_METRICS,
  delegationMatchesSuggestion,
  loadFranchiseBenchmarkTargets,
  scoreLeadRoutes,
  suggestedDelegationForRoute,
} from "@/lib/franchise/command-center";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import {
  loadFranchiseDelegations,
  loadFranchiseLeadRoutingState,
} from "@/lib/franchise/steering";
import {
  benchmarkSignalKey,
  loadFranchiseBenchmarkActionsForRoot,
} from "@/lib/franchise/benchmark-actions";

export const dynamic = "force-dynamic";

const ROUTE_LABELS: Record<string, string> = {
  "franchise-coaching": "Franchise coaching",
  "lokale-planning": "Lokale planning",
  kwaliteit: "Kwaliteit",
  marketing: "Marketing",
  bewaken: "Bewaken",
};

const RESULT_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  on_track: "Op koers",
  at_risk: "Risico",
  achieved: "Behaald",
  not_achieved: "Niet behaald",
  cancelled: "Geannuleerd",
};

function formatTargetValue(value: number | null, unit: string) {
  if (value === null) return "-";
  if (unit === "euro_cents") return formatEuro(value);
  if (unit === "percent") return formatPercent(value);
  return `${value}`;
}

function metricForAction(metricKey: string | null) {
  return FRANCHISE_BENCHMARK_METRICS.find((metric) => metric.key === metricKey) ?? null;
}

function inputValueForMetric(value: number | null, unit?: string) {
  if (value === null) return "";
  return unit === "euro_cents" ? String(value / 100) : String(value);
}

export default async function FranchiseAttentionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [sp, { tenant }] = await Promise.all([
    searchParams,
    requireFranchiseOperator(),
  ]);
  let data: {
    performance: Awaited<ReturnType<typeof loadFranchisePerformanceOverview>>;
    governance: Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>;
    leadRouting: Awaited<ReturnType<typeof loadFranchiseLeadRoutingState>>;
    benchmarkActions: Awaited<ReturnType<typeof loadFranchiseBenchmarkActionsForRoot>>;
    delegations: Awaited<ReturnType<typeof loadFranchiseDelegations>>;
    benchmarkTargets: Awaited<ReturnType<typeof loadFranchiseBenchmarkTargets>>;
    leadRecommendations: ReturnType<typeof scoreLeadRoutes>;
  } | null = null;

  try {
    const [
      performance,
      governance,
      leadRouting,
      benchmarkActions,
      delegations,
    ] = await Promise.all([
      loadFranchisePerformanceOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
      loadFranchiseLeadRoutingState(tenant.id),
      loadFranchiseBenchmarkActionsForRoot(tenant.id),
      loadFranchiseDelegations(tenant.id),
    ]);
    const benchmarkTargets = await loadFranchiseBenchmarkTargets(
      tenant.id,
      performance,
    );
    data = {
      performance,
      governance,
      leadRouting,
      benchmarkActions,
      delegations,
      benchmarkTargets,
      leadRecommendations: scoreLeadRoutes(leadRouting, performance),
    };
  } catch (error) {
    console.error("[franchise/aandacht] load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Aandacht"
        description={`De aandachtssignalen konden nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const {
    performance,
    governance,
    benchmarkActions,
    delegations,
    benchmarkTargets,
    leadRecommendations,
  } = data;
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null;
  const delegationByTenant = new Map(
    delegations.map((delegation) => [delegation.franchisee_tenant_id, delegation]),
  );
  const targetsByTenant = new Map<string, typeof benchmarkTargets>();
  for (const target of benchmarkTargets) {
    const list = targetsByTenant.get(target.franchisee_tenant_id) ?? [];
    list.push(target);
    targetsByTenant.set(target.franchisee_tenant_id, list);
  }
  const activeBenchmarkBySignal = new Map(
    benchmarkActions
      .filter((action) =>
        ["created", "accepted", "in_progress"].includes(action.status),
      )
      .map((action) => [action.signal_key, action]),
  );
  const benchmarkStatusLabel: Record<string, string> = {
    created: "Wacht op acceptatie",
    accepted: "Lokaal geaccepteerd",
    in_progress: "In uitvoering",
    completed: "Afgerond",
    declined: "Afgewezen",
    cancelled: "Geannuleerd",
  };
  const coachingActions = benchmarkActions
    .filter((action) => !["declined", "cancelled"].includes(action.status))
    .slice(0, 6);
  const routeCounts = performance.franchisees.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.follow_up_route] = (acc[row.follow_up_route] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise aandacht"
        title="Aandacht"
        description="Prioriteer franchisees op basis van omzet, lesvolume, capaciteit, conversie en kwaliteit. Follow-up blijft bestuurlijk: lokaal uitvoeren, centraal bewaken."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="danger">
              {performance.network.high_priority_count} hoog
            </FranchiseStatusBadge>
            <FranchiseStatusBadge tone="warning">
              {performance.network.attention_count} signalen
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/delegaties">
              Delegatiepad
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/ai-insights" variant="primary">
              AI-samenvatten
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      {errorMsg ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
          {errorMsg}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Directe aandacht"
          value={performance.network.high_priority_count}
          hint="hoog risico"
          icon={AlertTriangle}
          tone={performance.network.high_priority_count > 0 ? "danger" : "success"}
        />
        <FranchiseKpiCard
          label="Alle signalen"
          value={performance.network.attention_count}
          hint="niet stabiel"
          icon={ClipboardList}
          tone="warning"
        />
        <FranchiseKpiCard
          label="Coaching targets"
          value={governance.coaching_targets.length}
          hint="centrale opvolging"
          icon={Megaphone}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Netwerkomzet"
          value={formatEuro(performance.network.current_revenue_cents)}
          hint="context voor prioriteit"
          icon={BadgeCheck}
          tone="info"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.55fr]">
        <FranchisePanel
          title="Aandachtspunten"
          description="Gesorteerd op urgentie, daarna omzet en lesvolume."
        >
          <div className="space-y-3">
            {performance.watchlists.attention.length === 0 ? (
              <FranchiseEmptyState
                icon={ShieldCheck}
                title="Geen directe aandacht"
                description="Het franchisenetwerk heeft op dit moment geen rode of oranje signalen."
              />
            ) : (
              performance.watchlists.attention.map((item) => {
                const signalKey = benchmarkSignalKey(
                  item.tenant_id,
                  item.follow_up_route,
                  item.attention_priority,
                );
                const activeBenchmarkAction =
                  activeBenchmarkBySignal.get(signalKey);
                const suggestedDelegation = suggestedDelegationForRoute(
                  item.follow_up_route,
                );
                const currentDelegation = delegationByTenant.get(item.tenant_id);
                const delegationReady = delegationMatchesSuggestion(
                  currentDelegation,
                  suggestedDelegation,
                );
                const combinedDelegation = {
                  can_manage_planning:
                    Boolean(currentDelegation?.can_manage_planning) ||
                    suggestedDelegation.can_manage_planning,
                  can_manage_leads:
                    Boolean(currentDelegation?.can_manage_leads) ||
                    suggestedDelegation.can_manage_leads,
                  can_manage_templates:
                    Boolean(currentDelegation?.can_manage_templates) ||
                    suggestedDelegation.can_manage_templates,
                  can_manage_fleet:
                    Boolean(currentDelegation?.can_manage_fleet) ||
                    suggestedDelegation.can_manage_fleet,
                  can_manage_instructor_availability:
                    Boolean(
                      currentDelegation?.can_manage_instructor_availability,
                    ) ||
                    suggestedDelegation.can_manage_instructor_availability,
                };
                const tenantTargets = targetsByTenant.get(item.tenant_id) ?? [];
                return (
                  <div
                    key={item.tenant_id}
                    className="rounded-2xl border border-brand-card-border bg-white p-4"
                  >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-foreground">
                          {item.tenant_name}
                        </h2>
                        <FranchiseStatusBadge tone={priorityTone(item.attention_priority)}>
                          {item.attention_label}
                        </FranchiseStatusBadge>
                        {activeBenchmarkAction ? (
                          <FranchiseStatusBadge tone="info">
                            {benchmarkStatusLabel[activeBenchmarkAction.status] ??
                              activeBenchmarkAction.status}
                          </FranchiseStatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {item.attention_reason}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-xl bg-brand-muted px-3 py-2 text-right">
                      <p className="text-xs font-bold text-muted-foreground">Route</p>
                      <p className="text-sm font-black text-foreground">
                        {ROUTE_LABELS[item.follow_up_route] ?? item.follow_up_route}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <p className="text-xs font-bold text-muted-foreground">Omzet</p>
                      <p className="mt-1 font-black text-foreground">
                        {formatEuro(item.current_revenue_cents)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <p className="text-xs font-bold text-muted-foreground">Lessen</p>
                      <p className="mt-1 font-black text-foreground">
                        {item.current_lessons}
                      </p>
                    </div>
                    <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <p className="text-xs font-bold text-muted-foreground">Bezetting</p>
                      <p className="mt-1 font-black text-foreground">
                        {item.capacity_utilisation === null
                          ? "-"
                          : `${item.capacity_utilisation}%`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border border-primary/15 bg-brand-accent px-3 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
                      Volgende stap
                    </p>
                    <p className="mt-1 text-sm font-bold text-foreground">
                      {item.next_step}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                            Delegatie-wizard
                          </p>
                          <p className="mt-1 font-black text-foreground">
                            {suggestedDelegation.label}
                          </p>
                        </div>
                        <FranchiseStatusBadge
                          tone={delegationReady ? "success" : "warning"}
                        >
                          {delegationReady ? "Actief" : "Voorstel"}
                        </FranchiseStatusBadge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {suggestedDelegation.reason}
                      </p>
                      <form
                        action={upsertFranchiseDelegation}
                        className="mt-3 flex justify-end"
                      >
                        <input
                          type="hidden"
                          name="return_to"
                          value="/backoffice/franchise/aandacht"
                        />
                        <input
                          type="hidden"
                          name="franchisee_tenant_id"
                          value={item.tenant_id}
                        />
                        <input type="hidden" name="scope_type" value="tenant" />
                        <input
                          type="hidden"
                          name="grant_reason"
                          value={`Voorgesteld vanuit signaal ${item.attention_label}: ${suggestedDelegation.reason}`}
                        />
                        {combinedDelegation.can_manage_planning ? (
                          <input
                            type="hidden"
                            name="can_manage_planning"
                            value="true"
                          />
                        ) : null}
                        {combinedDelegation.can_manage_leads ? (
                          <input
                            type="hidden"
                            name="can_manage_leads"
                            value="true"
                          />
                        ) : null}
                        {combinedDelegation.can_manage_templates ? (
                          <input
                            type="hidden"
                            name="can_manage_templates"
                            value="true"
                          />
                        ) : null}
                        {combinedDelegation.can_manage_fleet ? (
                          <input
                            type="hidden"
                            name="can_manage_fleet"
                            value="true"
                          />
                        ) : null}
                        {combinedDelegation.can_manage_instructor_availability ? (
                          <input
                            type="hidden"
                            name="can_manage_instructor_availability"
                            value="true"
                          />
                        ) : null}
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={delegationReady}
                        >
                          {delegationReady ? "Delegatie staat goed" : "Pas voorstel toe"}
                        </Button>
                      </form>
                    </div>

                    <div className="rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                            Benchmark target
                          </p>
                          <p className="mt-1 font-black text-foreground">
                            Doelwaarde instellen
                          </p>
                        </div>
                        <Target className="h-4 w-4 text-primary" aria-hidden />
                      </div>
                      {tenantTargets.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {tenantTargets.slice(0, 2).map((target) => (
                            <div key={target.id}>
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-bold text-foreground">
                                  {target.metric_label}
                                </span>
                                <span className="font-black text-muted-foreground">
                                  {formatTargetValue(target.current_value, target.unit)} / {formatTargetValue(target.target_value, target.unit)}
                                </span>
                              </div>
                              <FranchiseProgressBar
                                value={target.progress}
                                tone={target.tone}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <form
                        action={upsertFranchiseBenchmarkTarget}
                        className="mt-3 grid gap-2"
                      >
                        <input
                          type="hidden"
                          name="return_to"
                          value="/backoffice/franchise/aandacht"
                        />
                        <input
                          type="hidden"
                          name="franchisee_tenant_id"
                          value={item.tenant_id}
                        />
                        <select
                          name="metric_key"
                          className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          defaultValue={
                            item.follow_up_route === "marketing"
                              ? "lead_conversion_rate"
                              : item.follow_up_route === "lokale-planning"
                                ? "capacity_utilisation"
                                : "current_lessons"
                          }
                        >
                          {FRANCHISE_BENCHMARK_METRICS.map((metric) => (
                            <option key={metric.key} value={metric.key}>
                              {metric.label}
                            </option>
                          ))}
                        </select>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <input
                            name="target_value"
                            type="number"
                            min="1"
                            step="0.01"
                            placeholder="Doelwaarde"
                            required
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <Button type="submit" size="sm" variant="outline">
                            Opslaan
                          </Button>
                        </div>
                        <input
                          type="hidden"
                          name="reason"
                          value={`Target vanuit command-signaal: ${item.attention_reason}`}
                        />
                      </form>
                    </div>
                  </div>
                  <form action={createFranchiseBenchmarkTask} className="mt-3 flex justify-end">
                    <input
                      type="hidden"
                      name="return_to"
                      value="/backoffice/franchise/aandacht"
                    />
                    <input
                      type="hidden"
                      name="franchisee_tenant_id"
                      value={item.tenant_id}
                    />
                    <input
                      type="hidden"
                      name="attention_priority"
                      value={item.attention_priority}
                    />
                    <input
                      type="hidden"
                      name="follow_up_route"
                      value={item.follow_up_route}
                    />
                    <input
                      type="hidden"
                      name="signal_key"
                      value={signalKey}
                    />
                    <input
                      type="hidden"
                      name="title"
                      value={`Franchise opvolging: ${item.tenant_name} - ${item.attention_label}`}
                    />
                    <input
                      type="hidden"
                      name="description"
                      value={`${item.attention_reason}\n\nVolgende stap: ${item.next_step}`}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={Boolean(activeBenchmarkAction)}
                    >
                      {activeBenchmarkAction ? "Opvolging loopt" : "Stuuractie maken"}
                    </Button>
                  </form>
                </div>
              );
              })
            )}
          </div>
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Lead routing" description="Centrale intake met lokale eigenaar.">
            <div className="space-y-3">
              {leadRecommendations.length === 0 ? (
                <FranchiseEmptyState
                  title="Geen routeerbare leads"
                  description="Alle open leads zijn al gekoppeld, toegewezen of wachten op delegatie."
                />
              ) : (
                leadRecommendations.map((lead) => {
                  const branchOptions = lead.route_scores;
                  const canRoute = lead.can_manage && branchOptions.length > 0;
                  const routeBadge = !lead.can_manage
                    ? "Delegatie nodig"
                    : branchOptions.length > 0
                      ? `Score ${lead.best_score?.total_score ?? 0}`
                      : "Geen vestiging";
                  return (
                    <form
                      key={lead.id}
                      action={routeFranchiseLead}
                      className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                    >
                      <input
                        type="hidden"
                        name="return_to"
                        value="/backoffice/franchise/aandacht"
                      />
                      <input type="hidden" name="lead_id" value={lead.id} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-foreground">
                            {lead.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {lead.tenant_name} - {lead.city ?? lead.postcode ?? lead.source}
                          </p>
                        </div>
                        <FranchiseStatusBadge tone={canRoute ? "delegated" : "readonly"}>
                          {routeBadge}
                        </FranchiseStatusBadge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          name="branch_id"
                          disabled={!canRoute}
                          required
                          className="h-10 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
                        >
                          <option value="">Kies lokale eigenaar...</option>
                          {branchOptions.map((score) => (
                            <option key={score.branch_id} value={score.branch_id}>
                              {score.total_score} - {score.tenant_name} - {score.branch_label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!canRoute}
                        >
                          Routeer
                        </Button>
                      </div>
                      {lead.best_score ? (
                        <div className="mt-3 rounded-xl border border-brand-card-border bg-brand-muted px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                              Beste match
                            </p>
                            <p className="text-xs font-black text-primary">
                              {lead.best_score.tenant_name}
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px] font-black text-muted-foreground">
                            <span>Cap {lead.best_score.capacity_score}</span>
                            <span>Rayon {lead.best_score.rayon_score}</span>
                            <span>Vrij {lead.best_score.availability_score}</span>
                            <span>Conv {lead.best_score.conversion_score}</span>
                            <span>Resp {lead.best_score.response_score}</span>
                          </div>
                        </div>
                      ) : null}
                    </form>
                  );
                })
              )}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Follow-up routes" description="Automatisch afgeleid, lokaal uitgevoerd.">
            <div className="space-y-3">
              {Object.entries(ROUTE_LABELS).map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-accent text-primary">
                      <Route className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="font-black text-foreground">{label}</p>
                  </div>
                  <FranchiseStatusBadge tone={(routeCounts[key] ?? 0) > 0 ? "info" : "readonly"}>
                    {routeCounts[key] ?? 0}
                  </FranchiseStatusBadge>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Coaching flow" description="Signaal, doel, actieplan, check-in en resultaat.">
            <div className="space-y-3">
              {coachingActions.length === 0 ? (
                <FranchiseEmptyState
                  title="Geen lopende benchmarkacties"
                  description="Maak vanuit een aandachtspunt een stuuractie om coaching te starten."
                />
              ) : (
                coachingActions
                  .map((action) => {
                    const metric = metricForAction(action.target_metric_key);
                    const latestCheckIn = action.checkins[0] ?? null;
                    const isClosed = ["completed", "declined", "cancelled"].includes(action.status);
                    const targetLabel = metric
                      ? `${metric.label}: ${formatTargetValue(action.latest_value, metric.unit)} / ${formatTargetValue(action.target_value, metric.unit)}`
                      : "Geen meetwaarde gekozen";
                    return (
                    <div
                      key={action.id}
                      className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-foreground">
                            {action.franchisee_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {action.title}
                          </p>
                        </div>
                        <FranchiseStatusBadge tone="info">
                          {benchmarkStatusLabel[action.status] ?? action.status}
                        </FranchiseStatusBadge>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {[
                          ["1", "Signaal", action.description ?? action.title],
                          ["2", "Doel", action.goal ?? "Nog geen concreet doel vastgelegd."],
                          ["3", "Actieplan", action.action_plan ?? "Nog geen actieplan vastgelegd."],
                          [
                            "4",
                            "Check-in",
                            latestCheckIn
                              ? `${latestCheckIn.note} ${latestCheckIn.next_check_in_date ? `(volgende: ${latestCheckIn.next_check_in_date})` : ""}`
                              : action.next_check_in_date
                                ? `Volgende check-in: ${action.next_check_in_date}`
                                : "Nog geen check-in gepland.",
                          ],
                          [
                            "5",
                            "Resultaat",
                            action.result_summary
                              ? `${RESULT_STATUS_LABELS[action.result_status] ?? action.result_status}: ${action.result_summary}`
                              : `${RESULT_STATUS_LABELS[action.result_status] ?? action.result_status} - ${targetLabel}`,
                          ],
                        ].map(([step, label, text]) => (
                          <div
                            key={`${action.id}-${step}`}
                            className="grid grid-cols-[2rem_6rem_1fr] gap-2 rounded-xl border border-brand-card-border bg-brand-muted px-3 py-2 text-xs"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-accent font-black text-primary">
                              {step}
                            </span>
                            <span className="font-black text-foreground">{label}</span>
                            <span className="line-clamp-2 text-muted-foreground">{text}</span>
                          </div>
                        ))}
                      </div>

                      <form
                        action={saveFranchiseBenchmarkCoachingPlan}
                        className="mt-3 rounded-xl border border-brand-card-border bg-brand-muted p-3"
                      >
                        <input type="hidden" name="return_to" value="/backoffice/franchise/aandacht" />
                        <input type="hidden" name="action_id" value={action.id} />
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                          Doel en actieplan
                        </p>
                        <textarea
                          name="goal"
                          rows={2}
                          defaultValue={action.goal ?? ""}
                          placeholder="Concreet doel, bijv. leadconversie naar 40% binnen 30 dagen."
                          disabled={isClosed}
                          className="mt-2 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-foreground"
                        />
                        <textarea
                          name="action_plan"
                          rows={3}
                          defaultValue={action.action_plan ?? ""}
                          placeholder="Actieplan: wie doet wat, wanneer en hoe meten we voortgang?"
                          disabled={isClosed}
                          className="mt-2 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-foreground"
                        />
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            name="coaching_owner_label"
                            defaultValue={action.coaching_owner_label}
                            placeholder="Eigenaar"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <select
                            name="target_metric_key"
                            defaultValue={action.target_metric_key ?? ""}
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          >
                            <option value="">Kies meetwaarde...</option>
                            {FRANCHISE_BENCHMARK_METRICS.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <input
                            name="baseline_value"
                            type="number"
                            step="0.01"
                            defaultValue={inputValueForMetric(action.baseline_value, metric?.unit)}
                            placeholder="Startwaarde"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <input
                            name="target_value"
                            type="number"
                            step="0.01"
                            defaultValue={inputValueForMetric(action.target_value, metric?.unit)}
                            placeholder="Doelwaarde"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <input
                            name="target_due_date"
                            type="date"
                            defaultValue={action.target_due_date ?? ""}
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <input
                            name="next_check_in_date"
                            type="date"
                            defaultValue={action.next_check_in_date ?? ""}
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                        </div>
                        <input type="hidden" name="result_status" value={action.result_status} />
                        <div className="mt-3 flex justify-end">
                          <Button type="submit" size="sm" variant="outline" disabled={isClosed}>
                            Coachingplan opslaan
                          </Button>
                        </div>
                      </form>

                      <form
                        action={addFranchiseBenchmarkCheckIn}
                        className="mt-3 rounded-xl border border-brand-card-border bg-white p-3"
                      >
                        <input type="hidden" name="return_to" value="/backoffice/franchise/aandacht" />
                        <input type="hidden" name="action_id" value={action.id} />
                        <input type="hidden" name="target_metric_key" value={action.target_metric_key ?? ""} />
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                          Check-in
                        </p>
                        <textarea
                          name="note"
                          rows={2}
                          placeholder="Wat is afgesproken of vastgesteld bij deze check-in?"
                          disabled={isClosed}
                          className="mt-2 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-foreground"
                        />
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          <select
                            name="status"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                            defaultValue="done"
                          >
                            <option value="done">Gedaan</option>
                            <option value="planned">Gepland</option>
                            <option value="blocked">Geblokkeerd</option>
                          </select>
                          <input
                            name="measured_value"
                            type="number"
                            step="0.01"
                            placeholder="Meetwaarde"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                          <input
                            name="next_check_in_date"
                            type="date"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button type="submit" size="sm" variant="outline" disabled={isClosed}>
                            Check-in toevoegen
                          </Button>
                        </div>
                      </form>

                      <form
                        action={recordFranchiseBenchmarkResult}
                        className="mt-3 rounded-xl border border-primary/15 bg-brand-accent p-3"
                      >
                        <input type="hidden" name="return_to" value="/backoffice/franchise/aandacht" />
                        <input type="hidden" name="action_id" value={action.id} />
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
                          Resultaat
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr]">
                          <select
                            name="result_status"
                            defaultValue="achieved"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          >
                            <option value="achieved">Doel behaald</option>
                            <option value="not_achieved">Niet behaald</option>
                            <option value="cancelled">Stopgezet</option>
                          </select>
                          <input
                            name="result_value"
                            type="number"
                            step="0.01"
                            placeholder="Eindwaarde"
                            disabled={isClosed}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-xs font-bold text-foreground"
                          />
                        </div>
                        <textarea
                          name="result_summary"
                          rows={2}
                          defaultValue={action.result_summary ?? ""}
                          placeholder="Beschrijf het resultaat en de vervolgafspraak."
                          disabled={isClosed}
                          className="mt-2 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-foreground"
                        />
                        <div className="mt-3 flex justify-end">
                          <Button type="submit" size="sm" disabled={isClosed}>
                            Resultaat vastleggen
                          </Button>
                        </div>
                      </form>
                    </div>
                  );
                  })
              )}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Governance regels" description="Waarom dit geen directe mutatie doet.">
            <div className="space-y-3 text-sm text-muted-foreground">
              {[
                "Franchisegever ziet signalen over tenants heen, maar neemt lokale data niet over.",
                "Een vervolgactie vraagt expliciete eigenaar, scope en geldigheid.",
                "Elke delegatie of wijziging moet auditbaar blijven.",
              ].map((rule) => (
                <div
                  key={rule}
                  className="flex items-start gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p>{rule}</p>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel
            title="Coaching targets"
            description="Vanuit governance-overzicht."
            actionHref="/backoffice/franchise/governance"
            actionLabel="Governance"
          >
            <div className="space-y-3">
              {governance.coaching_targets.length === 0 ? (
                <FranchiseEmptyState
                  title="Geen coachingtargets"
                  description="Er zijn geen franchisees die direct centrale coaching nodig hebben."
                />
              ) : (
                governance.coaching_targets.map((target) => (
                  <div
                    key={target.tenant_id}
                    className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-foreground">{target.tenant_name}</p>
                      <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {target.reason}
                    </p>
                  </div>
                ))
              )}
            </div>
          </FranchisePanel>
        </div>
      </section>
    </FranchisePage>
  );
}
