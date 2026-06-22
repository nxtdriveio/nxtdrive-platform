import {
  Activity,
  AlertTriangle,
  BarChart3,
  Gauge,
  GraduationCap,
  TrendingDown,
  TrendingUp,
  Users,
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
  FranchiseTableCell,
  FranchiseMiniTable,
} from "@/components/backoffice/franchise/franchise-primitives";
import { Button } from "@/components/ui/button";
import {
  formatEuro,
  formatPercent,
  formatSignedPercent,
  priorityTone,
} from "@/components/backoffice/franchise/franchise-format";
import { createFranchiseBenchmarkTask } from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  loadFranchisePerformanceOverview,
  type FranchisePerformanceRow,
} from "@/lib/franchise/performance";

export const dynamic = "force-dynamic";

function MetricRanking({
  title,
  items,
  value,
}: {
  title: string;
  items: FranchisePerformanceRow[];
  value: (row: FranchisePerformanceRow) => string;
}) {
  return (
    <FranchisePanel title={title} description="Top 5 franchisees in de huidige periode.">
      <div className="space-y-3">
        {items.length === 0 ? (
          <FranchiseEmptyState
            title="Nog geen meetpunten"
            description="Zodra franchisees activiteit hebben verschijnen ze in deze ranking."
          />
        ) : (
          items.slice(0, 5).map((item, index) => (
            <div key={item.tenant_id} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="text-center text-sm font-black text-muted-foreground">
                {index + 1}
              </span>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-foreground">{item.tenant_name}</p>
                  <p className="text-sm font-black text-foreground">{value(item)}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.branch_count} vestigingen, {item.active_students} leerlingen
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </FranchisePanel>
  );
}

export default async function FranchisePerformancePage() {
  const { tenant } = await requireFranchiseOperator();
  let overview: Awaited<ReturnType<typeof loadFranchisePerformanceOverview>> | null =
    null;

  try {
    overview = await loadFranchisePerformanceOverview(tenant.id);
  } catch (error) {
    console.error("[franchise/prestaties] load failed", error);
  }

  if (!overview) {
    return (
      <FranchiseErrorState
        title="Franchise Prestaties"
        description={`De prestatiegegevens konden nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const bestRevenue = [...overview.franchisees].sort(
    (left, right) => right.current_revenue_cents - left.current_revenue_cents,
  );
  const bestLessons = [...overview.franchisees].sort(
    (left, right) => right.current_lessons - left.current_lessons,
  );
  const bestConversion = [...overview.franchisees].sort(
    (left, right) =>
      (right.lead_conversion_rate ?? -1) - (left.lead_conversion_rate ?? -1),
  );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise prestaties"
        title="Prestaties"
        description="Commerciele en operationele franchise-KPI's zonder tenantgrenzen te doorbreken. Alle cijfers komen uit echte planning, facturen, leads en examenregistraties."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="info">
              {overview.network.franchisees} franchisees
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/aandacht">
              Aandacht
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/reports" variant="primary">
              Rapportage
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FranchiseKpiCard
          label="Omzet huidig"
          value={formatEuro(overview.network.current_revenue_cents)}
          hint="laatste 30 dagen"
          trend={formatSignedPercent(overview.network.revenue_delta_pct)}
          icon={TrendingUp}
          tone="success"
        />
        <FranchiseKpiCard
          label="Lessen huidig"
          value={overview.network.current_lessons}
          hint={`${overview.network.lesson_delta > 0 ? "+" : ""}${overview.network.lesson_delta} vs vorige`}
          icon={Activity}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Actieve leerlingen"
          value={overview.network.active_students}
          hint="franchisebreed"
          icon={Users}
          tone="info"
        />
        <FranchiseKpiCard
          label="Aandacht"
          value={overview.network.attention_count}
          hint={`${overview.network.high_priority_count} hoog`}
          icon={AlertTriangle}
          tone={overview.network.high_priority_count > 0 ? "danger" : "success"}
        />
        <FranchiseKpiCard
          label="Benchmark"
          value="90 dgn"
          hint="current, previous, baseline"
          icon={BarChart3}
          tone="delegated"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MetricRanking
          title="Omzet ranking"
          items={bestRevenue}
          value={(row) => formatEuro(row.current_revenue_cents)}
        />
        <MetricRanking
          title="Lesvolume"
          items={bestLessons}
          value={(row) => `${row.current_lessons} lessen`}
        />
        <MetricRanking
          title="Leadconversie"
          items={bestConversion}
          value={(row) => formatPercent(row.lead_conversion_rate)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.7fr]">
        <FranchisePanel
          title="Alle franchisees"
          description="Vergelijk prestaties, capaciteit en aandachtssignalen."
          contentClassName="p-0"
        >
          <FranchiseMiniTable
            columns={["Franchisee", "Omzet", "Lessen", "Conversie", "Slaging", "Bezetting", "Status", "Actie"]}
            minWidth="1080px"
          >
            {overview.franchisees.map((row) => (
              <tr key={row.tenant_id}>
                <FranchiseTableCell>
                  <p className="font-black text-foreground">{row.tenant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.branch_count} vestigingen, {row.active_students} leerlingen
                  </p>
                </FranchiseTableCell>
                <FranchiseTableCell align="right">
                  <p className="font-black text-foreground">
                    {formatEuro(row.current_revenue_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSignedPercent(row.revenue_delta_pct)}
                  </p>
                </FranchiseTableCell>
                <FranchiseTableCell align="right">{row.current_lessons}</FranchiseTableCell>
                <FranchiseTableCell align="right">
                  {formatPercent(row.lead_conversion_rate)}
                </FranchiseTableCell>
                <FranchiseTableCell align="right">
                  {formatPercent(row.exam_pass_rate)}
                </FranchiseTableCell>
                <FranchiseTableCell>
                  <FranchiseProgressBar
                    value={row.capacity_utilisation}
                    tone="delegated"
                    label={formatPercent(row.capacity_utilisation)}
                  />
                </FranchiseTableCell>
                <FranchiseTableCell>
                  <FranchiseStatusBadge tone={priorityTone(row.attention_priority)}>
                    {row.attention_label}
                  </FranchiseStatusBadge>
                </FranchiseTableCell>
                <FranchiseTableCell align="right">
                  <form action={createFranchiseBenchmarkTask}>
                    <input
                      type="hidden"
                      name="return_to"
                      value="/backoffice/franchise/prestaties"
                    />
                    <input
                      type="hidden"
                      name="franchisee_tenant_id"
                      value={row.tenant_id}
                    />
                    <input
                      type="hidden"
                      name="attention_priority"
                      value={row.attention_priority}
                    />
                    <input
                      type="hidden"
                      name="follow_up_route"
                      value={row.follow_up_route}
                    />
                    <input
                      type="hidden"
                      name="title"
                      value={`Benchmark opvolging: ${row.tenant_name}`}
                    />
                    <input
                      type="hidden"
                      name="description"
                      value={`${row.attention_reason}\n\nVolgende stap: ${row.next_step}`}
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Taak
                    </Button>
                  </form>
                </FranchiseTableCell>
              </tr>
            ))}
          </FranchiseMiniTable>
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Terugval omzet" description="Sterkste negatieve trends.">
            <div className="space-y-3">
              {overview.watchlists.revenue_softness.map((row) => (
                <div
                  key={row.tenant_id}
                  className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-foreground">{row.tenant_name}</p>
                    <FranchiseStatusBadge tone="danger">
                      {formatSignedPercent(row.revenue_delta_pct)}
                    </FranchiseStatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.attention_reason}
                  </p>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Lesvolume watchlist" description="Dalende planningactiviteit.">
            <div className="space-y-3">
              {overview.watchlists.lesson_softness.map((row) => (
                <div
                  key={row.tenant_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div>
                    <p className="font-black text-foreground">{row.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.current_lessons} lessen huidig
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-black text-danger">
                    <TrendingDown className="h-4 w-4" aria-hidden />
                    {row.lesson_delta}
                  </span>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Kwaliteit" description="Slaging en capaciteit.">
            <div className="space-y-3">
              {overview.franchisees.slice(0, 4).map((row) => (
                <div key={row.tenant_id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-black text-foreground">{row.tenant_name}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {formatPercent(row.exam_pass_rate)}
                    </span>
                  </div>
                  <FranchiseProgressBar
                    value={row.exam_pass_rate}
                    tone={(row.exam_pass_rate ?? 100) < 55 ? "warning" : "success"}
                    label={formatPercent(row.exam_pass_rate)}
                  />
                </div>
              ))}
            </div>
          </FranchisePanel>
        </div>
      </section>
    </FranchisePage>
  );
}
