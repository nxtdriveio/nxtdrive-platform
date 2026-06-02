/**
 * Unit tests for the trial-lesson route scoring engine (Fase 3 — Route
 * Intelligence). Pure logic; no database or network — the Google Routes API is
 * faked via a stubbed global fetch so the computed path is exercised
 * deterministically.
 *
 *   pnpm --filter @workspace/scripts run test-route-scoring
 *
 * Covers:
 *  - haversineKm: great-circle distance (known value + zero distance).
 *  - estimateMinutesFromKm: Haversine-based driving-minute fallback.
 *  - applyRouteScoring branches:
 *      • Google-configured (computed) path — status "computed", real fit check,
 *        near / detour / fits factors.
 *      • Unconfigured/failed (estimated) path — status "estimated",
 *        needs_manual_confirm, and NEVER hard-rejects (even when it does not
 *        fit and allowReject is true).
 *      • Hard reject ONLY on a real computed mismatch with allowReject = true.
 *      • allowReject = false never rejects a computed mismatch.
 *      • No pickup / no neighbour → "unavailable", no factors, no reject.
 */
// The nxtdrive artifact is a CommonJS package; the ESM `scripts` package cannot
// statically link its named exports (cjs-module-lexer misses esbuild's output),
// so import the runtime values via a namespace object and the types separately
// (type imports are erased at runtime and resolved only by tsc). Depending on
// the tsx/esbuild version the CJS exports land either directly on the namespace
// or nested under `.default`, so normalise with `default ?? namespace`.
import type { LatLng } from "../../artifacts/nxtdrive/lib/trial-lessons/route.ts";
import type {
  BusyInterval,
  ScoredSlot,
  SuggestionContext,
  TrialPolicy,
} from "../../artifacts/nxtdrive/lib/trial-lessons/suggestions.ts";
import * as routeNs from "../../artifacts/nxtdrive/lib/trial-lessons/route.ts";
import * as suggNs from "../../artifacts/nxtdrive/lib/trial-lessons/suggestions.ts";

const routeMod = ((routeNs as { default?: typeof routeNs }).default ??
  routeNs) as typeof routeNs;
const suggMod = ((suggNs as { default?: typeof suggNs }).default ??
  suggNs) as typeof suggNs;

const { haversineKm, estimateMinutesFromKm, FALLBACK_AVG_SPEED_KMH } = routeMod;
const { applyRouteScoring, DEFAULT_POLICY } = suggMod;

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function approx(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

const MIN = 60 * 1000;
// Fixed reference instant: 2026-07-15 12:00 UTC (a Wednesday). All slots/busy
// intervals are anchored to this so the tests are time-independent.
const T0 = Date.UTC(2026, 6, 15, 12, 0, 0);

// ---- fetch stub for the computed (Google) path --------------------------
// computeRouteMatrix builds origins = [pickup, ...prevPoints] and destinations
// = [pickup, ...nextPoints]; prev→pickup is element (originIndex>0, dest 0) and
// pickup→next is element (origin 0, destinationIndex>0). The stub returns the
// requested duration for those legs.
const realFetch = globalThis.fetch;
function installRoutesStub(toMin: number, fromMin: number): void {
  // A key must be present for isRoutesApiConfigured() to take the computed path.
  process.env.GOOGLE_ROUTES_API_KEY = "test-routes-key";
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      origins: unknown[];
      destinations: unknown[];
    };
    const elements: Array<{
      originIndex: number;
      destinationIndex: number;
      duration: string;
      condition: string;
    }> = [];
    for (let oi = 0; oi < body.origins.length; oi++) {
      for (let di = 0; di < body.destinations.length; di++) {
        let min = 0;
        if (oi > 0 && di === 0) min = toMin; // prev → pickup
        else if (oi === 0 && di > 0) min = fromMin; // pickup → next
        elements.push({
          originIndex: oi,
          destinationIndex: di,
          duration: `${min * 60}s`,
          condition: "ROUTE_EXISTS",
        });
      }
    }
    return {
      ok: true,
      json: async () => elements,
    } as Response;
  }) as typeof fetch;
}
function clearRoutesStub(): void {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_ROUTES_API_KEY;
}

// ---- context / slot builders --------------------------------------------
let scenarioSeq = 0;
function makeCtx(opts: {
  pickup: LatLng | null;
  busy: BusyInterval[];
  hasAnxiety?: boolean;
  policy?: Partial<TrialPolicy>;
}): SuggestionContext {
  return {
    tenantId: "t",
    instructorId: "i",
    instructorName: "Test",
    policy: { ...DEFAULT_POLICY, ...(opts.policy ?? {}) },
    pickupLocation: null,
    pickup: opts.pickup,
    pickupPlaceId: null,
    pickupFormattedAddress: null,
    preferredDays: new Set(),
    preferredTimes: new Set(),
    desiredStart: null,
    hasAnxiety: opts.hasAnxiety ?? false,
    fastTrack: false,
    windowStart: T0,
    windowEnd: T0 + 21 * 24 * 60 * MIN,
    busy: opts.busy,
  };
}

// One 60-min slot at T0 with a single preceding appointment `gapMin` before it,
// located at `neighbour`. Distinct pickup per scenario to dodge the per-pair
// travel-time cache inside route.ts.
function singlePrevScenario(opts: {
  neighbour: LatLng;
  gapMin: number;
  hasAnxiety?: boolean;
  policy?: Partial<TrialPolicy>;
}): { ctx: SuggestionContext; slot: ScoredSlot } {
  const pickup: LatLng = { lat: 52.0, lng: 5.0 + 0.01 * scenarioSeq++ };
  const slotStart = T0;
  const slotEnd = slotStart + 60 * MIN;
  const prevEnd = slotStart - opts.gapMin * MIN;
  const busy: BusyInterval[] = [
    {
      start: prevEnd - 60 * MIN,
      end: prevEnd,
      lat: opts.neighbour.lat,
      lng: opts.neighbour.lng,
    },
  ];
  const ctx = makeCtx({
    pickup,
    busy,
    hasAnxiety: opts.hasAnxiety,
    policy: opts.policy,
  });
  const slot: ScoredSlot = {
    start: slotStart,
    end: slotEnd,
    score: 0,
    factors: [],
  };
  return { ctx, slot };
}

function hasFactor(
  factors: { key: string }[],
  key: string,
): boolean {
  return factors.some((f) => f.key === key);
}

async function main(): Promise<void> {
  console.log("Running route-scoring unit tests\n");

  // ===== pure helpers =====================================================
  {
    // 1° of latitude ≈ 111.19 km along a meridian.
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    check(
      "haversineKm: 1° latitude ≈ 111.19 km",
      approx(km, 111.19, 0.5),
      `km=${km.toFixed(3)}`,
    );
  }
  {
    const km = haversineKm({ lat: 52, lng: 5 }, { lat: 52, lng: 5 });
    check("haversineKm: identical points → 0 km", km === 0, `km=${km}`);
  }
  {
    // 10 km * 1.3 detour / 38 km/h * 60 = 20.5 → 21 min.
    const min = estimateMinutesFromKm(10);
    check(
      "estimateMinutesFromKm: 10 km → 21 min (default speed)",
      min === 21,
      `min=${min} (speed=${FALLBACK_AVG_SPEED_KMH})`,
    );
  }
  {
    const min = estimateMinutesFromKm(10, 60);
    check(
      "estimateMinutesFromKm: respects custom speed",
      min === 13,
      `min=${min}`,
    );
  }

  // A neighbour ~0.1 km from the base pickup latitude (≤ route_near_km).
  const nearNeighbour: LatLng = { lat: 52.0009, lng: 5.0 };
  // A neighbour ~50 km away (well past route_long_detour at fallback speed).
  const farNeighbour: LatLng = { lat: 52.45, lng: 5.0 };

  // ===== computed path: near + fits, no detour ============================
  {
    installRoutesStub(10, 0); // prev→pickup = 10 min
    const { ctx, slot } = singlePrevScenario({
      neighbour: nearNeighbour,
      gapMin: 120,
    });
    const [r] = await applyRouteScoring(ctx, [slot], true);
    clearRoutesStub();
    check(
      "computed: status=computed",
      r!.insight.status === "computed",
      `status=${r!.insight.status}`,
    );
    check(
      "computed: near + fits factors, no detour, not rejected",
      hasFactor(r!.factors, "route_near_previous") &&
        hasFactor(r!.factors, "route_fits") &&
        !hasFactor(r!.factors, "route_detour") &&
        r!.reject === false &&
        r!.insight.needs_manual_confirm === false &&
        r!.scoreDelta === 40,
      `delta=${r!.scoreDelta} factors=${r!.factors.map((f) => f.key).join(",")} reject=${r!.reject} confirm=${r!.insight.needs_manual_confirm}`,
    );
    check(
      "computed: travel_to_min reflects Google duration",
      r!.insight.travel_to_min === 10,
      `travel_to_min=${r!.insight.travel_to_min}`,
    );
  }

  // ===== computed path: long detour factor ================================
  {
    installRoutesStub(50, 0); // 50 min > route_long_detour_min (35)
    const { ctx, slot } = singlePrevScenario({
      neighbour: farNeighbour,
      gapMin: 240, // generous gap so it still fits → isolates the detour factor
    });
    const [r] = await applyRouteScoring(ctx, [slot], true);
    clearRoutesStub();
    check(
      "computed: long travel adds route_detour and still fits",
      r!.insight.status === "computed" &&
        hasFactor(r!.factors, "route_detour") &&
        hasFactor(r!.factors, "route_fits") &&
        r!.reject === false,
      `factors=${r!.factors.map((f) => f.key).join(",")} reject=${r!.reject}`,
    );
  }

  // ===== estimated path: fits, never rejects ==============================
  {
    clearRoutesStub(); // ensure no key
    delete process.env.GOOGLE_ROUTES_API_KEY;
    const { ctx, slot } = singlePrevScenario({
      neighbour: nearNeighbour,
      gapMin: 120,
    });
    const [r] = await applyRouteScoring(ctx, [slot], true);
    check(
      "estimated: status=estimated + needs_manual_confirm",
      r!.insight.status === "estimated" &&
        r!.insight.needs_manual_confirm === true,
      `status=${r!.insight.status} confirm=${r!.insight.needs_manual_confirm}`,
    );
    check(
      "estimated: fits → route_fits, not rejected",
      hasFactor(r!.factors, "route_fits") && r!.reject === false,
      `factors=${r!.factors.map((f) => f.key).join(",")} reject=${r!.reject}`,
    );
  }

  // ===== estimated path: does NOT fit → still never rejected ==============
  {
    delete process.env.GOOGLE_ROUTES_API_KEY;
    const { ctx, slot } = singlePrevScenario({
      neighbour: farNeighbour, // ~50 km → ~103 estimated min
      gapMin: 20, // tiny gap → cannot fit
    });
    const [r] = await applyRouteScoring(ctx, [slot], true);
    check(
      "estimated: non-fitting gap is NOT hard-rejected (allowReject=true)",
      r!.insight.status === "estimated" &&
        r!.reject === false &&
        r!.insight.needs_manual_confirm === true &&
        !hasFactor(r!.factors, "route_fits"),
      `status=${r!.insight.status} reject=${r!.reject} confirm=${r!.insight.needs_manual_confirm}`,
    );
  }

  // ===== computed mismatch → hard reject when allowReject=true ============
  {
    installRoutesStub(60, 0); // 60 min travel
    const { ctx, slot } = singlePrevScenario({
      neighbour: farNeighbour,
      gapMin: 20, // 60 + 15 buffer > 20 → does not fit
    });
    const [r] = await applyRouteScoring(ctx, [slot], true);
    clearRoutesStub();
    check(
      "computed mismatch: hard-rejected with allowReject=true",
      r!.insight.status === "computed" &&
        r!.reject === true &&
        !hasFactor(r!.factors, "route_fits"),
      `status=${r!.insight.status} reject=${r!.reject}`,
    );
  }

  // ===== computed mismatch → NOT rejected when allowReject=false ==========
  {
    installRoutesStub(60, 0);
    const { ctx, slot } = singlePrevScenario({
      neighbour: farNeighbour,
      gapMin: 20,
    });
    const [r] = await applyRouteScoring(ctx, [slot], false);
    clearRoutesStub();
    check(
      "computed mismatch: NOT rejected when allowReject=false",
      r!.insight.status === "computed" && r!.reject === false,
      `reject=${r!.reject}`,
    );
  }

  // ===== no pickup → unavailable, no scoring =============================
  {
    const ctx = makeCtx({ pickup: null, busy: [] });
    const slot: ScoredSlot = {
      start: T0,
      end: T0 + 60 * MIN,
      score: 0,
      factors: [],
    };
    const [r] = await applyRouteScoring(ctx, [slot], true);
    check(
      "no pickup: status=unavailable, no factors, no reject",
      r!.insight.status === "unavailable" &&
        r!.factors.length === 0 &&
        r!.reject === false &&
        r!.scoreDelta === 0,
      `status=${r!.insight.status} factors=${r!.factors.length}`,
    );
  }

  // ===== pickup but no neighbours → unavailable, no reject ===============
  {
    const pickup: LatLng = { lat: 52.0, lng: 6.5 };
    const ctx = makeCtx({ pickup, busy: [] });
    const slot: ScoredSlot = {
      start: T0,
      end: T0 + 60 * MIN,
      score: 0,
      factors: [],
    };
    const [r] = await applyRouteScoring(ctx, [slot], true);
    check(
      "pickup, no neighbours: status=unavailable, no reject",
      r!.insight.status === "unavailable" && r!.reject === false,
      `status=${r!.insight.status} reject=${r!.reject}`,
    );
  }

  // ---- report -----------------------------------------------------------
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
  console.log("All route-scoring unit tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
