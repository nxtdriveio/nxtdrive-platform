import {
  AdminPage,
  AdminPageHeader,
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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createNlDateTimeFormatter,
  resolveTenantTimeZone,
} from "@/lib/datetime";

export const dynamic = "force-dynamic";

export default async function BackofficePage() {
  const { tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const supabase = await createServerSupabaseClient();
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
    <AdminPage className="gap-3">
      <AdminPageHeader
        title="Dashboard"
        description={
          <>
            Operationeel overzicht van vandaag.{" "}
            {today.charAt(0).toUpperCase() + today.slice(1)}.
          </>
        }
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

      <DashboardSection
        tenantId={tenant.id}
        initial={initialLive}
        monthlyRevenue={monthlyRevenue}
        studentProgress={studentProgress}
        leadPipeline={pipeline}
        timeZone={timeZone}
      />
    </AdminPage>
  );
}
