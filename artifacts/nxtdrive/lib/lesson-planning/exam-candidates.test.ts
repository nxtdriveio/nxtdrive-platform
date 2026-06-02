import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateExamEligibility,
  scoreExamCandidate,
  type ExamCandidateInput,
} from "./exam-candidates";
import { DEFAULT_LESSON_PLAN_POLICY } from "./policy";
import type { SlotInfo } from "./candidates";

// A Tuesday-morning 90-minute exam slot (UTC). 09:00 → morning daypart.
const SLOT: SlotInfo = (() => {
  const startMs = Date.parse("2026-06-09T09:00:00.000Z");
  return { startMs, endMs: startMs + 90 * 60 * 1000, durationMin: 90 };
})();

const POLICY = DEFAULT_LESSON_PLAN_POLICY;

// A fully-eligible, exam-ready baseline candidate; override per test.
function candidate(over: Partial<ExamCandidateInput> = {}): ExamCandidateInput {
  return {
    studentId: "s1",
    fullName: "Test Leerling",
    balanceMin: 120,
    preferredDayparts: [],
    theorieBehaald: true,
    machtigingOntvangen: true,
    gezondheidsverklaringVereist: false,
    gezondheidsverklaringGeregeld: false,
    examStatus: "geen",
    lastExamResult: null,
    hasUpcomingExam: false,
    readinessAdvice: "examenwaardig",
    criticalBelowThreshold: 0,
    readinessPct: 92,
    ...over,
  };
}

// --- Eligibility ----------------------------------------------------------

test("voldoet aan alle voorwaarden → eligible", () => {
  const v = evaluateExamEligibility(candidate(), SLOT, false);
  assert.equal(v.kind, "eligible");
});

test("al bezet over het slot → excluded (niet getoond)", () => {
  const v = evaluateExamEligibility(candidate(), SLOT, true);
  assert.equal(v.kind, "excluded");
});

test("al geslaagd → excluded (geen examen meer nodig)", () => {
  const v = evaluateExamEligibility(
    candidate({ examStatus: "geslaagd" }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "excluded");
});

test("heeft al een examen gepland → excluded", () => {
  const v = evaluateExamEligibility(
    candidate({ hasUpcomingExam: true }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "excluded");
});

test("theorie niet behaald → blocked met reden", () => {
  const v = evaluateExamEligibility(
    candidate({ theorieBehaald: false }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "blocked");
  assert.ok(v.kind === "blocked" && v.blockers.includes("Theorie nog niet behaald"));
});

test("machtiging niet ontvangen → blocked met reden", () => {
  const v = evaluateExamEligibility(
    candidate({ machtigingOntvangen: false }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "blocked");
  assert.ok(
    v.kind === "blocked" && v.blockers.includes("Machtiging nog niet ontvangen"),
  );
});

test("gezondheidsverklaring vereist maar niet geregeld → blocked", () => {
  const v = evaluateExamEligibility(
    candidate({
      gezondheidsverklaringVereist: true,
      gezondheidsverklaringGeregeld: false,
    }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "blocked");
  assert.ok(
    v.kind === "blocked" &&
      v.blockers.includes("Gezondheidsverklaring nog niet geregeld"),
  );
});

test("onvoldoende tegoed voor de slotduur → blocked", () => {
  const v = evaluateExamEligibility(
    candidate({ balanceMin: 60 }), // < 90 min slot
    SLOT,
    false,
  );
  assert.equal(v.kind, "blocked");
  assert.ok(v.kind === "blocked" && v.blockers.includes("Onvoldoende tegoed"));
});

test("meerdere ontbrekende voorwaarden → alle redenen verzameld", () => {
  const v = evaluateExamEligibility(
    candidate({
      theorieBehaald: false,
      machtigingOntvangen: false,
      balanceMin: 0,
    }),
    SLOT,
    false,
  );
  assert.equal(v.kind, "blocked");
  assert.ok(v.kind === "blocked" && v.blockers.length === 3);
});

test("busy gaat vóór de blocker-controle (excluded wint)", () => {
  const v = evaluateExamEligibility(
    candidate({ theorieBehaald: false }),
    SLOT,
    true,
  );
  assert.equal(v.kind, "excluded");
});

// --- Scoring --------------------------------------------------------------

test("examenwaardig krijgt de hoogste readiness-bonus", () => {
  const { score, factors } = scoreExamCandidate(candidate(), SLOT, POLICY);
  assert.ok(factors.some((f) => f.key === "exam_ready"));
  // examenwaardig + waiting (geen examen gepland) = 35 + 15
  assert.equal(score, POLICY.exam_ready_points + POLICY.exam_waiting_points);
});

test("niet examenrijp krijgt een negatieve factor en lagere score", () => {
  const ready = scoreExamCandidate(candidate(), SLOT, POLICY).score;
  const notReady = scoreExamCandidate(
    candidate({ readinessAdvice: "niet_examenrijp" }),
    SLOT,
    POLICY,
  );
  assert.ok(notReady.factors.some((f) => f.key === "exam_not_ready"));
  assert.ok(notReady.score < ready);
});

test("eerder gezakt → herexamen-urgentie telt mee", () => {
  const { factors } = scoreExamCandidate(
    candidate({
      examStatus: "gezakt",
      lastExamResult: "failed",
      readinessAdvice: "bijna_examenrijp",
    }),
    SLOT,
    POLICY,
  );
  assert.ok(factors.some((f) => f.key === "exam_failed_before"));
});

test("wacht-bonus alleen voor (bijna) examenrijp zonder gepland examen", () => {
  const notReady = scoreExamCandidate(
    candidate({ readinessAdvice: "niet_examenrijp" }),
    SLOT,
    POLICY,
  );
  assert.ok(!notReady.factors.some((f) => f.key === "exam_waiting"));
});

test("voorkeursdagdeel matcht de ochtend-slot → beschikbaarheidsbonus", () => {
  const { factors } = scoreExamCandidate(
    candidate({ preferredDayparts: ["morning"] }),
    SLOT,
    POLICY,
  );
  assert.ok(factors.some((f) => f.key === "exam_preferred_daypart"));
});

test("kritieke aandachtspunten open → negatieve factor", () => {
  const { factors } = scoreExamCandidate(
    candidate({ criticalBelowThreshold: 2 }),
    SLOT,
    POLICY,
  );
  assert.ok(factors.some((f) => f.key === "exam_critical_gap"));
});

test("geen readiness-data → geen readiness-factoren, score blijft eindig", () => {
  const { score, factors } = scoreExamCandidate(
    candidate({ readinessAdvice: null, readinessPct: null }),
    SLOT,
    POLICY,
  );
  assert.ok(!factors.some((f) => f.key === "exam_ready"));
  assert.ok(!factors.some((f) => f.key === "exam_waiting"));
  assert.ok(Number.isFinite(score));
});
