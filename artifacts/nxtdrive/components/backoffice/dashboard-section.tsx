"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Gauge,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";

import {
  DashboardCard,
  DashboardEmptyState,
} from "@/components/backoffice/dashboard-card";
import { StatusBadge } from "@/components/backoffice/status-badge";
import { MiniBarChart } from "@/components/charts/MiniBarChart";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/invoices/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";
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
  timeZone: string;
};

const REFRESH_INTERVAL_MS = 60_000;

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
  lead_followup:
    "text-danger bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]",
  low_balance:
    "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
  exam_upcoming:
    "text-info bg-[color-mix(in_oklab,var(--info)_12%,transparent)]",
  overdue_invoice:
    "text-warning bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]",
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
  timeZone,
}: Props) {
  const [data, setData] = useState<DashboardLiveData>(initial);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const timeFmt = useMemo(
    () =>
      createNlDateTimeFormatter(
        { hour: "2-digit", minute: "2-digit" },
        timeZone,
      ),
    [timeZone],
  );
  const dateFmt = useMemo(
    () =>
      createNlDateTimeFormatter(
        { weekday: "short", day: "numeric", month: "short" },
        timeZone,
      ),
    [timeZone],
  );

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

  const totalRevenue = monthlyRevenue.reduce(
    (sum, point) => sum + point.cents,
    0,
  );
  const avgRevenue =
    monthlyRevenue.length > 0
      ? Math.round(totalRevenue / monthlyRevenue.length)
      : 0;
  const maxWeekPlanning = Math.max(
    1,
    ...data.weekPlanning.map((point) => point.planned),
  );
  const utilization = data.todayCapacity.utilizationPercent ?? 0;
  const freeCapacityMinutes = Math.max(
    0,
    data.todayCapacity.availableMinutes - data.todayCapacity.scheduledMinutes,
  );

  return (
    <div className="grid min-w-0 gap-3 xl:auto-rows-[22rem] xl:grid-cols-12">
      <DashboardCard
        className="order-2 xl:col-span-6"
        title={
          <>
            <CalendarDays className="h-4 w-4 text-primary" />
            Planning vandaag
          </>
        }
        actionLabel="Agenda"
        actionHref="/backoffice/agenda"
      >
        {data.todayLessons.length === 0 ? (
          <DashboardEmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            message="Geen lessen gepland voor vandaag."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.todayLessons.slice(0, 6).map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/backoffice/agenda/${lesson.id}`}
                  className="flex items-center justify-between gap-3 py-2 transition-colors hover:bg-[var(--admin-row-hover)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-primary">
                      {timeFmt.format(new Date(lesson.startsAt))}–
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
        className="order-1 xl:col-span-6"
        title={
          <>
            <AlertTriangle className="h-4 w-4 text-warning" />
            Aandacht nodig
          </>
        }
        actionLabel="Alle taken"
        actionHref="/backoffice/taken"
      >
        {data.smartAlerts.length === 0 && data.openTasks.length === 0 ? (
          <DashboardEmptyState
            icon={<CheckCircle2 className="h-5 w-5 text-success" />}
            message="Geen directe aandachtspunten."
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.smartAlerts.slice(0, 3).map((alert) => {
              const Icon = ALERT_ICONS[alert.type];
              const colorClass = ALERT_COLORS[alert.type];
              return (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    className="flex items-center gap-2.5 py-2 transition hover:bg-[var(--admin-row-hover)]"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colorClass}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {alert.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {alert.description}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {alert.timeAgo}
                    </span>
                  </Link>
                </li>
              );
            })}
            {data.openTasks.slice(0, 3).map((task) => (
              <li key={task.id}>
                <Link
                  href="/backoffice/taken"
                  className="flex items-center gap-2.5 py-2 transition hover:bg-[var(--admin-row-hover)]"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      PRIORITY_DOT[task.priority] ?? "bg-muted-foreground"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {task.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {task.taskType}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard
        className="order-4 xl:col-span-6"
        title={
          <>
            <BarChart3 className="h-4 w-4 text-primary" />
            Trends
          </>
        }
        actionLabel="Rapportages"
        actionHref="/backoffice/rapportages"
      >
        <div className="grid min-w-[36rem] gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2.5 flex items-end justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Planning deze week
                </p>
                <p className="text-xs text-muted-foreground">
                  Geplande lessen per dag
                </p>
              </div>
              <span className="text-lg font-black text-foreground">
                {data.weekPlanning.reduce(
                  (sum, point) => sum + point.planned,
                  0,
                )}
              </span>
            </div>
            <div className="flex h-28 items-end gap-2 border-b border-border">
              {data.weekPlanning.map((point) => (
                <div
                  key={point.day}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <div
                    className="mx-auto w-full max-w-8 rounded-t-md bg-[linear-gradient(180deg,var(--brand-secondary),var(--brand-primary))]"
                    style={{
                      height: `${Math.max(5, (point.planned / maxWeekPlanning) * 100)}%`,
                    }}
                    title={`${point.label}: ${point.planned}`}
                  />
                  <span className="py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Omzettrend
                </p>
                <p className="text-xs text-muted-foreground">
                  Laatste zes maanden
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-foreground">
                  {formatEuros(totalRevenue)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  gem. {formatEuros(avgRevenue)}
                </p>
              </div>
            </div>
            <MiniBarChart data={monthlyRevenue} height={112} showLabels />
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        className="order-3 xl:col-span-6"
        title={
          <>
            <Gauge className="h-4 w-4 text-primary" />
            Bezetting vandaag
          </>
        }
        actionLabel="Planboard"
        actionHref="/backoffice/planning-board"
      >
        <div className="grid items-center gap-3 sm:grid-cols-[7rem_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[7rem_minmax(0,1fr)]">
          <div
            className="relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(var(--brand-primary)_var(--utilization),#edf1f7_0)]"
            style={
              { "--utilization": `${utilization}%` } as React.CSSProperties
            }
          >
            <div className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-white shadow-inner">
              <div className="text-center">
                <p className="text-xl font-black text-foreground">
                  {data.todayCapacity.utilizationPercent === null
                    ? "—"
                    : `${utilization}%`}
                </p>
                <p className="text-[10px] text-muted-foreground">bezet</p>
              </div>
            </div>
          </div>
          <dl className="grid gap-2">
            {[
              ["Gepland", data.todayCapacity.scheduledMinutes],
              ["Beschikbaar", data.todayCapacity.availableMinutes],
              ["Vrij", freeCapacityMinutes],
            ].map(([label, minutes]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between border-b border-border py-1.5 last:border-0"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-semibold text-foreground">
                  {formatCapacityMinutes(Number(minutes))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </DashboardCard>

      <DashboardCard
        className="order-5 xl:col-span-6"
        title={
          <>
            <Users className="h-4 w-4 text-primary" />
            Leerlingvoortgang
          </>
        }
        actionLabel="Leerlingen"
        actionHref="/backoffice/leerlingen"
      >
        {studentProgress.length === 0 ? (
          <DashboardEmptyState
            icon={<Users className="h-5 w-5" />}
            message="Nog geen lessen geregistreerd."
          />
        ) : (
          <ul className="space-y-2">
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
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--admin-row-hover)]"
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
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate font-semibold text-foreground">
                          {student.name}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {student.completedLessons}/{total}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
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
        className="order-6 xl:col-span-6"
        title={
          <>
            <Car className="h-4 w-4 text-primary" />
            Eerstvolgende proeflessen
          </>
        }
        actionLabel="Leads"
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
                  className="flex items-center justify-between gap-3 py-2 transition-colors hover:bg-[var(--admin-row-hover)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {trial.leadName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateFmt.format(new Date(trial.startsAt))} ·{" "}
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
    </div>
  );
}
