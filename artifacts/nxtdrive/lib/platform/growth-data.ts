import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-level growth analytics — reads all tenants, students, lessons, leads
 * via the service-role client (no RLS filter). Server-only.
 */

// ── Month helpers ─────────────────────────────────────────────────────────────

function monthKeyOf(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toISOString().slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "UTC",
    month: "short",
    year: "2-digit",
  }).format(new Date(`${key}-15T12:00:00Z`));
}

/** "YYYY-MM" keys for the last n months (oldest first, current month last). */
function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i);
    d.setUTCDate(1);
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TenantGrowthPoint = {
  month: string;    // "YYYY-MM"
  label: string;   // "Jan '26"
  newTenants: number;
  cumulative: number;
};

export type ActiveTenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  studentCount: number;
  lessonsThisMonth: number;
  leadCount: number;
};

export type InactiveTenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  daysSinceCreation: number;
};

export type PlatformGrowthData = {
  tenantGrowth: TenantGrowthPoint[];
  activeTenants: ActiveTenantRow[];
  inactiveTenants: InactiveTenantRow[];
  totalTenantsAllTime: number;
};

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Loads all platform-wide growth analytics using the service-role client.
 * Runs all queries in parallel and computes derived metrics in-process.
 */
export async function getPlatformGrowthData(
  service: SupabaseClient,
): Promise<PlatformGrowthData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();

  const [
    tenantsRes,
    studentsRes,
    lessonsRes,
    leadsRes,
    lessonsThisMonthRes,
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, name, slug, plan, created_at")
      .order("created_at", { ascending: true }),
    service.from("students").select("id, tenant_id, active"),
    service
      .from("lessons")
      .select("id, tenant_id, created_at")
      .gte("created_at", thirtyDaysAgo),
    service.from("leads").select("id, tenant_id"),
    service
      .from("lessons")
      .select("id, tenant_id")
      .gte("starts_at", currentMonthStart),
  ]);

  const allTenants = tenantsRes.data ?? [];
  const allStudents = studentsRes.data ?? [];
  const recentLessons = lessonsRes.data ?? [];
  const allLeads = leadsRes.data ?? [];
  const lessonsThisMonth = lessonsThisMonthRes.data ?? [];

  // ── Tenant growth per month ───────────────────────────────────────────────

  const keys = lastNMonthKeys(12);
  const newPerMonth = new Map<string, number>(keys.map((k) => [k, 0]));

  for (const t of allTenants) {
    const key = monthKeyOf(t.created_at as string);
    if (newPerMonth.has(key)) {
      newPerMonth.set(key, (newPerMonth.get(key) ?? 0) + 1);
    }
  }

  // Cumulative: total tenants created on or before each month
  let cumulative = 0;
  // First count tenants before the 12-month window
  const windowStart = keys[0];
  for (const t of allTenants) {
    if (monthKeyOf(t.created_at as string) < windowStart) cumulative++;
  }

  const tenantGrowth: TenantGrowthPoint[] = keys.map((month) => {
    cumulative += newPerMonth.get(month) ?? 0;
    return {
      month,
      label: monthLabel(month),
      newTenants: newPerMonth.get(month) ?? 0,
      cumulative,
    };
  });

  // ── Per-tenant counts ─────────────────────────────────────────────────────

  const studentsByTenant = new Map<string, number>();
  for (const s of allStudents) {
    if ((s.active as boolean)) {
      const tid = s.tenant_id as string;
      studentsByTenant.set(tid, (studentsByTenant.get(tid) ?? 0) + 1);
    }
  }

  const lessonsThisMonthByTenant = new Map<string, number>();
  for (const l of lessonsThisMonth) {
    const tid = l.tenant_id as string;
    lessonsThisMonthByTenant.set(tid, (lessonsThisMonthByTenant.get(tid) ?? 0) + 1);
  }

  const leadsByTenant = new Map<string, number>();
  for (const l of allLeads) {
    const tid = l.tenant_id as string;
    leadsByTenant.set(tid, (leadsByTenant.get(tid) ?? 0) + 1);
  }

  // ── Active tenants top-5 ─────────────────────────────────────────────────

  const activeTenants: ActiveTenantRow[] = allTenants
    .map((t) => ({
      id: t.id as string,
      name: t.name as string,
      slug: t.slug as string,
      plan: (t.plan as string) ?? "start",
      studentCount: studentsByTenant.get(t.id as string) ?? 0,
      lessonsThisMonth: lessonsThisMonthByTenant.get(t.id as string) ?? 0,
      leadCount: leadsByTenant.get(t.id as string) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.studentCount - a.studentCount ||
        b.lessonsThisMonth - a.lessonsThisMonth,
    )
    .slice(0, 5);

  // ── Inactive tenants ──────────────────────────────────────────────────────

  const recentActivityByTenant = new Set<string>();
  for (const l of recentLessons) {
    recentActivityByTenant.add(l.tenant_id as string);
  }
  for (const s of allStudents) {
    if ((s.active as boolean)) {
      recentActivityByTenant.add(s.tenant_id as string);
    }
  }

  const inactiveTenants: InactiveTenantRow[] = allTenants
    .filter((t) => !recentActivityByTenant.has(t.id as string))
    .map((t) => {
      const createdAt = t.created_at as string;
      const daysSince = Math.floor(
        (now.getTime() - new Date(createdAt).getTime()) / 86_400_000,
      );
      return {
        id: t.id as string,
        name: t.name as string,
        slug: t.slug as string,
        plan: (t.plan as string) ?? "start",
        createdAt,
        daysSinceCreation: daysSince,
      };
    })
    .sort((a, b) => a.daysSinceCreation - b.daysSinceCreation);

  return {
    tenantGrowth,
    activeTenants,
    inactiveTenants,
    totalTenantsAllTime: allTenants.length,
  };
}
