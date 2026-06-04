import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { amsterdamYmd, startOfDayUtc } from "./metrics";
import { LEAD_SOURCE_LABEL } from "@/lib/leads/types";
import {
  loadTenantReviewOverview,
  type ReviewOverview,
} from "@/lib/reports/review-overview";

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// ── Month helpers ─────────────────────────────────────────────────────────────

/** "YYYY-MM" for n months ago (0 = current month). */
export function monthKeyOffset(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 7);
}

/** First moment (UTC ISO) of a "YYYY-MM" month key. */
export function monthStart(key: string): string {
  return startOfDayUtc(`${key}-01`).toISOString();
}

/** First moment (UTC ISO) of the month *after* a "YYYY-MM" key. */
export function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return startOfDayUtc(`${nextY}-${String(nextM).padStart(2, "0")}-01`).toISOString();
}

/** Short NL month label for a "YYYY-MM" key (e.g. "mei"). */
export function monthLabel(key: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
  }).format(new Date(`${key}-15T12:00:00Z`));
}

/** Previous "YYYY-MM" month key. */
export function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

/** Trend % from previous to current; null when both are 0. */
export function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type MonthlyRevenuePoint = {
  month: string;
  label: string;
  cents: number;
};

export type RapportagesKpis = {
  leadsThisMonth: number;
  leadsPrevMonth: number;
  trialLessonsThisMonth: number;
  trialLessonsPrevMonth: number;
  activeStudents: number;
  revenueThisMonthCents: number;
  revenuePrevMonthCents: number;
};

export type ConversionFunnel = {
  aanvragen: number;
  proeflessen: number;
  pakket: number;
  proeflesToAanvragenPct: number;
  pakketToProeflesPct: number;
};

export type SourceBucket = {
  source: string;
  label: string;
  count: number;
  pct: number;
};

export type LessonStats = {
  completed: number;
  planned: number;
  cancelled: number;
  lateCancel: number;
};

export type ExamStats = {
  passed: number;
  failed: number;
  bijnaExamenrijp: number;
  passPct: number | null;
};

export type TegoedRow = {
  studentId: string;
  name: string;
  initials: string;
  balanceMinutes: number;
};

export type OpenInvoiceSummary = {
  count: number;
  totalCents: number;
};

export type UpcomingTrialLesson = {
  id: string;
  startsAt: string;
  status: string;
  leadName: string;
};

export type TaskRow = {
  id: string;
  title: string;
  priority: string;
  taskType: string;
};

export type StudentProgressRow = {
  studentId: string;
  name: string;
  initials: string;
  completedLessons: number;
  plannedLessons: number;
};

export type SmartAlert = {
  id: string;
  type: "lead_followup" | "low_balance" | "exam_upcoming" | "overdue_invoice";
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  timeAgo: string;
};

// ── Data functions ────────────────────────────────────────────────────────────

/** Last numMonths months of paid-invoice revenue, oldest first. */
export async function getMonthlyRevenue(
  supabase: SupabaseServerClient,
  tenantId: string,
  numMonths = 6,
): Promise<MonthlyRevenuePoint[]> {
  const keys: string[] = [];
  for (let i = numMonths - 1; i >= 0; i--) keys.push(monthKeyOffset(i));

  const fromTs = monthStart(keys[0]);
  const { data: invoices } = await supabase
    .from("invoices")
    .select("total_cents, paid_at")
    .eq("tenant_id", tenantId)
    .eq("status", "paid")
    .gte("paid_at", fromTs);

  const buckets = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const inv of invoices ?? []) {
    if (!inv.paid_at) continue;
    const key = amsterdamYmd(new Date(inv.paid_at as string)).slice(0, 7);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + ((inv.total_cents as number) ?? 0));
    }
  }

  return keys.map((k) => ({ month: k, label: monthLabel(k), cents: buckets.get(k) ?? 0 }));
}

/** KPIs with month-over-month comparison for the selected month key. */
export async function getRapportagesKpis(
  supabase: SupabaseServerClient,
  tenantId: string,
  currentMonthKey: string,
): Promise<RapportagesKpis> {
  const prev = prevMonth(currentMonthKey);
  const [cStart, cEnd, pStart, pEnd] = [
    monthStart(currentMonthKey),
    monthEnd(currentMonthKey),
    monthStart(prev),
    monthEnd(prev),
  ];

  const sumCents = (rows: { total_cents: unknown }[] | null) =>
    (rows ?? []).reduce((s, r) => s + ((r.total_cents as number) ?? 0), 0);

  const [
    leadsNow, leadsPrev, trialsNow, trialsPrev,
    activeStudents, revenueNow, revenuePrev,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", cStart).lt("created_at", cEnd),
    supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", pStart).lt("created_at", pEnd),
    supabase.from("trial_lessons").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).not("status", "in", "(cancelled,rejected)")
      .gte("created_at", cStart).lt("created_at", cEnd),
    supabase.from("trial_lessons").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).not("status", "in", "(cancelled,rejected)")
      .gte("created_at", pStart).lt("created_at", pEnd),
    supabase.from("students").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("active", true),
    supabase.from("invoices").select("total_cents")
      .eq("tenant_id", tenantId).eq("status", "paid")
      .gte("paid_at", cStart).lt("paid_at", cEnd),
    supabase.from("invoices").select("total_cents")
      .eq("tenant_id", tenantId).eq("status", "paid")
      .gte("paid_at", pStart).lt("paid_at", pEnd),
  ]);

  return {
    leadsThisMonth: leadsNow.count ?? 0,
    leadsPrevMonth: leadsPrev.count ?? 0,
    trialLessonsThisMonth: trialsNow.count ?? 0,
    trialLessonsPrevMonth: trialsPrev.count ?? 0,
    activeStudents: activeStudents.count ?? 0,
    revenueThisMonthCents: sumCents(revenueNow.data),
    revenuePrevMonthCents: sumCents(revenuePrev.data),
  };
}

/** Funnel: aanvragen → proefles → pakket for the given period. */
export async function getConversionFunnel(
  supabase: SupabaseServerClient,
  tenantId: string,
  cStart: string,
  cEnd: string,
): Promise<ConversionFunnel> {
  const [aanvragenRes, proeflesRes, pakketRes] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", cStart).lt("created_at", cEnd),
    supabase.from("trial_lessons").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).not("status", "in", "(cancelled,rejected)")
      .gte("created_at", cStart).lt("created_at", cEnd),
    supabase.from("leads").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).eq("status", "converted")
      .gte("converted_to_student_at", cStart).lt("converted_to_student_at", cEnd),
  ]);

  const aanvragen = aanvragenRes.count ?? 0;
  const proeflessen = proeflesRes.count ?? 0;
  const pakket = pakketRes.count ?? 0;

  return {
    aanvragen,
    proeflessen,
    pakket,
    proeflesToAanvragenPct: aanvragen > 0 ? Math.round((proeflessen / aanvragen) * 100) : 0,
    pakketToProeflesPct: proeflessen > 0 ? Math.round((pakket / proeflessen) * 100) : 0,
  };
}

/** Lead count per source for a donut chart. */
export async function getMarketingSources(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<SourceBucket[]> {
  const { data } = await supabase
    .from("leads").select("source").eq("tenant_id", tenantId);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const src = (row.source as string) ?? "other";
    counts.set(src, (counts.get(src) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  if (total === 0) return [];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) top.push(["other_merged", rest]);

  return top.map(([source, count]) => ({
    source,
    label:
      source === "other_merged"
        ? "Overig"
        : (LEAD_SOURCE_LABEL[source as keyof typeof LEAD_SOURCE_LABEL] ?? source),
    count,
    pct: Math.round((count / total) * 100),
  }));
}

/** Lesson statistics for a given period. */
export async function getLessonStats(
  supabase: SupabaseServerClient,
  tenantId: string,
  cStart: string,
  cEnd: string,
): Promise<LessonStats> {
  const { data } = await supabase
    .from("lessons").select("status, cancelled_hours_before")
    .eq("tenant_id", tenantId).gte("starts_at", cStart).lt("starts_at", cEnd);

  let completed = 0, planned = 0, cancelled = 0, lateCancel = 0;
  for (const r of data ?? []) {
    const status = r.status as string;
    if (status === "completed" || status === "in_progress") completed++;
    else if (status === "planned") planned++;
    else if (status === "cancelled_with_refund" || status === "cancelled_no_refund") {
      cancelled++;
      const hrs = r.cancelled_hours_before as number | null;
      if (hrs !== null && hrs < 24) lateCancel++;
    }
  }
  return { completed, planned, cancelled, lateCancel };
}

/** Exam results for agenda_appointments with type=exam in a given period. */
export async function getExamStats(
  supabase: SupabaseServerClient,
  tenantId: string,
  cStart: string,
  cEnd: string,
  bijnaExamenrijp = 0,
): Promise<ExamStats> {
  const { data } = await supabase
    .from("agenda_appointments").select("result")
    .eq("tenant_id", tenantId).eq("type", "exam")
    .not("result", "is", null)
    .gte("starts_at", cStart).lt("starts_at", cEnd);

  let passed = 0, failed = 0;
  for (const r of data ?? []) {
    if ((r.result as string) === "passed") passed++;
    else if ((r.result as string) === "failed") failed++;
  }

  const total = passed + failed;
  return {
    passed,
    failed,
    bijnaExamenrijp,
    passPct: total > 0 ? Math.round((passed / total) * 100) : null,
  };
}

/** Top N students by current credit balance (minutes). */
export async function getTopTegoed(
  supabase: SupabaseServerClient,
  tenantId: string,
  limit = 5,
): Promise<TegoedRow[]> {
  const [studentsRes, ledgerRes] = await Promise.all([
    supabase.from("students").select("id, full_name")
      .eq("tenant_id", tenantId).eq("active", true),
    supabase.from("credit_ledger").select("student_id, delta")
      .eq("tenant_id", tenantId),
  ]);

  const balanceMap = new Map<string, number>();
  for (const e of ledgerRes.data ?? []) {
    const sid = e.student_id as string;
    balanceMap.set(sid, (balanceMap.get(sid) ?? 0) + (e.delta as number));
  }

  function toInitials(name: string): string {
    const parts = (name ?? "").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return (studentsRes.data ?? [])
    .map((s) => ({
      studentId: s.id as string,
      name: (s.full_name as string) ?? "Onbekend",
      initials: toInitials((s.full_name as string) ?? ""),
      balanceMinutes: balanceMap.get(s.id as string) ?? 0,
    }))
    .filter((r) => r.balanceMinutes > 0)
    .sort((a, b) => b.balanceMinutes - a.balanceMinutes)
    .slice(0, limit);
}

/** Count and total of open invoices for the tenant. */
export async function getOpenInvoiceSummary(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<OpenInvoiceSummary> {
  const { data } = await supabase
    .from("invoices").select("total_cents")
    .eq("tenant_id", tenantId).eq("status", "open");

  const rows = data ?? [];
  return {
    count: rows.length,
    totalCents: rows.reduce((s, r) => s + ((r.total_cents as number) ?? 0), 0),
  };
}

/** Count of active students without a future planned lesson. */
export async function getStudentsWithoutNextLesson(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<number> {
  const now = new Date().toISOString();
  const [studentsRes, futureLessonsRes] = await Promise.all([
    supabase.from("students").select("id").eq("tenant_id", tenantId).eq("active", true),
    supabase.from("lessons").select("student_id")
      .eq("tenant_id", tenantId).eq("status", "planned").gt("starts_at", now),
  ]);

  const withNext = new Set((futureLessonsRes.data ?? []).map((r) => r.student_id as string));
  return (studentsRes.data ?? []).filter((r) => !withNext.has(r.id as string)).length;
}

/** Upcoming confirmed/provisional trial lessons, sorted by start time. */
export async function getUpcomingTrialLessons(
  supabase: SupabaseServerClient,
  tenantId: string,
  limit = 4,
): Promise<UpcomingTrialLesson[]> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("trial_lessons")
    .select("id, starts_at, status, lead_id, leads(full_name)")
    .eq("tenant_id", tenantId)
    .in("status", ["provisional", "confirmed"])
    .gt("starts_at", now)
    .order("starts_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((r) => {
    const raw = r.leads as unknown;
    const lead = Array.isArray(raw)
      ? (raw[0] as { full_name: string } | undefined)
      : (raw as { full_name: string } | null);
    return {
      id: r.id as string,
      startsAt: r.starts_at as string,
      status: r.status as string,
      leadName: lead?.full_name ?? "Onbekend",
    };
  });
}

/** Open (non-archived) tasks for the tenant, newest first. */
export async function getOpenTasks(
  supabase: SupabaseServerClient,
  tenantId: string,
  limit = 5,
): Promise<TaskRow[]> {
  const { data } = await supabase
    .from("tasks").select("id, title, priority, task_type")
    .eq("tenant_id", tenantId).is("archived_at", null)
    .order("created_at", { ascending: false }).limit(limit);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? "",
    priority: (r.priority as string) ?? "low",
    taskType: (r.task_type as string) ?? "manual",
  }));
}

/** Top N students by completed lesson count, for the progress panel. */
export async function getStudentProgressSummary(
  supabase: SupabaseServerClient,
  tenantId: string,
  limit = 5,
): Promise<StudentProgressRow[]> {
  const [studentsRes, lessonsRes] = await Promise.all([
    supabase.from("students").select("id, full_name")
      .eq("tenant_id", tenantId).eq("active", true),
    supabase.from("lessons").select("student_id, status")
      .eq("tenant_id", tenantId)
      .in("status", ["planned", "completed", "in_progress"]),
  ]);

  function toInitials(name: string): string {
    const parts = (name ?? "").trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const completedMap = new Map<string, number>();
  const plannedMap = new Map<string, number>();
  for (const l of lessonsRes.data ?? []) {
    const sid = l.student_id as string;
    const status = l.status as string;
    if (status === "completed" || status === "in_progress") {
      completedMap.set(sid, (completedMap.get(sid) ?? 0) + 1);
    } else if (status === "planned") {
      plannedMap.set(sid, (plannedMap.get(sid) ?? 0) + 1);
    }
  }

  return (studentsRes.data ?? [])
    .map((s) => ({
      studentId: s.id as string,
      name: (s.full_name as string) ?? "Onbekend",
      initials: toInitials((s.full_name as string) ?? ""),
      completedLessons: completedMap.get(s.id as string) ?? 0,
      plannedLessons: plannedMap.get(s.id as string) ?? 0,
    }))
    .sort((a, b) => b.completedLessons - a.completedLessons)
    .slice(0, limit);
}

/** Computed smart alerts for the dashboard (lead, balance, exam, invoice). */
export async function getSmartAlerts(
  supabase: SupabaseServerClient,
  tenantId: string,
): Promise<SmartAlert[]> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const alerts: SmartAlert[] = [];

  const [overdueLeadsRes, studentsRes, ledgerRes, upcomingExamsRes, overdueInvRes] =
    await Promise.all([
      supabase.from("leads").select("id, full_name, created_at")
        .eq("tenant_id", tenantId).eq("status", "new")
        .lt("created_at", twentyFourHoursAgo)
        .order("created_at", { ascending: false }).limit(1),
      supabase.from("students").select("id, full_name")
        .eq("tenant_id", tenantId).eq("active", true),
      supabase.from("credit_ledger").select("student_id, delta")
        .eq("tenant_id", tenantId),
      supabase.from("agenda_appointments").select("id, starts_at")
        .eq("tenant_id", tenantId).eq("type", "exam").eq("status", "planned")
        .gt("starts_at", now.toISOString()).lt("starts_at", fourteenDaysFromNow).limit(1),
      supabase.from("invoices").select("id, total_cents, due_date")
        .eq("tenant_id", tenantId).eq("status", "open")
        .lt("due_date", now.toISOString().slice(0, 10)).limit(2),
    ]);

  if ((overdueLeadsRes.data ?? []).length > 0) {
    const lead = overdueLeadsRes.data![0];
    alerts.push({
      id: `lead_${lead.id}`,
      type: "lead_followup",
      title: "Lead niet opgevolgd",
      description: `${(lead.full_name as string) ?? "Nieuwe lead"} wacht al meer dan 24 uur`,
      severity: "high",
      timeAgo: _timeAgo(lead.created_at as string),
    });
  }

  const balanceMap = new Map<string, number>();
  for (const e of ledgerRes.data ?? []) {
    const sid = e.student_id as string;
    balanceMap.set(sid, (balanceMap.get(sid) ?? 0) + (e.delta as number));
  }
  const lowBalance = (studentsRes.data ?? []).filter(
    (s) => (balanceMap.get(s.id as string) ?? 0) < 120,
  );
  if (lowBalance.length > 0) {
    const s = lowBalance[0];
    const extra = lowBalance.length > 1 ? ` (+${lowBalance.length - 1} meer)` : "";
    alerts.push({
      id: `balance_${s.id as string}`,
      type: "low_balance",
      title: "Leerling bijna zonder saldo",
      description: `${(s.full_name as string) ?? "Leerling"} heeft < 2 lessen tegoed${extra}`,
      severity: "medium",
      timeAgo: "nu",
    });
  }

  if ((upcomingExamsRes.data ?? []).length > 0) {
    const exam = upcomingExamsRes.data![0];
    const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" });
    alerts.push({
      id: `exam_${exam.id as string}`,
      type: "exam_upcoming",
      title: "Examen aanstaande",
      description: `Rijexamen gepland op ${dateFmt.format(new Date(exam.starts_at as string))}`,
      severity: "low",
      timeAgo: _timeAgo(exam.starts_at as string),
    });
  }

  for (const inv of (overdueInvRes.data ?? []).slice(0, 2)) {
    const euros = ((inv.total_cents as number) / 100).toLocaleString("nl-NL", {
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
    alerts.push({
      id: `invoice_${inv.id as string}`,
      type: "overdue_invoice",
      title: "Factuur te laat betaald",
      description: `€${euros} — verlopen op ${inv.due_date ?? "onbekend"}`,
      severity: "medium",
      timeAgo: inv.due_date ? _timeAgo(`${String(inv.due_date)}T12:00:00Z`) : "—",
    });
  }

  return alerts;
}

function _timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (hours < 1) return "zojuist";
  if (hours < 24) return `${hours} uur geleden`;
  if (days === 1) return "gisteren";
  return `${days} dagen geleden`;
}

export type { ReviewOverview };
export { loadTenantReviewOverview };
