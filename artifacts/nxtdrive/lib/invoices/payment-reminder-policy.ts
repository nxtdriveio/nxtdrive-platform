import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Module 6 — tenant-configurable betaalherinneringen (overdue payment
// reminders). Platform defaults overlaid with a per-tenant override stored in
// tenant_settings under key `payment_reminder`. The override is untrusted JSON,
// so every value is sanitised: `enabled` coerced to boolean and `days` clamped
// to a sorted, de-duplicated list of positive day offsets (days AFTER the
// invoice due_date at which a reminder step fires). Always returns a complete,
// valid policy. Never hardcoded per school.
// ---------------------------------------------------------------------------

export const PAYMENT_REMINDER_POLICY_KEY = "payment_reminder";

export type PaymentReminderPolicy = {
  // Whether overdue reminders are sent at all for this tenant.
  enabled: boolean;
  // Day offsets after due_date at which a reminder fires (e.g. 1, 7, 14).
  days: number[];
};

export const DEFAULT_PAYMENT_REMINDER_POLICY: PaymentReminderPolicy = {
  enabled: true,
  days: [1, 7, 14],
};

const DAY_MIN = 1;
const DAY_MAX = 365;
const MAX_STEPS = 10;

function sanitizeDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<number>();
  for (const raw of value) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const n = Math.round(raw);
    if (n < DAY_MIN || n > DAY_MAX) continue;
    seen.add(n);
  }
  const days = [...seen].sort((a, b) => a - b).slice(0, MAX_STEPS);
  return days.length > 0 ? days : null;
}

/**
 * Merge an untrusted tenant override onto the platform defaults, dropping any
 * malformed value. Always returns a complete, valid policy.
 */
export function mergePaymentReminderPolicy(
  override: unknown,
): PaymentReminderPolicy {
  const policy: PaymentReminderPolicy = {
    enabled: DEFAULT_PAYMENT_REMINDER_POLICY.enabled,
    days: [...DEFAULT_PAYMENT_REMINDER_POLICY.days],
  };
  if (!override || typeof override !== "object") return policy;
  const o = override as Record<string, unknown>;

  if (typeof o["enabled"] === "boolean") policy.enabled = o["enabled"];
  const days = sanitizeDays(o["days"]);
  if (days !== null) policy.days = days;

  return policy;
}

/**
 * Read the tenant's payment-reminder policy. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform defaults on any read error.
 */
export async function loadPaymentReminderPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<PaymentReminderPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", PAYMENT_REMINDER_POLICY_KEY)
    .maybeSingle();
  if (error) return mergePaymentReminderPolicy(null);
  return mergePaymentReminderPolicy(data?.value ?? null);
}
