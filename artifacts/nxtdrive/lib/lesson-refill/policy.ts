import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Task #93 — tenant-configurable rules for the wachtlijst / refill-invitation
// flow. Platform defaults overlaid with a per-tenant override stored in
// tenant_settings under key `lesson_refill_policy`. The override is untrusted
// JSON, so every value is sanitised: unknown keys are ignored, numbers are
// clamped to a sane range and booleans coerced. Always returns a complete,
// valid policy. Mirrors the lesson_planning_policy pattern — never hardcoded
// per school.
// ---------------------------------------------------------------------------

export const LESSON_REFILL_POLICY_KEY = "lesson_refill_policy";

export type RefillPolicy = {
  // Whether staff may send refill invitations at all for this tenant.
  enabled: boolean;
  // How long an invitation stays open before it lazily expires (minutes).
  valid_minutes: number;
  // Maximum number of simultaneously open (pending) invitations per freed block.
  max_candidates: number;
};

export const DEFAULT_REFILL_POLICY: RefillPolicy = {
  enabled: true,
  valid_minutes: 1440, // 24 uur
  max_candidates: 3,
};

const VALID_MINUTES_MIN = 15;
const VALID_MINUTES_MAX = 20160; // 14 dagen
const MAX_CANDIDATES_MIN = 1;
const MAX_CANDIDATES_MAX = 20;

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Merge an untrusted tenant override onto the platform defaults, dropping any
 * malformed value. Always returns a complete, valid policy.
 */
export function mergeRefillPolicy(override: unknown): RefillPolicy {
  const policy: RefillPolicy = { ...DEFAULT_REFILL_POLICY };
  if (!override || typeof override !== "object") return policy;
  const o = override as Record<string, unknown>;

  if (typeof o.enabled === "boolean") policy.enabled = o.enabled;
  const valid = clampInt(o.valid_minutes, VALID_MINUTES_MIN, VALID_MINUTES_MAX);
  if (valid !== null) policy.valid_minutes = valid;
  const max = clampInt(o.max_candidates, MAX_CANDIDATES_MIN, MAX_CANDIDATES_MAX);
  if (max !== null) policy.max_candidates = max;

  return policy;
}

/**
 * Read the tenant's refill policy. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform defaults on any read error.
 */
export async function loadRefillPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<RefillPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", LESSON_REFILL_POLICY_KEY)
    .maybeSingle();
  if (error) return { ...DEFAULT_REFILL_POLICY };
  return mergeRefillPolicy(data?.value ?? null);
}
