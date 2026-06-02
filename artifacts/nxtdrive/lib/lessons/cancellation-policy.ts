import type { SupabaseClient } from "@supabase/supabase-js";
import type { CancellationPolicy, CancellationTier } from "./types";

// ---------------------------------------------------------------------------
// Task #91 — load + sanitise the tenant's cancellation policy.
//
// The cancel_lesson RPC (migration 0015) reads tenant_settings key
// `cancellation_policy` → a `tiers` array of { hours_before, refund_pct } and
// refunds the highest tier whose hours_before is <= the actual notice. This
// module gives the backoffice a safe way to read and write that JSON: the
// stored value is always sanitised (tiers clamped, deduped, ordered) so a
// malformed write can never corrupt the refund calculation. Mirrors the
// lead_score_policy / lesson_planning_policy pattern — never hardcoded per
// school.
// ---------------------------------------------------------------------------

export const CANCELLATION_POLICY_KEY = "cancellation_policy";

// Example default mirrors the product blueprint: full refund from 72h notice,
// half from 24h, nothing inside 24h (anything below the lowest tier → 0%).
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  tiers: [
    { hours_before: 72, refund_pct: 100 },
    { hours_before: 24, refund_pct: 50 },
  ],
  min_notice_hours: 0,
};

const MAX_HOURS_BEFORE = 8760; // 1 jaar — ruime bovengrens
const MAX_TIERS = 10;

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function defaultTiers(): CancellationTier[] {
  return DEFAULT_CANCELLATION_POLICY.tiers.map((t) => ({ ...t }));
}

/**
 * Merge an untrusted tenant override onto the platform defaults, dropping any
 * malformed value. Always returns a complete, valid policy.
 *
 * - Each tier: hours_before clamped to 0..8760, refund_pct clamped to 0..100;
 *   malformed tiers are dropped, duplicate hours_before deduped (first wins),
 *   and the result ordered by hours_before descending (how the refund resolves).
 * - An explicit empty `tiers` array is preserved (a deliberate "no refund"
 *   policy); only a missing/invalid `tiers` key falls back to the defaults so a
 *   malformed write never silently wipes the school's policy.
 * - `min_notice_hours` is clamped to 0..8760; stored for the upcoming student
 *   self-cancellation flow (the staff cancel_lesson RPC does not gate on it).
 */
export function mergeCancellationPolicy(override: unknown): CancellationPolicy {
  if (!override || typeof override !== "object") {
    return { tiers: defaultTiers(), min_notice_hours: 0 };
  }
  const o = override as Record<string, unknown>;

  let tiers: CancellationTier[];
  if (Array.isArray(o.tiers)) {
    const seen = new Set<number>();
    const collected: CancellationTier[] = [];
    for (const raw of o.tiers) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const hours = clampInt(r.hours_before, 0, MAX_HOURS_BEFORE);
      const pct = clampInt(r.refund_pct, 0, 100);
      if (hours === null || pct === null) continue;
      if (seen.has(hours)) continue;
      seen.add(hours);
      collected.push({ hours_before: hours, refund_pct: pct });
    }
    collected.sort((a, b) => b.hours_before - a.hours_before);
    tiers = collected.slice(0, MAX_TIERS);
  } else {
    tiers = defaultTiers();
  }

  const minNotice = clampInt(o.min_notice_hours, 0, MAX_HOURS_BEFORE) ?? 0;

  return { tiers, min_notice_hours: minNotice };
}

/**
 * Read the tenant's cancellation policy. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform defaults on any read error.
 */
export async function loadCancellationPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<CancellationPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", CANCELLATION_POLICY_KEY)
    .maybeSingle();
  if (error) return mergeCancellationPolicy(null);
  return mergeCancellationPolicy(data?.value ?? null);
}
