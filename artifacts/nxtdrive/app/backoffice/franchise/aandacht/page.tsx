import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  ClipboardList,
  Megaphone,
  Route,
  ShieldCheck,
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
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { Button } from "@/components/ui/button";
import { formatEuro, priorityTone } from "@/components/backoffice/franchise/franchise-format";
import {
  createFranchiseBenchmarkTask,
  routeFranchiseLead,
} from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { loadFranchiseLeadRoutingState } from "@/lib/franchise/steering";

export const dynamic = "force-dynamic";

const ROUTE_LABELS: Record<string, string> = {
  "franchise-coaching": "Franchise coaching",
  "lokale-planning": "Lokale planning",
  kwaliteit: "Kwaliteit",
  marketing: "Marketing",
  bewaken: "Bewaken",
};

export default async function FranchiseAttentionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [sp, { tenant }] = await Promise.all([
    searchParams,
    requireFranchiseOperator(),
  ]);
  let data:
    | [
        Awaited<ReturnType<typeof loadFranchisePerformanceOverview>>,
        Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>,
        Awaited<ReturnType<typeof loadFranchiseLeadRoutingState>>,
      ]
    | null = null;

  try {
    data = await Promise.all([
      loadFranchisePerformanceOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
      loadFranchiseLeadRoutingState(tenant.id),
    ]);
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

  const [performance, governance, leadRouting] = data;
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null;
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
              performance.watchlists.attention.map((item) => (
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
                      name="title"
                      value={`Franchise opvolging: ${item.tenant_name} - ${item.attention_label}`}
                    />
                    <input
                      type="hidden"
                      name="description"
                      value={`${item.attention_reason}\n\nVolgende stap: ${item.next_step}`}
                    />
                    <Button type="submit" size="sm">
                      Stuuractie maken
                    </Button>
                  </form>
                </div>
              ))
            )}
          </div>
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Lead routing" description="Open leads zonder vestiging.">
            <div className="space-y-3">
              {leadRouting.leads.length === 0 ? (
                <FranchiseEmptyState
                  title="Geen routeerbare leads"
                  description="Alle open leads zijn al aan een vestiging gekoppeld."
                />
              ) : (
                leadRouting.leads.map((lead) => {
                  const branchOptions = leadRouting.branches.filter(
                    (branch) => branch.tenant_id === lead.tenant_id,
                  );
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
                            {lead.tenant_name} - {lead.source}
                          </p>
                        </div>
                        <FranchiseStatusBadge tone={lead.can_manage ? "delegated" : "readonly"}>
                          {lead.can_manage ? "Routing" : "Delegatie nodig"}
                        </FranchiseStatusBadge>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select
                          name="branch_id"
                          disabled={!lead.can_manage || branchOptions.length === 0}
                          required
                          className="h-10 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
                        >
                          <option value="">Kies vestiging...</option>
                          {branchOptions.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                              {branch.city ? `, ${branch.city}` : ""}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!lead.can_manage || branchOptions.length === 0}
                        >
                          Routeer
                        </Button>
                      </div>
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
