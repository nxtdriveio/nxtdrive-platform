import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Inbox,
  Wallet,
  Receipt,
  Clock,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getDashboardKpis,
  getTodayLessons,
} from "@/lib/dashboard/metrics";
import {
  getUpcomingTrialLessons,
  getOpenTasks,
  getStudentProgressSummary,
  getSmartAlerts,
  getMonthlyRevenue,
} from "@/lib/dashboard/reports-data";
import { formatEuros } from "@/lib/invoices/types";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type LessonStatus,
} from "@/lib/lessons/types";
import { MiniBarChart } from "@/components/charts/MiniBarChart";

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
  "bg-amber-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-rose-500",
];

const ALERT_COLORS = {
  lead_followup: "text-red-400 bg-red-400/10",
  low_balance: "text-amber-400 bg-amber-400/10",
  exam_upcoming: "text-blue-400 bg-blue-400/10",
  overdue_invoice: "text-orange-400 bg-orange-400/10",
};

const ALERT_ICONS = {
  lead_followup: AlertTriangle,
  low_balance: Wallet,
  exam_upcoming: CalendarDays,
  overdue_invoice: Receipt,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
};

function TrendChip({ value, hint }: { value: number | null; hint: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">{hint}</span>;
  const up = value >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {value}% {hint}
    </span>
  );
}

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
  ] = await Promise.all([
    getDashboardKpis(supabase, tenant.id),
    getTodayLessons(supabase, tenant.id),
    getUpcomingTrialLessons(supabase, tenant.id, 4),
    getOpenTasks(supabase, tenant.id, 5),
    getStudentProgressSummary(supabase, tenant.id, 5),
    getSmartAlerts(supabase, tenant.id),
    getMonthlyRevenue(supabase, tenant.id, 6),
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

  const kpis = [
    {
      label: "Actieve leerlingen",
      value: metrics.activeStudents.toLocaleString("nl-NL"),
      hint: null as string | null,
      trendValue: null as number | null,
      trendHint: "deze maand",
      icon: Users,
      href: "/backoffice/leerlingen",
    },
    {
      label: "Lessen vandaag",
      value: metrics.lessonsToday.toLocaleString("nl-NL"),
      hint: null,
      trendValue: null,
      trendHint: "gepland",
      icon: Clock,
      href: "/backoffice/agenda",
    },
    {
      label: "Openstaande leads",
      value: metrics.openLeads.toLocaleString("nl-NL"),
      hint: null,
      trendValue: null,
      trendHint: "actief",
      icon: Inbox,
      href: "/backoffice/leads",
    },
    {
      label: "Omzet deze maand",
      value: formatEuros(metrics.revenueThisMonthCents),
      hint: null,
      trendValue: null,
      trendHint: "betaalde facturen",
      icon: Wallet,
      href: "/backoffice/boekhouding",
    },
    {
      label: "Nog opvolgen",
      value: metrics.leadsToFollowUp.toLocaleString("nl-NL"),
      hint: null,
      trendValue: null,
      trendHint: "nieuwe leads",
      icon: TrendingUp,
      href: "/backoffice/leads",
    },
    {
      label: "Openstaande facturen",
      value: metrics.openInvoices.toLocaleString("nl-NL"),
      hint: null,
      trendValue: null,
      trendHint: "nog niet betaald",
      icon: Receipt,
      href: "/backoffice/facturen",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
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
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nieuwe aanvraag
          </Link>
        </div>
      </div>

      {/* ── 6 KPI cards ── */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className="group">
              <Card className="transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="truncate">{kpi.label}</CardTitle>
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="h-3 w-3" aria-hidden />
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-semibold text-foreground">{kpi.value}</div>
                  <TrendChip value={kpi.trendValue} hint={kpi.trendHint} />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>

      {/* ── 3-column main layout ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* LEFT: Agenda + Taken */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Agenda vandaag</CardTitle>
                <Link
                  href="/backoffice/agenda"
                  className="text-xs text-primary hover:underline"
                >
                  Volledig →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {todayLessons.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Geen lessen gepland voor vandaag.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {todayLessons.map((lesson) => (
                    <li
                      key={lesson.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                          {timeFmt.format(new Date(lesson.startsAt))} –{" "}
                          {timeFmt.format(new Date(lesson.endsAt))}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {lesson.studentName}
                        </span>
                      </div>
                      <Badge
                        variant={LESSON_STATUS_VARIANT[lesson.status as LessonStatus]}
                      >
                        {LESSON_STATUS_LABEL[lesson.status as LessonStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-3.5 w-3.5" />
                  Openstaande taken
                </CardTitle>
                <Link
                  href="/backoffice/taken"
                  className="text-xs text-primary hover:underline"
                >
                  Alle →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {openTasks.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-400" />
                  Geen openstaande taken.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {openTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2.5 py-2.5">
                      <span
                        className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          task.priority === "high"
                            ? "bg-red-400"
                            : task.priority === "medium"
                              ? "bg-amber-400"
                              : "bg-muted-foreground"
                        }`}
                      />
                      <span className="flex-1 text-sm text-foreground">{task.title}</span>
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Proeflessen + Voortgang */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Eerstvolgende proeflessen</CardTitle>
                <Link
                  href="/backoffice/leads"
                  className="text-xs text-primary hover:underline"
                >
                  Alle leads →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingTrials.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Geen proeflessen gepland.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {upcomingTrials.map((trial) => (
                    <li key={trial.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">{trial.leadName}</p>
                        <p className="text-xs text-muted-foreground">
                          {dateFmt.format(new Date(trial.startsAt))} —{" "}
                          {timeFmt.format(new Date(trial.startsAt))}
                        </p>
                      </div>
                      <Badge
                        variant={
                          trial.status === "confirmed" ? "success" : "warning"
                        }
                      >
                        {trial.status === "confirmed" ? "Bevestigd" : "Voorlopig"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Leerlingen voortgang</CardTitle>
                <Link
                  href="/backoffice/leerlingen"
                  className="text-xs text-primary hover:underline"
                >
                  Alle →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {studentProgress.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  Nog geen lessen geregistreerd.
                </div>
              ) : (
                <ul className="space-y-3">
                  {studentProgress.map((s, i) => {
                    const total = s.completedLessons + s.plannedLessons;
                    const pct = total > 0 ? Math.round((s.completedLessons / total) * 100) : 0;
                    return (
                      <li key={s.studentId} className="flex items-center gap-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                        >
                          {s.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate font-medium text-foreground">{s.name}</span>
                            <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                              {s.completedLessons}/{total}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Omzet + Slimme meldingen */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Omzet samenvatting</CardTitle>
                <Link
                  href="/backoffice/rapportages"
                  className="text-xs text-primary hover:underline"
                >
                  Rapportages →
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <MiniBarChart data={monthlyRevenue} height={60} />
              <div className="mt-3 grid grid-cols-2 gap-3">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Slimme meldingen</CardTitle>
                {smartAlerts.length > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-xs font-semibold text-red-400">
                    {smartAlerts.length}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {smartAlerts.length === 0 ? (
                <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  Alles ziet er goed uit.
                </div>
              ) : (
                <ul className="space-y-2">
                  {smartAlerts.map((alert) => {
                    const Icon = ALERT_ICONS[alert.type];
                    const colorClass = ALERT_COLORS[alert.type];
                    return (
                      <li
                        key={alert.id}
                        className="flex gap-2.5 rounded-lg border border-border p-2.5"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${colorClass}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{alert.title}</p>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
