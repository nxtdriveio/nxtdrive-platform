// LEGACY leskaart L1 compatibility projection.
//
// New readiness decisions MUST use evaluateReadiness from
// ./readiness-engine.ts. This file remains temporarily exported because older
// reporting/UI projections still consume its shape. It is not an authorized
// persistence, publication or assessment-planning boundary.
//
// Given a student's latest per-skill scores (1..8), the critical-skill flags,
// the per-lesson score history and the three CBR preconditions, this computes:
//   * mastery across assessed skills only;
//   * coverage as a separate percentage so "N" is never treated as a score;
//   * the weakest critical-safety-skill score;
//   * whether the last 3 lessons are stable;
//   * an advice verdict (niet / bijna / examenwaardig);
//   * a 0..100 Readiness Score with its 5-band phase;
//   * the blockers preventing "examenwaardig".
//
// It is ADVISORY ONLY. The instructor stays responsible for the final exam
// advice (see READINESS_DISCLAIMER).
//
// Thresholds come from docs/NXTDRIVE_LESKAART_CANON.md ("Examenrijpheid" +
// "Exam Readiness Score") and docs/LESKAART_ROADMAP.md (Fase L1). Where the
// canon leaves a value undefined (the stability window, the 0..100 mapping and
// the gap between the "niet"/"bijna" bands) the engine resolves it
// conservatively; each such choice is documented at its constant below.

export const READINESS_DISCLAIMER =
  "Deze examenrijpheidsindicatie is uitsluitend adviserend. De instructeur blijft altijd eindverantwoordelijk voor het uiteindelijke examenadvies.";

// --- Canon thresholds (docs/NXTDRIVE_LESKAART_CANON.md "Examenrijpheid") -----
const EXAM_FLOOR = 7; // kritiek of gemiddelde hieronder => niet examenrijp
const CRITICAL_MIN = 8; // kritieke vaardigheden minimaal 8 voor positief advies
const NEAR_AVG = 7.5; // bijna examenrijp: gemiddelde minimaal 7,5
const PASS_AVG = 8; // examenwaardig: gemiddelde minimaal 8
const SCORE_MAX = 8;

// Stability of the "laatste 3 lessen". The canon requires it for examenwaardig
// but does not define it numerically. Documented heuristic: at least 3 lessons
// must have carried scores, the spread between those 3 lesson averages must
// stay within STABILITY_SPREAD, and none may drop below STABILITY_FLOOR — i.e.
// "consistent en op niveau", not fluctuating.
const STABILITY_LESSONS = 3;
const STABILITY_SPREAD = 1.0;
const STABILITY_FLOOR = 7.0;

export type ReadinessAdvice =
  | "niet_examenrijp"
  | "bijna_examenrijp"
  | "examenwaardig";

export type ReadinessPhase =
  | "beginfase"
  | "ontwikkelfase"
  | "gevorderd"
  | "bijna_examenrijp"
  | "examenwaardig";

export const ADVICE_LABELS: Record<ReadinessAdvice, string> = {
  niet_examenrijp: "Niet examenrijp",
  bijna_examenrijp: "Bijna examenrijp",
  examenwaardig: "Examenwaardig",
};

export const PHASE_LABELS: Record<ReadinessPhase, string> = {
  beginfase: "Beginfase",
  ontwikkelfase: "Ontwikkelfase",
  gevorderd: "Gevorderd",
  bijna_examenrijp: "Bijna examenrijp",
  examenwaardig: "Examenwaardig",
};

export type ReadinessSkillInput = {
  skillId: string;
  isCritical: boolean;
  /** Latest 1..8 score, or null when never scored ("nog nooit behandeld"). */
  score: number | null;
};

export type ReadinessLessonInput = {
  lessonId: string;
  /** ISO timestamp; used only to order lessons. */
  startsAt: string;
  /** Scores recorded during this lesson (any skills). */
  scores: number[];
};

export type ReadinessPreconditions = {
  theorieBehaald: boolean;
  machtigingGeregeld: boolean;
  gezondheidsverklaringVereist: boolean;
  gezondheidsverklaringGeregeld: boolean;
};

export type ReadinessInput = {
  /** ALL active leaf skills for the tenant (scored or not). */
  skills: ReadinessSkillInput[];
  /** Lesson score history; order does not matter, the engine sorts. */
  lessons: ReadinessLessonInput[];
  preconditions: ReadinessPreconditions;
};

export type ReadinessStability = {
  stable: boolean;
  lessonsConsidered: number;
  lessonAverages: number[];
};

export type ReadinessResult = {
  /** Average across assessed active leaves only, rounded to 1 decimal. */
  averageScore: number;
  /** Raw average used for thresholds; exposed for tests/debugging. */
  averageScoreRaw: number;
  scoredLeaves: number;
  totalLeaves: number;
  /** Percentage of active leaves with actual assessment evidence. */
  coveragePct: number;
  /** Score-derived mastery for assessed leaves only. */
  masteryPct: number;
  /** Weakest assessed critical-skill score, or null when none is assessed. */
  criticalMinScore: number | null;
  /** Critical skills for which no evidence exists yet. */
  criticalUnassessed: number;
  /** How many critical skills are still below CRITICAL_MIN (8). */
  criticalBelowThreshold: number;
  stability: ReadinessStability;
  preconditions: ReadinessPreconditions & { met: boolean };
  advice: ReadinessAdvice;
  /** 0..100 Readiness Score. */
  readinessPct: number;
  phase: ReadinessPhase;
  /** Human-readable NL reasons that block "examenwaardig". */
  blockers: string[];
  disclaimer: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeStability(lessons: ReadinessLessonInput[]): ReadinessStability {
  const withScores = lessons
    .filter((l) => l.scores.length > 0)
    .slice()
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const last = withScores.slice(-STABILITY_LESSONS);
  const averages = last.map((l) => round1(mean(l.scores)));
  if (last.length < STABILITY_LESSONS) {
    return {
      stable: false,
      lessonsConsidered: last.length,
      lessonAverages: averages,
    };
  }
  const spread = Math.max(...averages) - Math.min(...averages);
  const stable =
    spread <= STABILITY_SPREAD && Math.min(...averages) >= STABILITY_FLOOR;
  return { stable, lessonsConsidered: last.length, lessonAverages: averages };
}

function phaseForPct(pct: number): ReadinessPhase {
  if (pct <= 25) return "beginfase";
  if (pct <= 50) return "ontwikkelfase";
  if (pct <= 75) return "gevorderd";
  if (pct <= 90) return "bijna_examenrijp";
  return "examenwaardig";
}

/**
 * @deprecated Use `evaluateReadiness` with normalized evidence. This legacy
 * projection treats numeric STANDARD-era scores as a display aggregate and
 * must not drive a new readiness decision or assessment override.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { skills, lessons, preconditions } = input;

  const totalLeaves = skills.length;
  const assessed = skills.filter(
    (skill): skill is ReadinessSkillInput & { score: number } =>
      skill.score !== null,
  );
  const scoredLeaves = assessed.length;
  const averageScoreRaw =
    scoredLeaves === 0 ? 0 : mean(assessed.map((skill) => skill.score));
  const coveragePct =
    totalLeaves === 0 ? 0 : Math.round((scoredLeaves / totalLeaves) * 100);

  const critical = skills.filter((s) => s.isCritical);
  const assessedCritical = critical.filter(
    (skill): skill is ReadinessSkillInput & { score: number } =>
      skill.score !== null,
  );
  const criticalUnassessed = critical.length - assessedCritical.length;
  const criticalMinScore =
    assessedCritical.length === 0
      ? null
      : Math.min(...assessedCritical.map((skill) => skill.score));
  const criticalBelowThreshold = critical.filter(
    (skill) => skill.score === null || skill.score < CRITICAL_MIN,
  ).length;

  const stability = computeStability(lessons);

  const preconditionsMet =
    preconditions.theorieBehaald &&
    preconditions.machtigingGeregeld &&
    (!preconditions.gezondheidsverklaringVereist ||
      preconditions.gezondheidsverklaringGeregeld);

  // --- Advice (deterministic, conservative) -------------------------------
  // When critical skills exist they gate every positive advice: criticalMin
  // must be >= EXAM_FLOOR to leave "niet", and >= CRITICAL_MIN (8) for any
  // positive advice. With no critical skills defined the gate is vacuous.
  const criticalAtLeastFloor =
    criticalUnassessed === 0 &&
    (criticalMinScore === null || criticalMinScore >= EXAM_FLOOR);
  const criticalAtLeast8 =
    criticalUnassessed === 0 &&
    (criticalMinScore === null || criticalMinScore >= CRITICAL_MIN);

  let advice: ReadinessAdvice;
  if (
    totalLeaves === 0 ||
    coveragePct < 100 ||
    !criticalAtLeastFloor ||
    averageScoreRaw < EXAM_FLOOR
  ) {
    advice = "niet_examenrijp";
  } else if (
    criticalAtLeast8 &&
    averageScoreRaw >= PASS_AVG &&
    stability.stable &&
    preconditionsMet
  ) {
    advice = "examenwaardig";
  } else if (criticalAtLeast8 && averageScoreRaw >= NEAR_AVG) {
    advice = "bijna_examenrijp";
  } else {
    // Above the niet-floor but not yet at the bijna gate (e.g. a critical skill
    // still 7..7.9, or average 7..7.49). A positive advice requires critical
    // >= 8, so this conservatively stays "niet examenrijp".
    advice = "niet_examenrijp";
  }

  // --- Readiness Score 0..100 --------------------------------------------
  // Map assessed mastery onto 0..100. Coverage remains an independent gate;
  // an unassessed item never enters the average as an invented low score.
  const masteryPct =
    scoredLeaves === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(((averageScoreRaw - 1) / (SCORE_MAX - 1)) * 100),
          ),
        );
  const readinessPct = Math.min(coveragePct, masteryPct);
  const phase = phaseForPct(readinessPct);

  // --- Blockers (what stands between here and examenwaardig) --------------
  const blockers: string[] = [];
  if (totalLeaves === 0) {
    blockers.push("Nog geen vaardigheden in de leskaart.");
  }
  if (coveragePct < 100 && totalLeaves > 0) {
    blockers.push(
      `Dekking is ${coveragePct}%: ${totalLeaves - scoredLeaves} ${totalLeaves - scoredLeaves === 1 ? "onderdeel is" : "onderdelen zijn"} nog niet beoordeeld.`,
    );
  }
  if (
    criticalUnassessed > 0 ||
    (criticalMinScore !== null && criticalMinScore < CRITICAL_MIN)
  ) {
    blockers.push(
      `Kritieke veiligheidsvaardigheid niet of onder niveau ${CRITICAL_MIN} ` +
        `(${criticalBelowThreshold} ${criticalBelowThreshold === 1 ? "onderdeel" : "onderdelen"}).`,
    );
  }
  if (averageScoreRaw < PASS_AVG) {
    blockers.push(`Gemiddelde score onder ${PASS_AVG}.`);
  }
  if (!stability.stable) {
    blockers.push("Laatste 3 lessen nog niet stabiel.");
  }
  if (!preconditions.theorieBehaald) {
    blockers.push("Theorie nog niet behaald.");
  }
  if (!preconditions.machtigingGeregeld) {
    blockers.push("Machtiging nog niet geregeld.");
  }
  if (
    preconditions.gezondheidsverklaringVereist &&
    !preconditions.gezondheidsverklaringGeregeld
  ) {
    blockers.push("Gezondheidsverklaring nog niet geregeld.");
  }

  return {
    averageScore: round1(averageScoreRaw),
    averageScoreRaw,
    scoredLeaves,
    totalLeaves,
    coveragePct,
    masteryPct,
    criticalMinScore,
    criticalUnassessed,
    criticalBelowThreshold,
    stability,
    preconditions: { ...preconditions, met: preconditionsMet },
    advice,
    readinessPct,
    phase,
    blockers,
    disclaimer: READINESS_DISCLAIMER,
  };
}
