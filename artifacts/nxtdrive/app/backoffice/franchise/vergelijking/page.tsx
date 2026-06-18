import { BarChart3, Building2, Gauge, GraduationCap, TrendingUp, Users } from "lucide-react";

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
} from "@/components/backoffice/franchise/franchise-primitives";
import { formatEuro, formatPercent } from "@/components/backoffice/franchise/franchise-format";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseContext } from "@/lib/franchise/context";
import { loadFranchiseOverview } from "@/lib/franchise/overview";

export const dynamic = "force-dynamic";

export default async function FranchiseComparisonPage() {
  const { tenant } = await requireFranchiseOperator();
  let data:
    | [
        Awaited<ReturnType<typeof loadFranchiseContext>>,
        Awaited<ReturnType<typeof loadFranchiseOverview>>,
      ]
    | null = null;

  try {
    data = await Promise.all([
      loadFranchiseContext(tenant.id),
      loadFranchiseOverview(tenant.id),
    ]);
  } catch (error) {
    console.error("[franchise/vergelijking] load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Vergelijking"
        description={`De franchisevergelijking kon nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const [context, overview] = data;
  const byRevenue = [...overview.locations].sort(
    (left, right) => right.revenue_last_30d_cents - left.revenue_last_30d_cents,
  );
  const byStudents = [...overview.locations].sort(
    (left, right) => right.active_students - left.active_students,
  );
  const avgCapacity =
    overview.locations.filter((location) => location.capacity_utilisation !== null)
      .length === 0
      ? null
      : Math.round(
          overview.locations.reduce(
            (sum, location) => sum + (location.capacity_utilisation ?? 0),
            0,
          ) /
            overview.locations.filter((location) => location.capacity_utilisation !== null)
              .length,
        );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise vergelijking"
        title="Vergelijking"
        description={`Benchmark franchisees binnen ${context.franchisegever_name} op omzet, lessen, conversie, capaciteit en vestigingsbasis.`}
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="info">
              {context.franchisees.length} franchisees
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/prestaties">
              Prestaties
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/aandacht" variant="primary">
              Aandacht
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Franchisees"
          value={overview.totals.franchisees}
          hint="in netwerk"
          icon={Building2}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Leerlingen"
          value={overview.totals.active_students}
          hint="actief"
          icon={Users}
          tone="info"
        />
        <FranchiseKpiCard
          label="Omzet 30 dagen"
          value={formatEuro(overview.totals.revenue_last_30d_cents)}
          hint="betaalde facturen"
          icon={TrendingUp}
          tone="success"
        />
        <FranchiseKpiCard
          label="Gem. bezetting"
          value={formatPercent(avgCapacity)}
          hint="alle franchisees"
          icon={Gauge}
          tone="delegated"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.42fr]">
        <FranchisePanel
          title="Alle franchisees naast elkaar"
          description="Read-only benchmark met echte tenantdata."
          contentClassName="p-0"
        >
          {overview.locations.length === 0 ? (
            <div className="p-4">
              <FranchiseEmptyState
                title="Geen franchisees"
                description="Koppel franchisee-tenants om benchmarkdata te tonen."
              />
            </div>
          ) : (
            <FranchiseMiniTable
              columns={[
                "Franchisee",
                "Vest.",
                "Leerlingen",
                "Lessen",
                "Omzet",
                "Slaging",
                "Conversie",
                "Bezetting",
              ]}
              minWidth="980px"
            >
              {overview.locations.map((location) => (
                <tr key={location.tenant_id}>
                  <FranchiseTableCell>
                    <p className="font-black text-foreground">{location.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">{location.tenant_slug}</p>
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {location.branches.length}
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {location.active_students}
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {location.lessons_last_30d}
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {formatEuro(location.revenue_last_30d_cents)}
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {formatPercent(location.exam_pass_rate)}
                  </FranchiseTableCell>
                  <FranchiseTableCell align="right">
                    {formatPercent(location.lead_conversion_rate)}
                  </FranchiseTableCell>
                  <FranchiseTableCell>
                    <FranchiseProgressBar
                      value={location.capacity_utilisation}
                      tone="delegated"
                      label={formatPercent(location.capacity_utilisation)}
                    />
                  </FranchiseTableCell>
                </tr>
              ))}
            </FranchiseMiniTable>
          )}
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Top omzet" description="Laatste 30 dagen.">
            <div className="space-y-3">
              {byRevenue.slice(0, 5).map((location, index) => (
                <div key={location.tenant_id} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="text-center text-sm font-black text-muted-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-foreground">{location.tenant_name}</p>
                      <p className="font-black text-foreground">
                        {formatEuro(location.revenue_last_30d_cents)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {location.lessons_last_30d} lessen
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Leerlingenbasis" description="Grootste actieve populatie.">
            <div className="space-y-3">
              {byStudents.slice(0, 5).map((location) => (
                <div key={location.tenant_id}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <p className="font-black text-foreground">{location.tenant_name}</p>
                    <p className="font-black text-foreground">
                      {location.active_students}
                    </p>
                  </div>
                  <FranchiseProgressBar
                    value={
                      overview.totals.active_students === 0
                        ? 0
                        : Math.round(
                            (location.active_students / overview.totals.active_students) * 100,
                          )
                    }
                    tone="primary"
                    label={`${location.active_students}`}
                  />
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Benchmark uitleg" description="Franchise vs multi-vestiging.">
            <div className="space-y-3 text-sm text-muted-foreground">
              {[
                "Franchisees zijn zelfstandige tenants onder een formule.",
                "Deze vergelijking schrijft niet terug in lokale tenantdata.",
                "Branches worden alleen getoond als uitsplitsing binnen de franchisee.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3">
                  <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </FranchisePanel>
        </div>
      </section>

      <FranchisePanel title="Vestigingsuitsplitsing" description="Alle actieve vestigingen per franchisee.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overview.locations.flatMap((location) =>
            location.branches.map((branch) => (
              <div key={branch.id} className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {location.tenant_name}{branch.city ? `, ${branch.city}` : ""}
                    </p>
                  </div>
                  <FranchiseStatusBadge tone={branch.is_active ? "success" : "readonly"}>
                    {branch.is_active ? "Actief" : "Inactief"}
                  </FranchiseStatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-brand-muted px-3 py-2">
                    <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
                    <p className="mt-1 text-sm font-black text-foreground">
                      {branch.active_students}
                    </p>
                    <p className="text-xs text-muted-foreground">leerlingen</p>
                  </div>
                  <div className="rounded-lg bg-brand-muted px-3 py-2">
                    <TrendingUp className="h-4 w-4 text-primary" aria-hidden />
                    <p className="mt-1 text-sm font-black text-foreground">
                      {branch.lessons_last_30d}
                    </p>
                    <p className="text-xs text-muted-foreground">lessen</p>
                  </div>
                </div>
              </div>
            )),
          )}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
