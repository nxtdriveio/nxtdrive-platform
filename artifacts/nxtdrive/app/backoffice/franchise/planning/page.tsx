import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardList,
  Gauge,
  LockKeyhole,
  MapPin,
  Network,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { formatDateTime } from "@/components/backoffice/franchise/franchise-format";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { createFranchisePlanningAction } from "@/lib/franchise/actions";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import {
  loadFranchisePlanningOverview,
  type FranchisePlanningPressure,
} from "@/lib/franchise/planning";
import {
  loadFranchisePlanningActionsForRoot,
  planningActionTypeLabel,
  type FranchisePlanningActionStatus,
} from "@/lib/franchise/planning-actions";

export const dynamic = "force-dynamic";

function pressureClass(pressure: FranchisePlanningPressure): string {
  if (pressure === "critical") return "bg-planning-critical text-red-950";
  if (pressure === "busy") return "bg-planning-busy text-orange-950";
  if (pressure === "normal") return "bg-planning-normal text-emerald-950";
  return "bg-planning-calm text-slate-500";
}

const planningStatusLabel: Record<FranchisePlanningActionStatus, string> = {
  created: "Wacht op lokaal akkoord",
  accepted: "Geaccepteerd",
  in_progress: "In uitvoering",
  completed: "Afgerond",
  declined: "Afgewezen",
  cancelled: "Geannuleerd",
};

function planningStatusTone(
  status: FranchisePlanningActionStatus,
): FranchiseTone {
  if (status === "completed") return "success";
  if (status === "declined" || status === "cancelled") return "danger";
  if (status === "accepted" || status === "in_progress") return "delegated";
  return "info";
}

export default async function FranchisePlanningPage() {
  const { tenant, readOnlyDowngrade } = await requireFranchiseOperator();
  let data:
    | [
        Awaited<ReturnType<typeof loadFranchisePlanningOverview>>,
        Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>,
        Awaited<ReturnType<typeof loadFranchisePlanningActionsForRoot>>,
      ]
    | null = null;

  try {
    data = await Promise.all([
      loadFranchisePlanningOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
      loadFranchisePlanningActionsForRoot(tenant.id),
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

  const [planning, governance, planningActions] = data;
  const branchesWithLessons =
    planning.branches.length - planning.branches_without_lessons;
  const coverage =
    planning.branches.length === 0
      ? 0
      : Math.round((branchesWithLessons / planning.branches.length) * 100);
  const busiest = [...planning.branches].sort(
    (left, right) => right.upcoming_lessons_7d - left.upcoming_lessons_7d,
  )[0];
  const delegatedBranches = planning.branches.filter(
    (branch) => branch.can_manage_planning,
  ).length;
  const firstPlanningDate = planning.branches[0]?.daily_lessons[0]?.date ?? "";

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise planning"
        title="Planning"
        description="Franchisebrede planningdruk per vestiging met expliciete sturing via delegatie. Capaciteit, lokale planningtaken en vestigings- of instructeuracties blijven auditbaar."
        badges={
          <>
            <FranchiseModeBadge
              mode={delegatedBranches > 0 ? "delegated" : "readonly"}
            />
            {readOnlyDowngrade ? (
              <FranchiseStatusBadge tone="warning">
                Downgrade read-only
              </FranchiseStatusBadge>
            ) : (
              <FranchiseStatusBadge tone="delegated">
                {delegatedBranches} vestiging
                {delegatedBranches === 1 ? "" : "en"} stuurbaar
              </FranchiseStatusBadge>
            )}
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/delegaties">
              Delegaties
            </FranchiseActionLink>
            <FranchiseActionLink
              href="/backoffice/planning-board"
              variant="primary"
            >
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
                      Delegatie
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-black uppercase tracking-[0.14em]">
                      Totaal
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-card-border">
                  {planning.branches.map((branch) => (
                    <tr key={branch.branch_id}>
                      <td className="px-4 py-3">
                        <p className="font-black text-foreground">
                          {branch.tenant_name}
                        </p>
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
                          tone={
                            branch.can_manage_planning
                              ? "delegated"
                              : "readonly"
                          }
                        >
                          {branch.can_manage_planning
                            ? branch.delegation_scope_type === "branches"
                              ? "Vestiging"
                              : "Actief"
                            : "Read-only"}
                        </FranchiseStatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <FranchiseStatusBadge
                          tone={
                            branch.upcoming_lessons_7d === 0
                              ? "warning"
                              : "success"
                          }
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
                  <span
                    className={`h-5 w-8 rounded-lg border border-white ${className}`}
                  />
                  <div>
                    <p className="font-black text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </FranchisePanel>

          <FranchisePanel
            title="Planning controles"
            description="Geen verborgen mutaties."
          >
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <div className="flex items-center gap-2 font-black text-foreground">
                  <LockKeyhole className="h-4 w-4 text-primary" aria-hidden />
                  Read-only standaard
                </div>
                <p className="mt-1 text-xs leading-5">
                  Franchiseplanning toont druk en gaten, maar schrijft niet in
                  lokale roosters.
                </p>
              </div>
              <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <div className="flex items-center gap-2 font-black text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                  Delegatiepad
                </div>
                <p className="mt-1 text-xs leading-5">
                  Wijzigen kan alleen via een expliciete delegatie met scope,
                  geldigheid en audit.
                </p>
              </div>
            </div>
          </FranchisePanel>

          <FranchisePanel
            title="Busiest branch"
            description="Op basis van komende 7 dagen."
          >
            {busiest ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                  <p className="font-black text-foreground">
                    {busiest.tenant_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {busiest.branch_name}
                    {busiest.city ? `, ${busiest.city}` : ""}
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

      <section className="grid gap-4 xl:grid-cols-[1fr_0.42fr]">
        <FranchisePanel
          title="Sturen op planning"
          description="Maak capaciteitverzoeken en lokale planningacties binnen de actieve delegatiescope."
        >
          {planning.branches.length === 0 ? (
            <FranchiseEmptyState
              icon={ClipboardList}
              title="Geen vestigingen om aan te sturen"
              description="Koppel franchisees en vestigingen voordat centrale planningsturing mogelijk is."
            />
          ) : (
            <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
              {planning.branches.map((branch) => {
                const canManage =
                  branch.can_manage_planning && !readOnlyDowngrade;
                const instructorOptions = planning.instructors.filter(
                  (instructor) => instructor.tenant_id === branch.tenant_id,
                );
                return (
                  <article
                    key={branch.branch_id}
                    className="rounded-2xl border border-brand-card-border bg-white p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-foreground">
                            {branch.tenant_name}
                          </h3>
                          <FranchiseStatusBadge
                            tone={canManage ? "delegated" : "readonly"}
                          >
                            {canManage ? "Delegatie actief" : "Read-only"}
                          </FranchiseStatusBadge>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-muted-foreground">
                          {branch.branch_name}
                          {branch.city ? `, ${branch.city}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 rounded-xl bg-brand-muted px-3 py-2 text-right">
                        <p className="text-xs font-bold text-muted-foreground">
                          7 dagen
                        </p>
                        <p className="text-sm font-black text-foreground">
                          {branch.upcoming_lessons_7d} lessen
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
                      <form
                        action={createFranchisePlanningAction}
                        className="rounded-xl border border-brand-card-border bg-brand-muted p-3"
                      >
                        <input
                          type="hidden"
                          name="return_to"
                          value="/backoffice/franchise/planning"
                        />
                        <input
                          type="hidden"
                          name="franchisee_tenant_id"
                          value={branch.tenant_id}
                        />
                        <input
                          type="hidden"
                          name="branch_id"
                          value={branch.branch_id}
                        />
                        <input
                          type="hidden"
                          name="action_type"
                          value="capacity_request"
                        />
                        <input
                          type="hidden"
                          name="request_key"
                          value={`capacity:${branch.branch_id}:${firstPlanningDate || "week"}`}
                        />
                        <input
                          type="hidden"
                          name="title"
                          value={`Capaciteit aanvragen: ${branch.branch_name}`}
                        />
                        <input
                          type="hidden"
                          name="description"
                          value={`Vraag lokale capaciteit aan voor ${branch.branch_name}.`}
                        />
                        <div className="flex items-center gap-2 text-sm font-black text-foreground">
                          <Clock className="h-4 w-4 text-primary" aria-hidden />
                          Capaciteit
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <input
                            name="requested_capacity_hours"
                            inputMode="decimal"
                            defaultValue="4"
                            disabled={!canManage}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground disabled:opacity-50"
                            aria-label="Aantal uren capaciteit"
                          />
                          <input
                            name="requested_date"
                            type="date"
                            defaultValue={firstPlanningDate}
                            disabled={!canManage}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground disabled:opacity-50"
                            aria-label="Doeldatum"
                          />
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          className="mt-3 w-full"
                          disabled={!canManage}
                        >
                          Capaciteit aanvragen
                        </Button>
                      </form>

                      <form
                        action={createFranchisePlanningAction}
                        className="rounded-xl border border-brand-card-border bg-brand-muted p-3"
                      >
                        <input
                          type="hidden"
                          name="return_to"
                          value="/backoffice/franchise/planning"
                        />
                        <input
                          type="hidden"
                          name="franchisee_tenant_id"
                          value={branch.tenant_id}
                        />
                        <input
                          type="hidden"
                          name="branch_id"
                          value={branch.branch_id}
                        />
                        <input
                          type="hidden"
                          name="action_type"
                          value="branch_directive"
                        />
                        <input
                          type="hidden"
                          name="title"
                          value={`Planningactie: ${branch.branch_name}`}
                        />
                        <div className="flex items-center gap-2 text-sm font-black text-foreground">
                          <Send className="h-4 w-4 text-primary" aria-hidden />
                          Lokale planningtaak
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-[0.8fr_1.2fr]">
                          <select
                            name="instructor_user_id"
                            disabled={
                              !canManage || instructorOptions.length === 0
                            }
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground disabled:opacity-50"
                          >
                            <option value="">Vestiging/team</option>
                            {instructorOptions.map((instructor) => (
                              <option
                                key={instructor.user_id}
                                value={instructor.user_id}
                              >
                                {instructor.full_name}
                              </option>
                            ))}
                          </select>
                          <input
                            name="due_date"
                            type="date"
                            defaultValue={firstPlanningDate}
                            disabled={!canManage}
                            className="h-9 rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground disabled:opacity-50"
                            aria-label="Deadline"
                          />
                        </div>
                        <textarea
                          name="description"
                          rows={2}
                          disabled={!canManage}
                          placeholder="Wat moet lokaal worden opgepakt?"
                          className="mt-2 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50"
                        />
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          {canManage ? (
                            <FranchiseActionLink
                              href={`/backoffice/planning-board?branch=${branch.branch_id}&date=${firstPlanningDate}&perspective=instructor`}
                              variant="ghost"
                            >
                              Planboard
                              <ArrowUpRight className="h-4 w-4" aria-hidden />
                            </FranchiseActionLink>
                          ) : null}
                          <Button type="submit" size="sm" disabled={!canManage}>
                            Planningactie maken
                          </Button>
                        </div>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </FranchisePanel>

        <FranchisePanel
          title="Lopende planningacties"
          description="Centrale sturing en lokale acceptatie/uitvoering."
        >
          {planningActions.length === 0 ? (
            <FranchiseEmptyState
              icon={CheckCircle2}
              title="Geen planningacties"
              description="Maak vanuit een vestiging een capaciteitverzoek of planningactie."
            />
          ) : (
            <div className="max-h-[38rem] space-y-3 overflow-y-auto pr-1">
              {planningActions.slice(0, 12).map((action) => (
                <div
                  key={action.id}
                  className="rounded-xl border border-brand-card-border bg-white px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-foreground">
                        {action.franchisee_name}
                      </p>
                      <p className="text-xs font-bold text-muted-foreground">
                        {planningActionTypeLabel(action.action_type)}
                      </p>
                    </div>
                    <FranchiseStatusBadge
                      tone={planningStatusTone(action.status)}
                    >
                      {planningStatusLabel[action.status]}
                    </FranchiseStatusBadge>
                  </div>
                  <p className="mt-2 text-sm font-black text-foreground">
                    {action.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                    {action.branch_name ? (
                      <span>{action.branch_name}</span>
                    ) : null}
                    {action.instructor_name ? (
                      <span>{action.instructor_name}</span>
                    ) : null}
                    {action.requested_capacity_hours ? (
                      <span>{action.requested_capacity_hours} uur</span>
                    ) : null}
                    {action.requested_date ? (
                      <span>{action.requested_date}</span>
                    ) : null}
                  </div>
                  {action.local_response ? (
                    <p className="mt-2 rounded-lg bg-brand-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
                      {action.local_response}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </FranchisePanel>
      </section>

      <FranchisePanel
        title="Planning details"
        description="Alle actieve vestigingen met eerstvolgende lesmoment."
        contentClassName="p-0"
      >
        <FranchiseMiniTable
          columns={[
            "Franchisee",
            "Vestiging",
            "Volgende les",
            "7 dagen",
            "Status",
          ]}
          minWidth="760px"
        >
          {planning.branches.map((branch) => (
            <tr key={branch.branch_id}>
              <FranchiseTableCell>
                <p className="font-black text-foreground">
                  {branch.tenant_name}
                </p>
              </FranchiseTableCell>
              <FranchiseTableCell>
                {branch.branch_name}
                {branch.city ? (
                  <span className="text-muted-foreground">, {branch.city}</span>
                ) : null}
              </FranchiseTableCell>
              <FranchiseTableCell>
                {formatDateTime(branch.next_lesson_at)}
              </FranchiseTableCell>
              <FranchiseTableCell align="right">
                {branch.upcoming_lessons_7d}
              </FranchiseTableCell>
              <FranchiseTableCell>
                <FranchiseStatusBadge
                  tone={
                    branch.upcoming_lessons_7d === 0 ? "warning" : "success"
                  }
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
