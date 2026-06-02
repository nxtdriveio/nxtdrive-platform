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

export type LeadScoreResult = {
  score: number;
  reasons: LeadScoreReason[];
};

export function scoreLead(input: LeadScoreInput): LeadScoreResult {
  const reasons: LeadScoreReason[] = [];
  let total = 0;
  for (const rule of RULES) {
    if (rule.when(input)) {
      total += rule.points;
      reasons.push({ code: rule.code, label: rule.label, points: rule.points });
    }
  }
  const score = Math.max(0, Math.min(100, total));
  return { score, reasons };
}

/** Coarse band for badge colour / sorting hints. */
export function leadScoreBand(score: number): "cold" | "warm" | "hot" {
  if (score >= 60) return "hot";
  if (score >= 30) return "warm";
  return "cold";
}
