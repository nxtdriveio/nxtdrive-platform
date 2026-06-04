import Link from "next/link";
import {
  Users,
  Inbox,
  Wallet,
  Receipt,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
  ListTodo,
  Car,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getDashboardKpis,
  getTodayLessons,
  getLeadsPipeline,
} from "@/lib/dashboard/metrics";
import {
  getUpcomingTrialLessons,
  getOpenTasks,
  getStudentProgressSummary,
  getSmartAlerts,
  getMonthlyRevenue,
} from "@/lib/dashboard/reports-data";
import { formatEuros } from "@/lib/invoices/types";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { KpiSection } from "@/components/backoffice/kpi-section";
import { DashboardCard, DashboardEmptyState } from "@/components/backoffice/dashboard-card";
import { StatusBadge } from "@/components/backoffice/status-badge";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
];

const ALERT_COLORS = {
  lead_followup: "text-danger bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
  low_balance: "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
  exam_upcoming: "text-info bg-[color-mix(in_oklab,var(--info)_12%,transparent)]",
  overdue_invoice: "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
};

const ALERT_ICONS = {
  lead_followup: AlertTriangle,
  low_balance: Wallet,
  exam_upcoming: CalendarDays,
  overdue_invoice: Receipt,
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-muted-foreground",
};

const FUNNEL_STAGES = [
  { key: "new" as const, label: "Nieuw" },
  { key: "contacted" as const, label: "Benaderd" },
  { key: "package_advised" as const, label: "Pakket" },
  { key: "converted" as const, label: "Klant" },
];

export default async function BackofficePage() {
  const { user, tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const supabase = await createServerSupabaseClient();

  const [
    metrics,
    todayLessons,
    upcomingTrials,
    openTasks,
    studentProgress,
    smartAlerts,
    monthlyRevenue,
    pipeline,
  ] = await Promise.all([
    getDashboardKpis(supabase, tenant.id),
    getTodayLessons(supabase, tenant.id),
    getUpcomingTrialLessons(supabase, tenant.id, 4),
    getOpenTasks(supabase, tenant.id, 5),
    getStudentProgressSummary(supabase, tenant.id, 5),
    getSmartAlerts(supabase, tenant.id),
    getMonthlyRevenue(supabase, tenant.id, 6),
    getLeadsPipeline(supabase, tenant.id),
  ]);

  const today = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const firstName =
    user.profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";

  const totalRevenue = monthlyRevenue.reduce((s, p) => s + p.cents, 0);
  const avgRevenue =
    monthlyRevenue.length > 0 ? Math.round(totalRevenue / monthlyRevenue.length) : 0;

  const funnelTotal = FUNNEL_STAGES.reduce((s, st) => s + (pipeline[st.key] ?? 0), 0);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {today.charAt(0).toUpperCase() + today.slice(1)}
            {firstName ? ` — welkom terug, ${firstName}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="primary">
            <ArrowUpRight className="h-3 w-3" aria-hidden />
            {tenant.name}
          </Badge>
          <Link
            href="/backoffice/leads/nieuw"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nieuwe aanvraag
          </Link>
        </div>
      </div>

      {/* ── 7 KPI cards (auto-refresh every 60 s) ── */}
      <KpiSection
        initial={{
          activeStudents: metrics.activeStudents,
          lessonsToday: metrics.lessonsToday,
          openLeads: metrics.openLeads,
          revenueThisMonthCents: metrics.revenueThisMonthCents,
          leadsToFollowUp: metrics.leadsToFollowUp,
          openInvoices: metrics.openInvoices,
          upcomingTrials: upcomingTrials.length,
          fetchedAt: new Date().toISOString(),
        }}
      />

      {/* ── Lead funnel ── */}
      <DashboardCard
        title={<><Inbox className="h-4 w-4 text-muted-foreground" /> Leadfunnel</>}
        actionLabel="Alle leads"
        actionHref="/backoffice/leads"
      >
        {funnelTotal === 0 ? (
          <DashboardEmptyState message="Nog geen leads in de funnel." />
        ) : (
          <div className="flex items-stretch gap-0 overflow-hidden rounded-xl border border-border">
            {FUNNEL_STAGES.map((stage, i) => {
              const count = pipeline[stage.key] ?? 0;
              const pct = funnelTotal > 0 ? Math.round((count / funnelTotal) * 100) : 0;
              const isLast = i === FUNNEL_STAGES.length - 1;
              return (
                <div
                  key={stage.key}
                  className="relative flex flex-1 flex-col gap-1 px-4 py-3"
                  style={{
                    background:
                      i === 0
                        ? "color-mix(in oklab, var(--primary) 10%, transparent)"
                        : i === 1
                          ? "color-mix(in oklab, var(--primary) 6%, transparent)"
                          : i === 2
                            ? "color-mix(in oklab, var(--primary) 3%, transparent)"
                            : "color-mix(in oklab, var(--success) 8%, transparent)",
                  }}
                >
                  {!isLast && (
                    <div
                      className="absolute inset-y-0 right-0 w-px bg-border"
                      aria-hidden
                    />
                  )}
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {stage.label}
                  </p>
                  <p className="text-xl font-bold text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground">{pct}%</p>
                </div>
              );
            })}
          </div>
        )}
      </DashboardCard>

      {/* ── 3-column main layout ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* LEFT: Agenda + Taken */}
        <div className="space-y-4">
          <DashboardCard
            title={<><CalendarDays className="h-4 w-4 text-muted-foreground" /> Agenda vandaag</>}
            actionLabel="Volledig"
            actionHref="/backoffice/agenda"
          >
            {todayLessons.length === 0 ? (
              <DashboardEmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                message="Geen lessen gepland voor vandaag."
              />
            ) : (
              <ul className="divide-y divide-border">
                {todayLessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {timeFmt.format(new Date(lesson.startsAt))} –{" "}
                        {timeFmt.format(new Date(lesson.endsAt))}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {lesson.studentName}
                      </span>
                    </div>
                    <StatusBadge
                      status={lesson.status}
                      domain="lesson"
                    />
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title={<><ListTodo className="h-4 w-4 text-muted-foreground" /> Openstaande taken</>}
            actionLabel="Alle"
            actionHref="/backoffice/taken"
          >
            {openTasks.length === 0 ? (
              <DashboardEmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                message="Geen openstaande taken."
              />
            ) : (
              <ul className="divide-y divide-border">
                {openTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-2.5 py-2.5">
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-muted-foreground"}`}
                    />
                    <span className="flex-1 text-sm text-foreground line-clamp-1">
                      {task.title}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        {/* CENTER: Proeflessen + Voortgang */}
        <div className="space-y-4">
          <DashboardCard
            title="Eerstvolgende proeflessen"
            actionLabel="Alle leads"
            actionHref="/backoffice/leads"
          >
            {upcomingTrials.length === 0 ? (
              <DashboardEmptyState
                icon={<Car className="h-5 w-5" />}
                message="Geen proeflessen gepland."
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcomingTrials.map((trial) => (
                  <li
                    key={trial.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {trial.leadName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dateFmt.format(new Date(trial.startsAt))} —{" "}
                        {timeFmt.format(new Date(trial.startsAt))}
                      </p>
                    </div>
                    <StatusBadge status={trial.status} domain="trial" />
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Leerlingen voortgang"
            actionLabel="Alle"
            actionHref="/backoffice/leerlingen"
          >
            {studentProgress.length === 0 ? (
              <DashboardEmptyState
                icon={<Users className="h-5 w-5" />}
                message="Nog geen lessen geregistreerd."
              />
            ) : (
              <ul className="space-y-3">
                {studentProgress.map((s, i) => {
                  const total = s.completedLessons + s.plannedLessons;
                  const pct =
                    total > 0 ? Math.round((s.completedLessons / total) * 100) : 0;
                  return (
                    <li key={s.studentId} className="flex items-center gap-2.5">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                      >
                        {s.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium text-foreground">
                            {s.name}
                          </span>
                          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {s.completedLessons}/{total}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardCard>
        </div>

        {/* RIGHT: Omzet + Slimme meldingen */}
        <div className="space-y-4">
          <DashboardCard
            title="Omzet samenvatting"
            actionLabel="Rapportages"
            actionHref="/backoffice/rapportages"
          >
            <MiniBarChart data={monthlyRevenue} height={64} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {formatEuros(totalRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">laatste 6 maanden</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {formatEuros(avgRevenue * 100)}
                </p>
                <p className="text-xs text-muted-foreground">gem. per maand</p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Slimme meldingen"
            headerRight={
              smartAlerts.length > 0 ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-xs font-semibold text-danger">
                  {smartAlerts.length}
                </span>
              ) : undefined
            }
          >
            {smartAlerts.length === 0 ? (
              <DashboardEmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                message="Alles ziet er goed uit."
              />
            ) : (
              <ul className="space-y-2">
                {smartAlerts.map((alert) => {
                  const Icon = ALERT_ICONS[alert.type];
                  const colorClass = ALERT_COLORS[alert.type];
                  return (
                    <li
                      key={alert.id}
                      className="flex gap-2.5 rounded-xl border border-border p-3"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {alert.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {alert.description}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {alert.timeAgo}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
