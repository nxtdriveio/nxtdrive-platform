import "server-only";
import type { MapsFeatureGate } from "../../application/contracts";
import { evaluateLimit } from "../../application/limits-and-costs";
import type {
  FeatureAvailability,
  MapsFeatureCode,
  MapsUsageEventInput,
} from "../../domain/types";

type QueryResult<T> = PromiseLike<{ data: T | null; error: unknown }>;
type QueryBuilder<T> = {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  is(column: string, value: null): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  order(column: string, options?: { ascending: boolean }): QueryBuilder<T>;
  limit(value: number): QueryBuilder<T>;
  maybeSingle(): QueryResult<T>;
};
type ReadClient = {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
};

type EntitlementRow = {
  status: FeatureAvailability["state"];
};
type LimitRow = {
  hard_limit: number;
  soft_limit: number | null;
  degradation_action: string;
};

type UsageReader = (input: {
  tenantId: string;
  featureCode: MapsFeatureCode;
  environment: MapsUsageEventInput["environment"];
}) => Promise<{ usedUnits: number; forecastUnits: number | null }>;

export class DatabaseMapsFeatureGate implements MapsFeatureGate {
  readonly #client: ReadClient;
  readonly #usage: UsageReader;

  constructor(client: ReadClient, usage: UsageReader) {
    this.#client = client;
    this.#usage = usage;
  }

  async evaluate(input: {
    tenantId: string;
    featureCode: MapsFeatureCode;
    requestedUnits: number;
    environment: MapsUsageEventInput["environment"];
  }): Promise<FeatureAvailability> {
    const [{ data: entitlement, error: entitlementError }, usage] =
      await Promise.all([
        this.#client
          .from<EntitlementRow>("maps_tenant_entitlements")
          .select("status")
          .eq("tenant_id", input.tenantId)
          .eq("feature_code", input.featureCode)
          .maybeSingle(),
        this.#usage(input),
      ]);
    if (entitlementError) {
      return blocked(input.featureCode, "ENTITLEMENT_UNAVAILABLE");
    }
    if (!entitlement || !["ENABLED", "PILOT"].includes(entitlement.status)) {
      return blocked(input.featureCode, "FEATURE_DISABLED");
    }
    const { data: limit, error: limitError } = await this.#client
      .from<LimitRow>("maps_tenant_limits")
      .select("hard_limit, soft_limit, degradation_action")
      .eq("tenant_id", input.tenantId)
      .eq("feature_code", input.featureCode)
      .eq("environment", input.environment)
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (limitError) {
      return blocked(input.featureCode, "LIMIT_POLICY_UNAVAILABLE");
    }
    return evaluateLimit({
      featureCode: input.featureCode,
      requestedUnits: input.requestedUnits,
      usage: {
        usedUnits: usage.usedUnits,
        limitUnits: limit?.hard_limit ?? null,
        forecastUnits: usage.forecastUnits,
      },
      policy: {
        warningPercent:
          limit?.soft_limit && limit.hard_limit
            ? (limit.soft_limit / limit.hard_limit) * 100
            : 70,
        degradationPercent: 85,
        hardPercent: 100,
        degradedMode: degradationMode(limit?.degradation_action),
      },
      featureEnabled: true,
    });
  }
}

function degradationMode(
  action: string | null | undefined,
): FeatureAvailability["mode"] {
  return (
    (
      {
        MANUAL_INPUT: "MANUAL",
        LIST_ONLY: "LIST_ONLY",
        NON_TRAFFIC_ROUTE: "NON_TRAFFIC",
        CACHE_ONLY: "CACHE",
        RAYON_OR_HAVERSINE: "HAVERSINE",
        LOCAL_HEURISTIC: "LOCAL_HEURISTIC",
        LAST_COMPLETE_PERIOD: "CACHE",
        DISABLE_OPTIONAL_FEATURE: "UNAVAILABLE",
        BLOCK: "UNAVAILABLE",
      } as const
    )[action ?? ""] ?? "HAVERSINE"
  );
}

function blocked(
  featureCode: MapsFeatureCode,
  reason: string,
): FeatureAvailability {
  return Object.freeze({
    featureCode,
    state: "DISABLED",
    mode: "UNAVAILABLE",
    reason,
    remainingUnits: 0,
  });
}
