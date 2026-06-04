import Link from "next/link";
import {
  Inbox,
  ArrowUpRight,
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
import { KpiSection } from "@/components/backoffice/kpi-section";
import {
  DashboardSection,
  type DashboardLiveData,
} from "@/components/backoffice/dashboard-section";
import { DashboardCard, DashboardEmptyState } from "@/components/backoffice/dashboard-card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

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

  const funnelTotal = FUNNEL_STAGES.reduce((s, st) => s + (pipeline[st.key] ?? 0), 0);

  const initialLive: DashboardLiveData = {
    todayLessons,
    upcomingTrials,
    openTasks,
    smartAlerts,
    fetchedAt: new Date().toISOString(),
  };

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

      {/* ── Live dashboard sections (auto-refresh every 60 s) ── */}
      <DashboardSection
        initial={initialLive}
        monthlyRevenue={monthlyRevenue}
        studentProgress={studentProgress}
      />
    </div>
  );
}
