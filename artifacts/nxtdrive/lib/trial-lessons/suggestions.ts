// ---------------------------------------------------------------------------
// Fase 2 + Fase 3 — Slimme Proeflesplanner: trial-lesson slot suggestion engine.
//
// Given a lead's intake answers and the solo instructor's agenda, this computes
// up to N free trial-lesson slots and scores each one. The prospect picks one;
// it is then stored as `provisional` via the book_trial_lesson RPC.
//
// Scoring model (Fase 2 base):
//   + 20  slot falls on a preferred day
//   + 20  slot falls in a preferred daypart (or weekend when "weekend" picked)
//   + 15  slot is within the desired start window
//   + 15  anxious learner AND slot is not rushed (free buffer around it)
//   + 10  fast-track learner AND slot is among the earliest available days
//
// Fase 3 — Route Intelligence (lib/trial-lessons/route.ts):
//   + 15  pickup is close (Haversine) to the PREVIOUS appointment
//   + 15  pickup is close (Haversine) to the NEXT appointment
//   + 25  travel time + buffer fits the gap to every adjacent appointment
//   - 20  reaching the pickup is a long detour
//   Slots whose travel time + buffer does NOT fit an adjacent gap are dropped
//   from the suggestions (never offered). When Google is unconfigured/fails we
//   fall back to Haversine estimates, never reject, and flag the slot
//   route_needs_confirm so the instructor verifies it. A chosen slot always
//   stays `provisional` until the instructor confirms — never blind-booked.
//
// The base scoring stays synchronous and pure; route scoring is an async pass
// that may make a single Google Routes API matrix call per request.
// ---------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeDaypart, IntakeWeekday } from "@/lib/leads/types";
import {
  TRIAL_LESSON_DURATIONS,
  type TrialRouteInsight,
  type TrialRouteStatus,
  type TrialScoreFactor,
  type TrialSuggestion,
} from "./types";
import {
  computeRouteMatrix,
  estimateMinutesFromKm,
  haversineKm,
  isRoutesApiConfigured,
  type LatLng,
} from "./route";

// Tunable scheduling policy. Tenant-configurable via tenant_settings key
// `trial_lesson_policy`; these are the platform defaults (never per-school
// hardcoded — see replit.md). Hours are interpreted in UTC for this phase.
type TrialPolicy = {
  duration_min: number;
  window_days: number;
  work_start_hour: number;
  work_end_hour: number;
  // Slot grid step in minutes.
  step_min: number;
  // Working weekdays as JS getUTCDay() (0 = Sunday … 6 = Saturday).
  work_days: number[];
  // Fase 3 — route intelligence tunables.
  // Straight-line distance (km) under which a neighbour counts as "near".
  route_near_km: number;
  // Level-1 Haversine prefilter bands (before the Routes API refines):
  //   nearest neighbour ≤ near_km  → "good"     (always kept)
  //   near_km < … ≤ far_km         → "possible" (always kept)
  //   > far_km                     → only kept when the agenda is spacious
  route_prefilter_near_km: number;
  route_prefilter_far_km: number;
  // "Ruime agenda": minimum free gap (min) to the nearest neighbour that lets a
  // far (> far_km) pickup still be offered.
  route_spacious_gap_min: number;
  // Minimum free buffer (min) required between travel and an adjacent slot.
  route_min_buffer_min: number;
  // Larger buffer for anxious learners (no rushed hand-overs).
  route_anxious_buffer_min: number;
  // Buffer (min) applied in a busy region — denser days need more slack.
  route_busy_region_buffer_min: number;
  // A day counts as a "busy region" once it has at least this many appointments.
  route_busy_region_min_appts: number;
  // Travel time (min) above which reaching the pickup is a "long detour".
  route_long_detour_min: number;
  // How many top base slots get route-refined (bounds work; one Google call).
  route_max_candidates: number;
};

const DEFAULT_POLICY: TrialPolicy = {
  duration_min: 60,
  window_days: 21,
  work_start_hour: 9,
  work_end_hour: 19,
  step_min: 90,
  work_days: [1, 2, 3, 4, 5, 6], // Mon–Sat
  route_near_km: 3,
  route_prefilter_near_km: 3,
  route_prefilter_far_km: 7,
  route_spacious_gap_min: 120,
  route_min_buffer_min: 15,
  route_anxious_buffer_min: 30,
  route_busy_region_buffer_min: 20,
  route_busy_region_min_appts: 4,
  route_long_detour_min: 35,
  route_max_candidates: 24,
};

// Route factor point values.
const ROUTE_NEAR_POINTS = 15;
const ROUTE_FITS_POINTS = 25;
const ROUTE_DETOUR_POINTS = -20;

// JS getUTCDay() (0=Sun) → intake weekday code.
const JS_DAY_TO_WEEKDAY: Record<number, IntakeWeekday> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

type BusyInterval = {
  start: number;
  end: number;
  lat: number | null;
  lng: number | null;
};

type SuggestionContext = {
  tenantId: string;
  instructorId: string;
  instructorName: string;
  policy: TrialPolicy;
  pickupLocation: string | null;
  pickup: LatLng | null;
  pickupPlaceId: string | null;
  pickupFormattedAddress: string | null;
  preferredDays: Set<string>;
  preferredTimes: Set<string>;
  desiredStart: number | null; // epoch ms (start of day) or null
  hasAnxiety: boolean;
  fastTrack: boolean;
  windowStart: number; // epoch ms
  windowEnd: number; // epoch ms
  busy: BusyInterval[];
};

function dayPartForHour(hour: number): IntakeDaypart {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function isWeekend(jsDay: number): boolean {
  return jsDay === 0 || jsDay === 6;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function asCoord(lat: unknown, lng: unknown): LatLng | null {
  const la = typeof lat === "number" ? lat : null;
  const ln = typeof lng === "number" ? lng : null;
  if (la == null || ln == null) return null;
  return { lat: la, lng: ln };
}

/**
 * Build everything the scoring/enumeration needs: the lead's intake, the solo
 * instructor, the scheduling policy and the instructor's busy intervals
 * (planned lessons + active trial lessons, with coordinates) inside the window.
 *
 * Returns null when suggestions cannot be produced (lead missing, no instructor).
 */
async function buildContext(
  service: SupabaseClient,
  leadId: string,
): Promise<SuggestionContext | null> {
  const { data: lead } = await service
    .from("leads")
    .select("id, tenant_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  const tenantId = lead.tenant_id as string;

  const { data: intake } = await service
    .from("lead_intake_details")
    .select(
      "pickup_location, pickup_lat, pickup_lng, pickup_place_id, pickup_formatted_address, city, preferred_days, preferred_times, desired_start_date, pace, has_anxiety, transmission",
    )
    .eq("lead_id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Vehicle/transmission compatibility (schakel/automaat). The tenant's active
  // vehicle catalogue (migration 0032) is the source of truth for what the
  // instructor can teach. If the lead wants a specific transmission and the
  // school has configured vehicles but none can serve it, we cannot suggest a
  // trial lesson — block here so both suggestions and the booking re-validation
  // (validateChosenSlot reuses this) honour the requirement.
  const requestedTransmission =
    intake?.transmission === "manual"
      ? "schakel"
      : intake?.transmission === "automatic"
        ? "automaat"
        : null;
  if (requestedTransmission) {
    const { data: vehicles } = await service
      .from("vehicles")
      .select("transmission")
      .eq("tenant_id", tenantId)
      .eq("active", true);
    const list = vehicles ?? [];
    const hasExplicit = list.some((v) => v.transmission != null);
    if (hasExplicit) {
      const compatible = list.some(
        (v) => v.transmission == null || v.transmission === requestedTransmission,
      );
      if (!compatible) return null;
    }
  }

  // Resolve the (solo) instructor for this tenant. Prefer a dedicated
  // instructor membership, else the owner (tenant_admin). Multi-instructor
  // matching is Fase 4 — here we plan against one agenda.
  const { data: memberships } = await service
    .from("memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId)
    .in("role", ["instructor", "tenant_admin"]);
  if (!memberships || memberships.length === 0) return null;
  const sorted = [...memberships].sort((a, b) => {
    const rank = (r: string) => (r === "instructor" ? 0 : 1);
    if (rank(a.role) !== rank(b.role)) return rank(a.role) - rank(b.role);
    return String(a.user_id).localeCompare(String(b.user_id));
  });
  const instructorId = sorted[0]!.user_id as string;

  const { data: profile } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", instructorId)
    .maybeSingle();
  const instructorName =
    (profile?.full_name as string | null)?.trim() || "Je instructeur";

  // Policy: platform defaults overlaid with the tenant override (if any).
  const { data: setting } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "trial_lesson_policy")
    .maybeSingle();
  const override = (setting?.value ?? {}) as Partial<TrialPolicy>;
  const policy: TrialPolicy = { ...DEFAULT_POLICY, ...override };
  if (!TRIAL_LESSON_DURATIONS.includes(policy.duration_min as never)) {
    policy.duration_min = DEFAULT_POLICY.duration_min;
  }

  const now = Date.now();
  // Start no earlier than 24h from now (give the school time to prepare) and no
  // earlier than the desired start date.
  const desiredStart = intake?.desired_start_date
    ? startOfUtcDay(Date.parse(intake.desired_start_date as string))
    : null;
  let windowStart = now + 24 * 60 * 60 * 1000;
  if (desiredStart && desiredStart > windowStart) windowStart = desiredStart;
  const windowEnd = startOfUtcDay(windowStart) + policy.window_days * 86400000;

  // Instructor busy intervals in the window: planned lessons + active trials,
  // each carrying coordinates (when known) for route reasoning.
  const windowStartIso = new Date(startOfUtcDay(windowStart)).toISOString();
  const windowEndIso = new Date(windowEnd + 86400000).toISOString();
  const busy: BusyInterval[] = [];
  const { data: lessons } = await service
    .from("lessons")
    .select("starts_at, ends_at, location_lat, location_lng")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .eq("status", "planned")
    .gte("starts_at", windowStartIso)
    .lte("starts_at", windowEndIso);
  for (const l of lessons ?? []) {
    busy.push({
      start: Date.parse(l.starts_at as string),
      end: Date.parse(l.ends_at as string),
      lat: (l.location_lat as number | null) ?? null,
      lng: (l.location_lng as number | null) ?? null,
    });
  }
  const { data: trials } = await service
    .from("trial_lessons")
    .select("starts_at, ends_at, pickup_lat, pickup_lng")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .in("status", ["provisional", "confirmed"])
    .gte("starts_at", windowStartIso)
    .lte("starts_at", windowEndIso);
  for (const t of trials ?? []) {
    busy.push({
      start: Date.parse(t.starts_at as string),
      end: Date.parse(t.ends_at as string),
      lat: (t.pickup_lat as number | null) ?? null,
      lng: (t.pickup_lng as number | null) ?? null,
    });
  }

  return {
    tenantId,
    instructorId,
    instructorName,
    policy,
    pickupLocation:
      (intake?.pickup_formatted_address as string | null) ??
      (intake?.pickup_location as string | null) ??
      (intake?.city as string | null) ??
      null,
    pickup: asCoord(intake?.pickup_lat, intake?.pickup_lng),
    pickupPlaceId: (intake?.pickup_place_id as string | null) ?? null,
    pickupFormattedAddress:
      (intake?.pickup_formatted_address as string | null) ?? null,
    preferredDays: new Set((intake?.preferred_days as string[] | null) ?? []),
    preferredTimes: new Set((intake?.preferred_times as string[] | null) ?? []),
    desiredStart,
    hasAnxiety: intake?.has_anxiety === true,
    fastTrack: intake?.pace === "fast",
    windowStart,
    windowEnd,
    busy,
  };
}

function overlapsBusy(start: number, end: number, busy: BusyInterval[]): boolean {
  return busy.some((b) => start < b.end && b.start < end);
}

// "Not rushed": no other appointment within `bufferMin` before or after.
function hasBuffer(
  start: number,
  end: number,
  busy: BusyInterval[],
  bufferMin: number,
): boolean {
  const buf = bufferMin * 60 * 1000;
  return !busy.some((b) => start - buf < b.end && b.start < end + buf);
}

/**
 * Score a single free slot's Fase 2 base factors. Composable: each criterion
 * that matches pushes a factor. Route factors are added later (async pass).
 */
function scoreSlot(
  slotStart: number,
  slotEnd: number,
  ctx: SuggestionContext,
): { score: number; factors: TrialScoreFactor[] } {
  const factors: TrialScoreFactor[] = [];
  const d = new Date(slotStart);
  const jsDay = d.getUTCDay();
  const weekday = JS_DAY_TO_WEEKDAY[jsDay]!;
  const daypart = dayPartForHour(d.getUTCHours());

  if (ctx.preferredDays.has(weekday)) {
    factors.push({ key: "preferred_day", points: 20, label: "Voorkeursdag" });
  }
  const timeMatch =
    ctx.preferredTimes.has(daypart) ||
    (isWeekend(jsDay) && ctx.preferredTimes.has("weekend"));
  if (timeMatch) {
    factors.push({ key: "preferred_time", points: 20, label: "Voorkeurstijd" });
  }
  if (ctx.desiredStart !== null) {
    const windowEnd = ctx.desiredStart + 14 * 86400000;
    if (slotStart >= ctx.desiredStart && slotStart <= windowEnd) {
      factors.push({
        key: "desired_start_window",
        points: 15,
        label: "Binnen gewenste startperiode",
      });
    }
  }
  if (ctx.hasAnxiety && hasBuffer(slotStart, slotEnd, ctx.busy, 30)) {
    factors.push({
      key: "anxious_not_rushed",
      points: 15,
      label: "Rustig ingepland (geen haast)",
    });
  }
  if (ctx.fastTrack) {
    const earlyCutoff = startOfUtcDay(ctx.windowStart) + 5 * 86400000;
    if (slotStart <= earlyCutoff) {
      factors.push({
        key: "fast_track_early",
        points: 10,
        label: "Snel te starten",
      });
    }
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

function reasonFromFactors(factors: TrialScoreFactor[]): string {
  if (factors.length === 0) {
    return "Eerstvolgende beschikbare moment.";
  }
  return factors.map((f) => f.label).join(" · ");
}

type ScoredSlot = {
  start: number;
  end: number;
  score: number;
  factors: TrialScoreFactor[];
};

/** Enumerate every free working-hour slot in the window, base-scored. */
function enumerateScoredSlots(ctx: SuggestionContext): ScoredSlot[] {
  const { policy } = ctx;
  const durationMs = policy.duration_min * 60 * 1000;
  const out: ScoredSlot[] = [];

  let dayCursor = startOfUtcDay(ctx.windowStart);
  while (dayCursor <= ctx.windowEnd) {
    const jsDay = new Date(dayCursor).getUTCDay();
    if (policy.work_days.includes(jsDay)) {
      for (
        let hour = policy.work_start_hour;
        hour < policy.work_end_hour;
        hour += policy.step_min / 60
      ) {
        const slotStart = dayCursor + hour * 60 * 60 * 1000;
        const slotEnd = slotStart + durationMs;
        const endHour = (slotEnd - dayCursor) / (60 * 60 * 1000);
        if (endHour > policy.work_end_hour) continue;
        if (slotStart < ctx.windowStart) continue;
        if (overlapsBusy(slotStart, slotEnd, ctx.busy)) continue;
        const { score, factors } = scoreSlot(slotStart, slotEnd, ctx);
        out.push({ start: slotStart, end: slotEnd, score, factors });
      }
    }
    dayCursor += 86400000;
  }
  return out;
}

// Nearest appointment ending before the slot, and starting after the slot.
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

/**
 * Level-1 cheap Haversine prefilter, run BEFORE any Routes API call. Gates a
 * candidate slot on the straight-line distance from the pickup to its nearest
 * adjacent appointment, using explicit distance bands:
 *   ≤ near_km  → "good"     keep
 *   ≤ far_km   → "possible" keep
 *   > far_km   → "far"      keep only when the agenda around the slot is
 *                            spacious (a large free gap to the neighbour)
 * Slots with no pickup, or no neighbour with coordinates, can't be prefiltered
 * on distance and are always kept (the Routes API / fallback handles them).
 */
function passesHaversinePrefilter(
  ctx: SuggestionContext,
  slot: ScoredSlot,
): boolean {
  if (!ctx.pickup) return true;
  const { prev, next } = neighboursByTime(slot.start, slot.end, ctx.busy);
  const prevCoord = prev ? asCoord(prev.lat, prev.lng) : null;
  const nextCoord = next ? asCoord(next.lat, next.lng) : null;
  const dists: number[] = [];
  if (prevCoord) dists.push(haversineKm(ctx.pickup, prevCoord));
  if (nextCoord) dists.push(haversineKm(ctx.pickup, nextCoord));
  if (dists.length === 0) return true;

  const nearestKm = Math.min(...dists);
  // "good" + "possible" bands are always offered.
  if (nearestKm <= ctx.policy.route_prefilter_far_km) return true;

  // "far" band: only when the agenda is spacious around this slot.
  const prevGapMin = prev ? (slot.start - prev.end) / 60000 : Infinity;
  const nextGapMin = next ? (next.start - slot.end) / 60000 : Infinity;
  const nearestGapMin = Math.min(prevGapMin, nextGapMin);
  return nearestGapMin >= ctx.policy.route_spacious_gap_min;
}

function pointKey(p: LatLng): string {
  return `${p.lat},${p.lng}`;
}

type RouteResult = {
  scoreDelta: number;
  factors: TrialScoreFactor[];
  insight: TrialRouteInsight;
  reject: boolean;
};

const NO_ROUTE: RouteResult = {
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

// Appointments sharing a slot's UTC day. A high count marks a "busy region"
// day that warrants a larger hand-over buffer.
function apptsOnDay(dayStart: number, busy: BusyInterval[]): number {
  const dayEnd = dayStart + 86400000;
  return busy.filter((b) => b.start < dayEnd && b.end > dayStart).length;
}

/**
 * Route-score a set of slots. Performs at most one Google Routes API matrix
 * call. Direction is respected: the leg to the slot is PREVIOUS→pickup and the
 * leg away is pickup→NEXT, so origins/destinations are built accordingly (these
 * differ on one-way/urban networks). Falls back to Haversine estimates when
 * Google is unconfigured or returns nothing — those slots are flagged
 * needs_manual_confirm and are NEVER rejected. When `allowReject` is true a
 * slot whose travel + buffer does not fit an adjacent gap (on a real, computed
 * travel time) is rejected so it is never offered or booked.
 *
 * The required buffer is the largest of: the base buffer, the anxious-learner
 * buffer (when applicable) and the busy-region buffer (on dense days).
 */
async function applyRouteScoring(
  ctx: SuggestionContext,
  slots: ScoredSlot[],
  allowReject: boolean,
): Promise<RouteResult[]> {
  if (!ctx.pickup || slots.length === 0) {
    return slots.map(() => NO_ROUTE);
  }
  const pickup = ctx.pickup;

  // Collect unique neighbour points per direction across all slots.
  const slotNeighbours = slots.map((s) =>
    neighboursByTime(s.start, s.end, ctx.busy),
  );
  const prevPoints = new Map<string, LatLng>();
  const nextPoints = new Map<string, LatLng>();
  for (const { prev, next } of slotNeighbours) {
    const pc = prev ? asCoord(prev.lat, prev.lng) : null;
    if (pc) prevPoints.set(pointKey(pc), pc);
    const nc = next ? asCoord(next.lat, next.lng) : null;
    if (nc) nextPoints.set(pointKey(nc), nc);
  }

  // Build a single directional matrix:
  //   origins      = [pickup, ...prevPoints]   → row 0 is pickup→*
  //   destinations = [pickup, ...nextPoints]   → col 0 is *→pickup
  // prev→pickup = matrix[prevOriginIdx][0]; pickup→next = matrix[0][nextDestIdx]
  const prevList = [...prevPoints.values()];
  const nextList = [...nextPoints.values()];
  const origins = [pickup, ...prevList];
  const destinations = [pickup, ...nextList];
  const prevOriginIdx = new Map<string, number>();
  prevList.forEach((p, i) => prevOriginIdx.set(pointKey(p), i + 1));
  const nextDestIdx = new Map<string, number>();
  nextList.forEach((p, i) => nextDestIdx.set(pointKey(p), i + 1));

  // To-pickup (prev→pickup) and from-pickup (pickup→next) real minutes.
  const toMins = new Map<string, number>();
  const fromMins = new Map<string, number>();
  if (isRoutesApiConfigured() && (prevList.length > 0 || nextList.length > 0)) {
    const matrix = await computeRouteMatrix(origins, destinations);
    for (const p of prevList) {
      const oi = prevOriginIdx.get(pointKey(p))!;
      const m = matrix[oi]?.[0];
      if (m != null) toMins.set(pointKey(p), m);
    }
    for (const p of nextList) {
      const di = nextDestIdx.get(pointKey(p))!;
      const m = matrix[0]?.[di];
      if (m != null) fromMins.set(pointKey(p), m);
    }
  }

  // travelFor: real Google minutes when available, else Haversine estimate.
  // `direction` selects which computed leg to read (Haversine is symmetric).
  function travelFor(
    neighbour: BusyInterval | null,
    direction: "to" | "from",
  ): { min: number; km: number; estimated: boolean } | null {
    const c = neighbour ? asCoord(neighbour.lat, neighbour.lng) : null;
    if (!c) return null;
    const km = haversineKm(pickup, c);
    const g =
      direction === "to" ? toMins.get(pointKey(c)) : fromMins.get(pointKey(c));
    if (g != null) return { min: g, km, estimated: false };
    return { min: estimateMinutesFromKm(km), km, estimated: true };
  }

  return slots.map((s, i) => {
    const { prev, next } = slotNeighbours[i]!;
    const factors: TrialScoreFactor[] = [];
    let delta = 0;
    let anyAssessed = false;
    let anyEstimated = false;
    let allFit = true;
    let reject = false;

    // Required buffer = max(base/anxious, busy-region when the day is dense).
    let buffer = ctx.hasAnxiety
      ? ctx.policy.route_anxious_buffer_min
      : ctx.policy.route_min_buffer_min;
    if (
      apptsOnDay(startOfUtcDay(s.start), ctx.busy) >=
      ctx.policy.route_busy_region_min_appts
    ) {
      buffer = Math.max(buffer, ctx.policy.route_busy_region_buffer_min);
    }

    const toT = travelFor(prev, "to");
    const fromT = travelFor(next, "from");

    // PREVIOUS side: gap = slotStart − prev.end.
    if (prev && toT) {
      anyAssessed = true;
      if (toT.estimated) anyEstimated = true;
      const gapMin = (s.start - prev.end) / 60000;
      const fits = toT.min + buffer <= gapMin;
      if (!fits) allFit = false;
      if (toT.km <= ctx.policy.route_near_km) {
        factors.push({
          key: "route_near_previous",
          points: ROUTE_NEAR_POINTS,
          label: "Dicht bij vorige afspraak",
        });
        delta += ROUTE_NEAR_POINTS;
      }
      if (toT.min > ctx.policy.route_long_detour_min) {
        factors.push({
          key: "route_detour",
          points: ROUTE_DETOUR_POINTS,
          label: "Lange rit vanaf vorige afspraak",
        });
        delta += ROUTE_DETOUR_POINTS;
      }
    }

    // NEXT side: gap = next.start − slotEnd.
    if (next && fromT) {
      anyAssessed = true;
      if (fromT.estimated) anyEstimated = true;
      const gapMin = (next.start - s.end) / 60000;
      const fits = fromT.min + buffer <= gapMin;
      if (!fits) allFit = false;
      if (fromT.km <= ctx.policy.route_near_km) {
        factors.push({
          key: "route_near_next",
          points: ROUTE_NEAR_POINTS,
          label: "Dicht bij volgende afspraak",
        });
        delta += ROUTE_NEAR_POINTS;
      }
      if (fromT.min > ctx.policy.route_long_detour_min) {
        factors.push({
          key: "route_detour",
          points: ROUTE_DETOUR_POINTS,
          label: "Lange rit naar volgende afspraak",
        });
        delta += ROUTE_DETOUR_POINTS;
      }
    }

    if (anyAssessed && allFit) {
      factors.push({
        key: "route_fits",
        points: ROUTE_FITS_POINTS,
        label: "Reistijd past in de planning",
      });
      delta += ROUTE_FITS_POINTS;
    }

    // A genuinely non-fitting gap is only a hard rejection when we have a real
    // (Google-computed) travel time. With estimates we keep the slot but flag
    // it for manual confirmation — never blind-reject on a guess.
    if (allowReject && anyAssessed && !allFit && !anyEstimated) {
      reject = true;
    }

    const status: TrialRouteStatus = !anyAssessed
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
        travel_to_min: toT ? toT.min : null,
        travel_from_min: fromT ? fromT.min : null,
        prev_distance_km: toT ? Math.round(toT.km * 10) / 10 : null,
        next_distance_km: fromT ? Math.round(fromT.km * 10) / 10 : null,
        needs_manual_confirm: needsManualConfirm,
      },
      reject,
    };
  });
}

/**
 * Generate up to `limit` trial-lesson suggestions for a lead, best first.
 * Prefers spreading suggestions across distinct days so the prospect gets real
 * choice rather than three back-to-back slots on one day. Route intelligence
 * re-ranks the top candidates and drops slots that cannot be reached in time.
 */
export async function generateTrialLessonSuggestions(
  service: SupabaseClient,
  leadId: string,
  limit = 3,
): Promise<TrialSuggestion[]> {
  const ctx = await buildContext(service, leadId);
  if (!ctx) return [];

  const base = enumerateScoredSlots(ctx);
  base.sort((a, b) => b.score - a.score || a.start - b.start);

  // Level-1: cheap Haversine prefilter (distance bands) drops slots in the wrong
  // region before any Google call. Level-2: the Routes API refines the survivors.
  const prefiltered = base.filter((s) => passesHaversinePrefilter(ctx, s));
  const pool = prefiltered.slice(0, ctx.policy.route_max_candidates);
  const routed = await applyRouteScoring(ctx, pool, true);

  type Ranked = ScoredSlot & {
    factors: TrialScoreFactor[];
    route: TrialRouteInsight | null;
  };
  const ranked: Ranked[] = [];
  // Slots whose computed travel + buffer cannot fit an adjacent gap are dropped
  // here, so a route-infeasible slot is never ranked or surfaced.
  pool.forEach((s, i) => {
    const r = routed[i]!;
    if (r.reject) return;
    ranked.push({
      start: s.start,
      end: s.end,
      score: s.score + r.scoreDelta,
      factors: [...s.factors, ...r.factors],
      route: r.insight,
    });
  });
  ranked.sort((a, b) => b.score - a.score || a.start - b.start);

  const chosen: Ranked[] = [];
  const usedDays = new Set<number>();
  // First pass: at most one slot per day.
  for (const s of ranked) {
    if (chosen.length >= limit) break;
    const day = startOfUtcDay(s.start);
    if (usedDays.has(day)) continue;
    usedDays.add(day);
    chosen.push(s);
  }
  // Second pass: fill from the route-vetted pool if we couldn't reach the
  // limit. We deliberately do NOT fall back to unvetted base slots here — every
  // surfaced suggestion has passed both the Haversine prefilter and (when
  // applicable) the Routes API fit check, so a route-infeasible slot is never
  // offered. Offering fewer than `limit` is acceptable; offering a bad route
  // is not.
  if (chosen.length < limit) {
    for (const s of ranked) {
      if (chosen.length >= limit) break;
      if (chosen.includes(s)) continue;
      chosen.push(s);
    }
  }
  chosen.sort((a, b) => a.start - b.start);

  return chosen.map((s) => ({
    instructor_id: ctx.instructorId,
    instructor_name: ctx.instructorName,
    starts_at: new Date(s.start).toISOString(),
    ends_at: new Date(s.end).toISOString(),
    duration_min: ctx.policy.duration_min,
    pickup_location: ctx.pickupLocation,
    pickup_lat: ctx.pickup?.lat ?? null,
    pickup_lng: ctx.pickup?.lng ?? null,
    pickup_place_id: ctx.pickupPlaceId,
    pickup_formatted_address: ctx.pickupFormattedAddress,
    score: s.score,
    factors: s.factors,
    reason: reasonFromFactors(s.factors),
    route: s.route,
  }));
}

export type ValidatedTrialSlot = {
  tenantId: string;
  instructorId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  pickupLocation: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupPlaceId: string | null;
  pickupFormattedAddress: string | null;
  score: number;
  reason: string;
  route: TrialRouteInsight;
};

/**
 * Re-validate a slot the prospect chose: it must be for the tenant's instructor,
 * land on the working grid, fit in the window and still be free. Returns the
 * recomputed score/reason + route insight + pickup coordinates so booking does
 * not trust client-supplied values. Route fit IS enforced here with the same
 * rule as suggestion generation: a slot whose real (computed) travel + buffer
 * does not fit an adjacent gap is rejected (returns null) so it can never be
 * booked. Estimated (Haversine) gaps never hard-reject — the slot stays
 * bookable and `provisional`, flagged route_needs_confirm for the instructor.
 * Returns null when the slot is no longer bookable (taken or route-infeasible).
 */
export async function validateChosenSlot(
  service: SupabaseClient,
  leadId: string,
  input: { instructorId: string; startsAt: string },
): Promise<ValidatedTrialSlot | null> {
  const ctx = await buildContext(service, leadId);
  if (!ctx) return null;
  if (input.instructorId !== ctx.instructorId) return null;

  const start = Date.parse(input.startsAt);
  if (Number.isNaN(start)) return null;

  const match = enumerateScoredSlots(ctx).find((s) => s.start === start);
  if (!match) return null;

  const [routed] = await applyRouteScoring(ctx, [match], true);
  const r = routed ?? NO_ROUTE;
  if (r.reject) return null;
  const factors = [...match.factors, ...r.factors];

  return {
    tenantId: ctx.tenantId,
    instructorId: ctx.instructorId,
    startsAt: new Date(match.start).toISOString(),
    endsAt: new Date(match.end).toISOString(),
    durationMin: ctx.policy.duration_min,
    pickupLocation: ctx.pickupLocation,
    pickupLat: ctx.pickup?.lat ?? null,
    pickupLng: ctx.pickup?.lng ?? null,
    pickupPlaceId: ctx.pickupPlaceId,
    pickupFormattedAddress: ctx.pickupFormattedAddress,
    score: match.score + r.scoreDelta,
    reason: reasonFromFactors(factors),
    route: r.insight,
  };
}
