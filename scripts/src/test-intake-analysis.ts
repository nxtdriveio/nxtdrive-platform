/**
 * Fase 1B — Intake-analyse engine tests.
 *
 *   pnpm --filter @workspace/scripts run db:test-intake-analysis
 *
 * Pure, deterministic engine (analyzeIntake) — no DB, no env required. Locks
 * down the labels, attention-point breakdown, total score and recommended step
 * for representative intake profiles + boundary/edge cases, so a regression in
 * the scoring rules never silently changes what instructors see for new leads.
 */
import {
  analyzeIntake,
  INTAKE_LABEL_INFO,
  INTAKE_ATTENTION_CATEGORY_LABEL,
  INTAKE_RECOMMENDED_STEP_LABEL,
  type IntakeAnalysisInput,
  type IntakeAttentionCategory,
} from "@workspace/leads-analysis";

type Outcome = { name: string; ok: boolean; detail?: string };

const results: Outcome[] = [];
function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

/** A neutral baseline: everything unknown/empty. Override per scenario. */
function baseInput(over: Partial<IntakeAnalysisInput> = {}): IntakeAnalysisInput {
  return {
    city: null,
    pickup_location: null,
    has_driving_experience: null,
    had_lessons_before: null,
    has_done_exam: null,
    theory_status: "unknown",
    health_declaration_status: "unknown",
    cbr_authorization_status: "unknown",
    preferred_days: [],
    preferred_times: [],
    desired_start_date: null,
    lessons_per_week: null,
    pace: null,
    has_anxiety: null,
    ...over,
  };
}

const sortedEq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

function codesOf(points: { code: string }[]) {
  return points.map((p) => p.code);
}

// --- Scenario 1: brand-new, anxious, fast-track, missing theory + CBR -------
{
  const res = analyzeIntake(
    baseInput({
      city: "Utrecht",
      has_driving_experience: false,
      has_done_exam: false,
      theory_status: "no",
      health_declaration_status: "unknown",
      cbr_authorization_status: "no",
      has_anxiety: true,
      pace: "fast",
      preferred_days: ["mon", "tue"],
      lessons_per_week: 3,
    }),
  );

  const expectedLabels = [
    "new_driver",
    "theory_missing",
    "cbr_authorization_missing",
    "anxious_student",
    "fast_track",
    "limited_availability",
  ];
  const expectedCodes = [
    "no_experience",
    "theory_missing",
    "cbr_authorization_missing",
    "anxious_student",
    "fast_track",
    "limited_availability",
  ];
  // 2 + 2 + 2 + 3 + 2 + 2 = 13
  assert(
    "new+anxious+fast: labels",
    sortedEq(res.labels, expectedLabels),
    res.labels.join(","),
  );
  assert(
    "new+anxious+fast: attention codes",
    sortedEq(codesOf(res.attention_points), expectedCodes),
    codesOf(res.attention_points).join(","),
  );
  assert(
    "new+anxious+fast: score is 13",
    res.score === 13,
    `score=${res.score}`,
  );
  assert(
    "new+anxious+fast: score equals sum of points",
    res.score === res.attention_points.reduce((s, p) => s + p.points, 0),
    `score=${res.score}`,
  );
  assert(
    "new+anxious+fast: recommended step = plan_trial_lesson",
    res.recommended_step === "plan_trial_lesson",
    res.recommended_step,
  );
  assert(
    "new+anxious+fast: summary mentions location + anxiety",
    res.summary.includes("Utrecht") &&
      /faalangst/i.test(res.summary) &&
      res.summary.includes("theorie herinneren"),
    res.summary,
  );
}

// --- Scenario 2: experienced, calm, everything arranged --------------------
{
  const res = analyzeIntake(
    baseInput({
      city: "Amsterdam",
      has_driving_experience: true,
      has_done_exam: false,
      theory_status: "yes",
      health_declaration_status: "yes",
      cbr_authorization_status: "yes",
      has_anxiety: false,
      pace: "relaxed",
      preferred_days: ["mon", "tue", "wed", "thu", "fri"],
    }),
  );

  assert(
    "experienced+calm: labels",
    sortedEq(res.labels, ["has_experience", "calm_track", "flexible_availability"]),
    res.labels.join(","),
  );
  assert(
    "experienced+calm: no attention points",
    res.attention_points.length === 0,
    codesOf(res.attention_points).join(","),
  );
  assert("experienced+calm: score is 0", res.score === 0, `score=${res.score}`);
  assert(
    "experienced+calm: recommended step = plan_trial_lesson",
    res.recommended_step === "plan_trial_lesson",
    res.recommended_step,
  );
  assert(
    "experienced+calm: summary has no open actions",
    !res.summary.includes("open acties") &&
      res.summary.includes("Advies: proefles plannen, daarna pakketadvies."),
    res.summary,
  );
}

// --- Scenario 3: edge — everything unknown / no availability ---------------
{
  const res = analyzeIntake(baseInput());
  assert("all-unknown: no labels", res.labels.length === 0, res.labels.join(","));
  assert(
    "all-unknown: no attention points",
    res.attention_points.length === 0,
    codesOf(res.attention_points).join(","),
  );
  assert("all-unknown: score is 0", res.score === 0, `score=${res.score}`);
  assert(
    "all-unknown: recommended step = plan_trial_lesson",
    res.recommended_step === "plan_trial_lesson",
    res.recommended_step,
  );
  assert(
    "all-unknown: summary is minimal",
    res.summary ===
      "Nieuwe aanvraag. Advies: proefles plannen, daarna pakketadvies.",
    res.summary,
  );
}

// --- Scenario 4: edge — returning student who already sat an exam ----------
{
  const res = analyzeIntake(
    baseInput({
      has_driving_experience: true,
      has_done_exam: true,
      theory_status: "yes",
      health_declaration_status: "yes",
      cbr_authorization_status: "yes",
      preferred_days: ["mon", "tue", "wed"], // 3 days => neutral availability
    }),
  );
  assert(
    "returning-exam: labels (has_experience + failed_exam_before)",
    sortedEq(res.labels, ["has_experience", "failed_exam_before"]),
    res.labels.join(","),
  );
  assert(
    "returning-exam: single attention point failed_exam_before (+3)",
    codesOf(res.attention_points).join(",") === "failed_exam_before" &&
      res.score === 3,
    `codes=${codesOf(res.attention_points).join(",")} score=${res.score}`,
  );
  assert(
    "returning-exam: failed_exam_before is herexamen category",
    res.attention_points[0]?.category === "herexamen",
    res.attention_points[0]?.category,
  );
}

// --- Scenario 5: availability boundaries (2=limited, 3=neutral, 4=flexible) --
{
  const limited = analyzeIntake(baseInput({ preferred_days: ["mon", "tue"] }));
  const neutral = analyzeIntake(
    baseInput({ preferred_days: ["mon", "tue", "wed"] }),
  );
  const flexible = analyzeIntake(
    baseInput({ preferred_days: ["mon", "tue", "wed", "thu"] }),
  );
  assert(
    "availability: 2 days => limited (+2)",
    limited.labels.includes("limited_availability") && limited.score === 2,
    `labels=${limited.labels.join(",")} score=${limited.score}`,
  );
  assert(
    "availability: 3 days => neither label, score 0",
    neutral.labels.length === 0 && neutral.score === 0,
    `labels=${neutral.labels.join(",")} score=${neutral.score}`,
  );
  assert(
    "availability: 4 days => flexible (label only, score 0)",
    flexible.labels.includes("flexible_availability") && flexible.score === 0,
    `labels=${flexible.labels.join(",")} score=${flexible.score}`,
  );
}

// --- Scenario 6: edge — explicit "unknown" statuses raise no flags ----------
{
  // A "yes" theory + "unknown" admin must not add admin/theory attention.
  const res = analyzeIntake(
    baseInput({
      theory_status: "unknown",
      health_declaration_status: "unknown",
      cbr_authorization_status: "unknown",
    }),
  );
  assert(
    "unknown-statuses: no theory/admin flags",
    !codesOf(res.attention_points).some((c) =>
      ["theory_missing", "health_declaration_missing", "cbr_authorization_missing"].includes(c),
    ),
    codesOf(res.attention_points).join(","),
  );
}

// --- Structural invariants --------------------------------------------------
{
  // Every produced label is renderable, every category known, step labelled.
  const res = analyzeIntake(
    baseInput({
      has_driving_experience: false,
      has_done_exam: true,
      theory_status: "no",
      health_declaration_status: "no",
      cbr_authorization_status: "no",
      has_anxiety: true,
      pace: "fast",
      preferred_days: ["mon"],
    }),
  );
  const knownCats = new Set<IntakeAttentionCategory>(
    Object.keys(INTAKE_ATTENTION_CATEGORY_LABEL) as IntakeAttentionCategory[],
  );
  assert(
    "invariants: all labels have render info",
    res.labels.every((l) => l in INTAKE_LABEL_INFO),
    res.labels.join(","),
  );
  assert(
    "invariants: all attention categories are known",
    res.attention_points.every((p) => knownCats.has(p.category)),
    res.attention_points.map((p) => p.category).join(","),
  );
  assert(
    "invariants: recommended step is labelled",
    res.recommended_step in INTAKE_RECOMMENDED_STEP_LABEL,
    res.recommended_step,
  );
  assert(
    "invariants: every attention point carries positive points",
    res.attention_points.every((p) => p.points > 0),
    res.attention_points.map((p) => `${p.code}:${p.points}`).join(","),
  );
}

// --- Report -----------------------------------------------------------------
console.log("NXTDRIVE — Fase 1B intake-analyse engine tests");
let failed = 0;
for (const o of results) {
  const tag = o.ok ? "✅" : "❌";
  if (!o.ok) failed++;
  console.log(`${tag} ${o.name}${o.detail ? ` — ${o.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0) process.exit(1);
