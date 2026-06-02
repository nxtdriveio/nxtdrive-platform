import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveExamSignals,
  mergeExamSignalPolicy,
  DEFAULT_EXAM_SIGNAL_POLICY,
  type ExamSignalFacts,
} from "./signals";

const NOW = new Date("2026-06-01T09:00:00.000Z");

function daysFromNow(days: number, hour = 9): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function baseFacts(overrides: Partial<ExamSignalFacts> = {}): ExamSignalFacts {
  return {
    examType: "exam",
    examAt: daysFromNow(20),
    prepLessonsPlanned: 5,
    theorieBehaald: true,
    creditBalance: 10,
    readinessAdvice: "examenwaardig",
    ...overrides,
  };
}

function codes(facts: ExamSignalFacts) {
  return deriveExamSignals(facts, DEFAULT_EXAM_SIGNAL_POLICY, NOW).signals.map(
    (s) => s.code,
  );
}

test("examenrijpe leerling, ruim op tijd → geen signalen", () => {
  const res = deriveExamSignals(baseFacts(), DEFAULT_EXAM_SIGNAL_POLICY, NOW);
  assert.deepEqual(res.signals, []);
  assert.equal(res.daysUntil, 20);
});

test("examen in het verleden → geen signalen", () => {
  const res = deriveExamSignals(
    baseFacts({ examAt: daysFromNow(-3), theorieBehaald: false }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  assert.deepEqual(res.signals, []);
  assert.ok(res.daysUntil < 0);
});

test("onparsebare examendatum → geen signalen, daysUntil NaN", () => {
  const res = deriveExamSignals(
    baseFacts({ examAt: "niet-een-datum" }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  assert.deepEqual(res.signals, []);
  assert.ok(Number.isNaN(res.daysUntil));
});

test("theorie niet behaald (examen) → theory_missing, minimaal warning", () => {
  const res = deriveExamSignals(
    baseFacts({ theorieBehaald: false, examAt: daysFromNow(25) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "theory_missing");
  assert.ok(sig, "theory_missing aanwezig");
  // 25 dagen > warningWithinDays(21) zou 'info' geven, maar wordt opgehoogd.
  assert.equal(sig!.severity, "warning");
  assert.equal(sig!.task.priority, "high");
});

test("theorie niet behaald maar TTT → géén theory_missing", () => {
  const res = codes(
    baseFacts({ examType: "interim_test", theorieBehaald: false }),
  );
  assert.ok(!res.includes("theory_missing"));
});

test("theorie ontbreekt vlak voor examen → critical/urgent", () => {
  const res = deriveExamSignals(
    baseFacts({ theorieBehaald: false, examAt: daysFromNow(3) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "theory_missing");
  assert.equal(sig!.severity, "critical");
  assert.equal(sig!.task.priority, "urgent");
});

test("te weinig voorbereidingslessen binnen venster → schedule_prep_lessons", () => {
  const res = deriveExamSignals(
    baseFacts({ prepLessonsPlanned: 1, examAt: daysFromNow(14) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "schedule_prep_lessons");
  assert.ok(sig);
  assert.match(sig!.title, /Plan nog 2 voorbereidingslessen/);
  assert.equal(sig!.severity, "warning"); // 14 dagen: binnen warning, buiten critical
});

test("te weinig lessen maar buiten signaalvenster → geen prep-signaal", () => {
  const policy = { ...DEFAULT_EXAM_SIGNAL_POLICY, signalWindowDays: 10 };
  const res = deriveExamSignals(
    baseFacts({ prepLessonsPlanned: 0, examAt: daysFromNow(20) }),
    policy,
    NOW,
  );
  assert.ok(!res.signals.some((s) => s.code === "schedule_prep_lessons"));
});

test("shortfall van 1 → enkelvoud 'voorbereidingsles'", () => {
  const res = deriveExamSignals(
    baseFacts({ prepLessonsPlanned: 2, examAt: daysFromNow(10) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "schedule_prep_lessons");
  assert.match(sig!.title, /Plan nog 1 voorbereidingsles$/);
});

test("onvoldoende tegoed binnen venster → insufficient_credit", () => {
  const res = deriveExamSignals(
    baseFacts({ creditBalance: 0, examAt: daysFromNow(5) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "insufficient_credit");
  assert.ok(sig);
  assert.equal(sig!.severity, "critical"); // 5 dagen ≤ criticalWithinDays(7)
});

test("voldoende tegoed → geen credit-signaal", () => {
  const res = codes(baseFacts({ creditBalance: 1, examAt: daysFromNow(5) }));
  assert.ok(!res.includes("insufficient_credit"));
});

test("niet examenrijp → not_ready, minimaal warning", () => {
  const res = deriveExamSignals(
    baseFacts({ readinessAdvice: "niet_examenrijp", examAt: daysFromNow(26) }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  const sig = res.signals.find((s) => s.code === "not_ready");
  assert.ok(sig);
  assert.equal(sig!.severity, "warning");
});

test("bijna/examenwaardig of onbekend → geen not_ready", () => {
  assert.ok(!codes(baseFacts({ readinessAdvice: "bijna_examenrijp" })).includes("not_ready"));
  assert.ok(!codes(baseFacts({ readinessAdvice: "examenwaardig" })).includes("not_ready"));
  assert.ok(!codes(baseFacts({ readinessAdvice: null })).includes("not_ready"));
  assert.ok(!codes(baseFacts({ readinessAdvice: undefined })).includes("not_ready"));
});

test("worst case: alles mis → vier signalen in vaste volgorde", () => {
  const res = deriveExamSignals(
    baseFacts({
      theorieBehaald: false,
      readinessAdvice: "niet_examenrijp",
      prepLessonsPlanned: 0,
      creditBalance: 0,
      examAt: daysFromNow(4),
    }),
    DEFAULT_EXAM_SIGNAL_POLICY,
    NOW,
  );
  assert.deepEqual(
    res.signals.map((s) => s.code),
    ["theory_missing", "not_ready", "schedule_prep_lessons", "insufficient_credit"],
  );
  // Vlak voor het examen is alles critical/urgent.
  for (const s of res.signals) {
    assert.equal(s.severity, "critical");
    assert.equal(s.task.priority, "urgent");
  }
});

test("pure functie: zelfde input → zelfde output", () => {
  const facts = baseFacts({ theorieBehaald: false, examAt: daysFromNow(6) });
  const a = deriveExamSignals(facts, DEFAULT_EXAM_SIGNAL_POLICY, NOW);
  const b = deriveExamSignals(facts, DEFAULT_EXAM_SIGNAL_POLICY, NOW);
  assert.deepEqual(a, b);
});

test("mergeExamSignalPolicy: leeg/ongeldig → defaults", () => {
  assert.deepEqual(mergeExamSignalPolicy(null), DEFAULT_EXAM_SIGNAL_POLICY);
  assert.deepEqual(mergeExamSignalPolicy("nope"), DEFAULT_EXAM_SIGNAL_POLICY);
  assert.deepEqual(mergeExamSignalPolicy(42), DEFAULT_EXAM_SIGNAL_POLICY);
});

test("mergeExamSignalPolicy: gedeeltelijke override + clamping", () => {
  const merged = mergeExamSignalPolicy({
    minPrepLessons: 5,
    minCreditBalance: -3, // clamp naar 0
    signalWindowDays: 9999, // clamp naar 365
    bogus: "x",
  });
  assert.equal(merged.minPrepLessons, 5);
  assert.equal(merged.minCreditBalance, 0);
  assert.equal(merged.signalWindowDays, 365);
  // Niet-opgegeven sleutels vallen terug op defaults.
  assert.equal(merged.criticalWithinDays, DEFAULT_EXAM_SIGNAL_POLICY.criticalWithinDays);
});

test("mergeExamSignalPolicy: niet-numerieke waarden → defaults per sleutel", () => {
  const merged = mergeExamSignalPolicy({
    minPrepLessons: "vier",
    minCreditBalance: NaN,
  });
  assert.equal(merged.minPrepLessons, DEFAULT_EXAM_SIGNAL_POLICY.minPrepLessons);
  assert.equal(merged.minCreditBalance, DEFAULT_EXAM_SIGNAL_POLICY.minCreditBalance);
});
