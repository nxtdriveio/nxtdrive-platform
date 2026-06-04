import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform-level growth analytics — reads all tenants, students, lessons, leads
 * via the service-role client (no RLS filter). Server-only.
 *
 * Two distinct student datasets:
 *  - allActiveStudents  → total per-tenant student count (used in "Actiefste rijscholen")
 *  - recentStudents     → students created in the last 30 days (ONLY for inactivity detection)
 *
 * MRR is computed from active tenants only — those with a lesson (starts_at) or a
 * newly-created student in the last 30 days. Inactive/churned tenants are excluded.
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
  month: string;   // "YYYY-MM"
  label: string;   // "jan '26"
  newTenants: number;
  cumulative: number;
};

export type ActiveTenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  /** Total active students for this tenant (all-time, active = true). */
  studentCount: number;
  /** Lessons with starts_at in the current calendar month. */
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
  /** Top-5 tenants by total student count + lessons this month. */
  activeTenants: ActiveTenantRow[];
  /** Tenants with no lesson (starts_at) and no new student in the last 30 days. */
  inactiveTenants: InactiveTenantRow[];
  totalTenantsAllTime: number;
  /**
   * Set of tenant IDs that have recent activity (lesson or student in the last
   * 30 days). Used by the admin page to restrict MRR to paying/active accounts.
   */
  activeTenantIds: Set<string>;
};

// ── Data fetching ─────────────────────────────────────────────────────────────

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
    allActiveStudentsRes,
    recentStudentsRes,
    recentLessonsRes,
    leadsRes,
    lessonsThisMonthRes,
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, name, slug, plan, created_at")
      .order("created_at", { ascending: true }),

    // ALL currently-active students → used to compute per-tenant student count
    // for the "Actiefste rijscholen" table ranking.
    service
      .from("students")
      .select("id, tenant_id")
      .eq("active", true),

    // Students created in the last 30 days → inactivity detection signal only.
    // A tenant that onboarded a new student recently is considered active even
    // if they haven't had a lesson yet in that window.
    service
      .from("students")
      .select("id, tenant_id")
      .gte("created_at", thirtyDaysAgo),

    // Recent lessons: filter on starts_at (the actual lesson moment), NOT created_at.
    // A lesson created months ago but scheduled this week IS recent activity.
    service
      .from("lessons")
      .select("id, tenant_id")
      .gte("starts_at", thirtyDaysAgo),

    service.from("leads").select("id, tenant_id"),

    service
      .from("lessons")
      .select("id, tenant_id")
      .gte("starts_at", currentMonthStart),
  ]);

  const allTenants = tenantsRes.data ?? [];
  const allActiveStudents = allActiveStudentsRes.data ?? [];
  const recentStudents = recentStudentsRes.data ?? [];
  const recentLessons = recentLessonsRes.data ?? [];
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

  let cumulative = 0;
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

  // Total active students (all-time) — determines ranking in "Actiefste rijscholen".
  const studentsByTenant = new Map<string, number>();
  for (const s of allActiveStudents) {
    const tid = s.tenant_id as string;
    studentsByTenant.set(tid, (studentsByTenant.get(tid) ?? 0) + 1);
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

  // ── Activity window for inactivity + MRR gating ──────────────────────────
  // A tenant is "active" (i.e. NOT churn-risk) when it has:
  //   (a) at least one lesson with starts_at >= 30 days ago, OR
  //   (b) at least one student created in the last 30 days.
  // This set is also used to restrict MRR to only actively-using tenants.

  const activeTenantIds = new Set<string>();
  for (const l of recentLessons) {
    activeTenantIds.add(l.tenant_id as string);
  }
  for (const s of recentStudents) {
    activeTenantIds.add(s.tenant_id as string);
  }

  // ── Top-5 active tenants ──────────────────────────────────────────────────
  // Ranked by total student count (all-time), then lessons this month.

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
        b.lessonsThisMonth - a.lessonsThisMonth ||
        b.leadCount - a.leadCount,
    )
    .slice(0, 5);

  // ── Inactive tenants ──────────────────────────────────────────────────────

  const inactiveTenants: InactiveTenantRow[] = allTenants
    .filter((t) => !activeTenantIds.has(t.id as string))
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
    activeTenantIds,
  };
}
