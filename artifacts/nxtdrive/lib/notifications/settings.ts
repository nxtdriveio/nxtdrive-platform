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
