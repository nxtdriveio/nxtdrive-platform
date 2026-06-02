// ---------------------------------------------------------------------------
// Fase 3 — Route Intelligence helpers for the Slimme Proeflesplanner.
//
// Two layers, server-side only:
//   1. Haversine — a cheap, always-available straight-line distance used as a
//      prefilter and as a graceful fallback when Google is unavailable.
//   2. Google Routes API (Compute Route Matrix) — real driving travel time,
//      used to refine the few selected suggestions.
//
// The Routes API key is read from GOOGLE_ROUTES_API_KEY (server env, never the
// browser). When it is missing or a call fails, every function degrades to null
// so callers fall back to Haversine + manual confirmation. We never throw.
// ---------------------------------------------------------------------------

export type LatLng = { lat: number; lng: number };

const ROUTES_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const EARTH_RADIUS_KM = 6371;
// Conservative average urban driving speed (km/h) for the Haversine fallback.
export const FALLBACK_AVG_SPEED_KMH = 38;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rough driving minutes for a straight-line distance. Adds a 30% detour factor
 * (roads are never straight) on top of the average speed. Used only when the
 * Routes API cannot be reached.
 */
export function estimateMinutesFromKm(
  km: number,
  speedKmh = FALLBACK_AVG_SPEED_KMH,
): number {
  const roadKm = km * 1.3;
  return Math.round((roadKm / speedKmh) * 60);
}

export function routesApiKey(): string | null {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

export function isRoutesApiConfigured(): boolean {
  return routesApiKey() !== null;
}

type MatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string; // e.g. "1234s"
  distanceMeters?: number;
  condition?: string; // "ROUTE_EXISTS" | "ROUTE_NOT_FOUND"
};

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!m) return null;
  const seconds = Number.parseFloat(m[1]!);
  return Number.isFinite(seconds) ? seconds : null;
}

// The Routes API caps a single Compute Route Matrix request at 625 elements
// (origins × destinations). We never exceed this; if a batch would, we degrade
// to Haversine estimates for that request rather than splitting.
const MATRIX_MAX_ELEMENTS = 625;

function waypoint(p: LatLng) {
  return {
    waypoint: {
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    },
  };
}

// ---------------------------------------------------------------------------
// Per-pair travel-time cache. Driving times between two fixed coordinates are
// stable over short horizons, and a single page render (or repeated renders of
// the same lead) asks for the same origin/destination pairs over and over.
// Caching at the (origin → destination) pair level means a re-render with the
// same pickup + neighbours costs zero Google calls. Process-local + TTL'd.
// ---------------------------------------------------------------------------
const PAIR_CACHE_TTL_MS = 10 * 60 * 1000;
const PAIR_CACHE_MAX = 5000;
type PairEntry = { min: number | null; expires: number };
const pairCache = new Map<string, PairEntry>();

function roundCoord(n: number): string {
  // ~1 m precision — enough to dedupe identical waypoints, coarse enough to hit.
  return n.toFixed(5);
}

function pairKey(o: LatLng, d: LatLng): string {
  return `${roundCoord(o.lat)},${roundCoord(o.lng)}>${roundCoord(d.lat)},${roundCoord(d.lng)}`;
}

function prunePairCache(now: number): void {
  if (pairCache.size <= PAIR_CACHE_MAX) return;
  for (const [k, v] of pairCache) {
    if (v.expires <= now) pairCache.delete(k);
  }
  // If still oversized after dropping expired entries, clear it wholesale.
  if (pairCache.size > PAIR_CACHE_MAX) pairCache.clear();
}

/**
 * Compute driving travel time (in minutes) for every origin→destination pair
 * via the Google Routes API. Returns a 2-D array `out[originIdx][destIdx]`;
 * any pair that cannot be computed (or all of them, when the API is
 * unconfigured, the batch is too large, or the call fails) is null.
 *
 * Direction matters: travel from A to B is not necessarily the same as B to A
 * (one-way streets, urban networks), so callers must pass origins and
 * destinations in the real direction of travel. Never throws.
 */
export async function computeRouteMatrix(
  origins: LatLng[],
  destinations: LatLng[],
): Promise<((number | null)[])[]> {
  const empty = origins.map(() => destinations.map(() => null));
  const key = routesApiKey();
  if (!key || origins.length === 0 || destinations.length === 0) return empty;
  if (origins.length * destinations.length > MATRIX_MAX_ELEMENTS) return empty;

  // Cache lookup: if every requested pair is cached and fresh, skip the API.
  const now = Date.now();
  const cached: (PairEntry | null)[][] = origins.map((o) =>
    destinations.map((d) => {
      const e = pairCache.get(pairKey(o, d));
      return e && e.expires > now ? e : null;
    }),
  );
  if (cached.every((row) => row.every((e) => e !== null))) {
    return cached.map((row) => row.map((e) => e!.min));
  }

  try {
    const res = await fetch(ROUTES_MATRIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,duration,condition",
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: destinations.map(waypoint),
        travelMode: "DRIVE",
      }),
      // Keep the request from hanging the page render.
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return empty;
    const body = (await res.json()) as MatrixElement[];
    if (!Array.isArray(body)) return empty;

    const out: ((number | null)[])[] = origins.map(() =>
      destinations.map(() => null),
    );
    for (const el of body) {
      const oi = el.originIndex ?? 0;
      const di = el.destinationIndex ?? 0;
      if (oi < 0 || oi >= out.length) continue;
      if (di < 0 || di >= out[oi]!.length) continue;
      if (el.condition && el.condition !== "ROUTE_EXISTS") continue;
      const seconds = parseDurationSeconds(el.duration);
      if (seconds != null) out[oi]![di] = Math.round(seconds / 60);
    }

    // Cache every pair we just resolved (including unreachable ones, which are
    // stable too) so repeated queries for the same coordinates skip the API.
    const expires = Date.now() + PAIR_CACHE_TTL_MS;
    origins.forEach((o, oi) => {
      destinations.forEach((d, di) => {
        pairCache.set(pairKey(o, d), { min: out[oi]![di] ?? null, expires });
      });
    });
    prunePairCache(expires);

    return out;
  } catch {
    return empty;
  }
}
