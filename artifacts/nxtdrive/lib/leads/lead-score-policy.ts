import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LEAD_SCORE_POLICY,
  LEAD_SCORE_WEIGHT_CODES,
  type LeadScorePolicy,
} from "@/lib/leads/lead-score";

// ---------------------------------------------------------------------------
// Fase 1B (Task #56) — load the tenant's lead scoring policy.
//
// Platform defaults (lead-score.ts) overlaid with a per-tenant override stored
// in tenant_settings under key `lead_score_policy`. The override is untrusted
// JSON, so every value is sanitised: unknown weight codes are dropped, weights
// are clamped to a sane range, and the band thresholds are clamped + ordered.
// Mirrors the trial_lesson_policy pattern. Never hardcoded per school.
// ---------------------------------------------------------------------------

export const LEAD_SCORE_POLICY_KEY = "lead_score_policy";

// A single rule should never dominate the 0–100 scale; clamp each weight.
const MAX_WEIGHT = 50;
const MIN_WEIGHT = 0;

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Merge an untrusted tenant override onto the platform defaults, dropping any
 * value that is malformed. Always returns a complete, valid policy.
 */
export function mergeLeadScorePolicy(override: unknown): LeadScorePolicy {
  const weights: Record<string, number> = { ...DEFAULT_LEAD_SCORE_POLICY.weights };
  let warm = DEFAULT_LEAD_SCORE_POLICY.bands.warm;
  let hot = DEFAULT_LEAD_SCORE_POLICY.bands.hot;

  if (override && typeof override === "object") {
    const o = override as Record<string, unknown>;

    if (o.weights && typeof o.weights === "object") {
      const ow = o.weights as Record<string, unknown>;
      for (const code of LEAD_SCORE_WEIGHT_CODES) {
        const v = clampInt(ow[code], MIN_WEIGHT, MAX_WEIGHT);
        if (v !== null) weights[code] = v;
      }
    }

    if (o.bands && typeof o.bands === "object") {
      const ob = o.bands as Record<string, unknown>;
      const w = clampInt(ob.warm, 0, 100);
      const h = clampInt(ob.hot, 0, 100);
      if (w !== null) warm = w;
      if (h !== null) hot = h;
    }
  }

  // Keep the bands ordered so warm is never above hot.
  if (warm > hot) warm = hot;

  return { weights, bands: { warm, hot } };
}

/**
 * Read the tenant's lead scoring policy. The given client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * also fine). Falls back to the platform defaults on any read error.
 */
export async function loadLeadScorePolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<LeadScorePolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", LEAD_SCORE_POLICY_KEY)
    .maybeSingle();
  if (error) return { ...DEFAULT_LEAD_SCORE_POLICY };
  return mergeLeadScorePolicy(data?.value ?? null);
}
