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
