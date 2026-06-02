// ---------------------------------------------------------------------------
// Fase 2 — Slimme Proeflesplanner: trial-lesson slot suggestion engine.
//
// Given a lead's intake answers and the solo instructor's agenda, this computes
// up to N free trial-lesson slots and scores each one. The prospect picks one;
// it is then stored as `provisional` via the book_trial_lesson RPC.
//
// Scoring model (Fase 2 — NO route intelligence yet, that is Fase 3):
//   + 20  slot falls on a preferred day
//   + 20  slot falls in a preferred daypart (or weekend when "weekend" picked)
//   + 15  slot is within the desired start window
//   + 15  anxious learner AND slot is not rushed (free buffer around it)
//   + 10  fast-track learner AND slot is among the earliest available days
//
// Fase 3 will add a route-distance factor. To keep this extensible the score is
// computed by composing TrialScoreFactor entries — a future route factor simply
// pushes another entry into `factors` inside scoreSlot(); nothing else changes.
// ---------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeDaypart, IntakeWeekday } from "@/lib/leads/types";
import {
  TRIAL_LESSON_DURATIONS,
  type TrialScoreFactor,
  type TrialSuggestion,
} from "./types";

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
};

const DEFAULT_POLICY: TrialPolicy = {
  duration_min: 60,
  window_days: 21,
  work_start_hour: 9,
  work_end_hour: 19,
  step_min: 90,
  work_days: [1, 2, 3, 4, 5, 6], // Mon–Sat
};

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

type BusyInterval = { start: number; end: number };

type SuggestionContext = {
  tenantId: string;
  instructorId: string;
  instructorName: string;
  policy: TrialPolicy;
  pickupLocation: string | null;
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

/**
 * Build everything the scoring/enumeration needs: the lead's intake, the solo
 * instructor, the scheduling policy and the instructor's busy intervals
 * (planned lessons + active trial lessons) inside the planning window.
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
      "pickup_location, city, preferred_days, preferred_times, desired_start_date, pace, has_anxiety, transmission",
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
  // intake transmission is 'manual' | 'automatic'; vehicles store 'schakel' |
  // 'automaat'. A vehicle with NULL transmission is treated as serving any.
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
    // Only enforce when the school actually maintains a vehicle catalogue with
    // explicit transmissions; otherwise stay permissive (tenant not configured).
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

  // Instructor busy intervals in the window: planned lessons + active trials.
  const windowStartIso = new Date(startOfUtcDay(windowStart)).toISOString();
  const windowEndIso = new Date(windowEnd + 86400000).toISOString();
  const busy: BusyInterval[] = [];
  const { data: lessons } = await service
    .from("lessons")
    .select("starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .eq("status", "planned")
    .gte("starts_at", windowStartIso)
    .lte("starts_at", windowEndIso);
  for (const l of lessons ?? []) {
    busy.push({
      start: Date.parse(l.starts_at as string),
      end: Date.parse(l.ends_at as string),
    });
  }
  const { data: trials } = await service
    .from("trial_lessons")
    .select("starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .in("status", ["provisional", "confirmed"])
    .gte("starts_at", windowStartIso)
    .lte("starts_at", windowEndIso);
  for (const t of trials ?? []) {
    busy.push({
      start: Date.parse(t.starts_at as string),
      end: Date.parse(t.ends_at as string),
    });
  }

  return {
    tenantId,
    instructorId,
    instructorName,
    policy,
    pickupLocation:
      (intake?.pickup_location as string | null) ??
      (intake?.city as string | null) ??
      null,
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
 * Score a single free slot. Composable: each criterion that matches pushes a
 * factor. Fase 3 route scoring plugs in here as one more factor.
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

/** Enumerate every free working-hour slot in the window, scored. */
function enumerateScoredSlots(
  ctx: SuggestionContext,
): { start: number; end: number; score: number; factors: TrialScoreFactor[] }[] {
  const { policy } = ctx;
  const durationMs = policy.duration_min * 60 * 1000;
  const out: {
    start: number;
    end: number;
    score: number;
    factors: TrialScoreFactor[];
  }[] = [];

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
        // Must end within working hours and not be in the past.
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

/**
 * Generate up to `limit` trial-lesson suggestions for a lead, best first.
 * Prefers spreading suggestions across distinct days so the prospect gets real
 * choice rather than three back-to-back slots on one day.
 */
export async function generateTrialLessonSuggestions(
  service: SupabaseClient,
  leadId: string,
  limit = 3,
): Promise<TrialSuggestion[]> {
  const ctx = await buildContext(service, leadId);
  if (!ctx) return [];

  const scored = enumerateScoredSlots(ctx);
  // Sort by score desc, then earliest first.
  scored.sort((a, b) => (b.score - a.score) || (a.start - b.start));

  const chosen: typeof scored = [];
  const usedDays = new Set<number>();
  // First pass: at most one slot per day.
  for (const s of scored) {
    if (chosen.length >= limit) break;
    const day = startOfUtcDay(s.start);
    if (usedDays.has(day)) continue;
    usedDays.add(day);
    chosen.push(s);
  }
  // Second pass: fill remaining slots if we couldn't reach the limit.
  if (chosen.length < limit) {
    for (const s of scored) {
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
    score: s.score,
    factors: s.factors,
    reason: reasonFromFactors(s.factors),
  }));
}

export type ValidatedTrialSlot = {
  tenantId: string;
  instructorId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  pickupLocation: string | null;
  score: number;
  reason: string;
};

/**
 * Re-validate a slot the prospect chose: it must be for the tenant's instructor,
 * land on the working grid, fit in the window and still be free. Returns the
 * recomputed score/reason so booking does not trust client-supplied values.
 * Returns null when the slot is no longer valid (e.g. just got booked).
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

  // The chosen slot must be one of the slots we would generate right now (same
  // working grid, window and free-of-conflict checks). This avoids trusting the
  // client and guarantees the slot is still bookable.
  const match = enumerateScoredSlots(ctx).find((s) => s.start === start);
  if (!match) return null;

  return {
    tenantId: ctx.tenantId,
    instructorId: ctx.instructorId,
    startsAt: new Date(match.start).toISOString(),
    endsAt: new Date(match.end).toISOString(),
    durationMin: ctx.policy.duration_min,
    pickupLocation: ctx.pickupLocation,
    score: match.score,
    reason: reasonFromFactors(match.factors),
  };
}
