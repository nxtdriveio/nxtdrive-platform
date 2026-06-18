import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Gauge,
  LockKeyhole,
  MapPin,
  Network,
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
import { formatDateTime } from "@/components/backoffice/franchise/franchise-format";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import {
  loadFranchisePlanningOverview,
  type FranchisePlanningPressure,
} from "@/lib/franchise/planning";

export const dynamic = "force-dynamic";

function pressureClass(pressure: FranchisePlanningPressure): string {
  if (pressure === "critical") return "bg-planning-critical text-red-950";
  if (pressure === "busy") return "bg-planning-busy text-orange-950";
  if (pressure === "normal") return "bg-planning-normal text-emerald-950";
  return "bg-planning-calm text-slate-500";
}

export default async function FranchisePlanningPage() {
  const { tenant, readOnlyDowngrade } = await requireFranchiseOperator();
  let data:
    | [
        Awaited<ReturnType<typeof loadFranchisePlanningOverview>>,
        Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>,
      ]
    | null = null;

  try {
    data = await Promise.all([
      loadFranchisePlanningOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
    ]);
  } catch (error) {
    console.error("[franchise/planning] load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Planning"
        description={`De franchiseplanning kon nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const [planning, governance] = data;
  const branchesWithLessons =
    planning.branches.length - planning.branches_without_lessons;
  const coverage =
    planning.branches.length === 0
      ? 0
      : Math.round((branchesWithLessons / planning.branches.length) * 100);
  const busiest = [...planning.branches].sort(
    (left, right) => right.upcoming_lessons_7d - left.upcoming_lessons_7d,
  )[0];

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise planning"
        title="Planning"
        description="Franchisebrede planningdruk per vestiging. De cockpit blijft read-only: plannen gebeurt lokaal of via expliciete delegatie."
        badges={
          <>
            <FranchiseModeBadge />
            {readOnlyDowngrade ? (
              <FranchiseStatusBadge tone="warning">Downgrade read-only</FranchiseStatusBadge>
            ) : (
              <FranchiseStatusBadge tone="delegated">Delegatie vereist</FranchiseStatusBadge>
            )}
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/delegaties">
              Delegaties
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/planning-board" variant="primary">
              Lokaal planboard
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Aankomende lessen"
          value={planning.total_upcoming_lessons}
          hint={`komende ${planning.horizon_days} dagen`}
          icon={CalendarDays}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Vestigingen"
          value={planning.branches.length}
          hint={`${branchesWithLessons} met planning`}
          icon={Network}
          tone="info"
        />
        <FranchiseKpiCard
          label="Planningsgaten"
          value={planning.branches_without_lessons}
          hint="vestigingen zonder lessen"
          icon={Clock}
          tone={planning.branches_without_lessons > 0 ? "warning" : "success"}
        />
        <FranchiseKpiCard
          label="Coverage"
          value={`${coverage}%`}
          hint="vestigingsdekking"
          icon={Gauge}
          tone="delegated"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.42fr]">
        <FranchisePanel
          title="Franchise Planning"
          description="Heatmap op basis van echte geplande lessen, gegroepeerd per franchisee en vestiging."
          contentClassName="p-0"
        >
          {planning.branches.length === 0 ? (
            <div className="p-4">
              <FranchiseEmptyState
                icon={MapPin}
                title="Geen actieve vestigingen"
                description="Zodra franchisees actieve vestigingen hebben verschijnt hier de planningdruk."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-sm">
                <thead className="border-b border-brand-card-border bg-brand-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em]">
                      Vestiging
                    </th>
                    {planning.branches[0]?.daily_lessons.map((day) => (
                      <th
                        key={day.date}
                        className="px-2 py-3 text-center text-[11px] font-black uppercase tracking-[0.1em]"
                      >
                        {day.label}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.14em]">
                      Totaal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-card-border">
                  {planning.branches.map((branch) => (
                    <tr key={branch.branch_id}>
                      <td className="px-4 py-3">
                        <p className="font-black text-foreground">{branch.tenant_name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {branch.branch_name}
                          {branch.city ? `, ${branch.city}` : ""}
                        </p>
                      </td>
                      {branch.daily_lessons.map((day) => (
                        <td key={day.date} className="px-2 py-3">
                          <div
                            className={`mx-auto flex h-12 w-16 items-center justify-center rounded-xl border border-white/80 text-sm font-black ${pressureClass(day.pressure)}`}
                            title={`${day.label}: ${day.lessons} lessen`}
                          >
                            {day.lessons}
                          </div>
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <FranchiseStatusBadge
                          tone={branch.upcoming_lessons_7d === 0 ? "warning" : "success"}
                        >
                          {branch.upcoming_lessons_7d}
                        </FranchiseStatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Legenda" description="Planningdruk per dag.">
            <div className="grid gap-2 text-sm">
              {[
                ["Rustig", "0-1 lessen", "bg-planning-calm"],
                ["Normaal", "2-4 lessen", "bg-planning-normal"],
                ["Druk", "5-7 lessen", "bg-planning-busy"],
                ["Zeer druk", "8+ lessen", "bg-planning-critical"],
              ].map(([label, description, className]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={`h-5 w-8 rounded-lg border border-white ${className}`} />
                  <div>
                    <p className="font-black text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel title="Planning controles" description="Geen verborgen mutaties.">
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <div className="flex items-center gap-2 font-black text-foreground">
                  <LockKeyhole className="h-4 w-4 text-primary" aria-hidden />
                  Read-only standaard
                </div>
                <p className="mt-1 text-xs leading-5">
                  Franchiseplanning toont druk en gaten, maar schrijft niet in lokale roosters.
                </p>
              </div>
              <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <div className="flex items-center gap-2 font-black text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                  Delegatiepad
                </div>
                <p className="mt-1 text-xs leading-5">
                  Wijzigen kan alleen via een expliciete delegatie met scope, geldigheid en audit.
                </p>
              </div>
            </div>
          </FranchisePanel>

          <FranchisePanel title="Busiest branch" description="Op basis van komende 7 dagen.">
            {busiest ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                  <p className="font-black text-foreground">{busiest.tenant_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {busiest.branch_name}{busiest.city ? `, ${busiest.city}` : ""}
                  </p>
                  <p className="mt-2 text-2xl font-black text-foreground">
                    {busiest.upcoming_lessons_7d} lessen
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Eerstvolgende: {formatDateTime(busiest.next_lesson_at)}
                  </p>
                </div>
                <FranchiseProgressBar
                  value={governance.average_capacity_utilisation}
                  tone="delegated"
                  label={
                    governance.average_capacity_utilisation === null
                      ? "-"
                      : `${governance.average_capacity_utilisation}%`
                  }
                />
              </div>
            ) : (
              <FranchiseEmptyState
                title="Nog geen planningdruk"
                description="Er is geen actieve vestiging met lessen in de gekozen horizon."
              />
            )}
          </FranchisePanel>
        </div>
      </section>

      <FranchisePanel
        title="Planning details"
        description="Alle actieve vestigingen met eerstvolgende lesmoment."
        contentClassName="p-0"
      >
        <FranchiseMiniTable
          columns={["Franchisee", "Vestiging", "Volgende les", "7 dagen", "Status"]}
          minWidth="760px"
        >
          {planning.branches.map((branch) => (
            <tr key={branch.branch_id}>
              <FranchiseTableCell>
                <p className="font-black text-foreground">{branch.tenant_name}</p>
              </FranchiseTableCell>
              <FranchiseTableCell>
                {branch.branch_name}
                {branch.city ? (
                  <span className="text-muted-foreground">, {branch.city}</span>
                ) : null}
              </FranchiseTableCell>
              <FranchiseTableCell>{formatDateTime(branch.next_lesson_at)}</FranchiseTableCell>
              <FranchiseTableCell align="right">{branch.upcoming_lessons_7d}</FranchiseTableCell>
              <FranchiseTableCell>
                <FranchiseStatusBadge
                  tone={branch.upcoming_lessons_7d === 0 ? "warning" : "success"}
                >
                  {branch.upcoming_lessons_7d === 0 ? "Aandacht" : "Gepland"}
                </FranchiseStatusBadge>
              </FranchiseTableCell>
            </tr>
          ))}
        </FranchiseMiniTable>
      </FranchisePanel>
    </FranchisePage>
  );
}
