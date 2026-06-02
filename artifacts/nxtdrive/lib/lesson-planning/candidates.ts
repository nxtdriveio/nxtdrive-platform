// ---------------------------------------------------------------------------
// Task #87 — Slimme planningslogica engine. Given a freed agenda slot, rank the
// existing STUDENTS who fit best. Advisory only: the planner picks + confirms
// via the normal scheduling flow; nothing is auto-booked.
//
// Two layers, mirroring the trial planner:
//   1. Pure, synchronous eligibility + base scoring (scoreCandidateBase) and a
//      pure route-scoring step (applyRouteToCandidate) that takes ALREADY
//      RESOLVED travel data. These are unit-tested with no DB / network.
//   2. DB orchestration (suggestStudentsForSlot) that loads candidates, base-
//      scores them, route-refines the top N via at most one Google Routes API
//      call, and returns the ranked list.
//
// Route / travel semantics (haversine, computeRouteMatrix, estimate) are reused
// verbatim from lib/trial-lessons/route.ts. Region proxy for a student is their
// MOST RECENT lesson location; absent → route degrades to "unavailable" (the
// student stays eligible, just earns no route bonus), exactly like the trial
// planner degrades when a pickup has no coordinates.
// ---------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessAdvice } from "@workspace/leskaart";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import {
  computeRouteMatrix,
  estimateMinutesFromKm,
  haversineKm,
  isRoutesApiConfigured,
  type LatLng,
} from "@/lib/trial-lessons/route";
import {
  DEFAULT_LESSON_PLAN_POLICY,
  loadLessonPlanPolicy,
  type LessonPlanPolicy,
} from "./policy";
import type {
  CandidateRouteInsight,
  CandidateRouteStatus,
  CandidateScoreFactor,
  LeadCandidate,
  SlotCandidates,
  StudentCandidate,
} from "./types";

// ---------------------------------------------------------------------------
// Pure helpers (UTC, matching the rest of the planning code).
// ---------------------------------------------------------------------------

export type SlotInfo = {
  startMs: number;
  endMs: number;
  durationMin: number;
};

function dayPartForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function isWeekend(jsDay: number): boolean {
  return jsDay === 0 || jsDay === 6;
}

// JS getUTCDay() (0=Sun) → intake weekday code (mirrors the trial planner).
const JS_DAY_TO_WEEKDAY: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Does the slot's daypart match any of the student's preferred dayparts? */
export function slotMatchesDayparts(
  slotStartMs: number,
  preferredDayparts: string[],
): boolean {
  if (preferredDayparts.length === 0) return false;
  const d = new Date(slotStartMs);
  const daypart = dayPartForHour(d.getUTCHours());
  if (preferredDayparts.includes(daypart)) return true;
  return isWeekend(d.getUTCDay()) && preferredDayparts.includes("weekend");
}

// ---------------------------------------------------------------------------
// Layer 1a — eligibility + base scoring (pure).
// ---------------------------------------------------------------------------

// Everything the base score needs about one student, pre-loaded by the caller.
export type CandidateInput = {
  studentId: string;
  fullName: string;
  balanceMin: number;
  preferredDayparts: string[]; // may be empty
  // Days until the student's next upcoming exam, or null when none scheduled.
  examInDays: number | null;
  // Number of recently cancelled lessons within the policy window.
  recentCancellations: number;
  // Days since the student's last (completed) lesson; null = never had one.
  daysSinceLastLesson: number | null;
  // True when the student already has a future planned lesson.
  hasUpcomingLesson: boolean;
  // Readiness verdict (refinement; null when not yet evaluated).
  readinessAdvice: ReadinessAdvice | null;
};

/**
 * Hard eligibility gate. A student is only ever suggested when they have enough
 * tegoed for the lesson and are not already booked over the slot. Daypart is a
 * hard gate only when the tenant opts in (`require_daypart_match`).
 */
export function isEligible(
  c: Pick<CandidateInput, "balanceMin" | "preferredDayparts">,
  slot: SlotInfo,
  policy: LessonPlanPolicy,
  alreadyBusy: boolean,
): boolean {
  if (alreadyBusy) return false;
  if (c.balanceMin < slot.durationMin) return false;
  if (
    policy.require_daypart_match &&
    c.preferredDayparts.length > 0 &&
    !slotMatchesDayparts(slot.startMs, c.preferredDayparts)
  ) {
    return false;
  }
  return true;
}

/**
 * Score a single (already-eligible) candidate's non-route factors. Pure +
 * synchronous; each matching criterion pushes an explainable factor. Route
 * factors are added later by applyRouteToCandidate.
 */
export function scoreCandidateBase(
  c: CandidateInput,
  slot: SlotInfo,
  policy: LessonPlanPolicy,
): { score: number; factors: CandidateScoreFactor[] } {
  const factors: CandidateScoreFactor[] = [];

  if (slotMatchesDayparts(slot.startMs, c.preferredDayparts)) {
    factors.push({
      key: "preferred_daypart",
      points: policy.preferred_daypart_points,
      label: "Voorkeursdagdeel",
    });
  }

  if (c.examInDays !== null && c.examInDays <= policy.exam_soon_days) {
    factors.push({
      key: "exam_soon",
      points: policy.exam_soon_points,
      label: "Examen in zicht",
    });
  }

  if (c.readinessAdvice === "bijna_examenrijp") {
    factors.push({
      key: "near_exam_ready",
      points: policy.near_exam_ready_points,
      label: "Bijna examenrijp",
    });
  }

  if (c.recentCancellations > 0) {
    factors.push({
      key: "recent_cancellation",
      points: policy.recent_cancellation_points,
      label: "Recent uitgevallen les",
    });
  }

  const idle =
    !c.hasUpcomingLesson &&
    c.balanceMin >= slot.durationMin &&
    (c.daysSinceLastLesson === null ||
      c.daysSinceLastLesson >= policy.idle_days);
  if (idle) {
    factors.push({
      key: "idle_with_credit",
      points: policy.idle_with_credit_points,
      label: "Tegoed, geen les gepland",
    });
  }

  if (c.balanceMin >= policy.ample_credit_min) {
    factors.push({
      key: "ample_credit",
      points: policy.ample_credit_points,
      label: "Veel openstaand tegoed",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

// ---------------------------------------------------------------------------
// Layer 1b — route scoring (pure; takes resolved travel data).
// ---------------------------------------------------------------------------

// Resolved travel for one candidate relative to the slot's neighbours. `min` is
// the driving time (Google when `estimated` is false, else Haversine estimate);
// `km` is the straight-line distance; gaps are the free minutes to each
// neighbour. A leg with no neighbour (or no coordinates) is null.
export type CandidateTravel = {
  to: { min: number; km: number; estimated: boolean } | null;
  from: { min: number; km: number; estimated: boolean } | null;
  prevGapMin: number | null;
  nextGapMin: number | null;
  // Required hand-over buffer (already resolved for the slot's day density).
  bufferMin: number;
};

export type RouteResult = {
  scoreDelta: number;
  factors: CandidateScoreFactor[];
  insight: CandidateRouteInsight;
  reject: boolean;
};

export const NO_ROUTE: RouteResult = {
  scoreDelta: 0,
  factors: [],
  insight: {
    status: "unavailable",
    travel_to_min: null,
    travel_from_min: null,
    prev_distance_km: null,
    next_distance_km: null,
    needs_manual_confirm: false,
  },
  reject: false,
};

/**
 * Route-score one candidate from resolved travel data. Mirrors the trial
 * planner's per-slot route block exactly:
 *   + near previous / near next (within route_near_km)
 *   + fits (travel + buffer fits every assessed gap)
 *   − long detour
 * A non-fitting gap is a HARD reject only on a real (computed) travel time when
 * `allowReject` is set; estimates never reject — the candidate is kept and
 * flagged needs_manual_confirm. No travel at all → "unavailable", no factors.
 */
export function applyRouteToCandidate(
  travel: CandidateTravel,
  policy: LessonPlanPolicy,
  allowReject: boolean,
): RouteResult {
  const { to, from } = travel;
  if (!to && !from) return NO_ROUTE;

  const factors: CandidateScoreFactor[] = [];
  let delta = 0;
  // A leg is only "assessed" when BOTH its travel time and its neighbour gap are
  // known. route_fits, rejection and needs_manual_confirm all hinge on this —
  // mirroring lib/trial-lessons/suggestions.ts exactly.
  let anyAssessed = false;
  let anyEstimated = false;
  let allFit = true;

  if (to && travel.prevGapMin !== null) {
    anyAssessed = true;
    if (to.estimated) anyEstimated = true;
    if (to.min + travel.bufferMin > travel.prevGapMin) allFit = false;
    if (to.km <= policy.route_near_km) {
      factors.push({
        key: "route_near_previous",
        points: policy.route_near_points,
        label: "Dicht bij vorige afspraak",
      });
      delta += policy.route_near_points;
    }
    if (to.min > policy.route_long_detour_min) {
      factors.push({
        key: "route_detour",
        points: policy.route_detour_points,
        label: "Lange rit vanaf vorige afspraak",
      });
      delta += policy.route_detour_points;
    }
  }

  if (from && travel.nextGapMin !== null) {
    anyAssessed = true;
    if (from.estimated) anyEstimated = true;
    if (from.min + travel.bufferMin > travel.nextGapMin) allFit = false;
    if (from.km <= policy.route_near_km) {
      factors.push({
        key: "route_near_next",
        points: policy.route_near_points,
        label: "Dicht bij volgende afspraak",
      });
      delta += policy.route_near_points;
    }
    if (from.min > policy.route_long_detour_min) {
      factors.push({
        key: "route_detour",
        points: policy.route_detour_points,
        label: "Lange rit naar volgende afspraak",
      });
      delta += policy.route_detour_points;
    }
  }

  if (anyAssessed && allFit) {
    factors.push({
      key: "route_fits",
      points: policy.route_fits_points,
      label: "Reistijd past in de planning",
    });
    delta += policy.route_fits_points;
  }

  // Hard reject ONLY on a real (computed) non-fitting gap; estimates never
  // reject — keep the candidate and flag for manual confirmation.
  const reject = allowReject && anyAssessed && !allFit && !anyEstimated;
  const status: CandidateRouteStatus = !anyAssessed
    ? "unavailable"
    : anyEstimated
      ? "estimated"
      : "computed";
  const needsManualConfirm =
    anyAssessed && (status === "estimated" || !allFit);

  return {
    scoreDelta: delta,
    factors,
    insight: {
      status,
      travel_to_min: to ? to.min : null,
      travel_from_min: from ? from.min : null,
      prev_distance_km: to ? Math.round(to.km * 10) / 10 : null,
      next_distance_km: from ? Math.round(from.km * 10) / 10 : null,
      needs_manual_confirm: needsManualConfirm,
    },
    reject,
  };
}

function reasonFromFactors(
  factors: CandidateScoreFactor[],
  fallback = "Beschikbaar met voldoende tegoed.",
): string {
  if (factors.length === 0) return fallback;
  return factors.map((f) => f.label).join(" · ");
}

// ---------------------------------------------------------------------------
// Layer 2 — DB orchestration.
// ---------------------------------------------------------------------------

type BusyInterval = {
  start: number;
  end: number;
  lat: number | null;
  lng: number | null;
};

function asCoord(lat: unknown, lng: unknown): LatLng | null {
  const la = typeof lat === "number" ? lat : null;
  const ln = typeof lng === "number" ? lng : null;
  if (la == null || ln == null) return null;
  return { lat: la, lng: ln };
}

function neighboursByTime(
  slotStart: number,
  slotEnd: number,
  busy: BusyInterval[],
): { prev: BusyInterval | null; next: BusyInterval | null } {
  let prev: BusyInterval | null = null;
  let next: BusyInterval | null = null;
  for (const b of busy) {
    if (b.end <= slotStart && (!prev || b.end > prev.end)) prev = b;
    if (b.start >= slotEnd && (!next || b.start < next.start)) next = b;
  }
  return { prev, next };
}

function apptsOnDay(dayStart: number, busy: BusyInterval[]): number {
  const dayEnd = dayStart + 86400000;
  return busy.filter((b) => b.start < dayEnd && b.end > dayStart).length;
}

/**
 * Load the instructor's busy intervals (planned lessons + active trials +
 * planned appointments) for the slot's day, used for neighbour reasoning and
 * day-density buffers. Shared by the student and lead orchestrations so both see
 * the same agenda. The free_block appointment marking the slot is excluded.
 */
async function loadInstructorBusy(
  client: SupabaseClient,
  tenantId: string,
  instructorId: string,
  dayStart: number,
  excludeAppointmentId?: string,
): Promise<BusyInterval[]> {
  const winStartIso = new Date(dayStart).toISOString();
  const winEndIso = new Date(dayStart + 86400000).toISOString();
  const busy: BusyInterval[] = [];

  const { data: instrLessons } = await client
    .from("lessons")
    .select("starts_at, ends_at, location_lat, location_lng")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .eq("status", "planned")
    .gte("starts_at", winStartIso)
    .lte("starts_at", winEndIso);
  for (const l of instrLessons ?? []) {
    busy.push({
      start: Date.parse(l.starts_at as string),
      end: Date.parse(l.ends_at as string),
      lat: (l.location_lat as number | null) ?? null,
      lng: (l.location_lng as number | null) ?? null,
    });
  }

  const { data: instrTrials } = await client
    .from("trial_lessons")
    .select("starts_at, ends_at, pickup_lat, pickup_lng")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .in("status", ["provisional", "confirmed"])
    .gte("starts_at", winStartIso)
    .lte("starts_at", winEndIso);
  for (const t of instrTrials ?? []) {
    busy.push({
      start: Date.parse(t.starts_at as string),
      end: Date.parse(t.ends_at as string),
      lat: (t.pickup_lat as number | null) ?? null,
      lng: (t.pickup_lng as number | null) ?? null,
    });
  }

  let apptQuery = client
    .from("agenda_appointments")
    .select("id, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .eq("status", "planned")
    .gte("starts_at", winStartIso)
    .lte("starts_at", winEndIso);
  if (excludeAppointmentId) {
    apptQuery = apptQuery.neq("id", excludeAppointmentId);
  }
  const { data: instrAppts } = await apptQuery;
  for (const a of instrAppts ?? []) {
    busy.push({
      start: Date.parse(a.starts_at as string),
      end: Date.parse(a.ends_at as string),
      lat: null,
      lng: null,
    });
  }

  return busy;
}

/**
 * One directional Google matrix call for a pool of candidate coordinates against
 * the slot's neighbours. origins = [prev?, ...coords]; destinations =
 * [next?, ...coords]; so prev→candidate_i = m[0][1+i] and candidate_i→next =
 * m[1+i][0]. Returns per-pool-index driving minutes; empty maps when the Routes
 * API is unconfigured or there are no usable coordinates. Shared by both the
 * student and lead orchestrations to keep route work bounded (one call each).
 */
async function resolveMatrix(
  poolCoords: (LatLng | null)[],
  prevCoord: LatLng | null,
  nextCoord: LatLng | null,
): Promise<{ toMins: Map<number, number>; fromMins: Map<number, number> }> {
  const toMins = new Map<number, number>();
  const fromMins = new Map<number, number>();
  if (
    isRoutesApiConfigured() &&
    (prevCoord || nextCoord) &&
    poolCoords.some((c) => c !== null)
  ) {
    const idxWithCoord = poolCoords
      .map((c, i) => ({ c, i }))
      .filter((x): x is { c: LatLng; i: number } => x.c !== null);
    const coords = idxWithCoord.map((x) => x.c);
    const origins = [prevCoord ?? nextCoord!, ...coords];
    const destinations = [nextCoord ?? prevCoord!, ...coords];
    const matrix = await computeRouteMatrix(origins, destinations);
    idxWithCoord.forEach((x, j) => {
      if (prevCoord) {
        const m = matrix[0]?.[1 + j];
        if (m != null) toMins.set(x.i, m);
      }
      if (nextCoord) {
        const m = matrix[1 + j]?.[0];
        if (m != null) fromMins.set(x.i, m);
      }
    });
  }
  return { toMins, fromMins };
}

function legFor(
  coord: LatLng | null,
  neighbour: LatLng | null,
  computed: number | undefined,
): { min: number; km: number; estimated: boolean } | null {
  if (!coord || !neighbour) return null;
  const km = haversineKm(coord, neighbour);
  if (computed != null) return { min: computed, km, estimated: false };
  return { min: estimateMinutesFromKm(km), km, estimated: true };
}

export type SuggestStudentsArgs = {
  tenantId: string;
  instructorId: string;
  startsAt: string; // ISO
  durationMin: number;
  // The free_block appointment being planned, excluded from neighbour/overlap
  // calculations (it marks the slot, it is not an occupant).
  excludeAppointmentId?: string;
  limit?: number;
};

/**
 * Suggest ranked student candidates for a freed slot. Reads only — pass a
 * tenant-scoped (RLS) server client or the service role. Never mutates. Returns
 * at most `limit` candidates, best first.
 */
export async function suggestStudentsForSlot(
  client: SupabaseClient,
  args: SuggestStudentsArgs,
): Promise<StudentCandidate[]> {
  const { tenantId, instructorId } = args;
  const startMs = Date.parse(args.startsAt);
  if (Number.isNaN(startMs)) return [];
  const durationMin = args.durationMin;
  if (!Number.isFinite(durationMin) || durationMin < 15) return [];
  const endMs = startMs + durationMin * 60 * 1000;
  const slot: SlotInfo = { startMs, endMs, durationMin };
  const limit = args.limit ?? 6;

  const policy = await loadLessonPlanPolicy(client, tenantId);
  const now = Date.now();

  // --- Instructor busy intervals (for neighbours + day density) ----------
  // A wide day window around the slot is enough for neighbour reasoning.
  const dayStart = startOfUtcDay(startMs);
  const busy = await loadInstructorBusy(
    client,
    tenantId,
    instructorId,
    dayStart,
    args.excludeAppointmentId,
  );

  // --- Active students + balances ----------------------------------------
  const { data: studentsRaw } = await client
    .from("students")
    .select("id, full_name, preferred_dayparts")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  const students = (studentsRaw ?? []) as {
    id: string;
    full_name: string;
    preferred_dayparts: string[] | null;
  }[];
  if (students.length === 0) return [];
  const studentIds = students.map((s) => s.id);

  const { data: balancesRaw } = await client
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("tenant_id", tenantId);
  const balanceByStudent = new Map<string, number>();
  for (const b of balancesRaw ?? []) {
    balanceByStudent.set(b.student_id as string, (b.balance as number) ?? 0);
  }

  // --- Students already booked over the slot (excluded) ------------------
  const slotStartIso = new Date(startMs).toISOString();
  const slotEndIso = new Date(endMs).toISOString();
  const busyStudentIds = new Set<string>();
  const { data: overlapLessons } = await client
    .from("lessons")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("status", "planned")
    .lt("starts_at", slotEndIso)
    .gt("ends_at", slotStartIso);
  for (const l of overlapLessons ?? []) {
    if (l.student_id) busyStudentIds.add(l.student_id as string);
  }
  const { data: overlapAppts } = await client
    .from("agenda_appointments")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("status", "planned")
    .not("student_id", "is", null)
    .lt("starts_at", slotEndIso)
    .gt("ends_at", slotStartIso);
  for (const a of overlapAppts ?? []) {
    if (a.student_id) busyStudentIds.add(a.student_id as string);
  }

  // --- Batched per-student signals ---------------------------------------
  // Upcoming exams (earliest future exam per student).
  const examInDays = new Map<string, number>();
  const { data: examRows } = await client
    .from("agenda_appointments")
    .select("student_id, starts_at")
    .eq("tenant_id", tenantId)
    .eq("type", "exam")
    .eq("status", "planned")
    .gt("starts_at", new Date(now).toISOString())
    .in("student_id", studentIds);
  for (const e of examRows ?? []) {
    const sid = e.student_id as string | null;
    if (!sid) continue;
    const days = Math.ceil((Date.parse(e.starts_at as string) - now) / 86400000);
    const prev = examInDays.get(sid);
    if (prev === undefined || days < prev) examInDays.set(sid, days);
  }

  // Recent cancellations (lessons cancelled within the window).
  const cancelSinceIso = new Date(
    now - policy.recent_cancellation_days * 86400000,
  ).toISOString();
  const recentCancellations = new Map<string, number>();
  const { data: cancelRows } = await client
    .from("lessons")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .in("status", ["cancelled_with_refund", "cancelled_no_refund"])
    .gte("updated_at", cancelSinceIso)
    .in("student_id", studentIds);
  for (const c of cancelRows ?? []) {
    const sid = c.student_id as string;
    recentCancellations.set(sid, (recentCancellations.get(sid) ?? 0) + 1);
  }

  // Last completed lesson + region coord + any upcoming planned lesson.
  const nowIso = new Date(now).toISOString();
  const lastLessonAt = new Map<string, number>();
  const regionCoord = new Map<string, LatLng>();
  const hasUpcoming = new Set<string>();
  const { data: histRows } = await client
    .from("lessons")
    .select("student_id, starts_at, status, location_lat, location_lng")
    .eq("tenant_id", tenantId)
    .in("student_id", studentIds)
    .order("starts_at", { ascending: false });
  for (const l of histRows ?? []) {
    const sid = l.student_id as string;
    const startsAt = Date.parse(l.starts_at as string);
    const status = l.status as string;
    if (status === "planned" && startsAt > now) hasUpcoming.add(sid);
    if (status === "completed" && startsAt <= now && !lastLessonAt.has(sid)) {
      lastLessonAt.set(sid, startsAt);
    }
    // Region proxy = most recent lesson with coordinates (rows are newest-first).
    if (!regionCoord.has(sid)) {
      const c = asCoord(l.location_lat, l.location_lng);
      if (c) regionCoord.set(sid, c);
    }
  }

  // --- Eligibility + base scoring ----------------------------------------
  type Scored = {
    input: CandidateInput;
    coord: LatLng | null;
    baseScore: number;
    factors: CandidateScoreFactor[];
  };
  const scored: Scored[] = [];
  for (const s of students) {
    const balanceMin = balanceByStudent.get(s.id) ?? 0;
    const preferredDayparts = (s.preferred_dayparts ?? []).filter(
      (x): x is string => typeof x === "string",
    );
    const eligible = isEligible(
      { balanceMin, preferredDayparts },
      slot,
      policy,
      busyStudentIds.has(s.id),
    );
    if (!eligible) continue;

    const last = lastLessonAt.get(s.id) ?? null;
    const input: CandidateInput = {
      studentId: s.id,
      fullName: s.full_name,
      balanceMin,
      preferredDayparts,
      examInDays: examInDays.get(s.id) ?? null,
      recentCancellations: recentCancellations.get(s.id) ?? 0,
      daysSinceLastLesson:
        last === null ? null : Math.floor((now - last) / 86400000),
      hasUpcomingLesson: hasUpcoming.has(s.id),
      readinessAdvice: null, // refined for the top pool below
    };
    const { score, factors } = scoreCandidateBase(input, slot, policy);
    scored.push({
      input,
      coord: regionCoord.get(s.id) ?? null,
      baseScore: score,
      factors,
    });
  }
  if (scored.length === 0) return [];

  // Refine only the top pool (bounds readiness + Google work).
  scored.sort(
    (a, b) =>
      b.baseScore - a.baseScore ||
      a.input.fullName.localeCompare(b.input.fullName),
  );
  const pool = scored.slice(0, policy.route_max_candidates);

  // Readiness (near-exam-ready boost) for the pool only.
  await Promise.all(
    pool.map(async (p) => {
      try {
        const readiness = await loadStudentReadiness(
          client,
          tenantId,
          p.input.studentId,
        );
        if (readiness.advice === "bijna_examenrijp") {
          p.input.readinessAdvice = "bijna_examenrijp";
          p.factors.push({
            key: "near_exam_ready",
            points: policy.near_exam_ready_points,
            label: "Bijna examenrijp",
          });
          p.baseScore += policy.near_exam_ready_points;
        }
      } catch {
        // Readiness is a refinement; ignore failures (e.g. no skill data yet).
      }
    }),
  );

  // --- Route scoring (single Google matrix call) -------------------------
  const { prev, next } = neighboursByTime(startMs, endMs, busy);
  const prevCoord = prev ? asCoord(prev.lat, prev.lng) : null;
  const nextCoord = next ? asCoord(next.lat, next.lng) : null;
  const prevGapMin = prev ? (startMs - prev.end) / 60000 : null;
  const nextGapMin = next ? (next.start - endMs) / 60000 : null;

  // Required buffer = base, bumped on dense ("busy region") days.
  let bufferMin = policy.route_min_buffer_min;
  if (apptsOnDay(dayStart, busy) >= policy.route_busy_region_min_appts) {
    bufferMin = Math.max(bufferMin, policy.route_busy_region_buffer_min);
  }

  // One directional matrix call for the whole pool (bounds Google usage).
  const poolCoords = pool.map((p) => p.coord);
  const { toMins, fromMins } = await resolveMatrix(
    poolCoords,
    prevCoord,
    nextCoord,
  );

  const ranked: StudentCandidate[] = [];
  pool.forEach((p, i) => {
    const travel: CandidateTravel = {
      to: legFor(p.coord, prevCoord, toMins.get(i)),
      from: legFor(p.coord, nextCoord, fromMins.get(i)),
      prevGapMin,
      nextGapMin,
      bufferMin,
    };
    const route = applyRouteToCandidate(travel, policy, true);
    if (route.reject) return; // route-infeasible (computed) → never suggested
    const factors = [...p.factors, ...route.factors];
    ranked.push({
      student_id: p.input.studentId,
      full_name: p.input.fullName,
      balance_min: p.input.balanceMin,
      score: p.baseScore + route.scoreDelta,
      factors,
      reason: reasonFromFactors(factors),
      route: travel.to || travel.from ? route.insight : null,
    });
  });

  ranked.sort(
    (a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name),
  );
  return ranked.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Task #92 — lead (trial-lesson) candidates for a freed slot.
//
// A freed slot can just as well be filled by an open lead who still wants a
// trial lesson. Leads are ranked from their intake profile (preferred days /
// times, desired start, pace, anxiety) plus the same route intelligence as
// students. Advisory only: the planner books a (provisional) trial via the
// normal flow — nothing is auto-booked.
// ---------------------------------------------------------------------------

// Lead statuses that may still be offered a (new) trial lesson: open, pre-trial
// stages plus follow-up. Anything from `trial_planned` onward already has — or
// has passed — a trial, and converted/dropped are terminal.
export const LEAD_ELIGIBLE_STATUSES = [
  "new",
  "contacted",
  "intake_completed",
  "trial_offered",
  "follow_up",
] as const;

// Valid trial-lesson durations enforced by the book_trial_lesson RPC. A freed
// slot of any length is snapped to the nearest valid trial duration.
const TRIAL_DURATIONS = [60, 90, 120] as const;

function clampTrialDuration(min: number): number {
  let best: number = TRIAL_DURATIONS[0];
  let bestDiff = Infinity;
  for (const o of TRIAL_DURATIONS) {
    const diff = Math.abs(o - min);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = o;
    }
  }
  return best;
}

// Everything the lead base score needs, pre-loaded by the caller.
export type LeadCandidateInput = {
  leadId: string;
  fullName: string;
  leadScore: number;
  // Intake weekday codes (mon..sun) the lead prefers.
  preferredDays: string[];
  // Intake dayparts (morning/afternoon/evening/weekend) the lead prefers.
  preferredTimes: string[];
  // Desired start as start-of-day epoch ms, or null when not given.
  desiredStartMs: number | null;
  // Lead wants to go fast (intake pace = "fast").
  fastTrack: boolean;
  hasAnxiety: boolean;
  // True when the slot has generous buffer either side (resolved by the caller),
  // so an anxious learner is not rushed between appointments.
  notRushed: boolean;
};

/**
 * Score a lead's non-route factors for a freed slot. Pure + synchronous; mirrors
 * `scoreCandidateBase` for students. Route factors are added later by
 * applyRouteToCandidate.
 */
export function scoreLeadBase(
  c: LeadCandidateInput,
  slot: SlotInfo,
  policy: LessonPlanPolicy,
): { score: number; factors: CandidateScoreFactor[] } {
  const factors: CandidateScoreFactor[] = [];
  const d = new Date(slot.startMs);
  const weekday = JS_DAY_TO_WEEKDAY[d.getUTCDay()]!;
  const daypart = dayPartForHour(d.getUTCHours());

  if (c.preferredDays.includes(weekday)) {
    factors.push({
      key: "lead_preferred_day",
      points: policy.lead_preferred_day_points,
      label: "Voorkeursdag",
    });
  }

  const timeMatch =
    c.preferredTimes.includes(daypart) ||
    (isWeekend(d.getUTCDay()) && c.preferredTimes.includes("weekend"));
  if (timeMatch) {
    factors.push({
      key: "lead_preferred_time",
      points: policy.lead_preferred_time_points,
      label: "Voorkeursdagdeel",
    });
  }

  if (c.desiredStartMs !== null) {
    const slotDay = startOfUtcDay(slot.startMs);
    const windowEnd =
      c.desiredStartMs + policy.lead_desired_window_days * 86400000;
    if (slotDay >= c.desiredStartMs && slotDay <= windowEnd) {
      factors.push({
        key: "lead_desired_start",
        points: policy.lead_desired_start_points,
        label: "Past bij gewenste startdatum",
      });
    }
  }

  if (c.fastTrack) {
    factors.push({
      key: "lead_fast_track",
      points: policy.lead_fast_track_points,
      label: "Wil snel starten",
    });
  }

  if (c.hasAnxiety && c.notRushed) {
    factors.push({
      key: "lead_anxious",
      points: policy.lead_anxious_points,
      label: "Rustige planning voor faalangst",
    });
  }

  if (c.leadScore >= policy.lead_high_score_min) {
    factors.push({
      key: "lead_high_score",
      points: policy.lead_high_score_points,
      label: "Kansrijke lead",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

export type SuggestLeadsArgs = {
  tenantId: string;
  instructorId: string;
  startsAt: string; // ISO
  durationMin: number;
  // The free_block appointment being planned, excluded from neighbour/overlap.
  excludeAppointmentId?: string;
  limit?: number;
};

/**
 * Suggest ranked LEAD candidates for a freed slot. Reads only — pass a
 * tenant-scoped (RLS) server client or the service role. Never mutates. Returns
 * at most `limit` leads, best first. Each carries the trial duration to prefill
 * (the slot length, snapped to a valid trial duration).
 */
export async function suggestLeadsForSlot(
  client: SupabaseClient,
  args: SuggestLeadsArgs,
): Promise<LeadCandidate[]> {
  const { tenantId, instructorId } = args;
  const startMs = Date.parse(args.startsAt);
  if (Number.isNaN(startMs)) return [];
  const durationMin = args.durationMin;
  if (!Number.isFinite(durationMin) || durationMin < 15) return [];
  const endMs = startMs + durationMin * 60 * 1000;
  const slot: SlotInfo = { startMs, endMs, durationMin };
  const limit = args.limit ?? 6;
  const trialDuration = clampTrialDuration(durationMin);

  const policy = await loadLessonPlanPolicy(client, tenantId);
  const dayStart = startOfUtcDay(startMs);
  const busy = await loadInstructorBusy(
    client,
    tenantId,
    instructorId,
    dayStart,
    args.excludeAppointmentId,
  );

  // --- Eligible leads ----------------------------------------------------
  const { data: leadsRaw } = await client
    .from("leads")
    .select("id, full_name, status, lead_score")
    .eq("tenant_id", tenantId)
    .in("status", LEAD_ELIGIBLE_STATUSES as unknown as string[]);
  const leads = (leadsRaw ?? []) as {
    id: string;
    full_name: string;
    status: string;
    lead_score: number | null;
  }[];
  if (leads.length === 0) return [];
  const leadIds = leads.map((l) => l.id);

  // Leads that already hold an active (provisional/confirmed) trial are skipped.
  const withActiveTrial = new Set<string>();
  const { data: activeTrials } = await client
    .from("trial_lessons")
    .select("lead_id")
    .eq("tenant_id", tenantId)
    .in("status", ["provisional", "confirmed"])
    .in("lead_id", leadIds);
  for (const t of activeTrials ?? []) {
    if (t.lead_id) withActiveTrial.add(t.lead_id as string);
  }

  // Intake profile per lead (preferences + pickup coordinates).
  const intakeByLead = new Map<
    string,
    {
      preferred_days: string[] | null;
      preferred_times: string[] | null;
      desired_start_date: string | null;
      pace: string | null;
      has_anxiety: boolean | null;
      pickup_location: string | null;
      pickup_lat: number | null;
      pickup_lng: number | null;
    }
  >();
  const { data: intakeRaw } = await client
    .from("lead_intake_details")
    .select(
      "lead_id, preferred_days, preferred_times, desired_start_date, pace, has_anxiety, pickup_location, pickup_lat, pickup_lng",
    )
    .eq("tenant_id", tenantId)
    .in("lead_id", leadIds);
  for (const r of intakeRaw ?? []) {
    intakeByLead.set(r.lead_id as string, {
      preferred_days: (r.preferred_days as string[] | null) ?? null,
      preferred_times: (r.preferred_times as string[] | null) ?? null,
      desired_start_date: (r.desired_start_date as string | null) ?? null,
      pace: (r.pace as string | null) ?? null,
      has_anxiety: (r.has_anxiety as boolean | null) ?? null,
      pickup_location: (r.pickup_location as string | null) ?? null,
      pickup_lat: (r.pickup_lat as number | null) ?? null,
      pickup_lng: (r.pickup_lng as number | null) ?? null,
    });
  }

  // --- Slot neighbours + buffer (shared across the pool) -----------------
  const { prev, next } = neighboursByTime(startMs, endMs, busy);
  const prevCoord = prev ? asCoord(prev.lat, prev.lng) : null;
  const nextCoord = next ? asCoord(next.lat, next.lng) : null;
  const prevGapMin = prev ? (startMs - prev.end) / 60000 : null;
  const nextGapMin = next ? (next.start - endMs) / 60000 : null;

  let bufferMin = policy.route_min_buffer_min;
  if (apptsOnDay(dayStart, busy) >= policy.route_busy_region_min_appts) {
    bufferMin = Math.max(bufferMin, policy.route_busy_region_buffer_min);
  }
  // "Not rushed" = both neighbour gaps comfortably exceed a generous buffer (or
  // there is no neighbour at all) — the calm planning an anxious learner needs.
  const anxietyBuffer = Math.max(
    bufferMin * 2,
    policy.route_busy_region_buffer_min,
  );
  const notRushed =
    (prevGapMin === null || prevGapMin >= anxietyBuffer) &&
    (nextGapMin === null || nextGapMin >= anxietyBuffer);

  // --- Base scoring ------------------------------------------------------
  type ScoredLead = {
    input: LeadCandidateInput;
    coord: LatLng | null;
    pickupLocation: string | null;
    baseScore: number;
    factors: CandidateScoreFactor[];
  };
  const scored: ScoredLead[] = [];
  for (const l of leads) {
    if (withActiveTrial.has(l.id)) continue;
    const intake = intakeByLead.get(l.id);
    const parsedStart = intake?.desired_start_date
      ? Date.parse(intake.desired_start_date)
      : NaN;
    const desiredStartMs = Number.isNaN(parsedStart)
      ? null
      : startOfUtcDay(parsedStart);
    const input: LeadCandidateInput = {
      leadId: l.id,
      fullName: l.full_name,
      leadScore: l.lead_score ?? 0,
      preferredDays: (intake?.preferred_days ?? []).filter(
        (x): x is string => typeof x === "string",
      ),
      preferredTimes: (intake?.preferred_times ?? []).filter(
        (x): x is string => typeof x === "string",
      ),
      desiredStartMs,
      fastTrack: intake?.pace === "fast",
      hasAnxiety: intake?.has_anxiety === true,
      notRushed,
    };
    const { score, factors } = scoreLeadBase(input, slot, policy);
    scored.push({
      input,
      coord: asCoord(intake?.pickup_lat, intake?.pickup_lng),
      pickupLocation: intake?.pickup_location ?? null,
      baseScore: score,
      factors,
    });
  }
  if (scored.length === 0) return [];

  scored.sort(
    (a, b) =>
      b.baseScore - a.baseScore ||
      a.input.fullName.localeCompare(b.input.fullName),
  );
  const pool = scored.slice(0, policy.route_max_candidates);

  // --- Route scoring (single Google matrix call) -------------------------
  const poolCoords = pool.map((p) => p.coord);
  const { toMins, fromMins } = await resolveMatrix(
    poolCoords,
    prevCoord,
    nextCoord,
  );

  const ranked: LeadCandidate[] = [];
  pool.forEach((p, i) => {
    const travel: CandidateTravel = {
      to: legFor(p.coord, prevCoord, toMins.get(i)),
      from: legFor(p.coord, nextCoord, fromMins.get(i)),
      prevGapMin,
      nextGapMin,
      bufferMin,
    };
    const route = applyRouteToCandidate(travel, policy, true);
    if (route.reject) return; // route-infeasible (computed) → never suggested
    const factors = [...p.factors, ...route.factors];
    ranked.push({
      lead_id: p.input.leadId,
      full_name: p.input.fullName,
      lead_score: p.input.leadScore,
      trial_duration_min: trialDuration,
      pickup_location: p.pickupLocation,
      score: p.baseScore + route.scoreDelta,
      factors,
      reason: reasonFromFactors(factors, "Beschikbaar voor proefles."),
      route: travel.to || travel.from ? route.insight : null,
    });
  });

  ranked.sort(
    (a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name),
  );
  return ranked.slice(0, limit);
}

/**
 * Combined advisory result for a freed slot: best-fit existing students AND
 * trial-wanting leads, each list ranked best-first. Runs both engines in
 * parallel. Reads only — never mutates.
 */
export async function suggestSlotCandidates(
  client: SupabaseClient,
  args: SuggestStudentsArgs,
): Promise<SlotCandidates> {
  const [students, leads] = await Promise.all([
    suggestStudentsForSlot(client, args),
    suggestLeadsForSlot(client, args),
  ]);
  return { students, leads };
}

export { DEFAULT_LESSON_PLAN_POLICY };
