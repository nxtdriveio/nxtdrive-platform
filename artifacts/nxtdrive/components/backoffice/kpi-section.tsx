"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Users, Inbox, Receipt, Clock, ClipboardList, CalendarCheck2, RefreshCw } from "lucide-react";
import { StatCard } from "@/components/backoffice/stat-card";
import { formatEuros } from "@/lib/invoices/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type KpiData = {
  activeStudents: number;
  lessonsToday: number;
  openLeads: number;
  revenueThisMonthCents: number;
  leadsToFollowUp: number;
  openInvoices: number;
  openInvoiceCents: number;
  openTasks: number;
  examsThisWeek: number;
  upcomingTrials: number;
  fetchedAt: string;
};

const REFRESH_INTERVAL_MS = 60_000;

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  hour: "2-digit",
  minute: "2-digit",
});

export function KpiSection({ initial, tenantId }: { initial: KpiData; tenantId: string }) {
  const [data, setData] = useState<KpiData>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);

  const fetchKpis = useCallback(async (force = false) => {
    if (!force && typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      setRefreshing(true);
      const res = await fetch("/backoffice/kpis", { cache: "no-store" });
      if (!res.ok) return;
      const json: KpiData = await res.json();
      setData(json);
    } catch {
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // 60 s polling — fallback when realtime connection is unavailable
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchKpis(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    intervalRef.current = setInterval(() => {
      void fetchKpis();
    }, REFRESH_INTERVAL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchKpis]);

  // Supabase Realtime — instant push on lessons / tasks / trial_lessons changes
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`kpis:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lessons",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => { void fetchKpis(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => { void fetchKpis(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trial_lessons",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => { void fetchKpis(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, fetchKpis]);

  const lastUpdated = timeFmt.format(new Date(data.fetchedAt));

  return (
    <section aria-label="KPI-overzicht">
      <div className="mb-2 flex items-center justify-end gap-1.5">
        <span className="text-[11px] text-muted-foreground">
          Bijgewerkt om {lastUpdated}
        </span>
        <button
          onClick={() => { void fetchKpis(true); }}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="Rijlessen vandaag"
          value={data.lessonsToday.toLocaleString("nl-NL")}
          icon={Clock}
          trendHint="gepland vandaag"
          href="/backoffice/agenda"
        />
        <StatCard
          label="Actieve leerlingen"
          value={data.activeStudents.toLocaleString("nl-NL")}
          icon={Users}
          trendHint="actieve dossiers"
          href="/backoffice/leerlingen"
        />
        <StatCard
          label="Open taken"
          value={data.openTasks.toLocaleString("nl-NL")}
          icon={ClipboardList}
          trendHint="openstaand"
          href="/backoffice/taken"
        />
        <StatCard
          label="Open facturen"
          value={formatEuros(data.openInvoiceCents)}
          icon={Receipt}
          trendHint={`${data.openInvoices.toLocaleString("nl-NL")} openstaand`}
          href="/backoffice/facturen"
        />
        <StatCard
          label="Nieuwe leads"
          value={data.openLeads.toLocaleString("nl-NL")}
          icon={Inbox}
          trendHint="in opvolging"
          href="/backoffice/leads"
        />
        <StatCard
          label="Examens deze week"
          value={data.examsThisWeek.toLocaleString("nl-NL")}
          icon={CalendarCheck2}
          trendHint={`${data.upcomingTrials.toLocaleString("nl-NL")} proefles(sen)`}
          href="/backoffice/cbr"
        />
      </div>
    </section>
  );
}
