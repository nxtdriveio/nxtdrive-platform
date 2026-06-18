import type { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

const TZ = "Europe/Amsterdam";

/**
 * Milliseconds to add to a UTC instant so that, when read in `TZ`, it shows
 * the same wall-clock time. Used to derive the UTC instant of a local
 * midnight (DST-aware).
 */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map["year"]),
    Number(map["month"]) - 1,
    Number(map["day"]),
    Number(map["hour"] === "24" ? "0" : map["hour"]),
    Number(map["minute"]),
    Number(map["second"]),
  );
  return asUTC - date.getTime();
}

/** Calendar date (YYYY-MM-DD) of `date` in the Amsterdam timezone. */
export function amsterdamYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC instant corresponding to local midnight (00:00 Amsterdam) of `ymd`. */
export function startOfDayUtc(ymd: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  const offset = tzOffsetMs(guess);
  return new Date(guess.getTime() - offset);
}

/** Add `n` days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** First calendar day of the month after the one containing `ymd`. */
export function firstOfNextMonth(ymd: string): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7)); // 1-12
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

export type DashboardKpis = {
  activeStudents: number;
  lessonsToday: number;
  openLeads: number;
  revenueThisMonthCents: number;
  leadsToFollowUp: number;
  openInvoices: number;
  openInvoiceCents: number;
  openTasks: number;
  examsThisWeek: number;
};

/**
 * Live, tenant-scoped KPIs for the backoffice dashboard. Every query is
 * filtered by `tenantId` and runs under the caller's session, so Supabase RLS
 * provides defence-in-depth. Read-only aggregations — no mutations.
 */
export async function getDashboardKpis(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<DashboardKpis> {
  const now = new Date();
  const todayYmd = amsterdamYmd(now);
  const todayStart = startOfDayUtc(todayYmd).toISOString();
  const tomorrowStart = startOfDayUtc(addDays(todayYmd, 1)).toISOString();
  const nextWeekStart = startOfDayUtc(addDays(todayYmd, 7)).toISOString();
  const monthStartYmd = `${todayYmd.slice(0, 7)}-01`;
  const monthStart = startOfDayUtc(monthStartYmd).toISOString();
  const nextMonthStart = startOfDayUtc(firstOfNextMonth(monthStartYmd)).toISOString();

  const [
    activeStudents,
    lessonsToday,
    openLeads,
    leadsToFollowUp,
    openInvoices,
    openTasks,
    examsThisWeek,
    paidThisMonth,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("active", true),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("starts_at", todayStart)
      .lt("starts_at", tomorrowStart)
      .not("status", "in", "(cancelled_with_refund,cancelled_no_refund)"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["new", "contacted", "package_advised"]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "new"),
    supabase
      .from("invoices")
      .select("id, total_cents", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "open"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("archived_at", null),
    supabase
      .from("agenda_appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("type", "exam")
      .gte("starts_at", todayStart)
      .lt("starts_at", nextWeekStart)
      .not("status", "in", "(cancelled,deleted)"),
    supabase
      .from("invoices")
      .select("total_cents")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("paid_at", monthStart)
      .lt("paid_at", nextMonthStart),
  ]);

  const revenueThisMonthCents = (paidThisMonth.data ?? []).reduce(
    (sum, row) => sum + (row.total_cents ?? 0),
    0,
  );

  return {
    activeStudents: activeStudents.count ?? 0,
    lessonsToday: lessonsToday.count ?? 0,
    openLeads: openLeads.count ?? 0,
    revenueThisMonthCents,
    leadsToFollowUp: leadsToFollowUp.count ?? 0,
    openInvoices: openInvoices.count ?? 0,
    openInvoiceCents: (openInvoices.data ?? []).reduce(
      (sum, row) => sum + ((row.total_cents as number | null) ?? 0),
      0,
    ),
    openTasks: openTasks.count ?? 0,
    examsThisWeek: examsThisWeek.count ?? 0,
  };
}

export type ReportRow = {
  date: string;
  lessonsGiven: number;
  revenueCents: number;
  newLeads: number;
};

export type Report = {
  from: string;
  to: string;
  rows: ReportRow[];
  totals: { lessonsGiven: number; revenueCents: number; newLeads: number };
};

/** Default report range: first day of the current month → today (Amsterdam). */
export function defaultReportRange(): { from: string; to: string } {
  const today = amsterdamYmd(new Date());
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/**
 * Tenant-scoped activity report over an inclusive [from, to] date range,
 * bucketed per Amsterdam calendar day. Revenue is taken strictly from paid
 * invoice totals.
 */
export async function getReport(
  supabase: SupabaseServerClient,
  tenantId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Report> {
  const rangeStart = startOfDayUtc(fromYmd).toISOString();
  const rangeEnd = startOfDayUtc(addDays(toYmd, 1)).toISOString();

  const [lessons, invoices, leads] = await Promise.all([
    supabase
      .from("lessons")
      .select("starts_at")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .gte("starts_at", rangeStart)
      .lt("starts_at", rangeEnd),
    supabase
      .from("invoices")
      .select("total_cents, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("paid_at", rangeStart)
      .lt("paid_at", rangeEnd),
    supabase
      .from("leads")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", rangeStart)
      .lt("created_at", rangeEnd),
  ]);

  const buckets = new Map<string, ReportRow>();
  for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) {
    buckets.set(d, { date: d, lessonsGiven: 0, revenueCents: 0, newLeads: 0 });
  }

  const bump = (ts: string | null, apply: (row: ReportRow) => void) => {
    if (!ts) return;
    const day = amsterdamYmd(new Date(ts));
    const row = buckets.get(day);
    if (row) apply(row);
  };

  for (const l of lessons.data ?? []) {
    bump(l.starts_at as string | null, (r) => (r.lessonsGiven += 1));
  }
  for (const inv of invoices.data ?? []) {
    bump(
      inv.paid_at as string | null,
      (r) => (r.revenueCents += (inv.total_cents as number | null) ?? 0),
    );
  }
  for (const lead of leads.data ?? []) {
    bump(lead.created_at as string | null, (r) => (r.newLeads += 1));
  }

  const rows = Array.from(buckets.values());
  const totals = rows.reduce(
    (acc, r) => ({
      lessonsGiven: acc.lessonsGiven + r.lessonsGiven,
      revenueCents: acc.revenueCents + r.revenueCents,
      newLeads: acc.newLeads + r.newLeads,
    }),
    { lessonsGiven: 0, revenueCents: 0, newLeads: 0 },
  );

  return { from: fromYmd, to: toYmd, rows, totals };
}

export type TodayLesson = {
  id: string;
  studentId: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  studentName: string;
};

export type WeekPlanningPoint = {
  day: string;
  label: string;
  planned: number;
};

export type TodayCapacity = {
  scheduledMinutes: number;
  availableMinutes: number;
  utilizationPercent: number | null;
};

/** Today's lessons (Amsterdam day), excluding cancelled ones, time-ordered. */
export async function getTodayLessons(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<TodayLesson[]> {
  const todayYmd = amsterdamYmd(new Date());
  const todayStart = startOfDayUtc(todayYmd).toISOString();
  const tomorrowStart = startOfDayUtc(addDays(todayYmd, 1)).toISOString();

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, starts_at, ends_at, status, student_id")
    .eq("tenant_id", tenantId)
    .gte("starts_at", todayStart)
    .lt("starts_at", tomorrowStart)
    .not("status", "in", "(cancelled_with_refund,cancelled_no_refund)")
    .order("starts_at", { ascending: true });

  const rows = lessons ?? [];
  if (rows.length === 0) return [];

  const studentIds = Array.from(
    new Set(rows.map((r) => r.student_id as string)),
  );
  const { data: students } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", studentIds);

  const nameMap = new Map(
    (students ?? []).map((s) => [s.id as string, s.full_name as string]),
  );

  return rows.map((r) => ({
    id: r.id as string,
    studentId: (r.student_id as string | null) ?? null,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    status: r.status as string,
    studentName: nameMap.get(r.student_id as string) ?? "Onbekend",
  }));
}

export async function getWeekPlanning(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<WeekPlanningPoint[]> {
  const todayYmd = amsterdamYmd(new Date());
  const start = startOfDayUtc(todayYmd).toISOString();
  const end = startOfDayUtc(addDays(todayYmd, 7)).toISOString();
  const days = Array.from({ length: 7 }, (_, index) => addDays(todayYmd, index));
  const buckets = new Map(days.map((day) => [day, 0]));

  const { data } = await supabase
    .from("lessons")
    .select("starts_at")
    .eq("tenant_id", tenantId)
    .gte("starts_at", start)
    .lt("starts_at", end)
    .not("status", "in", "(cancelled_with_refund,cancelled_no_refund)");

  for (const row of data ?? []) {
    const day = amsterdamYmd(new Date(row.starts_at as string));
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }

  const fmt = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ,
    weekday: "short",
  });

  return days.map((day) => ({
    day,
    label: fmt.format(startOfDayUtc(day)),
    planned: buckets.get(day) ?? 0,
  }));
}

function weekdayForAmsterdamYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

function durationMinutes(startsAt: string | null, endsAt: string | null): number {
  if (!startsAt || !endsAt) return 0;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

function exceptionMinutes(
  startMin: number | null,
  endMin: number | null,
): number {
  const start = startMin ?? 0;
  const end = endMin ?? 1440;
  return Math.max(0, Math.min(1440, end) - Math.max(0, start));
}

export async function getTodayCapacity(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<TodayCapacity> {
  const todayYmd = amsterdamYmd(new Date());
  const todayStart = startOfDayUtc(todayYmd).toISOString();
  const tomorrowStart = startOfDayUtc(addDays(todayYmd, 1)).toISOString();
  const weekday = weekdayForAmsterdamYmd(todayYmd);

  const [lessons, weeklyAvailability, exceptions] = await Promise.all([
    supabase
      .from("lessons")
      .select("starts_at, ends_at")
      .eq("tenant_id", tenantId)
      .gte("starts_at", todayStart)
      .lt("starts_at", tomorrowStart)
      .not("status", "in", "(cancelled_with_refund,cancelled_no_refund)"),
    supabase
      .from("instructor_availability")
      .select("start_min, end_min")
      .eq("tenant_id", tenantId)
      .eq("weekday", weekday),
    supabase
      .from("instructor_availability_exception")
      .select("kind, start_min, end_min")
      .eq("tenant_id", tenantId)
      .eq("exception_date", todayYmd),
  ]);

  const scheduledMinutes = (lessons.data ?? []).reduce(
    (sum, row) =>
      sum +
      durationMinutes(
        row.starts_at as string | null,
        row.ends_at as string | null,
      ),
    0,
  );
  const baseAvailableMinutes = (weeklyAvailability.data ?? []).reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        ((row.end_min as number | null) ?? 0) -
          ((row.start_min as number | null) ?? 0),
      ),
    0,
  );
  const exceptionDelta = (exceptions.data ?? []).reduce((sum, row) => {
    const minutes = exceptionMinutes(
      row.start_min as number | null,
      row.end_min as number | null,
    );
    return row.kind === "available" ? sum + minutes : sum - minutes;
  }, 0);
  const availableMinutes = Math.max(0, baseAvailableMinutes + exceptionDelta);
  const utilizationPercent =
    availableMinutes > 0
      ? Math.min(100, Math.round((scheduledMinutes / availableMinutes) * 100))
      : null;

  return {
    scheduledMinutes,
    availableMinutes,
    utilizationPercent,
  };
}

export const LEAD_PIPELINE_STAGES = [
  "new",
  "contacted",
  "package_advised",
  "converted",
  "dropped",
] as const;

export type LeadPipeline = Record<
  (typeof LEAD_PIPELINE_STAGES)[number],
  number
>;

/** Lead counts per pipeline stage for the tenant. */
export async function getLeadsPipeline(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<LeadPipeline> {
  const { data } = await supabase
    .from("leads")
    .select("status")
    .eq("tenant_id", tenantId);

  const pipeline: LeadPipeline = {
    new: 0,
    contacted: 0,
    package_advised: 0,
    converted: 0,
    dropped: 0,
  };
  for (const row of data ?? []) {
    const status = row.status as keyof LeadPipeline;
    if (status in pipeline) pipeline[status] += 1;
  }
  return pipeline;
}

/** Validate a YYYY-MM-DD string; returns null when malformed. */
export function normalizeYmd(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Reject impossible dates (e.g. 2026-02-31 rolls over to March).
  if (d.toISOString().slice(0, 10) !== value) return null;
  return value;
}
