"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  ListTodo,
  Receipt,
  RefreshCw,
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
import type { TodayLesson } from "@/lib/dashboard/metrics";
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
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(true);
      const res = await fetch("/backoffice/dashboard", { cache: "no-store" });
      if (!res.ok) return;
      const json: DashboardLiveData = await res.json();
      setData(json);
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
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

  const lastUpdated = timeFmt.format(new Date(data.fetchedAt));
  const totalRevenue = monthlyRevenue.reduce((sum, point) => sum + point.cents, 0);
  const avgRevenue =
    monthlyRevenue.length > 0 ? Math.round(totalRevenue / monthlyRevenue.length) : 0;

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[11px] text-muted-foreground">
          Bijgewerkt om {lastUpdated}
        </span>
        <button
          onClick={() => {
            void fetchData(true);
          }}
          disabled={refreshing}
          aria-label="Nu vernieuwen"
          className="flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <DashboardCard
            title={
              <>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Agenda vandaag
              </>
            }
            actionLabel="Volledig"
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
                        <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
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
            title={
              <>
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                Openstaande taken
              </>
            }
            actionLabel="Alle"
            actionHref="/backoffice/taken"
          >
            {data.openTasks.length === 0 ? (
              <DashboardEmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                message="Geen openstaande taken."
              />
            ) : (
              <ul className="divide-y divide-border">
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
                      <span className="line-clamp-1 flex-1 text-sm text-foreground">
                        {task.title}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4">
          <DashboardCard
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
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
                          style={{
                            backgroundColor:
                              AVATAR_COLORS[index % AVATAR_COLORS.length],
                          }}
                        >
                          {student.initials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate font-medium text-foreground">
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
        </div>

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
                  {formatEuros(avgRevenue)}
                </p>
                <p className="text-xs text-muted-foreground">gem. per maand</p>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Slimme meldingen"
            headerRight={
              data.smartAlerts.length > 0 ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-xs font-semibold text-danger">
                  {data.smartAlerts.length}
                </span>
              ) : undefined
            }
          >
            {data.smartAlerts.length === 0 ? (
              <DashboardEmptyState
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                message="Alles ziet er goed uit."
              />
            ) : (
              <ul className="space-y-2">
                {data.smartAlerts.map((alert) => {
                  const Icon = ALERT_ICONS[alert.type];
                  const colorClass = ALERT_COLORS[alert.type];
                  return (
                    <li key={alert.id}>
                      <Link
                        href={alert.href}
                        className="flex gap-2.5 rounded-xl border border-border p-3 transition-colors hover:bg-[var(--admin-row-hover)]"
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
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {alert.description}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {alert.timeAgo}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardCard>
        </div>
      </div>
    </>
  );
}
