import "server-only";
import type {
  AddressValidationResult,
  AutocompleteInput,
  AutocompleteSuggestion,
  GeocodeResult,
  LocationProvider,
  MapsMeter,
  ResolvedPlace,
} from "../../application/contracts";
import type { MapsFeatureCode, MapsUsageEventInput } from "../../domain/types";

export class MeteredLocationProvider implements LocationProvider {
  readonly #provider: LocationProvider;
  readonly #meter: MapsMeter;
  readonly #environment: MapsUsageEventInput["environment"];
  readonly #surface: MapsUsageEventInput["surface"];

  constructor(input: {
    provider: LocationProvider;
    meter: MapsMeter;
    environment: MapsUsageEventInput["environment"];
    surface: MapsUsageEventInput["surface"];
  }) {
    this.#provider = input.provider;
    this.#meter = input.meter;
    this.#environment = input.environment;
    this.#surface = input.surface;
  }

  async autocomplete(
    input: AutocompleteInput,
  ): Promise<readonly AutocompleteSuggestion[]> {
    return this.#run(
      input.tenantId,
      input.correlationId,
      "ADDRESS_AUTOCOMPLETE",
      "AUTOCOMPLETE_REQUEST",
      "REQUEST",
      () => this.#provider.autocomplete(input),
    );
  }

  async resolvePlace(input: {
    tenantId: string;
    providerReference: string;
    sessionToken: string;
    correlationId: string;
  }): Promise<ResolvedPlace | null> {
    return this.#run(
      input.tenantId,
      input.correlationId,
      "PLACE_DETAILS",
      "PLACE_DETAILS_ESSENTIALS",
      "SESSION",
      () => this.#provider.resolvePlace(input),
    );
  }

  async validateAddress(input: {
    tenantId: string;
    address: Omit<ResolvedPlace, "provider" | "providerPlaceId" | "obtainedAt">;
    correlationId: string;
  }): Promise<AddressValidationResult> {
    return this.#run(
      input.tenantId,
      input.correlationId,
      "ADDRESS_VALIDATION",
      "ADDRESS_VALIDATION",
      "REQUEST",
      () => this.#provider.validateAddress(input),
    );
  }

  async geocode(input: {
    tenantId: string;
    formattedAddress: string;
    correlationId: string;
  }): Promise<GeocodeResult> {
    return this.#run(
      input.tenantId,
      input.correlationId,
      "GEOCODING",
      "GEOCODING",
      "REQUEST",
      () => this.#provider.geocode(input),
    );
  }

  async #run<T>(
    tenantId: string,
    correlationId: string,
    featureCode: MapsFeatureCode,
    skuCode: string,
    unitType: MapsUsageEventInput["unitType"],
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await operation();
      await this.#record({
        tenantId,
        correlationId,
        featureCode,
        skuCode,
        unitType,
        latencyMs: Date.now() - startedAt,
        resultStatus: "SUCCESS",
      });
      return result;
    } catch (error) {
      await this.#record({
        tenantId,
        correlationId,
        featureCode,
        skuCode,
        unitType,
        latencyMs: Date.now() - startedAt,
        resultStatus: "FAILED",
      });
      throw error;
    }
  }

  async #record(
    input: Pick<
      MapsUsageEventInput,
      | "tenantId"
      | "correlationId"
      | "featureCode"
      | "skuCode"
      | "unitType"
      | "latencyMs"
      | "resultStatus"
    >,
  ) {
    await this.#meter.record({
      ...input,
      environment: this.#environment,
      surface: this.#surface,
      provider: "GOOGLE",
      units: 1,
      cacheStatus: "NOT_APPLICABLE",
      fallbackMethod: null,
    });
  }
}
