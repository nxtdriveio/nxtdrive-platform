import "server-only";
import type { MapsFeatureGate } from "../../application/contracts";
import type {
  FeatureAvailability,
  MapsFeatureCode,
  MapsUsageEventInput,
} from "../../domain/types";

type RpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export class RpcMapsFeatureGate implements MapsFeatureGate {
  readonly #client: RpcClient;

  constructor(client: RpcClient) {
    this.#client = client;
  }

  async evaluate(input: {
    tenantId: string;
    featureCode: MapsFeatureCode;
    requestedUnits: number;
    environment: MapsUsageEventInput["environment"];
  }): Promise<FeatureAvailability> {
    const { data, error } = await this.#client.rpc(
      "evaluate_maps_feature_gate",
      {
        p_tenant_id: input.tenantId,
        p_feature_code: input.featureCode,
        p_environment: input.environment,
        p_requested_units: input.requestedUnits,
      },
    );
    if (error || !isAvailability(data, input.featureCode)) {
      return Object.freeze({
        featureCode: input.featureCode,
        state: "DEGRADED",
        mode: fallbackMode(input.featureCode),
        reason: "FEATURE_GATE_UNAVAILABLE",
        remainingUnits: 0,
      });
    }
    return Object.freeze(data);
  }
}

function isAvailability(
  value: unknown,
  featureCode: MapsFeatureCode,
): value is FeatureAvailability {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.featureCode === featureCode &&
    typeof row.state === "string" &&
    typeof row.mode === "string" &&
    typeof row.reason === "string" &&
    (row.remainingUnits === null ||
      (typeof row.remainingUnits === "number" &&
        row.remainingUnits >= 0 &&
        Number.isFinite(row.remainingUnits)))
  );
}

function fallbackMode(
  featureCode: MapsFeatureCode,
): FeatureAvailability["mode"] {
  if (
    [
      "ADDRESS_AUTOCOMPLETE",
      "PLACE_DETAILS",
      "ADDRESS_VALIDATION",
      "GEOCODING",
    ].includes(featureCode)
  ) {
    return "MANUAL";
  }
  if (
    [
      "MAP_LOAD",
      "WORK_AREA_MAP",
      "POSTCODE_ANALYTICS",
      "EMPTY_MILE_ANALYSIS",
    ].includes(featureCode)
  ) {
    return "LIST_ONLY";
  }
  return "HAVERSINE";
}
