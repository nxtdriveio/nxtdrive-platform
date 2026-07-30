import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getTodayCapacity,
  getTodayLessons,
  getWeekPlanning,
} from "@/lib/dashboard/metrics";
import {
  getUpcomingTrialLessons,
  getOpenTasks,
  getSmartAlerts,
} from "@/lib/dashboard/reports-data";
import { resolveTenantTimeZone } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
    const supabase = await createServerSupabaseClient();
    const timeZone = resolveTenantTimeZone(tenant);

    const [
      todayLessons,
      upcomingTrials,
      openTasks,
      smartAlerts,
      weekPlanning,
      todayCapacity,
    ] = await Promise.all([
      getTodayLessons(supabase, tenant.id, timeZone),
      getUpcomingTrialLessons(supabase, tenant.id, 4),
      getOpenTasks(supabase, tenant.id, 5),
      getSmartAlerts(supabase, tenant.id),
      getWeekPlanning(supabase, tenant.id, timeZone),
      getTodayCapacity(supabase, tenant.id, timeZone),
    ]);

    return NextResponse.json({
      todayLessons,
      upcomingTrials,
      openTasks,
      smartAlerts,
      weekPlanning,
      todayCapacity,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
