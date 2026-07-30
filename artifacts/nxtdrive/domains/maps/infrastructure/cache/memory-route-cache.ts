import type { RouteCache } from "../../application/contracts";
import type { MapsFeatureCode, RouteMatrixResult } from "../../domain/types";

type Entry = {
  expiresAt: number;
  value: RouteMatrixResult;
  locationRecordIds: ReadonlySet<string>;
};

export class MemoryRouteCache implements RouteCache {
  readonly #entries = new Map<string, Entry>();
  readonly #inFlight = new Map<string, Promise<RouteMatrixResult>>();
  readonly #clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.#clock = clock;
  }

  async get(
    tenantId: string,
    featureCode: MapsFeatureCode,
    key: string,
  ): Promise<RouteMatrixResult | null> {
    const scopedKey = scope(tenantId, featureCode, key);
    const entry = this.#entries.get(scopedKey);
    if (!entry) return null;
    if (entry.expiresAt <= this.#clock()) {
      this.#entries.delete(scopedKey);
      return null;
    }
    return structuredClone(entry.value);
  }

  async set(
    tenantId: string,
    featureCode: MapsFeatureCode,
    key: string,
    value: RouteMatrixResult,
    ttlMs: number,
  ): Promise<void> {
    if (!tenantId || !key || ttlMs <= 0) {
      throw new Error("Ongeldige tenantcache-invoer.");
    }
    this.#entries.set(scope(tenantId, featureCode, key), {
      expiresAt: this.#clock() + ttlMs,
      value: structuredClone(value),
      locationRecordIds: new Set(extractLocationReferences(key)),
    });
  }

  async invalidateLocation(
    tenantId: string,
    locationRecordId: string,
  ): Promise<void> {
    const prefix = `${tenantId}:`;
    for (const [key, entry] of this.#entries) {
      if (
        key.startsWith(prefix) &&
        entry.locationRecordIds.has(locationRecordId)
      ) {
        this.#entries.delete(key);
      }
    }
  }

  async singleFlight(
    tenantId: string,
    featureCode: MapsFeatureCode,
    key: string,
    factory: () => Promise<RouteMatrixResult>,
  ): Promise<RouteMatrixResult> {
    const scopedKey = scope(tenantId, featureCode, key);
    const current = this.#inFlight.get(scopedKey);
    if (current) return current;
    const operation = factory().finally(() => {
      this.#inFlight.delete(scopedKey);
    });
    this.#inFlight.set(scopedKey, operation);
    return operation;
  }
}

function scope(
  tenantId: string,
  featureCode: MapsFeatureCode,
  key: string,
): string {
  return `${tenantId}:${featureCode}:${key}`;
}

function extractLocationReferences(key: string): string[] {
  return [...key.matchAll(/location:([0-9a-f-]{36})/gi)].map(
    (match) => match[1]!,
  );
}
