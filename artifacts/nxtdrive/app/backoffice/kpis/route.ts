import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDashboardKpis } from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
    const supabase = await createServerSupabaseClient();

    const [metrics, trialCount] = await Promise.all([
      getDashboardKpis(supabase, tenant.id),
      supabase
        .from("trial_lessons")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .in("status", ["provisional", "confirmed"])
        .gt("starts_at", new Date().toISOString()),
    ]);

    return NextResponse.json({
      ...metrics,
      upcomingTrials: trialCount.count ?? 0,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
