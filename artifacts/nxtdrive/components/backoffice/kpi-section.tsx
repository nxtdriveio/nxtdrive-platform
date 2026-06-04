"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Users, Inbox, Wallet, Receipt, Clock, ArrowUpRight, Car, RefreshCw } from "lucide-react";
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

  const fetchKpis = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/backoffice/kpis", { cache: "no-store" });
      if (!res.ok) return;
      const json: KpiData = await res.json();
      setData(json);
    } catch {
    } finally {
      setRefreshing(false);
    }
  }, []);

  // 60 s polling — fallback when realtime connection is unavailable
  useEffect(() => {
    intervalRef.current = setInterval(fetchKpis, REFRESH_INTERVAL_MS);
    return () => {
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
          onClick={fetchKpis}
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="Actieve leerlingen"
          value={data.activeStudents.toLocaleString("nl-NL")}
          icon={Users}
          trendHint="actief"
          href="/backoffice/leerlingen"
        />
        <StatCard
          label="Lessen vandaag"
          value={data.lessonsToday.toLocaleString("nl-NL")}
          icon={Clock}
          trendHint="gepland"
          href="/backoffice/agenda"
        />
        <StatCard
          label="Openstaande leads"
          value={data.openLeads.toLocaleString("nl-NL")}
          icon={Inbox}
          trendHint="in funnel"
          href="/backoffice/leads"
        />
        <StatCard
          label="Omzet deze maand"
          value={formatEuros(data.revenueThisMonthCents)}
          icon={Wallet}
          trendHint="betaald"
          href="/backoffice/boekhouding"
        />
        <StatCard
          label="Nog opvolgen"
          value={data.leadsToFollowUp.toLocaleString("nl-NL")}
          icon={ArrowUpRight}
          trendHint="nieuwe leads"
          href="/backoffice/leads"
        />
        <StatCard
          label="Open facturen"
          value={data.openInvoices.toLocaleString("nl-NL")}
          icon={Receipt}
          trendHint="onbetaald"
          href="/backoffice/facturen"
        />
        <StatCard
          label="Proefles geboekt"
          value={data.upcomingTrials.toLocaleString("nl-NL")}
          icon={Car}
          trendHint="aankomend"
          href="/backoffice/leads"
        />
      </div>
    </section>
  );
}
