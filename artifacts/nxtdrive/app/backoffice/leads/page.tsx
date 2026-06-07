import Link from "next/link";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  INTAKE_TRANSMISSION_LABEL,
  INTAKE_TRANSMISSIONS,
  LEAD_ACTION_STATUS_LABEL,
  LEAD_ACTION_STATUS_VARIANT,
  LEAD_NEXT_ACTION_HINT,
  LEAD_SOURCES,
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_VARIANT,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/types";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type TaskPriority,
} from "@/lib/tasks/types";
import { leadScoreBand, type LeadScorePolicy } from "@/lib/leads/lead-score";
import { loadLeadScorePolicy } from "@/lib/leads/lead-score-policy";
import {
  getLeadKpis,
  getLeadsForTab,
  type DashboardTab,
  type LeadFilters,
} from "@/lib/leads/lead-service";
import { LEAD_BACKOFFICE_READ_ROLES } from "@/lib/leads/access";
import { createLeadManual } from "./actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const TABS: { key: DashboardTab; label: string }[] = [
  { key: "today", label: "Vandaag" },
  { key: "new_requests", label: "Nieuwe aanvragen" },
  { key: "trials", label: "Proeflessen" },
  { key: "package_advice", label: "Pakketadvies" },
  { key: "follow_up", label: "Opvolgen" },
  { key: "won", label: "Gewonnen" },
  { key: "lost", label: "Afgehaakt" },
];

const PRIORITY_VARIANT: Record<TaskPriority, "default" | "info" | "warning" | "danger"> = {
  low: "default",
  normal: "info",
  high: "warning",
  urgent: "danger",
};

function isTab(v: string | undefined): v is DashboardTab {
  return TABS.some((t) => t.key === v);
}

function parseFilters(sp: Record<string, string | undefined>): LeadFilters {
  const f: LeadFilters = {};
  if (sp.status && LEAD_STATUS_LABEL[sp.status as LeadStatus]) f.status = sp.status as LeadStatus;
  if (
    sp.priority === "low" ||
    sp.priority === "normal" ||
    sp.priority === "high" ||
    sp.priority === "urgent"
  )
    f.priority = sp.priority;
  if (sp.source && LEAD_SOURCE_LABEL[sp.source as LeadSource]) f.source = sp.source;
  if (sp.city?.trim()) f.city = sp.city.trim();
  if (sp.neighborhood?.trim()) f.neighborhood = sp.neighborhood.trim();
  if (sp.transmission === "manual" || sp.transmission === "automatic")
    f.transmission = sp.transmission;
  const minScore = Number(sp.minScore);
  if (sp.minScore && Number.isFinite(minScore)) f.minLeadScore = Math.max(0, Math.min(100, minScore));
  if (sp.startFrom?.trim()) f.desiredStartFrom = sp.startFrom.trim();
  if (sp.startTo?.trim()) f.desiredStartTo = sp.startTo.trim();
  if (sp.overdue === "1") f.overdueOnly = true;
  return f;
}

function hasActiveFilters(f: LeadFilters): boolean {
  return Object.keys(f).length > 0;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const tab: DashboardTab = isTab(sp.tab) ? sp.tab : "today";
  const newFlag = sp.new;
  const filters = parseFilters(sp);

  const supabase = await createServerSupabaseClient();
  const context = await requireOrganizationPermission("lead:read", {
    allowedRoles: [...LEAD_BACKOFFICE_READ_ROLES],
  });
  const tenant = context.organization;
  const branchScope = await loadOrganizationBranchScope(supabase, context);
  const leadQueryOptions = {
    branchScope,
    assignedUserId: context.roles.includes("instructor") ? context.user.id : null,
  };
  const now = Date.now();
  const scorePolicy = await loadLeadScorePolicy(supabase, tenant.id);
  const [kpis, leads] = await Promise.all([
    getLeadKpis(supabase, tenant.id, now, scorePolicy.bands.hot, leadQueryOptions),
    getLeadsForTab(supabase, tenant.id, tab, now, filters, leadQueryOptions),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Leaddashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Wat moet er vandaag gebeuren bij {tenant.name}. Intake-link:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              /intake/{tenant.slug}
            </code>
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Vandaag" value={kpis.todayCount} accent="primary" />
        <Kpi label="Te laat" value={kpis.overdueCount} accent="danger" />
        <Kpi label="Open" value={kpis.openCount} />
        <Kpi label="Wachten op lead" value={kpis.waitingCount} />
        <Kpi label={`Hot (≥${scorePolicy.bands.hot})`} value={kpis.hotCount} accent="warning" />
        <Kpi label="Gewonnen" value={kpis.wonCount} accent="success" />
      </div>

      {/* New lead */}
      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          + Nieuwe lead toevoegen
        </summary>
        <form
          action={createLeadManual}
          className="grid gap-3 border-t border-border p-4 sm:grid-cols-2"
        >
          <Input name="full_name" placeholder="Naam" required />
          <Select name="source" defaultValue="manual">
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          <Input name="email" type="email" placeholder="E-mail" />
          <Input name="phone" placeholder="Telefoon" />
          <Input
            name="message"
            placeholder="Notitie (optioneel)"
            className="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button type="submit">Lead aanmaken</Button>
            {newFlag === "error" && (
              <span className="ml-3 text-xs text-danger">
                Vul een naam en e-mail of telefoon in.
              </span>
            )}
          </div>
        </form>
      </details>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/backoffice/leads?tab=${t.key}`}
            className={
              t.key === tab
                ? "inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary"
                : "inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <details
        className="rounded-xl border border-border bg-card"
        open={hasActiveFilters(filters)}
      >
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-foreground">
          <span>Filters</span>
          {hasActiveFilters(filters) && (
            <Badge variant="info">Actief</Badge>
          )}
        </summary>
        <form
          method="get"
          className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="tab" value={tab} />
          <Select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Alle statussen</option>
            {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={filters.priority ?? ""}>
            <option value="">Alle prioriteiten</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
          <Select name="source" defaultValue={filters.source ?? ""}>
            <option value="">Alle bronnen</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select name="transmission" defaultValue={filters.transmission ?? ""}>
            <option value="">Schakel & automaat</option>
            {INTAKE_TRANSMISSIONS.map((t) => (
              <option key={t} value={t}>
                {INTAKE_TRANSMISSION_LABEL[t]}
              </option>
            ))}
          </Select>
          <Input name="city" placeholder="Plaats" defaultValue={filters.city ?? ""} />
          <Input
            name="neighborhood"
            placeholder="Wijk / buurt"
            defaultValue={filters.neighborhood ?? ""}
          />
          <Input
            name="minScore"
            type="number"
            min={0}
            max={100}
            placeholder="Min. leadscore"
            defaultValue={filters.minLeadScore ?? ""}
          />
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Startdatum vanaf
            <Input name="startFrom" type="date" defaultValue={filters.desiredStartFrom ?? ""} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Startdatum t/m
            <Input name="startTo" type="date" defaultValue={filters.desiredStartTo ?? ""} />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="overdue"
              value="1"
              defaultChecked={filters.overdueOnly === true}
              className="h-4 w-4 rounded border-border"
            />
            Alleen te laat
          </label>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit">Filter toepassen</Button>
            {hasActiveFilters(filters) && (
              <Link
                href={`/backoffice/leads?tab=${tab}`}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Wissen
              </Link>
            )}
          </div>
        </form>
      </details>

      {/* Lead list */}
      <Card className="overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {tab === "today"
              ? "Niets te doen vandaag. Goed bezig! 🎉"
              : "Geen leads in deze weergave."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((l) => (
              <LeadRow key={l.id} lead={l} now={now} scorePolicy={scorePolicy} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "primary" | "danger" | "warning" | "success";
}) {
  const color =
    accent === "danger"
      ? "text-danger"
      : accent === "warning"
        ? "text-warning"
        : accent === "success"
          ? "text-success"
          : accent === "primary"
            ? "text-primary"
            : "text-foreground";
  return (
    <Card className="p-4">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function LeadRow({
  lead,
  now,
  scorePolicy,
}: {
  lead: Lead;
  now: number;
  scorePolicy: LeadScorePolicy;
}) {
  const overdue =
    lead.next_action_at !== null &&
    new Date(lead.next_action_at).getTime() < now &&
    lead.action_status !== "closed";
  const band = leadScoreBand(lead.lead_score, scorePolicy);
  const scoreVariant =
    band === "hot" ? "warning" : band === "warm" ? "info" : "default";
  const nextAction = LEAD_NEXT_ACTION_HINT[lead.status];

  return (
    <li>
      <Link
        href={`/backoffice/leads/${lead.id}`}
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {lead.full_name}
            </span>
            <Badge variant={scoreVariant}>{lead.lead_score}</Badge>
            {lead.priority !== "normal" && lead.priority !== "low" && (
              <Badge variant={PRIORITY_VARIANT[lead.priority]}>
                {TASK_PRIORITY_LABEL[lead.priority]}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {LEAD_SOURCE_LABEL[lead.source]} ·{" "}
            {lead.email ?? lead.phone ?? "geen contact"}
            {lead.city ? ` · ${lead.city}` : ""}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground">
            <span aria-hidden className="text-primary">
              →
            </span>
            <span className="truncate font-medium">{nextAction}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>
            {LEAD_STATUS_LABEL[lead.status]}
          </Badge>
          <Badge variant={LEAD_ACTION_STATUS_VARIANT[lead.action_status]}>
            {LEAD_ACTION_STATUS_LABEL[lead.action_status]}
          </Badge>
          <span
            className={`text-xs tabular-nums ${overdue ? "font-medium text-danger" : "text-muted-foreground"}`}
          >
            {lead.next_action_at
              ? `${overdue ? "Te laat · " : ""}${dateFmt.format(new Date(lead.next_action_at))}`
              : "—"}
          </span>
        </div>
      </Link>
    </li>
  );
}
