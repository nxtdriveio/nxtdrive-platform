import Link from "next/link";
import {
  BadgeCheck,
  Gift,
  Layers3,
  Package,
  Settings,
  Wallet,
} from "lucide-react";

import {
  AdminGrid,
  AdminList,
  AdminListRow,
  AdminModuleTile,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import {
  DashboardSection,
  type DashboardLiveData,
} from "@/components/backoffice/dashboard-section";
import { KpiSection } from "@/components/backoffice/kpi-section";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  getDashboardKpis,
  getLeadsPipeline,
  getTodayCapacity,
  getTodayLessons,
  getWeekPlanning,
} from "@/lib/dashboard/metrics";
import {
  getMonthlyRevenue,
  getOpenTasks,
  getSmartAlerts,
  getStudentProgressSummary,
  getUpcomingTrialLessons,
} from "@/lib/dashboard/reports-data";
import { FEATURE_LABELS, lockedFeatures } from "@/lib/platform/features";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
} from "@/lib/datetime";

export const dynamic = "force-dynamic";

const FUNNEL_STAGES = [
  { key: "new" as const, label: "Nieuw", href: "/backoffice/leads?tab=today" },
  {
    key: "contacted" as const,
    label: "Benaderd",
    href: "/backoffice/leads?status=contacted",
  },
  {
    key: "package_advised" as const,
    label: "Pakket",
    href: "/backoffice/leads?status=package_advised",
  },
  {
    key: "converted" as const,
    label: "Klant",
    href: "/backoffice/leads?status=converted",
  },
];

export default async function BackofficePage() {
  const { tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const timeZone = resolveTenantTimeZone(tenant);

  const [
    metrics,
    todayLessons,
    upcomingTrials,
    openTasks,
    studentProgress,
    smartAlerts,
    monthlyRevenue,
    pipeline,
    weekPlanning,
    todayCapacity,
  ] = await Promise.all([
    getDashboardKpis(supabase, tenant.id, timeZone),
    getTodayLessons(supabase, tenant.id, timeZone),
    getUpcomingTrialLessons(supabase, tenant.id, 4),
    getOpenTasks(supabase, tenant.id, 5),
    getStudentProgressSummary(supabase, tenant.id, 5),
    getSmartAlerts(supabase, tenant.id),
    getMonthlyRevenue(supabase, tenant.id, 6, timeZone),
    getLeadsPipeline(supabase, tenant.id),
    getWeekPlanning(supabase, tenant.id, timeZone),
    getTodayCapacity(supabase, tenant.id, timeZone),
  ]);

  const today = createNlDateTimeFormatter(
    { weekday: "long", day: "numeric", month: "long" },
    timeZone,
  ).format(new Date());
  const showSubscriptionCard = roles.includes("tenant_admin");
  const entitlementSnapshot = showSubscriptionCard
    ? await loadTenantEntitlementSnapshot(service, tenant.id)
    : null;
  const limitStatuses = entitlementSnapshot?.limitStatuses ?? null;
  const lockedCommercialFeatures =
    entitlementSnapshot?.entitlements.locked ?? lockedFeatures(tenant);
  const funnelTotal = FUNNEL_STAGES.reduce(
    (sum, stage) => sum + (pipeline[stage.key] ?? 0),
    0,
  );

  const initialLive: DashboardLiveData = {
    todayLessons,
    upcomingTrials,
    openTasks,
    smartAlerts,
    weekPlanning,
    todayCapacity,
    fetchedAt: new Date().toISOString(),
  };

  return (
    <AdminPage>
      <AdminPageHeader
        title="Dashboard"
        description={
          <>
            Operationeel overzicht van vandaag.{" "}
            {today.charAt(0).toUpperCase() + today.slice(1)}.
          </>
        }
      />

      <DashboardSection
        tenantId={tenant.id}
        initial={initialLive}
        monthlyRevenue={monthlyRevenue}
        studentProgress={studentProgress}
        timeZone={timeZone}
      />

      <KpiSection
        tenantId={tenant.id}
        initial={{
          activeStudents: metrics.activeStudents,
          lessonsToday: metrics.lessonsToday,
          openLeads: metrics.openLeads,
          revenueThisMonthCents: metrics.revenueThisMonthCents,
          leadsToFollowUp: metrics.leadsToFollowUp,
          openInvoices: metrics.openInvoices,
          openInvoiceCents: metrics.openInvoiceCents,
          openTasks: metrics.openTasks,
          examsThisWeek: metrics.examsThisWeek,
          upcomingTrials: upcomingTrials.length,
          fetchedAt: new Date().toISOString(),
        }}
      />

      <AdminGrid columns="2">
        <AdminPanel
          title={
            <span className="inline-flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-muted-foreground" />
              Leadfunnel
            </span>
          }
          info="Klik op een fase om direct naar de relevante leadlijst te gaan."
          actionHref="/backoffice/leads"
          actionLabel="Alle leads"
        >
          {funnelTotal === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-[var(--surface-2)] p-6 text-center text-sm text-muted-foreground">
              Nog geen leads in de funnel.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              {FUNNEL_STAGES.map((stage) => {
                const count = pipeline[stage.key] ?? 0;
                const percentage =
                  funnelTotal > 0 ? Math.round((count / funnelTotal) * 100) : 0;
                return (
                  <Link
                    key={stage.key}
                    href={stage.href}
                    className="rounded-xl border border-border bg-[var(--surface-2)] p-3 transition-colors hover:border-primary/40 hover:bg-[var(--admin-row-hover)]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {stage.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {count}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {percentage}% van funnel
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </AdminPanel>

        {showSubscriptionCard && limitStatuses ? (
          <AdminPanel
            title={
              <span className="inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Abonnement & limieten
              </span>
            }
            info="Commerciele limieten en locked features blijven zichtbaar voor organisatiebeheerders."
            actionHref="/backoffice/abonnement"
            actionLabel="Beheren"
          >
            <AdminList maxHeight="17rem">
              {Object.values(limitStatuses).map((status) => (
                <AdminListRow
                  key={status.key}
                  href="/backoffice/abonnement"
                  title={status.label}
                  subtitle={
                    status.isUnlimited
                      ? "Onbeperkt op huidig plan"
                      : `${status.used}/${status.limitLabel} gebruikt`
                  }
                  tone={
                    status.isOverLimit
                      ? "danger"
                      : status.isAtLimit
                        ? "warning"
                        : "success"
                  }
                  meta={
                    status.isOverLimit
                      ? "Over limiet"
                      : status.isAtLimit
                        ? "Vol"
                        : "OK"
                  }
                />
              ))}
              {lockedCommercialFeatures.slice(0, 3).map((feature) => (
                <AdminListRow
                  key={feature}
                  href="/backoffice/abonnement"
                  title={FEATURE_LABELS[feature]}
                  subtitle="Niet actief op dit abonnement"
                  tone="warning"
                  meta="Locked"
                />
              ))}
            </AdminList>
          </AdminPanel>
        ) : (
          <AdminPanel
            title="Snelle beheeracties"
            info="De belangrijkste beheerroutes blijven compact beschikbaar."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminModuleTile
                href="/backoffice/cbr"
                icon={BadgeCheck}
                label="CBR-status"
                description="Machtigingen, theorie en examens."
              />
              <AdminModuleTile
                href="/backoffice/referrals"
                icon={Gift}
                label="Referrals"
                description="Ambassadeurs en beloningen."
              />
              <AdminModuleTile
                href="/backoffice/packages"
                icon={Package}
                label="Pakketten"
                description="Lespakketten en tegoed."
              />
              <AdminModuleTile
                href="/backoffice/instellingen"
                icon={Settings}
                label="Instellingen"
                description="Organisatie en voorkeuren."
              />
            </div>
          </AdminPanel>
        )}
      </AdminGrid>
    </AdminPage>
  );
}
