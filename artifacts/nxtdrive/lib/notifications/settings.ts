import type { SupabaseClient } from "@supabase/supabase-js";

export type ReminderSettings = {
  enabled: boolean;
  hoursBefore: number;
};

/** Sensible default when a tenant has not configured a reminder window. */
const DEFAULT_REMINDER: ReminderSettings = { enabled: true, hoursBefore: 24 };

/**
 * Reads the tenant's lesson-reminder window from tenant_settings
 * (key: `lesson_reminder`, value: { enabled, hours_before }). Never hardcoded
 * per school — falls back to a 24h default.
 */
export async function getReminderSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<ReminderSettings> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "lesson_reminder")
    .maybeSingle();

  const v = (data?.value ?? {}) as Record<string, unknown>;
  const enabled =
    typeof v["enabled"] === "boolean" ? (v["enabled"] as boolean) : DEFAULT_REMINDER.enabled;
  const hoursBefore =
    typeof v["hours_before"] === "number" && (v["hours_before"] as number) > 0
      ? (v["hours_before"] as number)
      : DEFAULT_REMINDER.hoursBefore;

  return { enabled, hoursBefore };
}

// ===========================================================================
// Task #107 — tenant-configureerbare drempels/vensters voor de nieuwe
// tijdgestuurde notificaties. Nooit hardcoded per school: elke loader leest
// tenant_settings en valt terug op een platform-default. Untrusted JSON wordt
// gesanitiseerd.
// ===========================================================================

export type LowCreditSettings = {
  enabled: boolean;
  thresholdMinutes: number;
};

const DEFAULT_LOW_CREDIT: LowCreditSettings = {
  enabled: true,
  thresholdMinutes: 60,
};

/**
 * Drempel waaronder een leerling een "lestegoed bijna op"-mail krijgt
 * (tenant_settings key `low_credit`, value: { enabled, threshold_minutes }).
 */
export async function getLowCreditSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<LowCreditSettings> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "low_credit")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const enabled =
    typeof v["enabled"] === "boolean"
      ? (v["enabled"] as boolean)
      : DEFAULT_LOW_CREDIT.enabled;
  const raw = v["threshold_minutes"];
  const thresholdMinutes =
    typeof raw === "number" && raw > 0 && raw <= 100_000
      ? Math.round(raw)
      : DEFAULT_LOW_CREDIT.thresholdMinutes;
  return { enabled, thresholdMinutes };
}

export type InstallmentDueSettings = {
  enabled: boolean;
  leadDays: number;
};

const DEFAULT_INSTALLMENT_DUE: InstallmentDueSettings = {
  enabled: true,
  leadDays: 3,
};

/**
 * Aantal dagen vóór de vervaldatum waarop een termijnfactuur-herinnering wordt
 * verstuurd (tenant_settings key `installment_due`, value: { enabled, lead_days }).
 */
export async function getInstallmentDueSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<InstallmentDueSettings> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "installment_due")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const enabled =
    typeof v["enabled"] === "boolean"
      ? (v["enabled"] as boolean)
      : DEFAULT_INSTALLMENT_DUE.enabled;
  const raw = v["lead_days"];
  const leadDays =
    typeof raw === "number" && raw >= 0 && raw <= 60
      ? Math.round(raw)
      : DEFAULT_INSTALLMENT_DUE.leadDays;
  return { enabled, leadDays };
}

export type ExamDayReminderSettings = {
  enabled: boolean;
  hoursBefore: number;
};

const DEFAULT_EXAM_DAY_REMINDER: ExamDayReminderSettings = {
  enabled: true,
  hoursBefore: 24,
};

/**
 * Venster waarbinnen een examendag-herinnering wordt verstuurd
 * (tenant_settings key `exam_day_reminder`, value: { enabled, hours_before }).
 */
export async function getExamDayReminderSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<ExamDayReminderSettings> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "exam_day_reminder")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const enabled =
    typeof v["enabled"] === "boolean"
      ? (v["enabled"] as boolean)
      : DEFAULT_EXAM_DAY_REMINDER.enabled;
  const raw = v["hours_before"];
  const hoursBefore =
    typeof raw === "number" && raw > 0 && raw <= 336
      ? Math.round(raw)
      : DEFAULT_EXAM_DAY_REMINDER.hoursBefore;
  return { enabled, hoursBefore };
}

// ===========================================================================
// Task #113 — Review- & referralflow. Tenant-configureerbare reviewmomenten:
// welke momenten actief zijn, de lesdrempel voor "na N lessen", en de
// (optionele) Google-review-URL. Nooit hardcoded per school.
// ===========================================================================

/** De vijf automatische reviewverzoek-momenten. */
export type ReviewMoment =
  | "after_trial"
  | "after_lessons"
  | "progress_milestone"
  | "exam_passed"
  | "traject_finished";

export const REVIEW_MOMENTS: readonly ReviewMoment[] = [
  "after_trial",
  "after_lessons",
  "progress_milestone",
  "exam_passed",
  "traject_finished",
] as const;

export const REVIEW_MOMENT_LABEL: Record<ReviewMoment, string> = {
  after_trial: "Na de proefles",
  after_lessons: "Na een aantal lessen",
  progress_milestone: "Bij een positieve mijlpaal",
  exam_passed: "Na een geslaagd examen",
  traject_finished: "Na afronding van het traject",
};

export const REVIEW_MOMENT_DESCRIPTION: Record<ReviewMoment, string> = {
  after_trial:
    "Stuur een reviewverzoek per e-mail zodra de proefles is afgerond.",
  after_lessons:
    "Vraag een review nadat de leerling het ingestelde aantal lessen heeft voltooid.",
  progress_milestone:
    "Vraag een review zodra de leerling examenwaardig niveau bereikt.",
  exam_passed: "Vier de overwinning en vraag een review na een geslaagd examen.",
  traject_finished:
    "Stuur een afsluitend reviewverzoek wanneer het traject wordt afgerond.",
};

/** tenant_settings sleutel voor het reviewmomenten-beleid. */
export const REVIEW_MOMENTS_KEY = "review_moments";

export type ReviewMomentsSettings = {
  /** Welke momenten een reviewverzoek mogen sturen. */
  activeMoments: Record<ReviewMoment, boolean>;
  /** Aantal voltooide lessen voor het "after_lessons"-moment. */
  lessonThreshold: number;
  /** Optionele Google-review-URL; null = val terug op de app. */
  googleReviewUrl: string | null;
};

/**
 * Platform-default: alle momenten aan, drempel 5 lessen, geen Google-URL.
 * Een tenant kan dit volledig overschrijven via tenant_settings.
 */
export const DEFAULT_REVIEW_MOMENTS: ReviewMomentsSettings = {
  activeMoments: {
    after_trial: true,
    after_lessons: true,
    progress_milestone: true,
    exam_passed: true,
    traject_finished: true,
  },
  lessonThreshold: 5,
  googleReviewUrl: null,
};

function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Leest het reviewmomenten-beleid uit tenant_settings (key `review_moments`,
 * value: { active_moments: {<moment>: bool}, lesson_threshold, google_review_url }).
 * Untrusted JSON wordt gesanitiseerd; ontbrekende velden vallen terug op de
 * platform-default.
 */
export async function getReviewMomentsSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<ReviewMomentsSettings> {
  const { data } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", "review_moments")
    .maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;

  const rawActive = (v["active_moments"] ?? {}) as Record<string, unknown>;
  const activeMoments = { ...DEFAULT_REVIEW_MOMENTS.activeMoments };
  for (const moment of REVIEW_MOMENTS) {
    if (typeof rawActive[moment] === "boolean") {
      activeMoments[moment] = rawActive[moment] as boolean;
    }
  }

  const rawThreshold = v["lesson_threshold"];
  const lessonThreshold =
    typeof rawThreshold === "number" && rawThreshold >= 1 && rawThreshold <= 1000
      ? Math.round(rawThreshold)
      : DEFAULT_REVIEW_MOMENTS.lessonThreshold;

  return {
    activeMoments,
    lessonThreshold,
    googleReviewUrl: sanitizeUrl(v["google_review_url"]),
  };
}
