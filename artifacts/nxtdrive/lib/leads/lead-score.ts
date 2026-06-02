import type { LeadScoreReason } from "@/lib/leads/types";

// ---------------------------------------------------------------------------
// Pure, deterministic lead scoring (Task #54).
//
// No I/O, no clock except the `now` injected by the caller, so it is trivially
// unit-testable and produces identical output for identical input. Score is
// clamped to 0–100. Reasons are returned so the UI can explain the number.
// ---------------------------------------------------------------------------

export type LeadScoreInput = {
  hasPhone: boolean;
  hasEmail: boolean;
  hasIntake: boolean;
  theoryPassed: boolean;
  cbrAuthorized: boolean;
  healthDeclared: boolean;
  /** Days until desired start date (null when unknown). */
  daysUntilDesiredStart: number | null;
  lessonsPerWeek: number | null;
  isReferral: boolean;
  trialPlanned: boolean;
  trialConfirmed: boolean;
  trialCompleted: boolean;
  /** Days since the last activity on the lead. */
  daysSinceActivity: number | null;
};

type Rule = {
  code: string;
  label: string;
  points: number;
  when: (i: LeadScoreInput) => boolean;
};

const RULES: Rule[] = [
  { code: "phone", label: "Telefoonnummer bekend", points: 10, when: (i) => i.hasPhone },
  { code: "email", label: "E-mailadres bekend", points: 5, when: (i) => i.hasEmail },
  { code: "intake", label: "Intake ingevuld", points: 15, when: (i) => i.hasIntake },
  { code: "theory", label: "Theorie gehaald", points: 10, when: (i) => i.theoryPassed },
  { code: "cbr", label: "CBR-machtiging geregeld", points: 5, when: (i) => i.cbrAuthorized },
  { code: "health", label: "Gezondheidsverklaring rond", points: 5, when: (i) => i.healthDeclared },
  {
    code: "soon",
    label: "Wil snel starten",
    points: 15,
    when: (i) => i.daysUntilDesiredStart !== null && i.daysUntilDesiredStart <= 30,
  },
  {
    code: "intensity",
    label: "Wil meerdere lessen per week",
    points: 5,
    when: (i) => (i.lessonsPerWeek ?? 0) >= 2,
  },
  { code: "referral", label: "Via referral binnengekomen", points: 5, when: (i) => i.isReferral },
  { code: "trial_planned", label: "Proefles gepland", points: 15, when: (i) => i.trialPlanned },
  { code: "trial_confirmed", label: "Proefles bevestigd", points: 10, when: (i) => i.trialConfirmed },
  { code: "trial_completed", label: "Proefles afgerond", points: 10, when: (i) => i.trialCompleted },
  {
    code: "fresh",
    label: "Recent contact",
    points: 10,
    when: (i) => i.daysSinceActivity !== null && i.daysSinceActivity <= 3,
  },
];

// ---------------------------------------------------------------------------
// Tenant-configurable scoring policy (Fase 1B — Task #56).
//
// The point value of every rule and the warm/hot band thresholds are platform
// defaults that a tenant may override via tenant_settings key `lead_score_policy`
// (loaded + sanitised server-side in lead-score-policy.ts). Rule *conditions*
// stay in code (deterministic, no AI); only the weights + bands are tunable, so
// a school can emphasise what matters to them — never hardcoded per school.
// ---------------------------------------------------------------------------

export type LeadScoreWeightCode = (typeof RULES)[number]["code"];

export type LeadScorePolicy = {
  /** Point value per rule code. */
  weights: Record<string, number>;
  /** Score band thresholds (inclusive lower bounds). warm <= hot. */
  bands: { warm: number; hot: number };
};

/** The set of rule codes a tenant override may set (anything else is ignored). */
export const LEAD_SCORE_WEIGHT_CODES: readonly string[] = RULES.map((r) => r.code);

/** Human labels for each weight code (for a future settings UI / docs). */
export const LEAD_SCORE_WEIGHT_LABEL: Record<string, string> = Object.fromEntries(
  RULES.map((r) => [r.code, r.label]),
);

export const DEFAULT_LEAD_SCORE_POLICY: LeadScorePolicy = {
  weights: Object.fromEntries(RULES.map((r) => [r.code, r.points])),
  bands: { warm: 30, hot: 60 },
};

export type LeadScoreResult = {
  score: number;
  reasons: LeadScoreReason[];
};

export function scoreLead(
  input: LeadScoreInput,
  policy: LeadScorePolicy = DEFAULT_LEAD_SCORE_POLICY,
): LeadScoreResult {
  const reasons: LeadScoreReason[] = [];
  let total = 0;
  for (const rule of RULES) {
    if (rule.when(input)) {
      const points = policy.weights[rule.code] ?? rule.points;
      total += points;
      reasons.push({ code: rule.code, label: rule.label, points });
    }
  }
  const score = Math.max(0, Math.min(100, total));
  return { score, reasons };
}

/** Coarse band for badge colour / sorting hints. */
export function leadScoreBand(
  score: number,
  policy: LeadScorePolicy = DEFAULT_LEAD_SCORE_POLICY,
): "cold" | "warm" | "hot" {
  if (score >= policy.bands.hot) return "hot";
  if (score >= policy.bands.warm) return "warm";
  return "cold";
}
