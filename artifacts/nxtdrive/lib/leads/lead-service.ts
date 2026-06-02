import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Lead,
  LeadActionStatus,
  LeadEvent,
  LeadStatus,
} from "@/lib/leads/types";

// ---------------------------------------------------------------------------
// Dashboard read layer (Task #54). Server-component reads of the denormalised
// leads table. All queries are tenant-scoped; RLS still applies because the
// dashboard reads with the request-scoped client, but we always pass tenant_id
// explicitly as defence-in-depth.
// ---------------------------------------------------------------------------

const LEAD_COLUMNS =
  "id, tenant_id, status, source, full_name, email, phone, postcode, message, assigned_to, " +
  "action_status, priority, lead_score, lead_score_reason, assigned_owner_id, assigned_instructor_id, " +
  "assigned_location_id, preferred_license_goal, preferred_transmission, role_type, birth_date, city, " +
  "neighborhood, pickup_address, pickup_place_id, pickup_lat, pickup_lng, desired_start_date, " +
  "last_activity_at, next_action_at, converted_to_student_at, lost_at, lost_reason, source_detail, " +
  "created_at, updated_at";

const OPEN_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "intake_completed",
  "trial_offered",
  "trial_planned",
  "trial_confirmed",
  "trial_completed",
  "assessment_pending",
  "assessment_done",
  "package_advised",
  "payment_pending",
  "paid",
  "follow_up",
];

// Funnel-oriented dashboard tabs (spec): Vandaag / Nieuwe aanvragen /
// Proeflessen / Pakketadvies / Opvolgen / Gewonnen / Afgehaakt.
export type DashboardTab =
  | "today"
  | "new_requests"
  | "trials"
  | "package_advice"
  | "follow_up"
  | "won"
  | "lost";

export const DASHBOARD_TABS: readonly DashboardTab[] = [
  "today",
  "new_requests",
  "trials",
  "package_advice",
  "follow_up",
  "won",
  "lost",
];

/** Status groups behind each funnel tab. */
const NEW_REQUEST_STATUSES: readonly LeadStatus[] = [
  "new",
  "contacted",
  "intake_completed",
  "trial_offered",
];
const TRIAL_STATUSES: readonly LeadStatus[] = [
  "trial_planned",
  "trial_confirmed",
  "trial_completed",
];
const PACKAGE_STATUSES: readonly LeadStatus[] = [
  "assessment_pending",
  "assessment_done",
  "package_advised",
  "payment_pending",
  "paid",
];

/** Optional dashboard filters (column-backed, all tenant-scoped). */
export type LeadFilters = {
  status?: LeadStatus;
  priority?: "low" | "normal" | "high" | "urgent";
  source?: string;
  city?: string;
  neighborhood?: string;
  transmission?: "manual" | "automatic";
  minLeadScore?: number;
  desiredStartFrom?: string;
  desiredStartTo?: string;
  overdueOnly?: boolean;
};

export type LeadKpis = {
  todayCount: number;
  openCount: number;
  waitingCount: number;
  overdueCount: number;
  wonCount: number;
  lostCount: number;
  hotCount: number;
};

function endOfTodayIso(now: number): string {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Apply the optional column-backed filters to a leads query.
 *
 * Generic over the builder type so the caller keeps its exact query type. The
 * body uses a local `any` view to avoid TS2589 (the Supabase filter-builder
 * chain is too deep to re-infer at every step).
 */
function applyFilters<T>(q: T, filters: LeadFilters, nowIso: string): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let out = q as any;
  if (filters.status) out = out.eq("status", filters.status);
  if (filters.priority) out = out.eq("priority", filters.priority);
  if (filters.source) out = out.eq("source", filters.source);
  if (filters.city) out = out.ilike("city", `%${filters.city}%`);
  if (filters.neighborhood) out = out.ilike("neighborhood", `%${filters.neighborhood}%`);
  if (filters.transmission) out = out.eq("preferred_transmission", filters.transmission);
  if (typeof filters.minLeadScore === "number") out = out.gte("lead_score", filters.minLeadScore);
  if (filters.desiredStartFrom) out = out.gte("desired_start_date", filters.desiredStartFrom);
  if (filters.desiredStartTo) out = out.lte("desired_start_date", filters.desiredStartTo);
  if (filters.overdueOnly) out = out.lt("next_action_at", nowIso);
  return out as T;
}

const PRIORITY_WEIGHT: Record<Lead["priority"], number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

/**
 * "Next best actions" ordering contract:
 *   overdue first → urgent (priority) → high lead score → due_at → desired start.
 * Sorted in JS because "overdue" is a now-relative bucket not expressible as a
 * single SQL ORDER BY.
 */
export function sortByNextBestAction(leads: Lead[], now: number): Lead[] {
  return [...leads].sort((a, b) => {
    const aOverdue = a.next_action_at !== null && new Date(a.next_action_at).getTime() < now;
    const bOverdue = b.next_action_at !== null && new Date(b.next_action_at).getTime() < now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    const prio = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (prio !== 0) return prio;

    if (b.lead_score !== a.lead_score) return b.lead_score - a.lead_score;

    const aDue = a.next_action_at ? new Date(a.next_action_at).getTime() : Infinity;
    const bDue = b.next_action_at ? new Date(b.next_action_at).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;

    const aStart = a.desired_start_date ? new Date(a.desired_start_date).getTime() : Infinity;
    const bStart = b.desired_start_date ? new Date(b.desired_start_date).getTime() : Infinity;
    return aStart - bStart;
  });
}

/** Leads that need action today or are overdue, ordered next-best-action first. */
export async function getTodayLeads(
  client: SupabaseClient,
  tenantId: string,
  now: number = Date.now(),
  filters: LeadFilters = {},
): Promise<Lead[]> {
  let q = client
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("action_status", "awaiting_us" satisfies LeadActionStatus)
    .in("status", OPEN_STATUSES as unknown as string[])
    .or(`next_action_at.is.null,next_action_at.lte.${endOfTodayIso(now)}`);
  q = applyFilters(q, filters, new Date(now).toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return sortByNextBestAction((data ?? []) as unknown as Lead[], now);
}

export async function getLeadsForTab(
  client: SupabaseClient,
  tenantId: string,
  tab: DashboardTab,
  now: number = Date.now(),
  filters: LeadFilters = {},
): Promise<Lead[]> {
  if (tab === "today") return getTodayLeads(client, tenantId, now, filters);

  let q = client.from("leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId);

  if (tab === "new_requests") {
    q = q.in("status", NEW_REQUEST_STATUSES as unknown as string[]);
  } else if (tab === "trials") {
    q = q.in("status", TRIAL_STATUSES as unknown as string[]);
  } else if (tab === "package_advice") {
    q = q.in("status", PACKAGE_STATUSES as unknown as string[]);
  } else if (tab === "follow_up") {
    // "Opvolgen": parked follow-ups + everything waiting on the lead.
    q = q
      .in("status", OPEN_STATUSES as unknown as string[])
      .or(
        `status.eq.follow_up,action_status.eq.${"awaiting_lead" satisfies LeadActionStatus}`,
      );
  } else if (tab === "won") {
    q = q.eq("status", "converted" satisfies LeadStatus);
  } else if (tab === "lost") {
    q = q.eq("status", "dropped" satisfies LeadStatus);
  }

  q = applyFilters(q, filters, new Date(now).toISOString());

  const { data, error } = await q
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Lead[];
}

export async function getLeadKpis(
  client: SupabaseClient,
  tenantId: string,
  now: number = Date.now(),
): Promise<LeadKpis> {
  const base = () => client.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const endToday = endOfTodayIso(now);
  const nowIso = new Date(now).toISOString();

  const [today, open, waiting, overdue, won, lost, hot] = await Promise.all([
    base()
      .eq("action_status", "awaiting_us")
      .in("status", OPEN_STATUSES as unknown as string[])
      .or(`next_action_at.is.null,next_action_at.lte.${endToday}`),
    base().in("status", OPEN_STATUSES as unknown as string[]),
    base()
      .eq("action_status", "awaiting_lead")
      .in("status", OPEN_STATUSES as unknown as string[]),
    base()
      .in("status", OPEN_STATUSES as unknown as string[])
      .lt("next_action_at", nowIso),
    base().eq("status", "converted"),
    base().eq("status", "dropped"),
    base().in("status", OPEN_STATUSES as unknown as string[]).gte("lead_score", 60),
  ]);

  return {
    todayCount: today.count ?? 0,
    openCount: open.count ?? 0,
    waitingCount: waiting.count ?? 0,
    overdueCount: overdue.count ?? 0,
    wonCount: won.count ?? 0,
    lostCount: lost.count ?? 0,
    hotCount: hot.count ?? 0,
  };
}

export async function getLeadById(
  client: SupabaseClient,
  tenantId: string,
  leadId: string,
): Promise<Lead | null> {
  const { data, error } = await client
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Lead) ?? null;
}

export async function getLeadTimeline(
  client: SupabaseClient,
  tenantId: string,
  leadId: string,
  limit = 100,
): Promise<LeadEvent[]> {
  const { data, error } = await client
    .from("lead_events")
    .select("id, lead_id, tenant_id, actor_user_id, event_type, payload, metadata, created_at")
    .eq("tenant_id", tenantId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as LeadEvent[];
}
