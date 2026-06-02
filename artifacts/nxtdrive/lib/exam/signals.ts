import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskPriority } from "@/lib/tasks/types";

// ---------------------------------------------------------------------------
// Examenflow B — pure, deterministische schoolsignaal-engine.
//
// Zodra een examen gepland staat leidt deze engine actiegerichte signalen voor
// de rijschool af UIT OBSERVEERBARE FEITEN (examendatum-afstand, aantal geplande
// voorbereidingslessen, theoriestatus, tegoedsaldo en — optioneel — de afgeleide
// examenrijpheid). Geen handmatige status die overschreven wordt: precies zoals
// lib/cbr/derive.ts is dit de enige bron van die afleiding, zodat backoffice,
// instructeur en (indirect) leerling exact dezelfde signalen zien.
//
// De drempels zijn tenant-configureerbaar via tenant_settings (key
// 'exam_signal_policy'), nooit hardcoded per rijschool; een ontbrekende of
// malformede instelling valt altijd terug op veilige platform-defaults
// (spiegelt lib/exam/policy.ts). De afleiding zelf is puur en testbaar.
// ---------------------------------------------------------------------------

export type ExamSignalCode =
  | "theory_missing" // theoriecertificaat nog niet behaald (examen vereist dit)
  | "schedule_prep_lessons" // te weinig voorbereidingslessen gepland vóór het examen
  | "insufficient_credit" // tegoed onvoldoende voor de geplande examenbegeleiding
  | "not_ready"; // afgeleide examenrijpheid is nog "niet examenrijp"

export type ExamSignalSeverity = "info" | "warning" | "critical";

/** Eén afgeleid schoolsignaal, inclusief kant-en-klare taakmetadata. */
export type ExamSignal = {
  code: ExamSignalCode;
  severity: ExamSignalSeverity;
  title: string;
  detail: string;
  task: {
    title: string;
    description: string;
    priority: TaskPriority;
  };
};

/** Observeerbare feiten waaruit de signalen volgen. */
export type ExamSignalFacts = {
  examType: "exam" | "interim_test";
  /** ISO-tijd van het geplande examenmoment. */
  examAt: string;
  /** Aantal geplande (toekomstige) lessen tussen nu en het examen. */
  prepLessonsPlanned: number;
  /** Heeft de leerling het theoriecertificaat behaald. */
  theorieBehaald: boolean;
  /** Beschikbaar lestegoed (credits). */
  creditBalance: number;
  /**
   * Optionele afgeleide examenrijpheid (uit de leskaart-readiness-engine).
   * null/undefined = onbekend → geen not_ready-signaal.
   */
  readinessAdvice?:
    | "niet_examenrijp"
    | "bijna_examenrijp"
    | "examenwaardig"
    | null;
};

export type ExamSignalPolicy = {
  /** Minimaal aanbevolen voorbereidingslessen vóór het examen. */
  minPrepLessons: number;
  /** Minimaal tegoed om de geplande examenbegeleiding te kunnen draaien. */
  minCreditBalance: number;
  /** Alleen prep-/tegoed-signalen tonen als het examen binnen dit venster valt. */
  signalWindowDays: number;
  /** Examen binnen dit aantal dagen → severity 'critical'. */
  criticalWithinDays: number;
  /** Examen binnen dit aantal dagen → severity 'warning'. */
  warningWithinDays: number;
};

// Platform-defaults: algemeen gehouden, nooit op één rijschool toegesneden.
export const DEFAULT_EXAM_SIGNAL_POLICY: ExamSignalPolicy = {
  minPrepLessons: 3,
  minCreditBalance: 1,
  signalWindowDays: 28,
  criticalWithinDays: 7,
  warningWithinDays: 21,
};

export const EXAM_SIGNAL_POLICY_KEY = "exam_signal_policy";

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * Merge een onvertrouwde tenant-override op de platform-defaults. Saneert elke
 * waarde naar een redelijk bereik en levert altijd een compleet, geldig beleid.
 */
export function mergeExamSignalPolicy(override: unknown): ExamSignalPolicy {
  if (!override || typeof override !== "object") {
    return { ...DEFAULT_EXAM_SIGNAL_POLICY };
  }
  const o = override as Record<string, unknown>;
  return {
    minPrepLessons: clampInt(o.minPrepLessons, DEFAULT_EXAM_SIGNAL_POLICY.minPrepLessons, 0, 50),
    minCreditBalance: clampInt(o.minCreditBalance, DEFAULT_EXAM_SIGNAL_POLICY.minCreditBalance, 0, 500),
    signalWindowDays: clampInt(o.signalWindowDays, DEFAULT_EXAM_SIGNAL_POLICY.signalWindowDays, 1, 365),
    criticalWithinDays: clampInt(o.criticalWithinDays, DEFAULT_EXAM_SIGNAL_POLICY.criticalWithinDays, 0, 365),
    warningWithinDays: clampInt(o.warningWithinDays, DEFAULT_EXAM_SIGNAL_POLICY.warningWithinDays, 0, 365),
  };
}

/**
 * Lees het signaalbeleid van de tenant. De client moet tenant_settings voor deze
 * tenant kunnen lezen (RLS staat tenantleden toe; service role werkt ook). Valt
 * bij elke leesfout terug op de platform-defaults.
 */
export async function loadExamSignalPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<ExamSignalPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", EXAM_SIGNAL_POLICY_KEY)
    .maybeSingle();
  if (error) return mergeExamSignalPolicy(null);
  return mergeExamSignalPolicy(data?.value ?? null);
}

export type ExamSignalsResult = {
  examType: "exam" | "interim_test";
  examAt: string;
  /** Hele dagen tot het examen (afgerond naar boven). Negatief = in het verleden. */
  daysUntil: number;
  signals: ExamSignal[];
};

const DAY_MS = 86_400_000;

const PRIORITY_BY_SEVERITY: Record<ExamSignalSeverity, TaskPriority> = {
  info: "normal",
  warning: "high",
  critical: "urgent",
};

function urgency(daysUntil: number, policy: ExamSignalPolicy): ExamSignalSeverity {
  if (daysUntil <= policy.criticalWithinDays) return "critical";
  if (daysUntil <= policy.warningWithinDays) return "warning";
  return "info";
}

// Minstens 'warning': blokkerende feiten (theorie/niet examenrijp) zijn nooit
// louter informatief, ook niet als het examen nog ver weg is.
function atLeastWarning(severity: ExamSignalSeverity): ExamSignalSeverity {
  return severity === "info" ? "warning" : severity;
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

function dayPhrase(daysUntil: number): string {
  if (daysUntil <= 0) return "vandaag";
  if (daysUntil === 1) return "morgen";
  return `over ${daysUntil} dagen`;
}

/**
 * Leidt de schoolsignalen af uit de feiten. Pure functie: dezelfde input geeft
 * altijd dezelfde output. Geeft een lege lijst terug zodra het examen in het
 * verleden ligt (de na-examenflow is een aparte taak). Signalen staan in een
 * vaste volgorde (theorie → rijpheid → lessen → tegoed) zodat de UI en de tests
 * deterministisch zijn.
 */
export function deriveExamSignals(
  facts: ExamSignalFacts,
  policy: ExamSignalPolicy = DEFAULT_EXAM_SIGNAL_POLICY,
  now: Date = new Date(),
): ExamSignalsResult {
  const examMs = Date.parse(facts.examAt);
  const nowMs = now.getTime();
  const daysUntil = Number.isNaN(examMs)
    ? Number.NaN
    : Math.ceil((examMs - nowMs) / DAY_MS);

  const result: ExamSignalsResult = {
    examType: facts.examType,
    examAt: facts.examAt,
    daysUntil,
    signals: [],
  };

  // Geen signalen voor een examen in het verleden of een onparsebare datum.
  if (Number.isNaN(examMs) || examMs < nowMs) {
    return result;
  }

  const base = urgency(daysUntil, policy);
  const when = dayPhrase(daysUntil);
  const examLabel = facts.examType === "exam" ? "examen" : "tussentijdse toets";

  // 1. Theorie — alleen relevant voor het praktijkexamen (niet de TTT).
  if (facts.examType === "exam" && !facts.theorieBehaald) {
    const severity = atLeastWarning(base);
    result.signals.push({
      code: "theory_missing",
      severity,
      title: "Theorie ontbreekt nog",
      detail: `Het theoriecertificaat is nog niet behaald, terwijl het examen ${when} plaatsvindt.`,
      task: {
        title: "Theorie regelen vóór examen",
        description: `De leerling heeft het theoriecertificaat nog niet behaald. Het praktijkexamen staat ${when} gepland — regel of bevestig het theoriecertificaat op tijd.`,
        priority: PRIORITY_BY_SEVERITY[severity],
      },
    });
  }

  // 2. Examenrijpheid — alleen als de afgeleide rijpheid expliciet "niet" is.
  if (facts.readinessAdvice === "niet_examenrijp") {
    const severity = atLeastWarning(base);
    result.signals.push({
      code: "not_ready",
      severity,
      title: "Nog niet examenrijp",
      detail: `De leskaart wijst nog op "niet examenrijp", terwijl het ${examLabel} ${when} plaatsvindt.`,
      task: {
        title: "Examenrijpheid bespreken",
        description: `De afgeleide examenrijpheid staat op "niet examenrijp" terwijl het ${examLabel} ${when} gepland staat. Bespreek de openstaande punten of heroverweeg de planning.`,
        priority: PRIORITY_BY_SEVERITY[severity],
      },
    });
  }

  // 3. Voorbereidingslessen — alleen binnen het signaalvenster.
  if (
    daysUntil <= policy.signalWindowDays &&
    facts.prepLessonsPlanned < policy.minPrepLessons
  ) {
    const shortfall = policy.minPrepLessons - facts.prepLessonsPlanned;
    result.signals.push({
      code: "schedule_prep_lessons",
      severity: base,
      title: `Plan nog ${shortfall} voorbereidings${plural(shortfall, "les", "lessen")}`,
      detail: `Het ${examLabel} is ${when}; er ${plural(facts.prepLessonsPlanned, "staat", "staan")} ${facts.prepLessonsPlanned} voorbereidings${plural(facts.prepLessonsPlanned, "les", "lessen")} gepland (aanbevolen minimaal ${policy.minPrepLessons}).`,
      task: {
        title: "Voorbereidingslessen inplannen",
        description: `Het ${examLabel} staat ${when} gepland en er ${plural(facts.prepLessonsPlanned, "staat", "staan")} nog maar ${facts.prepLessonsPlanned} voorbereidings${plural(facts.prepLessonsPlanned, "les", "lessen")} gepland. Plan er minimaal ${shortfall} bij.`,
        priority: PRIORITY_BY_SEVERITY[base],
      },
    });
  }

  // 4. Tegoed — alleen binnen het signaalvenster.
  if (
    daysUntil <= policy.signalWindowDays &&
    facts.creditBalance < policy.minCreditBalance
  ) {
    result.signals.push({
      code: "insufficient_credit",
      severity: base,
      title: "Tegoed onvoldoende voor examenbegeleiding",
      detail: `Het beschikbare tegoed is ${facts.creditBalance} en daarmee onvoldoende voor de geplande examenbegeleiding (minimaal ${policy.minCreditBalance}).`,
      task: {
        title: "Tegoed aanvullen vóór examen",
        description: `Het beschikbare tegoed (${facts.creditBalance}) is onvoldoende voor de geplande examenbegeleiding vóór het ${examLabel} ${when}. Volg de betaling/aanvulling op.`,
        priority: PRIORITY_BY_SEVERITY[base],
      },
    });
  }

  return result;
}
