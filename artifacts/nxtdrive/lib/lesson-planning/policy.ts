import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Task #87 — load the tenant's smart-planning policy.
//
// Platform defaults overlaid with a per-tenant override stored in
// tenant_settings under key `lesson_planning_policy`. The override is untrusted
// JSON, so every value is sanitised: unknown keys are ignored, numbers are
// clamped to a sane range and booleans coerced. Always returns a complete,
// valid policy. Mirrors the trial_lesson_policy / lead_score_policy pattern —
// never hardcoded per school.
// ---------------------------------------------------------------------------

export const LESSON_PLANNING_POLICY_KEY = "lesson_planning_policy";

export type LessonPlanPolicy = {
  // --- Scoring weights ---------------------------------------------------
  // Slot daypart matches one of the student's preferred dayparts.
  preferred_daypart_points: number;
  // Student has an upcoming exam within `exam_soon_days` → urgent to keep lessons.
  exam_soon_points: number;
  exam_soon_days: number;
  // Student is "bijna examenrijp" (close to test-ready) per the readiness engine.
  near_exam_ready_points: number;
  // Student had a lesson cancelled recently (within `recent_cancellation_days`)
  // and wants to catch up — a freed slot is a good replacement.
  recent_cancellation_points: number;
  recent_cancellation_days: number;
  // Student has credit + no upcoming lesson + has not had one in `idle_days`.
  idle_with_credit_points: number;
  idle_days: number;
  // Student is sitting on a lot of unused tegoed (≥ `ample_credit_min` minutes).
  ample_credit_points: number;
  ample_credit_min: number;

  // --- Route intelligence (reused from the trial planner) ----------------
  // Straight-line distance (km) under which a neighbour counts as "near".
  route_near_km: number;
  route_near_points: number;
  route_fits_points: number;
  route_detour_points: number;
  // Travel minutes above which reaching the student is a "long detour".
  route_long_detour_min: number;
  // Minimum free buffer (min) required between travel and an adjacent slot.
  route_min_buffer_min: number;
  // Larger buffer applied on dense ("busy region") days.
  route_busy_region_buffer_min: number;
  // A day counts as a "busy region" at/above this many appointments.
  route_busy_region_min_appts: number;
  // How many top base-scored candidates get route-refined (bounds Google calls).
  route_max_candidates: number;

  // --- Refill opt-in weights — Task #93 ----------------------------------
  // Student explicitly opted in to be invited when time frees up (wachtlijst).
  refill_opt_in_points: number;
  // Slot daypart matches one of the student's refill preferred moments.
  refill_preferred_moment_points: number;

  // --- Lead (trial-lesson) weights — Task #92 ----------------------------
  // Scoring weights for ranking trial-wanting LEADS for a freed slot. These
  // mirror the student weights but for the intake profile of an open lead.
  // Slot weekday is one of the lead's preferred days.
  lead_preferred_day_points: number;
  // Slot daypart is one of the lead's preferred times (or weekend).
  lead_preferred_time_points: number;
  // Slot falls within the lead's desired start window.
  lead_desired_start_points: number;
  // How many days after the desired start date still counts as "in window".
  lead_desired_window_days: number;
  // Lead wants to go fast (pace = fast) — a near-term freed slot suits them.
  lead_fast_track_points: number;
  // Lead is anxious AND the slot has generous buffer around it (not rushed).
  lead_anxious_points: number;
  // Lead's lead_score is at/above `lead_high_score_min` (a hot lead).
  lead_high_score_points: number;
  lead_high_score_min: number;

  // --- Eligibility -------------------------------------------------------
  // When true, a student whose preferred dayparts are set but do not include the
  // slot's daypart is excluded entirely (hard filter). Default false: dayparts
  // are a soft preference (scoring boost), never a hard gate.
  require_daypart_match: boolean;
};

export const DEFAULT_LESSON_PLAN_POLICY: LessonPlanPolicy = {
  preferred_daypart_points: 20,
  exam_soon_points: 25,
  exam_soon_days: 21,
  near_exam_ready_points: 15,
  recent_cancellation_points: 15,
  recent_cancellation_days: 14,
  idle_with_credit_points: 15,
  idle_days: 10,
  ample_credit_points: 10,
  ample_credit_min: 600, // 10 uur tegoed
  refill_opt_in_points: 25,
  refill_preferred_moment_points: 10,
  route_near_km: 3,
  route_near_points: 15,
  route_fits_points: 25,
  route_detour_points: -20,
  route_long_detour_min: 35,
  route_min_buffer_min: 15,
  route_busy_region_buffer_min: 20,
  route_busy_region_min_appts: 4,
  route_max_candidates: 12,
  lead_preferred_day_points: 20,
  lead_preferred_time_points: 18,
  lead_desired_start_points: 14,
  lead_desired_window_days: 21,
  lead_fast_track_points: 10,
  lead_anxious_points: 12,
  lead_high_score_points: 10,
  lead_high_score_min: 60,
  require_daypart_match: false,
};

// Per-weight clamp: no single factor should dominate the ranking. Negative
// factors (detour) are allowed a symmetric negative range.
const POINTS_MIN = -50;
const POINTS_MAX = 50;
const DAYS_MIN = 0;
const DAYS_MAX = 120;

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Numeric keys grouped by their valid range so the merge stays declarative.
const POINT_KEYS = [
  "preferred_daypart_points",
  "exam_soon_points",
  "near_exam_ready_points",
  "recent_cancellation_points",
  "idle_with_credit_points",
  "ample_credit_points",
  "refill_opt_in_points",
  "refill_preferred_moment_points",
  "route_near_points",
  "route_fits_points",
  "route_detour_points",
  "lead_preferred_day_points",
  "lead_preferred_time_points",
  "lead_desired_start_points",
  "lead_fast_track_points",
  "lead_anxious_points",
  "lead_high_score_points",
] as const;

const DAY_KEYS = [
  "exam_soon_days",
  "recent_cancellation_days",
  "idle_days",
  "lead_desired_window_days",
] as const;

// Remaining numeric tunables with bespoke ranges.
const RANGED_KEYS: Record<string, { min: number; max: number }> = {
  ample_credit_min: { min: 0, max: 100000 },
  route_near_km: { min: 0, max: 100 },
  route_long_detour_min: { min: 0, max: 600 },
  route_min_buffer_min: { min: 0, max: 240 },
  route_busy_region_buffer_min: { min: 0, max: 240 },
  route_busy_region_min_appts: { min: 1, max: 50 },
  route_max_candidates: { min: 1, max: 50 },
  lead_high_score_min: { min: 0, max: 100 },
};

/**
 * Merge an untrusted tenant override onto the platform defaults, dropping any
 * malformed value. Always returns a complete, valid policy.
 */
export function mergeLessonPlanPolicy(override: unknown): LessonPlanPolicy {
  const policy: LessonPlanPolicy = { ...DEFAULT_LESSON_PLAN_POLICY };
  if (!override || typeof override !== "object") return policy;
  const o = override as Record<string, unknown>;

  for (const key of POINT_KEYS) {
    const v = clampInt(o[key], POINTS_MIN, POINTS_MAX);
    if (v !== null) policy[key] = v;
  }
  for (const key of DAY_KEYS) {
    const v = clampInt(o[key], DAYS_MIN, DAYS_MAX);
    if (v !== null) policy[key] = v;
  }
  for (const [key, range] of Object.entries(RANGED_KEYS)) {
    const v = clampInt(o[key], range.min, range.max);
    if (v !== null) (policy as Record<string, number | boolean>)[key] = v;
  }
  if (typeof o.require_daypart_match === "boolean") {
    policy.require_daypart_match = o.require_daypart_match;
  }

  return policy;
}

/**
 * Read the tenant's smart-planning policy. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform defaults on any read error.
 */
export async function loadLessonPlanPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<LessonPlanPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", LESSON_PLANNING_POLICY_KEY)
    .maybeSingle();
  if (error) return { ...DEFAULT_LESSON_PLAN_POLICY };
  return mergeLessonPlanPolicy(data?.value ?? null);
}
