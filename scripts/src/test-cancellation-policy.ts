/**
 * Unit tests for the cancellation-policy sanitiser (Task #91 — Annuleringsbeleid
 * configureerbaar). Pure logic only; no database or network.
 *
 *   pnpm --filter @workspace/scripts run test-cancellation-policy
 *
 * Covers mergeCancellationPolicy:
 *  - null / non-object → platform defaults.
 *  - valid override sorted by hours_before descending.
 *  - refund_pct clamped to 0..100, hours_before floored at 0.
 *  - duplicate hours_before deduped (first wins).
 *  - malformed tier entries dropped.
 *  - explicit empty tiers array preserved (deliberate "no refund").
 *  - missing tiers key → defaults preserved (no silent wipe).
 *  - min_notice_hours clamped.
 * And an integration check of refundPctForHours against a merged policy.
 */
// The nxtdrive artifact is a CommonJS package; the ESM `scripts` package cannot
// statically link its named exports, so import runtime values via a namespace
// object. Normalise the CJS interop shape with `default ?? namespace`
// (see test-lesson-planning.ts).
import * as polNs from "../../artifacts/nxtdrive/lib/lessons/cancellation-policy.ts";
import * as typesNs from "../../artifacts/nxtdrive/lib/lessons/types.ts";

const polMod = ((polNs as { default?: typeof polNs }).default ??
  polNs) as typeof polNs;
const typesMod = ((typesNs as { default?: typeof typesNs }).default ??
  typesNs) as typeof typesNs;

const { mergeCancellationPolicy, DEFAULT_CANCELLATION_POLICY } = polMod;
const { refundPctForHours } = typesMod;

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

// ===== defaults ===========================================================
{
  const def = mergeCancellationPolicy(null);
  check(
    "null → platform defaults (2 tiers, min_notice 0)",
    def.tiers.length === DEFAULT_CANCELLATION_POLICY.tiers.length &&
      def.tiers.length === 2 &&
      def.min_notice_hours === 0,
    `tiers=${JSON.stringify(def.tiers)}`,
  );
  check(
    "non-object override → defaults",
    mergeCancellationPolicy("nonsense").tiers.length === 2,
  );
  // Defaults are returned as fresh copies (mutating output must not affect base).
  def.tiers.push({ hours_before: 1, refund_pct: 1 });
  check(
    "defaults returned as a fresh copy",
    DEFAULT_CANCELLATION_POLICY.tiers.length === 2,
  );
}

// ===== ordering ===========================================================
{
  const out = mergeCancellationPolicy({
    tiers: [
      { hours_before: 24, refund_pct: 50 },
      { hours_before: 72, refund_pct: 100 },
      { hours_before: 48, refund_pct: 75 },
    ],
  });
  const hours = out.tiers.map((t) => t.hours_before);
  check(
    "tiers sorted by hours_before descending",
    JSON.stringify(hours) === JSON.stringify([72, 48, 24]),
    `hours=${JSON.stringify(hours)}`,
  );
}

// ===== clamping ===========================================================
{
  const out = mergeCancellationPolicy({
    tiers: [
      { hours_before: 48, refund_pct: 150 }, // pct over 100 → 100
      { hours_before: -10, refund_pct: -5 }, // hours < 0 → 0, pct < 0 → 0
    ],
  });
  const byHours = Object.fromEntries(
    out.tiers.map((t) => [t.hours_before, t.refund_pct]),
  );
  check(
    "refund_pct clamped to 100",
    byHours[48] === 100,
    `48→${byHours[48]}`,
  );
  check(
    "negative hours floored to 0, negative pct floored to 0",
    byHours[0] === 0,
    `0→${byHours[0]}`,
  );
}

// ===== dedupe + malformed =================================================
{
  const out = mergeCancellationPolicy({
    tiers: [
      { hours_before: 24, refund_pct: 50 }, // first wins
      { hours_before: 24, refund_pct: 90 }, // duplicate dropped
      { hours_before: 24.4, refund_pct: 30 }, // rounds to 24 → also dropped
      "garbage",
      null,
      { hours_before: "x", refund_pct: 10 }, // non-number → dropped
      { refund_pct: 10 }, // missing hours → dropped
    ],
  });
  check(
    "duplicate hours_before deduped (first wins) + malformed dropped",
    out.tiers.length === 1 &&
      out.tiers[0]!.hours_before === 24 &&
      out.tiers[0]!.refund_pct === 50,
    `tiers=${JSON.stringify(out.tiers)}`,
  );
}

// ===== empty vs missing ===================================================
{
  const empty = mergeCancellationPolicy({ tiers: [] });
  check(
    "explicit empty tiers array preserved (deliberate no-refund)",
    Array.isArray(empty.tiers) && empty.tiers.length === 0,
    `tiers=${JSON.stringify(empty.tiers)}`,
  );
  const missing = mergeCancellationPolicy({ min_notice_hours: 12 });
  check(
    "missing tiers key → defaults (no silent wipe), min_notice respected",
    missing.tiers.length === 2 && missing.min_notice_hours === 12,
    `tiers=${missing.tiers.length} min=${missing.min_notice_hours}`,
  );
}

// ===== min_notice clamping ================================================
{
  const high = mergeCancellationPolicy({
    tiers: [{ hours_before: 24, refund_pct: 50 }],
    min_notice_hours: 1000000,
  });
  check(
    "min_notice_hours clamped to upper bound (8760)",
    high.min_notice_hours === 8760,
    `min=${high.min_notice_hours}`,
  );
  const neg = mergeCancellationPolicy({
    tiers: [{ hours_before: 24, refund_pct: 50 }],
    min_notice_hours: -5,
  });
  check(
    "negative min_notice_hours → 0",
    neg.min_notice_hours === 0,
    `min=${neg.min_notice_hours}`,
  );
}

// ===== integration with refundPctForHours =================================
{
  const policy = mergeCancellationPolicy(null); // 72→100, 24→50
  check(
    "refund: 80h notice → 100%",
    refundPctForHours(policy, 80) === 100,
  );
  check(
    "refund: 48h notice → 50% (between 24 and 72)",
    refundPctForHours(policy, 48) === 50,
  );
  check(
    "refund: 10h notice → 0% (below lowest tier)",
    refundPctForHours(policy, 10) === 0,
  );
  check(
    "refund: empty policy → always 0%",
    refundPctForHours(mergeCancellationPolicy({ tiers: [] }), 200) === 0,
  );
}

// ---- report ---------------------------------------------------------------
console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "✅" : "❌";
  console.log(`${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All cancellation-policy unit tests passed.");
