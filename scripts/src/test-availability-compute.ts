/**
 * Unit tests for the pure availability computation engine (Module 3d —
 * Beschikbaarheid). No database or network — exercises the interval math and
 * free-space resolution deterministically.
 *
 *   pnpm --filter @workspace/scripts run test-availability-compute
 *
 * Covers:
 *  - mergeIntervals / subtractIntervals primitives.
 *  - computeFreeIntervals: weekly base ∪ 'available' exceptions − 'blocked'.
 *  - computeDayFreeSpace union semantics, including the regression case of an
 *    instructor with NO weekly schedule but an 'available' date exception (must
 *    still contribute free space).
 *  - dateKey / weekdayForDateKey alignment.
 */
// The nxtdrive artifact is a CommonJS package; the ESM `scripts` package cannot
// statically link its named exports, so import runtime values via a namespace
// object (normalised with `default ?? namespace`) and types separately.
import type {
  AvailabilityException,
  WeeklyAvailability,
} from "../../artifacts/nxtdrive/lib/availability/types.ts";
import * as computeNs from "../../artifacts/nxtdrive/lib/availability/compute.ts";

const computeMod = ((computeNs as { default?: typeof computeNs }).default ??
  computeNs) as typeof computeNs;

const {
  mergeIntervals,
  subtractIntervals,
  computeFreeIntervals,
  computeDayFreeSpace,
  dateKey,
  weekdayForDateKey,
} = computeMod;

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

const iv = (start_min: number, end_min: number) => ({ start_min, end_min });
const eq = (
  a: ReadonlyArray<{ start_min: number; end_min: number }>,
  b: ReadonlyArray<{ start_min: number; end_min: number }>,
): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) => x.start_min === b[i]!.start_min && x.end_min === b[i]!.end_min,
  );

// Minimal builders — only the fields the pure functions read matter.
function weekly(
  instructor_id: string,
  weekday: number,
  start_min: number,
  end_min: number,
): WeeklyAvailability {
  return {
    id: `${instructor_id}-${weekday}-${start_min}`,
    tenant_id: "t",
    instructor_id,
    weekday,
    start_min,
    end_min,
    created_at: "",
    updated_at: "",
  };
}
function exception(
  instructor_id: string,
  kind: "available" | "blocked",
  start_min: number | null,
  end_min: number | null,
): AvailabilityException {
  return {
    id: `${instructor_id}-${kind}-${start_min}`,
    tenant_id: "t",
    instructor_id,
    exception_date: "2026-06-03",
    kind,
    start_min,
    end_min,
    note: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

// ---- mergeIntervals --------------------------------------------------------
check(
  "mergeIntervals merges overlapping + adjacent",
  eq(mergeIntervals([iv(540, 660), iv(660, 720), iv(630, 700)]), [iv(540, 720)]),
);
check("mergeIntervals empty -> empty", eq(mergeIntervals([]), []));

// ---- subtractIntervals -----------------------------------------------------
check(
  "subtractIntervals cuts a middle hole",
  eq(subtractIntervals([iv(540, 1020)], [iv(720, 780)]), [
    iv(540, 720),
    iv(780, 1020),
  ]),
);
check(
  "subtractIntervals no holes returns merged base",
  eq(subtractIntervals([iv(540, 600), iv(600, 660)], []), [iv(540, 660)]),
);

// ---- computeFreeIntervals --------------------------------------------------
check(
  "computeFreeIntervals: base ∪ available − blocked",
  eq(
    computeFreeIntervals(
      [{ ...weekly("i1", 3, 540, 720) }],
      [exception("i1", "available", 720, 1020), exception("i1", "blocked", 600, 660)],
    ),
    [iv(540, 600), iv(660, 1020)],
  ),
);
check(
  "computeFreeIntervals: whole-day blocked exception wipes the day",
  eq(
    computeFreeIntervals(
      [{ ...weekly("i1", 3, 540, 1020) }],
      [exception("i1", "blocked", null, null)],
    ),
    [],
  ),
);

// ---- dateKey / weekdayForDateKey -------------------------------------------
// 2026-06-03 is a Wednesday (getUTCDay === 3).
check(
  "weekdayForDateKey('2026-06-03') === 3 (Wed)",
  weekdayForDateKey("2026-06-03") === 3,
  `got ${weekdayForDateKey("2026-06-03")}`,
);
{
  // dateKey reflects the LOCAL calendar date of a Date built from local fields.
  const local = new Date(2026, 5, 3, 0, 0, 0); // 3 June 2026 local midnight
  check(
    "dateKey(local 2026-06-03) === '2026-06-03'",
    dateKey(local) === "2026-06-03",
    `got ${dateKey(local)}`,
  );
}

// ---- computeDayFreeSpace union ---------------------------------------------
const KEY = "2026-06-03"; // Wednesday, weekday 3
{
  // Two instructors with overlapping weekly Wednesday blocks → merged union.
  const weeklyMap = new Map<string, WeeklyAvailability[]>([
    ["i1", [weekly("i1", 3, 540, 720)]],
    ["i2", [weekly("i2", 3, 660, 900)]],
  ]);
  const free = computeDayFreeSpace(KEY, weeklyMap, new Map());
  check(
    "computeDayFreeSpace unions overlapping instructors",
    eq(free, [iv(540, 900)]),
    JSON.stringify(free),
  );
}
{
  // REGRESSION: instructor i3 has NO weekly schedule at all but an 'available'
  // date exception on KEY. It must still contribute free space.
  const weeklyMap = new Map<string, WeeklyAvailability[]>([
    ["i1", [weekly("i1", 3, 540, 600)]],
  ]);
  const excMap = new Map<string, AvailabilityException[]>([
    [`i3:${KEY}`, [exception("i3", "available", 1080, 1200)]],
  ]);
  const free = computeDayFreeSpace(KEY, weeklyMap, excMap);
  check(
    "computeDayFreeSpace includes exception-only instructor (no weekly schedule)",
    eq(free, [iv(540, 600), iv(1080, 1200)]),
    JSON.stringify(free),
  );
}
{
  // Exception-only instructor on a DIFFERENT date must NOT leak into KEY.
  const excMap = new Map<string, AvailabilityException[]>([
    ["i3:2026-06-04", [exception("i3", "available", 1080, 1200)]],
  ]);
  const free = computeDayFreeSpace(KEY, new Map(), excMap);
  check(
    "computeDayFreeSpace ignores exceptions on other dates",
    eq(free, []),
    JSON.stringify(free),
  );
}

// ---- report ----------------------------------------------------------------
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
console.log("All availability-compute unit tests passed.");
