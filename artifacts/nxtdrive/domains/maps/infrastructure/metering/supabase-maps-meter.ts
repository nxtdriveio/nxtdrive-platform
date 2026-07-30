import "server-only";
import type { MapsMeter } from "../../application/contracts";
import type { MapsUsageEventInput } from "../../domain/types";

type RpcResult = PromiseLike<{ error: { message?: string } | null }>;
type RpcClient = {
  rpc(name: string, params: Record<string, unknown>): RpcResult;
};

export class SupabaseMapsMeter implements MapsMeter {
  readonly #client: RpcClient;

  constructor(client: RpcClient) {
    this.#client = client;
  }

  async record(input: MapsUsageEventInput): Promise<void> {
    assertPiiFreeUsageEvent(input);
    const { error } = await this.#client.rpc("record_maps_usage_event", {
      p_tenant_id: input.tenantId,
      p_environment: input.environment,
      p_feature_code: input.featureCode,
      p_surface: input.surface,
      p_provider: input.provider,
      p_sku_code: input.skuCode,
      p_unit_type: input.unitType,
      p_units: input.units,
      p_cache_status: input.cacheStatus,
      p_result_status: input.resultStatus,
      p_correlation_id: input.correlationId,
      p_latency_ms: input.latencyMs,
      p_fallback_method: input.fallbackMethod,
    });
    if (error) {
      throw new Error("Maps-verbruik kon niet veilig worden geregistreerd.");
    }
  }
}

export function assertPiiFreeUsageEvent(input: MapsUsageEventInput) {
  if (
    !Number.isFinite(input.units) ||
    input.units <= 0 ||
    input.units > 1_000_000
  ) {
    throw new Error("Maps-verbruik bevat ongeldige units.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.correlationId)) {
    throw new Error("Maps-verbruik bevat een ongeldige correlation ID.");
  }
  const serialized = JSON.stringify(input);
  const forbiddenKey =
    /"address"|"postalCode"|"latitude"|"longitude"|"placeId"|"sessionToken"|"apiKey"|"studentName"/i;
  if (forbiddenKey.test(serialized)) {
    throw new Error(
      "Maps-verbruik mag geen locatie- of persoonsdata bevatten.",
    );
  }
}
