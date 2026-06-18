"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Gauge,
  ListTodo,
  Receipt,
  Route,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import {
  DashboardCard,
  DashboardEmptyState,
} from "@/components/backoffice/dashboard-card";
import { StatusBadge } from "@/components/backoffice/status-badge";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/invoices/types";
import type {
  TodayCapacity,
  TodayLesson,
  WeekPlanningPoint,
} from "@/lib/dashboard/metrics";
import type {
  MonthlyRevenuePoint,
  SmartAlert,
  StudentProgressRow,
  TaskRow,
  UpcomingTrialLesson,
} from "@/lib/dashboard/reports-data";

export type DashboardLiveData = {
  todayLessons: TodayLesson[];
  upcomingTrials: UpcomingTrialLesson[];
  openTasks: TaskRow[];
  smartAlerts: SmartAlert[];
  weekPlanning: WeekPlanningPoint[];
  todayCapacity: TodayCapacity;
  fetchedAt: string;
};

type Props = {
  initial: DashboardLiveData;
  monthlyRevenue: MonthlyRevenuePoint[];
  studentProgress: StudentProgressRow[];
  tenantId: string;
};

const REFRESH_INTERVAL_MS = 60_000;

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

function formatCapacityMinutes(minutes: number): string {
  if (minutes <= 0) return "0 u";
  const hours = minutes / 60;
  return `${hours.toLocaleString("nl-NL", {
    maximumFractionDigits: hours < 10 && minutes % 60 !== 0 ? 1 : 0,
  })} u`;
}

const AVATAR_COLORS = [
  "var(--primary)",
  "var(--info)",
  "var(--success)",
  "var(--accent-foreground)",
  "var(--warning)",
];

const ALERT_COLORS: Record<SmartAlert["type"], string> = {
  lead_followup: "text-danger bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
  low_balance: "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
  exam_upcoming: "text-info bg-[color-mix(in_oklab,var(--info)_12%,transparent)]",
  overdue_invoice: "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
};

const ALERT_ICONS: Record<SmartAlert["type"], React.ElementType> = {
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

export function DashboardSection({
  initial,
  monthlyRevenue,
  studentProgress,
  tenantId,
}: Props) {
  const [data, setData] = useState<DashboardLiveData>(initial);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchData = useCallback(async (force = false) => {
    if (
      !force &&
      typeof document !== "undefined" &&
      document.visibilityState !== "visible"
    ) {
      return;
    }
    if (inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      const res = await fetch("/backoffice/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      const json: DashboardLiveData = await res.json();
      setData(json);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchData(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    intervalRef.current = setInterval(() => {
      void fetchData();
    }, REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`dashboard:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lessons",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          void fetchData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          void fetchData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trial_lessons",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          void fetchData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, fetchData]);

  const totalRevenue = monthlyRevenue.reduce((sum, point) => sum + point.cents, 0);
  const avgRevenue =
    monthlyRevenue.length > 0 ? Math.round(totalRevenue / monthlyRevenue.length) : 0;
  const maxWeekPlanning = Math.max(1, ...data.weekPlanning.map((point) => point.planned));
  const utilization = data.todayCapacity.utilizationPercent ?? 0;
  const freeCapacityMinutes = Math.max(
    0,
    data.todayCapacity.availableMinutes - data.todayCapacity.scheduledMinutes,
  );
  const activityItems = [
    ...data.upcomingTrials.slice(0, 2).map((trial) => ({
      id: `trial-${trial.id}`,
      title: "Proefles gepland",
      body: trial.leadName,
      href: "/backoffice/leads",
      time: dateFmt.format(new Date(trial.startsAt)),
      tone: "info" as const,
    })),
    ...data.openTasks.slice(0, 2).map((task) => ({
      id: `task-${task.id}`,
      title: "Taak open",
      body: task.title,
      href: "/backoffice/taken",
      time: task.priority === "high" ? "Hoog" : "Open",
      tone: "warning" as const,
    })),
    ...data.smartAlerts.slice(0, 2).map((alert) => ({
      id: `alert-${alert.id}`,
      title: alert.title,
      body: alert.description,
      href: alert.href,
      time: alert.timeAgo,
      tone: alert.severity === "high" ? "danger" as const : "warning" as const,
    })),
  ].slice(0, 5);
  const quickActions = [
    { href: "/backoffice/agenda/afspraak/nieuw", label: "Nieuwe rijles plannen", icon: CalendarDays },
    { href: "/backoffice/leads", label: "Proefles inplannen", icon: Route },
    { href: "/backoffice/leerlingen", label: "Nieuwe leerling aanmaken", icon: UserPlus },
    { href: "/backoffice/facturen/nieuw", label: "Factuur aanmaken", icon: Receipt },
    { href: "/backoffice/beschikbaarheid", label: "Instructeur beschikbaarheid", icon: Users },
    { href: "/backoffice/planning-board", label: "Planning optimaliseren", icon: Wrench },
  ];

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-12">
        <DashboardCard
          className="xl:col-span-4"
          title={
            <>
              <CalendarDays className="h-4 w-4 text-primary" />
              Planning vandaag
            </>
          }
          actionLabel="Bekijk agenda"
          actionHref="/backoffice/agenda"
        >
            {data.todayLessons.length === 0 ? (
              <DashboardEmptyState
                icon={<CalendarDays className="h-5 w-5" />}
                message="Geen lessen gepland voor vandaag."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.todayLessons.map((lesson) => (
                  <li key={lesson.id}>
                    <Link
                      href={`/backoffice/agenda/${lesson.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-[var(--admin-row-hover)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-20 shrink-0 text-xs font-semibold tabular-nums text-primary">
                          {timeFmt.format(new Date(lesson.startsAt))} -{" "}
                          {timeFmt.format(new Date(lesson.endsAt))}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {lesson.studentName}
                        </span>
                      </div>
                      <StatusBadge status={lesson.status} domain="lesson" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-3"
          title={
            <>
              <BarChart3 className="h-4 w-4 text-primary" />
              Planning deze week
            </>
          }
          actionLabel="Planboard"
          actionHref="/backoffice/planning-board"
        >
          <div className="flex h-48 items-end gap-3">
            {data.weekPlanning.map((point, index) => (
              <div key={point.day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-36 w-full items-end rounded-xl bg-brand-muted/70 px-1.5 pb-1.5">
                  <div
                    className="w-full rounded-lg bg-[linear-gradient(180deg,var(--brand-secondary),var(--brand-primary))] shadow-[0_10px_22px_rgba(91,77,255,0.18)]"
                    style={{ height: `${Math.max(9, (point.planned / maxWeekPlanning) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-muted-foreground">
                  {point.label}
                </span>
                <span className="text-[11px] font-black text-foreground">
                  {point.planned}
                </span>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-3"
          title={
            <>
              <AlertTriangle className="h-4 w-4 text-warning" />
              Alerts & risico's
            </>
          }
          actionLabel="Alle alerts"
          actionHref="/backoffice/rapportages"
        >
          {data.smartAlerts.length === 0 ? (
            <DashboardEmptyState
              icon={<CheckCircle2 className="h-5 w-5 text-success" />}
              message="Alles ziet er goed uit."
            />
          ) : (
            <ul className="space-y-2">
              {data.smartAlerts.slice(0, 4).map((alert) => {
                const Icon = ALERT_ICONS[alert.type];
                const colorClass = ALERT_COLORS[alert.type];
                return (
                  <li key={alert.id}>
                    <Link
                      href={alert.href}
                      className="flex items-center gap-2.5 rounded-xl border border-brand-border bg-[var(--surface-2)] px-3 py-2.5 transition hover:border-primary/30 hover:bg-[var(--admin-row-hover)]"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">
                          {alert.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {alert.description}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-primary">Bekijk</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-2"
          title="Snelle acties"
          contentClassName="overflow-hidden p-3"
        >
          <div className="grid gap-1.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-brand-border bg-[var(--surface-2)] px-2.5 text-[11px] font-bold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-accent text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                </Link>
              );
            })}
          </div>
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title={
            <>
              <Users className="h-4 w-4 text-primary" />
              Leerlingen voortgang
            </>
          }
          actionLabel="Alle leerlingen"
          actionHref="/backoffice/leerlingen"
        >
          {studentProgress.length === 0 ? (
            <DashboardEmptyState
              icon={<Users className="h-5 w-5" />}
              message="Nog geen lessen geregistreerd."
            />
          ) : (
            <ul className="space-y-3">
              {studentProgress.map((student, index) => {
                const total = student.completedLessons + student.plannedLessons;
                const pct =
                  total > 0
                    ? Math.round((student.completedLessons / total) * 100)
                    : 0;
                return (
                  <li key={student.studentId}>
                    <Link
                      href={`/backoffice/leerlingen/${student.studentId}`}
                      className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--admin-row-hover)]"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-primary-foreground"
                        style={{
                          backgroundColor:
                            AVATAR_COLORS[index % AVATAR_COLORS.length],
                        }}
                      >
                        {student.initials}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-bold text-foreground">
                            {student.name}
                          </span>
                          <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                            {student.completedLessons}/{total}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title="Laatste activiteit"
          actionLabel="Alle activiteiten"
          actionHref="/backoffice/rapportages"
        >
          {activityItems.length === 0 ? (
            <DashboardEmptyState
              icon={<CheckCircle2 className="h-5 w-5 text-success" />}
              message="Nog geen recente activiteit."
            />
          ) : (
            <ul className="space-y-2">
              {activityItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--admin-row-hover)]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-accent text-primary">
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.body}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title={
            <>
              <ListTodo className="h-4 w-4 text-primary" />
              Taken overzicht
            </>
          }
          actionLabel="Bekijk taken"
          actionHref="/backoffice/taken"
        >
          {data.openTasks.length === 0 ? (
            <DashboardEmptyState
              icon={<CheckCircle2 className="h-5 w-5 text-success" />}
              message="Geen openstaande taken."
            />
          ) : (
            <ul className="divide-y divide-brand-border">
              {data.openTasks.map((task) => (
                <li key={task.id}>
                  <Link
                    href="/backoffice/taken"
                    className="flex items-center gap-2.5 py-2.5 transition-colors hover:bg-[var(--admin-row-hover)]"
                  >
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        PRIORITY_DOT[task.priority] ?? "bg-muted-foreground"
                      }`}
                    />
                    <span className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
                      {task.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {task.taskType}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title={
            <>
              <Gauge className="h-4 w-4 text-primary" />
              Bezetting vandaag
            </>
          }
          actionLabel="Bekijk planboard"
          actionHref="/backoffice/planning-board"
        >
          <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <div
              className="relative grid h-32 w-32 place-items-center rounded-full bg-[conic-gradient(var(--brand-primary)_var(--utilization),#edf1f7_0)]"
              style={{ "--utilization": `${utilization}%` } as React.CSSProperties}
            >
              <div className="grid h-24 w-24 place-items-center rounded-full bg-white shadow-inner">
                <div className="text-center">
                  <p className="text-2xl font-black text-foreground">
                    {data.todayCapacity.utilizationPercent === null
                      ? "n.v.t."
                      : `${utilization}%`}
                  </p>
                  <p className="text-[10px] font-bold text-muted-foreground">
                    Beschikbaarheid
                  </p>
                </div>
              </div>
            </div>
            <div className="grid content-center gap-3">
              <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <span className="text-sm text-muted-foreground">Gepland</span>
                <span className="font-black text-foreground">
                  {formatCapacityMinutes(data.todayCapacity.scheduledMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <span className="text-sm text-muted-foreground">Beschikbaar</span>
                <span className="font-black text-foreground">
                  {formatCapacityMinutes(data.todayCapacity.availableMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] px-3 py-2">
                <span className="text-sm text-muted-foreground">Vrij</span>
                <span className="font-black text-foreground">
                  {formatCapacityMinutes(freeCapacityMinutes)}
                </span>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title="Eerstvolgende proeflessen"
          actionLabel="Alle leads"
          actionHref="/backoffice/leads"
          >
            {data.upcomingTrials.length === 0 ? (
              <DashboardEmptyState
                icon={<Car className="h-5 w-5" />}
                message="Geen proeflessen gepland."
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.upcomingTrials.map((trial) => (
                  <li key={trial.id}>
                    <Link
                      href="/backoffice/leads"
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-[var(--admin-row-hover)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {trial.leadName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dateFmt.format(new Date(trial.startsAt))} -{" "}
                          {timeFmt.format(new Date(trial.startsAt))}
                        </p>
                      </div>
                      <StatusBadge status={trial.status} domain="trial" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </DashboardCard>

        <DashboardCard
          className="xl:col-span-4"
          title="Financieel"
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
                  {formatEuros(avgRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">gem. per maand</p>
              </div>
            </div>
        </DashboardCard>
      </div>
    </>
  );
}
