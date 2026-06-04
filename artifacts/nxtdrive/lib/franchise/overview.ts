/**
 * Franchise dashboard aggregation.
 *
 * Reads across ALL franchisee tenants of a given franchisegever.
 * Service-role only (bypasses RLS). Fail-loud on any read error.
 * No caching — live aggregate.
 *
 * Branch-level data:
 *   Lessons and students can be attributed to a branch via their branch_id FK.
 *   Each FranchiseeLocation exposes per-branch breakdowns alongside tenant totals.
 *
 * Capacity utilisation:
 *   computed as (completed lesson minutes / instructor available minutes) × 100.
 *   instructor_availability stores weekly recurring blocks (start_min / end_min per weekday).
 *   We count the occurrences of each weekday in the 30-day window to get total available minutes.
 *   Falls back to null when no availability blocks are configured for the tenant.
 */
import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchiseeLocationBranch = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  active_students: number;
  lessons_last_30d: number;
};

export type FranchiseeLocation = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  branches: FranchiseeLocationBranch[];
  // Tenant-level totals (includes rows with branch_id = null)
  active_students: number;
  lessons_last_30d: number;
  revenue_last_30d_cents: number;
  exam_pass_rate: number | null;
  lead_conversion_rate: number | null;
  capacity_utilisation: number | null;
};

export type FranchiseOverview = {
  franchisegever_id: string;
  franchisegever_name: string;
  locations: FranchiseeLocation[];
  totals: {
    franchisees: number;
    active_students: number;
    lessons_last_30d: number;
    revenue_last_30d_cents: number;
  };
};

export async function loadFranchiseOverview(
  franchisegever_tenant_id: string,
): Promise<FranchiseOverview> {
  const service = createServiceRoleClient();

  // Load franchisegever info.
  const { data: franchisegever, error: fgErr } = await service
    .from("tenants")
    .select("id, name")
    .eq("id", franchisegever_tenant_id)
    .single();

  if (fgErr || !franchisegever) {
    throw new Error(`Franchisegever laden mislukt: ${fgErr?.message ?? "niet gevonden"}`);
  }

  // Load all franchisee tenants.
  const { data: franchisees, error: feErr } = await service
    .from("tenants")
    .select("id, name, slug")
    .eq("parent_tenant_id", franchisegever_tenant_id)
    .order("name");

  if (feErr) {
    throw new Error(`Franchisees laden mislukt: ${feErr.message}`);
  }

  if (!franchisees || franchisees.length === 0) {
    return {
      franchisegever_id: franchisegever.id,
      franchisegever_name: franchisegever.name,
      locations: [],
      totals: { franchisees: 0, active_students: 0, lessons_last_30d: 0, revenue_last_30d_cents: 0 },
    };
  }

  const franchiseeIds = franchisees.map((f) => f.id);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

  // Compute weekday occurrence counts in the 30-day window (for capacity utilisation).
  const weekdayCounts: Record<number, number> = {};
  const cursor = new Date(thirtyDaysAgo);
  while (cursor <= now) {
    const wd = cursor.getUTCDay();
    weekdayCounts[wd] = (weekdayCounts[wd] ?? 0) + 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Parallel reads for all franchisees.
  const [
    branchesRes,
    studentsRes,
    lessonsRes,
    invoicesRes,
    completedExamsRes,
    allLeadsRes,
    convertedLeadsRes,
    availabilityRes,
  ] = await Promise.all([
    service
      .from("branches")
      .select("id, tenant_id, name, city, is_active")
      .in("tenant_id", franchiseeIds)
      .order("name"),
    service
      .from("students")
      .select("id, tenant_id, branch_id")
      .in("tenant_id", franchiseeIds),
    service
      .from("lessons")
      .select("id, tenant_id, branch_id, starts_at, ends_at")
      .in("tenant_id", franchiseeIds)
      .eq("status", "completed")
      .gte("starts_at", thirtyDaysAgoIso),
    service
      .from("invoices")
      .select("tenant_id, total_cents_incl_vat")
      .in("tenant_id", franchiseeIds)
      .eq("status", "paid")
      .gte("paid_at", thirtyDaysAgoIso),
    service
      .from("agenda_appointments")
      .select("tenant_id, result")
      .in("tenant_id", franchiseeIds)
      .eq("type", "exam")
      .eq("status", "completed")
      .not("result", "is", null),
    service
      .from("leads")
      .select("id, tenant_id, status")
      .in("tenant_id", franchiseeIds),
    service
      .from("leads")
      .select("id, tenant_id")
      .in("tenant_id", franchiseeIds)
      .eq("status", "converted"),
    // instructor_availability: weekly recurring blocks for capacity utilisation.
    service
      .from("instructor_availability")
      .select("tenant_id, weekday, start_min, end_min")
      .in("tenant_id", franchiseeIds),
  ]);

  // Surface any read errors.
  const errors = [
    [branchesRes.error, "Vestigingen"],
    [studentsRes.error, "Leerlingen"],
    [lessonsRes.error, "Lessen"],
    [invoicesRes.error, "Facturen"],
    [completedExamsRes.error, "Examens"],
    [allLeadsRes.error, "Leads"],
    [convertedLeadsRes.error, "Conversies"],
    [availabilityRes.error, "Beschikbaarheid"],
  ] as const;
  for (const [err, label] of errors) {
    if (err) throw new Error(`${label} laden mislukt: ${err.message}`);
  }

  const branches        = branchesRes.data ?? [];
  const allStudents     = studentsRes.data ?? [];
  const lessonsRecent   = lessonsRes.data ?? [];
  const paidInvoices    = invoicesRes.data ?? [];
  const completedExams  = completedExamsRes.data ?? [];
  const allLeads        = allLeadsRes.data ?? [];
  const convertedLeads  = convertedLeadsRes.data ?? [];
  const availability    = availabilityRes.data ?? [];

  // ── Build per-tenant maps ──────────────────────────────────────────────────

  const branchesByTenant   = groupBy(branches, (b) => b.tenant_id);
  const studentsByTenant   = groupBy(allStudents, (s) => s.tenant_id);
  const lessonsByTenant    = groupBy(lessonsRecent, (l) => l.tenant_id);
  const invoicesByTenant   = groupBy(paidInvoices, (i) => i.tenant_id);
  const leadsByTenant      = groupBy(allLeads, (l) => l.tenant_id);
  const convertedByTenant  = groupBy(convertedLeads, (l) => l.tenant_id);
  const examsByTenant      = groupBy(completedExams, (e) => e.tenant_id);

  // ── Capacity utilisation per tenant ───────────────────────────────────────
  // Available minutes = sum of weekly blocks × weekday occurrence count in window.
  const availableMinutesByTenant: Record<string, number> = {};
  for (const a of availability) {
    const occurrences = weekdayCounts[a.weekday as number] ?? 0;
    const blockMin    = (a.end_min as number) - (a.start_min as number);
    availableMinutesByTenant[a.tenant_id] =
      (availableMinutesByTenant[a.tenant_id] ?? 0) + occurrences * blockMin;
  }

  // Used minutes = sum of completed lesson durations in window.
  const usedMinutesByTenant: Record<string, number> = {};
  for (const l of lessonsRecent) {
    if (l.starts_at && l.ends_at) {
      const durationMin = Math.round(
        (new Date(l.ends_at as string).getTime() -
          new Date(l.starts_at as string).getTime()) /
          60_000,
      );
      usedMinutesByTenant[l.tenant_id] =
        (usedMinutesByTenant[l.tenant_id] ?? 0) + durationMin;
    }
  }

  // ── Build per-branch lookup ────────────────────────────────────────────────
  // students and lessons carry a nullable branch_id
  const studentsByBranch = groupBy(
    allStudents.filter((s) => s.branch_id),
    (s) => s.branch_id as string,
  );
  const lessonsByBranch = groupBy(
    lessonsRecent.filter((l) => l.branch_id),
    (l) => l.branch_id as string,
  );

  // ── Assemble locations ────────────────────────────────────────────────────
  const locations: FranchiseeLocation[] = franchisees.map((f) => {
    const tenantBranches  = branchesByTenant[f.id]  ?? [];
    const tenantStudents  = studentsByTenant[f.id]  ?? [];
    const tenantLessons   = lessonsByTenant[f.id]   ?? [];
    const tenantInvoices  = invoicesByTenant[f.id]  ?? [];
    const tenantLeads     = leadsByTenant[f.id]     ?? [];
    const tenantConverted = convertedByTenant[f.id] ?? [];
    const tenantExams     = examsByTenant[f.id]     ?? [];

    const revenueCents = tenantInvoices.reduce(
      (sum, inv) => sum + ((inv.total_cents_incl_vat as number) ?? 0),
      0,
    );

    const passed = tenantExams.filter((e) => e.result === "geslaagd").length;
    const examPassRate =
      tenantExams.length > 0
        ? Math.round((passed / tenantExams.length) * 100)
        : null;

    const leadConversionRate =
      tenantLeads.length > 0
        ? Math.round((tenantConverted.length / tenantLeads.length) * 100)
        : null;

    // Capacity utilisation.
    const availMins = availableMinutesByTenant[f.id] ?? 0;
    const usedMins  = usedMinutesByTenant[f.id]  ?? 0;
    const capacityUtilisation =
      availMins > 0
        ? Math.min(100, Math.round((usedMins / availMins) * 100))
        : null;

    // Per-branch breakdown.
    const branchRows: FranchiseeLocationBranch[] = tenantBranches.map((b) => ({
      id: b.id,
      name: b.name,
      city: (b.city as string | null) ?? null,
      is_active: b.is_active as boolean,
      active_students: (studentsByBranch[b.id] ?? []).length,
      lessons_last_30d: (lessonsByBranch[b.id] ?? []).length,
    }));

    return {
      tenant_id: f.id,
      tenant_name: f.name,
      tenant_slug: f.slug,
      branches: branchRows,
      active_students: tenantStudents.length,
      lessons_last_30d: tenantLessons.length,
      revenue_last_30d_cents: revenueCents,
      exam_pass_rate: examPassRate,
      lead_conversion_rate: leadConversionRate,
      capacity_utilisation: capacityUtilisation,
    };
  });

  const totals = {
    franchisees: locations.length,
    active_students: locations.reduce((s, l) => s + l.active_students, 0),
    lessons_last_30d: locations.reduce((s, l) => s + l.lessons_last_30d, 0),
    revenue_last_30d_cents: locations.reduce((s, l) => s + l.revenue_last_30d_cents, 0),
  };

  return {
    franchisegever_id: franchisegever.id,
    franchisegever_name: franchisegever.name,
    locations,
    totals,
  };
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
