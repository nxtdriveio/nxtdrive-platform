/**
 * Unit tests for the smart-planning engine (Task #87 — Slimme planningslogica).
 * Pure logic only; no database or network — the route step is tested by feeding
 * ALREADY-RESOLVED travel data into applyRouteToCandidate, so no fetch stub is
 * needed.
 *
 *   pnpm --filter @workspace/scripts run test-lesson-planning
 *
 * Covers:
 *  - slotMatchesDayparts: morning/afternoon/evening + weekend matching.
 *  - isEligible: tegoed gate, already-busy gate, optional daypart hard gate.
 *  - scoreCandidateBase: daypart / exam-soon / near-exam-ready / cancellation /
 *    idle-with-credit / ample-credit factors and their sum.
 *  - applyRouteToCandidate: computed near+fits, estimated never rejects (flagged
 *    needs_manual_confirm), computed hard-reject on a gap that does not fit, and
 *    no-travel → "unavailable".
 */
// The nxtdrive artifact is a CommonJS package; the ESM `scripts` package cannot
// statically link its named exports, so import runtime values via a namespace
// object and types separately (types are erased at runtime). Normalise the CJS
// interop shape with `default ?? namespace` (see test-route-scoring.ts).
import type {
  CandidateInput,
  CandidateTravel,
  SlotInfo,
} from "../../artifacts/nxtdrive/lib/lesson-planning/candidates.ts";
import type { LessonPlanPolicy } from "../../artifacts/nxtdrive/lib/lesson-planning/policy.ts";
import * as candNs from "../../artifacts/nxtdrive/lib/lesson-planning/candidates.ts";

const candMod = ((candNs as { default?: typeof candNs }).default ??
  candNs) as typeof candNs;

const {
  slotMatchesDayparts,
  isEligible,
  scoreCandidateBase,
  applyRouteToCandidate,
  DEFAULT_LESSON_PLAN_POLICY,
} = candMod;

const policy: LessonPlanPolicy = DEFAULT_LESSON_PLAN_POLICY;

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

// Fixed reference instants (all UTC).
// 2026-07-15 = Wednesday. 10:00 = morning, 14:00 = afternoon, 19:00 = evening.
const MORNING = Date.UTC(2026, 6, 15, 10, 0, 0);
const AFTERNOON = Date.UTC(2026, 6, 15, 14, 0, 0);
const EVENING = Date.UTC(2026, 6, 15, 19, 0, 0);
// 2026-07-18 = Saturday (weekend).
const SATURDAY = Date.UTC(2026, 6, 18, 10, 0, 0);

const MIN = 60 * 1000;

function slotAt(startMs: number, durationMin = 60): SlotInfo {
  return { startMs, endMs: startMs + durationMin * MIN, durationMin };
}

function baseInput(over: Partial<CandidateInput> = {}): CandidateInput {
  return {
    studentId: "s1",
    fullName: "Test Leerling",
    balanceMin: 600,
    preferredDayparts: [],
    examInDays: null,
    recentCancellations: 0,
    daysSinceLastLesson: 30,
    hasUpcomingLesson: false,
    readinessAdvice: null,
    ...over,
  };
}

function hasFactor(
  factors: { key: string }[],
  key: string,
): boolean {
  return factors.some((f) => f.key === key);
}

// ===== slotMatchesDayparts ================================================
check(
  "daypart: morning slot matches 'morning'",
  slotMatchesDayparts(MORNING, ["morning"]) === true,
);
check(
  "daypart: afternoon slot does NOT match 'morning'",
  slotMatchesDayparts(AFTERNOON, ["morning"]) === false,
);
check(
  "daypart: evening slot matches 'evening'",
  slotMatchesDayparts(EVENING, ["evening"]) === true,
);
check(
  "daypart: empty prefs never match",
  slotMatchesDayparts(MORNING, []) === false,
);
check(
  "daypart: saturday slot matches 'weekend'",
  slotMatchesDayparts(SATURDAY, ["weekend"]) === true,
);
check(
  "daypart: weekday slot does NOT match 'weekend'",
  slotMatchesDayparts(MORNING, ["weekend"]) === false,
);

// ===== isEligible =========================================================
{
  const slot = slotAt(MORNING, 60);
  check(
    "eligible: enough tegoed, not busy → true",
    isEligible({ balanceMin: 60, preferredDayparts: [] }, slot, policy, false) ===
      true,
  );
  check(
    "eligible: insufficient tegoed → false",
    isEligible({ balanceMin: 45, preferredDayparts: [] }, slot, policy, false) ===
      false,
  );
  check(
    "eligible: already busy → false",
    isEligible({ balanceMin: 600, preferredDayparts: [] }, slot, policy, true) ===
      false,
  );
  const strict: LessonPlanPolicy = { ...policy, require_daypart_match: true };
  check(
    "eligible: require_daypart_match, mismatch → false",
    isEligible(
      { balanceMin: 600, preferredDayparts: ["evening"] },
      slot,
      strict,
      false,
    ) === false,
  );
  check(
    "eligible: require_daypart_match, match → true",
    isEligible(
      { balanceMin: 600, preferredDayparts: ["morning"] },
      slot,
      strict,
      false,
    ) === true,
  );
  check(
    "eligible: require_daypart_match, no prefs set → not gated",
    isEligible(
      { balanceMin: 600, preferredDayparts: [] },
      slot,
      strict,
      false,
    ) === true,
  );
}

// ===== scoreCandidateBase =================================================
{
  const slot = slotAt(MORNING, 60);

  // No matching factors → score 0, neutral.
  const none = scoreCandidateBase(
    baseInput({ daysSinceLastLesson: 0, hasUpcomingLesson: true, balanceMin: 60 }),
    slot,
    policy,
  );
  check(
    "score: nothing matches → 0 points, no factors",
    none.score === 0 && none.factors.length === 0,
    `score=${none.score}`,
  );

  // Preferred daypart.
  const dp = scoreCandidateBase(
    baseInput({
      preferredDayparts: ["morning"],
      hasUpcomingLesson: true,
      balanceMin: 60,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: preferred daypart factor",
    hasFactor(dp.factors, "preferred_daypart") &&
      dp.score === policy.preferred_daypart_points,
    `score=${dp.score}`,
  );

  // Exam soon (within window) vs far away.
  const examSoon = scoreCandidateBase(
    baseInput({
      examInDays: 7,
      hasUpcomingLesson: true,
      balanceMin: 60,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: exam within window → exam_soon factor",
    hasFactor(examSoon.factors, "exam_soon"),
  );
  const examFar = scoreCandidateBase(
    baseInput({
      examInDays: policy.exam_soon_days + 5,
      hasUpcomingLesson: true,
      balanceMin: 60,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: exam beyond window → no exam_soon factor",
    !hasFactor(examFar.factors, "exam_soon"),
  );

  // Near exam ready (readiness refinement).
  const ready = scoreCandidateBase(
    baseInput({
      readinessAdvice: "bijna_examenrijp",
      hasUpcomingLesson: true,
      balanceMin: 60,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: bijna_examenrijp → near_exam_ready factor",
    hasFactor(ready.factors, "near_exam_ready"),
  );

  // Recent cancellation.
  const cancelled = scoreCandidateBase(
    baseInput({
      recentCancellations: 2,
      hasUpcomingLesson: true,
      balanceMin: 60,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: recent cancellation factor",
    hasFactor(cancelled.factors, "recent_cancellation"),
  );

  // Idle with credit: no upcoming lesson, idle long enough, has credit.
  const idle = scoreCandidateBase(
    baseInput({
      hasUpcomingLesson: false,
      daysSinceLastLesson: policy.idle_days + 1,
      balanceMin: 120,
    }),
    slot,
    policy,
  );
  check(
    "score: idle with credit factor",
    hasFactor(idle.factors, "idle_with_credit"),
  );
  // Has an upcoming lesson → not idle.
  const notIdle = scoreCandidateBase(
    baseInput({
      hasUpcomingLesson: true,
      daysSinceLastLesson: policy.idle_days + 1,
      balanceMin: 120,
    }),
    slot,
    policy,
  );
  check(
    "score: upcoming lesson → no idle factor",
    !hasFactor(notIdle.factors, "idle_with_credit"),
  );

  // Ample credit threshold.
  const ample = scoreCandidateBase(
    baseInput({
      balanceMin: policy.ample_credit_min,
      hasUpcomingLesson: true,
      daysSinceLastLesson: 0,
    }),
    slot,
    policy,
  );
  check(
    "score: ample credit factor",
    hasFactor(ample.factors, "ample_credit"),
  );

  // Sum equals the sum of factor points.
  const summed = ample.factors.reduce((s, f) => s + f.points, 0);
  check(
    "score: total equals sum of factor points",
    ample.score === summed,
    `score=${ample.score} sum=${summed}`,
  );
}

// ===== applyRouteToCandidate ==============================================
{
  // Computed, near both neighbours, fits comfortably.
  const fits: CandidateTravel = {
    to: { min: 8, km: 2, estimated: false },
    from: { min: 8, km: 2, estimated: false },
    prevGapMin: 60,
    nextGapMin: 60,
    bufferMin: policy.route_min_buffer_min,
  };
  const rFits = applyRouteToCandidate(fits, policy, true);
  check(
    "route: computed near+fits → near factors + fits, no reject",
    rFits.insight.status === "computed" &&
      hasFactor(rFits.factors, "route_near_previous") &&
      hasFactor(rFits.factors, "route_near_next") &&
      hasFactor(rFits.factors, "route_fits") &&
      rFits.reject === false &&
      rFits.insight.needs_manual_confirm === false,
    `status=${rFits.insight.status} reject=${rFits.reject}`,
  );

  // Estimated, does NOT fit, allowReject=true → NEVER rejects; flagged.
  const est: CandidateTravel = {
    to: { min: 40, km: 30, estimated: true },
    from: null,
    prevGapMin: 20,
    nextGapMin: null,
    bufferMin: policy.route_min_buffer_min,
  };
  const rEst = applyRouteToCandidate(est, policy, true);
  check(
    "route: estimated never rejects, needs_manual_confirm",
    rEst.insight.status === "estimated" &&
      rEst.reject === false &&
      rEst.insight.needs_manual_confirm === true,
    `status=${rEst.insight.status} reject=${rEst.reject}`,
  );

  // Computed, does NOT fit (travel+buffer > gap), allowReject=true → reject.
  const tight: CandidateTravel = {
    to: { min: 50, km: 40, estimated: false },
    from: null,
    prevGapMin: 20,
    nextGapMin: null,
    bufferMin: policy.route_min_buffer_min,
  };
  const rTight = applyRouteToCandidate(tight, policy, true);
  check(
    "route: computed mismatch + allowReject → reject",
    rTight.reject === true,
    `reject=${rTight.reject}`,
  );
  // Same, allowReject=false → kept (no reject) but flagged.
  const rTightKeep = applyRouteToCandidate(tight, policy, false);
  check(
    "route: computed mismatch + allowReject=false → kept, flagged",
    rTightKeep.reject === false &&
      rTightKeep.insight.needs_manual_confirm === true,
    `reject=${rTightKeep.reject}`,
  );

  // No travel at all → unavailable, no factors, no reject.
  const none: CandidateTravel = {
    to: null,
    from: null,
    prevGapMin: null,
    nextGapMin: null,
    bufferMin: policy.route_min_buffer_min,
  };
  const rNone = applyRouteToCandidate(none, policy, true);
  check(
    "route: no travel → unavailable, no factors, no reject",
    rNone.insight.status === "unavailable" &&
      rNone.factors.length === 0 &&
      rNone.reject === false,
    `status=${rNone.insight.status}`,
  );

  // Travel leg present but no assessed gap (gap null) → NOT assessed, so it must
  // behave like "unavailable": no route_fits, no reject, no manual-confirm flag.
  const unassessed: CandidateTravel = {
    to: { min: 8, km: 2, estimated: false },
    from: null,
    prevGapMin: null,
    nextGapMin: null,
    bufferMin: policy.route_min_buffer_min,
  };
  const rUnassessed = applyRouteToCandidate(unassessed, policy, true);
  check(
    "route: leg present but no gap → unavailable, no fits/reject/flag",
    rUnassessed.insight.status === "unavailable" &&
      !hasFactor(rUnassessed.factors, "route_fits") &&
      rUnassessed.reject === false &&
      rUnassessed.insight.needs_manual_confirm === false,
    `status=${rUnassessed.insight.status} reject=${rUnassessed.reject}`,
  );

  // Long detour penalty applied on a computed long leg.
  const detour: CandidateTravel = {
    to: { min: policy.route_long_detour_min + 10, km: 50, estimated: false },
    from: null,
    prevGapMin: 600,
    nextGapMin: null,
    bufferMin: policy.route_min_buffer_min,
  };
  const rDetour = applyRouteToCandidate(detour, policy, true);
  check(
    "route: long computed leg → detour factor",
    hasFactor(rDetour.factors, "route_detour"),
  );
}

// ---- report ---------------------------------------------------------------
console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "✅" : "❌";
  console.log(`${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All lesson-planning unit tests passed.");
