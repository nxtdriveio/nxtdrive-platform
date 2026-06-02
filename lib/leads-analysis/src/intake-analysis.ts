// ---------------------------------------------------------------------------
// Fase 1B — Intake-analyse (labels, score & advies).
//
// Deterministic, rule-based engine that turns a lead's intake answers into:
//   - structured labels (for showing/filtering in the backoffice),
//   - a numeric attention score + structured breakdown (attention points),
//   - a natural-language Dutch summary,
//   - a recommended next step.
//
// No AI: the scoring is fully deterministic (canon: AI is a later phase). Pure
// functions only — safe to call both at intake submission and as a backfill.
//
// Lives in a shared lib so it can be unit-tested from @workspace/scripts and
// reused without dragging in the Next.js app. The TaskPriority-dependent task
// templates (intakeAttentionTask) stay in the nxtdrive app layer.
// ---------------------------------------------------------------------------

import { z } from "zod";

// --- Intake enums (single source of truth) ---------------------------------
//
// The engine only needs the answer enums; the nxtdrive app re-exports these
// alongside its UI labels so there is no duplicate definition.

export const INTAKE_STATUSES = ["yes", "no", "unknown"] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_PACES = ["relaxed", "fast"] as const;
export type IntakePace = (typeof INTAKE_PACES)[number];

// --- Labels ----------------------------------------------------------------

export const INTAKE_LABELS = [
  "new_driver",
  "has_experience",
  "failed_exam_before",
  "theory_missing",
  "health_declaration_missing",
  "cbr_authorization_missing",
  "fast_track",
  "calm_track",
  "anxious_student",
  "flexible_availability",
  "limited_availability",
] as const;
export type IntakeLabel = (typeof INTAKE_LABELS)[number];

export type IntakeBadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export const INTAKE_LABEL_INFO: Record<
  IntakeLabel,
  { label: string; variant: IntakeBadgeVariant }
> = {
  new_driver: { label: "Beginnend bestuurder", variant: "info" },
  has_experience: { label: "Heeft rijervaring", variant: "success" },
  failed_exam_before: { label: "Eerder gezakt", variant: "warning" },
  theory_missing: { label: "Theorie ontbreekt", variant: "warning" },
  health_declaration_missing: {
    label: "Gezondheidsverklaring open",
    variant: "warning",
  },
  cbr_authorization_missing: { label: "CBR-machtiging open", variant: "warning" },
  fast_track: { label: "Snel traject", variant: "primary" },
  calm_track: { label: "Rustig traject", variant: "info" },
  anxious_student: { label: "Faalangst / onzeker", variant: "danger" },
  flexible_availability: { label: "Ruime beschikbaarheid", variant: "success" },
  limited_availability: { label: "Beperkte beschikbaarheid", variant: "warning" },
};

// --- Attention points (score breakdown) ------------------------------------

export type IntakeAttentionCategory =
  | "begeleiding"
  | "herexamen"
  | "theorie"
  | "administratie"
  | "planning";

export type IntakeAttentionPoint = {
  code: string;
  label: string;
  points: number;
  category: IntakeAttentionCategory;
};

export const INTAKE_ATTENTION_CATEGORY_LABEL: Record<
  IntakeAttentionCategory,
  string
> = {
  begeleiding: "Begeleiding",
  herexamen: "Herexamen",
  theorie: "Theorie",
  administratie: "Administratie",
  planning: "Planning",
};

/** Stable dedupe key so clicking twice never creates a duplicate open task. */
export function intakeAttentionDedupeKey(leadId: string, code: string): string {
  return `lead:${leadId}:intake:${code}`;
}

// --- Recommended next step -------------------------------------------------

export const INTAKE_RECOMMENDED_STEPS = [
  "plan_trial_lesson",
  "theory_reminder",
  "admin_action",
  "contact_student",
] as const;
export type IntakeRecommendedStep = (typeof INTAKE_RECOMMENDED_STEPS)[number];

export const INTAKE_RECOMMENDED_STEP_LABEL: Record<
  IntakeRecommendedStep,
  string
> = {
  plan_trial_lesson: "Proefles plannen",
  theory_reminder: "Theorie herinneren",
  admin_action: "Administratie-actie",
  contact_student: "Contact opnemen",
};

// --- Input / output --------------------------------------------------------

export type IntakeAnalysisInput = {
  city: string | null;
  pickup_location: string | null;
  has_driving_experience: boolean | null;
  had_lessons_before: boolean | null;
  has_done_exam: boolean | null;
  theory_status: IntakeStatus;
  health_declaration_status: IntakeStatus;
  cbr_authorization_status: IntakeStatus;
  preferred_days: string[];
  preferred_times: string[];
  desired_start_date: string | null;
  lessons_per_week: number | null;
  pace: IntakePace | null;
  has_anxiety: boolean | null;
};

export type IntakeAnalysis = {
  labels: IntakeLabel[];
  score: number;
  attention_points: IntakeAttentionPoint[];
  summary: string;
  recommended_step: IntakeRecommendedStep;
};

// --- Runtime validation ----------------------------------------------------
//
// The engine is fed by the public intake wizard and the backoffice backfill,
// both of which assemble this object from form/DB data. A malformed value (an
// out-of-enum status, a non-array preferred_days, a non-boolean flag, …) would
// otherwise silently produce wrong labels/scores. This schema mirrors
// IntakeAnalysisInput so bad data fails loudly at the engine boundary instead.
export const intakeAnalysisInputSchema = z.object({
  city: z.string().nullable(),
  pickup_location: z.string().nullable(),
  has_driving_experience: z.boolean().nullable(),
  had_lessons_before: z.boolean().nullable(),
  has_done_exam: z.boolean().nullable(),
  theory_status: z.enum(INTAKE_STATUSES),
  health_declaration_status: z.enum(INTAKE_STATUSES),
  cbr_authorization_status: z.enum(INTAKE_STATUSES),
  preferred_days: z.array(z.string()),
  preferred_times: z.array(z.string()),
  desired_start_date: z.string().nullable(),
  lessons_per_week: z.number().nullable(),
  pace: z.enum(INTAKE_PACES).nullable(),
  has_anxiety: z.boolean().nullable(),
}) satisfies z.ZodType<IntakeAnalysisInput>;

/**
 * Validate raw intake answers against {@link intakeAnalysisInputSchema}. Throws
 * a clear, single-line Error listing every offending field on invalid input —
 * never returns a partially-coerced object. Used as the guard inside
 * {@link analyzeIntake}, but exported so callers can validate up front too.
 */
export function parseIntakeAnalysisInput(
  input: unknown,
): IntakeAnalysisInput {
  const parsed = intakeAnalysisInputSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Ongeldige intake-gegevens voor analyse: ${details}`);
  }
  return parsed.data;
}

// Stored row shape (1:1 with a lead) as read back from the DB.
export type LeadIntakeAnalysis = {
  id: string;
  lead_id: string;
  tenant_id: string;
  labels: string[];
  score: number;
  attention_points: IntakeAttentionPoint[];
  summary: string;
  recommended_step: string;
  created_at: string;
  updated_at: string;
};

// --- Helpers ---------------------------------------------------------------

/** Join a list as a natural Dutch enumeration: "a, b en c". */
function joinNl(parts: string[]): string {
  const items = parts.filter((p) => p.length > 0);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}`;
}

const summaryDateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : summaryDateFmt.format(new Date(t));
}

/**
 * Classify availability from the chosen preferred days. Returns "flexible" when
 * the learner offers many days, "limited" when only one or two, otherwise null
 * (unknown — no day preference was given).
 */
function availabilityClass(
  preferredDays: string[],
): "flexible" | "limited" | null {
  const n = preferredDays.length;
  if (n === 0) return null;
  if (n >= 4) return "flexible";
  if (n <= 2) return "limited";
  return null;
}

// --- Engine ----------------------------------------------------------------

export function analyzeIntake(input: IntakeAnalysisInput): IntakeAnalysis {
  // Catch broken intake answers before they reach scoring: a malformed value
  // must fail loudly here, never silently yield a wrong label/score.
  parseIntakeAnalysisInput(input);

  const labels: IntakeLabel[] = [];
  const attention: IntakeAttentionPoint[] = [];

  const add = (label: IntakeLabel) => {
    if (!labels.includes(label)) labels.push(label);
  };
  const flag = (point: IntakeAttentionPoint) => attention.push(point);

  // Driving experience.
  if (input.has_driving_experience === false) {
    add("new_driver");
    flag({
      code: "no_experience",
      label: "Geen rijervaring — extra begeleiding nodig",
      points: 2,
      category: "begeleiding",
    });
  } else if (input.has_driving_experience === true) {
    add("has_experience");
  }

  // Earlier exam (re-exam focus).
  if (input.has_done_exam === true) {
    add("failed_exam_before");
    flag({
      code: "failed_exam_before",
      label: "Eerder examen gedaan — herexamenfocus",
      points: 3,
      category: "herexamen",
    });
  }

  // Theory not passed.
  if (input.theory_status === "no") {
    add("theory_missing");
    flag({
      code: "theory_missing",
      label: "Theorie niet gehaald — theorieactie",
      points: 2,
      category: "theorie",
    });
  }

  // Health declaration not arranged.
  if (input.health_declaration_status === "no") {
    add("health_declaration_missing");
    flag({
      code: "health_declaration_missing",
      label: "Gezondheidsverklaring niet geregeld — administratie",
      points: 2,
      category: "administratie",
    });
  }

  // CBR authorization not arranged.
  if (input.cbr_authorization_status === "no") {
    add("cbr_authorization_missing");
    flag({
      code: "cbr_authorization_missing",
      label: "CBR-machtiging niet geregeld — administratie",
      points: 2,
      category: "administratie",
    });
  }

  // Anxiety / insecurity.
  if (input.has_anxiety === true) {
    add("anxious_student");
    flag({
      code: "anxious_student",
      label: "Faalangst/onzekerheid — rustige planning",
      points: 3,
      category: "planning",
    });
  }

  // Pace.
  if (input.pace === "fast") {
    add("fast_track");
    flag({
      code: "fast_track",
      label: "Snel traject — hogere lesfrequentie",
      points: 2,
      category: "planning",
    });
  } else if (input.pace === "relaxed") {
    add("calm_track");
  }

  // Availability.
  const availability = availabilityClass(input.preferred_days);
  if (availability === "flexible") {
    add("flexible_availability");
  } else if (availability === "limited") {
    add("limited_availability");
    flag({
      code: "limited_availability",
      label: "Beperkte beschikbaarheid — planningsrisico",
      points: 2,
      category: "planning",
    });
  }

  const score = attention.reduce((sum, p) => sum + p.points, 0);
  const summary = buildSummary(input, labels);
  const recommended_step = recommendStep(input);

  return { labels, score, attention_points: attention, summary, recommended_step };
}

function recommendStep(_input: IntakeAnalysisInput): IntakeRecommendedStep {
  // A brand-new lead's logical first step is always to plan a trial lesson; the
  // open admin/theory actions are surfaced separately as attention points.
  return "plan_trial_lesson";
}

function buildSummary(
  input: IntakeAnalysisInput,
  labels: IntakeLabel[],
): string {
  const sentences: string[] = [];

  // 1. Opening + location.
  const loc = joinNl(
    [input.city, input.pickup_location].filter(
      (v): v is string => !!v && v.length > 0,
    ),
  );
  sentences.push(loc ? `Nieuwe aanvraag uit ${loc}.` : "Nieuwe aanvraag.");

  // 2. Learner profile (pace, experience, anxiety).
  const profile: string[] = [];
  if (input.pace === "fast") profile.push("wil snel starten");
  else if (input.pace === "relaxed") profile.push("wil rustig opbouwen");
  if (input.has_driving_experience === true)
    profile.push("heeft al rijervaring");
  else if (input.has_driving_experience === false)
    profile.push("is beginnend bestuurder");
  if (input.has_anxiety === true) profile.push("geeft faalangst/onzekerheid aan");
  if (profile.length > 0) {
    sentences.push(`Leerling ${joinNl(profile)}.`);
  }

  // 3. Theory / exam / admin status.
  const status: string[] = [];
  if (input.has_done_exam === true)
    status.push("heeft eerder al examen gedaan");
  if (input.theory_status === "no") status.push("heeft nog geen theorie gehaald");
  else if (input.theory_status === "yes") status.push("heeft theorie al gehaald");
  if (input.health_declaration_status === "no")
    status.push("gezondheidsverklaring nog niet geregeld");
  if (input.cbr_authorization_status === "no")
    status.push("CBR-machtiging nog niet geregeld");
  if (status.length > 0) {
    sentences.push(`${capitalize(joinNl(status))}.`);
  }

  // 4. Availability + planning wishes.
  const planning: string[] = [];
  if (labels.includes("limited_availability"))
    planning.push("beperkte beschikbaarheid");
  else if (labels.includes("flexible_availability"))
    planning.push("ruime beschikbaarheid");
  if (input.lessons_per_week != null)
    planning.push(`wil ${input.lessons_per_week} ${input.lessons_per_week === 1 ? "les" : "lessen"} per week`);
  const start = fmtDate(input.desired_start_date);
  if (start) planning.push(`gewenste startdatum ${start}`);
  if (planning.length > 0) {
    sentences.push(`${capitalize(joinNl(planning))}.`);
  }

  // 5. Advice.
  const openActions: string[] = [];
  if (input.theory_status === "no") openActions.push("theorie herinneren");
  if (
    input.health_declaration_status === "no" ||
    input.cbr_authorization_status === "no"
  )
    openActions.push("administratie aanvullen");
  const advice =
    openActions.length > 0
      ? `Advies: proefles plannen, daarna pakketadvies; open acties: ${joinNl(openActions)}.`
      : "Advies: proefles plannen, daarna pakketadvies.";
  sentences.push(advice);

  return sentences.join(" ");
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
