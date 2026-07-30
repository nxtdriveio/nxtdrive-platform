import "server-only";
import type {
  AddressValidationResult,
  AutocompleteInput,
  AutocompleteSuggestion,
  GeocodeResult,
  LocationProvider,
  ResolvedPlace,
} from "../../application/contracts";
import { googleJson, serverCredential, type SafeFetch } from "./http";

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlace = {
  id?: string;
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
};

export class GoogleLocationProvider implements LocationProvider {
  readonly #placesApiKey: () => string;
  readonly #validationApiKey: () => string;
  readonly #geocodingApiKey: () => string;
  readonly #fetcher: SafeFetch;
  readonly #clock: () => Date;

  constructor(input?: {
    placesApiKey?: () => string;
    validationApiKey?: () => string;
    geocodingApiKey?: () => string;
    fetcher?: SafeFetch;
    clock?: () => Date;
  }) {
    this.#placesApiKey =
      input?.placesApiKey ?? (() => serverCredential("GOOGLE_PLACES_API_KEY"));
    this.#validationApiKey =
      input?.validationApiKey ??
      (() => serverCredential("GOOGLE_ADDRESS_VALIDATION_API_KEY"));
    this.#geocodingApiKey =
      input?.geocodingApiKey ??
      (() => serverCredential("GOOGLE_GEOCODING_API_KEY"));
    this.#fetcher = input?.fetcher ?? fetch;
    this.#clock = input?.clock ?? (() => new Date());
  }

  async autocomplete(
    input: AutocompleteInput,
  ): Promise<readonly AutocompleteSuggestion[]> {
    const query = input.query.trim();
    if (query.length < 3 || query.length > 200) return [];
    const body = await googleJson<{
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
          types?: string[];
        };
      }>;
    }>(
      {
        url: "https://places.googleapis.com/v1/places:autocomplete",
        apiKey: this.#placesApiKey(),
        fieldMask: [
          "suggestions.placePrediction.placeId",
          "suggestions.placePrediction.text.text",
          "suggestions.placePrediction.structuredFormat.mainText.text",
          "suggestions.placePrediction.structuredFormat.secondaryText.text",
          "suggestions.placePrediction.types",
        ].join(","),
        body: {
          input: query,
          sessionToken: input.sessionToken,
          includedRegionCodes: input.countryCodes.slice(0, 15),
          ...(input.locationBias
            ? {
                locationBias: {
                  circle: {
                    center: input.locationBias.center,
                    radius: Math.min(
                      Math.max(input.locationBias.radiusMeters, 1),
                      50_000,
                    ),
                  },
                },
              }
            : {}),
        },
      },
      this.#fetcher,
    );
    return Object.freeze(
      (body.suggestions ?? [])
        .map((item) => item.placePrediction)
        .filter(
          (
            prediction,
          ): prediction is NonNullable<typeof prediction> & {
            placeId: string;
          } => Boolean(prediction?.placeId),
        )
        .slice(0, 8)
        .map((prediction) =>
          Object.freeze({
            providerReference: prediction.placeId,
            primaryText:
              prediction.structuredFormat?.mainText?.text ??
              prediction.text?.text ??
              "",
            secondaryText:
              prediction.structuredFormat?.secondaryText?.text ?? "",
            types: Object.freeze(prediction.types ?? []),
          }),
        ),
    );
  }

  async resolvePlace(input: {
    tenantId: string;
    providerReference: string;
    sessionToken: string;
    correlationId: string;
  }): Promise<ResolvedPlace | null> {
    const placeId = safePlaceId(input.providerReference);
    const query = new URLSearchParams({
      sessionToken: input.sessionToken,
      languageCode: "nl",
      regionCode: "NL",
    });
    const place = await googleJson<GooglePlace>(
      {
        url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${query.toString()}`,
        apiKey: this.#placesApiKey(),
        fieldMask: "id,formattedAddress,addressComponents,location",
      },
      this.#fetcher,
    );
    return resolveGooglePlace(place, this.#clock().toISOString());
  }

  async validateAddress(input: {
    tenantId: string;
    address: Omit<ResolvedPlace, "provider" | "providerPlaceId" | "obtainedAt">;
    correlationId: string;
  }): Promise<AddressValidationResult> {
    const body = await googleJson<{
      result?: {
        verdict?: {
          addressComplete?: boolean;
          hasUnconfirmedComponents?: boolean;
          hasInferredComponents?: boolean;
          possibleNextAction?: string;
        };
        address?: {
          formattedAddress?: string;
          addressComponents?: Array<{
            componentName?: { text?: string };
            componentType?: string;
          }>;
        };
        geocode?: {
          location?: { latitude?: number; longitude?: number };
          placeId?: string;
        };
      };
    }>(
      {
        url: "https://addressvalidation.googleapis.com/v1:validateAddress",
        apiKey: this.#validationApiKey(),
        body: {
          address: {
            regionCode: input.address.countryCode,
            languageCode: "nl",
            postalCode: input.address.postalCode ?? undefined,
            administrativeArea: input.address.region ?? undefined,
            locality: input.address.city ?? undefined,
            addressLines: [input.address.formattedAddress],
          },
        },
      },
      this.#fetcher,
    );
    const result = body.result;
    if (!result?.verdict) {
      return {
        status: "INVALID",
        corrected: null,
        explanationCodes: Object.freeze(["PROVIDER_RESULT_MISSING"]),
        provider: "GOOGLE",
      };
    }
    const action = result.verdict.possibleNextAction;
    const status: AddressValidationResult["status"] =
      action === "ACCEPT" && result.verdict.addressComplete
        ? "VALID"
        : action?.startsWith("CONFIRM")
          ? "REVIEW_REQUIRED"
          : result.verdict.hasUnconfirmedComponents ||
              result.verdict.hasInferredComponents
            ? "PARTIAL"
            : "INVALID";
    return Object.freeze({
      status,
      corrected: validationPlace(result, this.#clock().toISOString()),
      explanationCodes: Object.freeze(
        [
          action,
          result.verdict.addressComplete ? "ADDRESS_COMPLETE" : null,
          result.verdict.hasUnconfirmedComponents
            ? "UNCONFIRMED_COMPONENTS"
            : null,
          result.verdict.hasInferredComponents ? "INFERRED_COMPONENTS" : null,
        ].filter((value): value is string => Boolean(value)),
      ),
      provider: "GOOGLE",
    });
  }

  async geocode(input: {
    tenantId: string;
    formattedAddress: string;
    correlationId: string;
  }): Promise<GeocodeResult> {
    const address = input.formattedAddress.trim();
    if (!address) return { status: "NOT_FOUND", candidates: [] };
    const body = await googleJson<{
      results?: GooglePlace[];
    }>(
      {
        url: `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(address)}`,
        apiKey: this.#geocodingApiKey(),
        fieldMask:
          "results.placeId,results.formattedAddress,results.addressComponents,results.location",
      },
      this.#fetcher,
    );
    const candidates = (body.results ?? [])
      .slice(0, 5)
      .map((place) =>
        resolveGooglePlace(
          { ...place, id: place.id ?? (place as { placeId?: string }).placeId },
          this.#clock().toISOString(),
        ),
      )
      .filter((place): place is ResolvedPlace => place !== null);
    return Object.freeze({
      status:
        candidates.length === 0
          ? "NOT_FOUND"
          : candidates.length === 1
            ? "MATCHED"
            : "AMBIGUOUS",
      candidates: Object.freeze(candidates),
    });
  }
}

function resolveGooglePlace(
  place: GooglePlace,
  obtainedAt: string,
): ResolvedPlace | null {
  if (!place.id || !place.formattedAddress) return null;
  const components = place.addressComponents ?? [];
  const component = (...types: string[]) =>
    components.find((item) => types.some((type) => item.types?.includes(type)));
  const street = component("route")?.longText ?? null;
  const houseNumber = component("street_number")?.longText ?? null;
  const addition = component("subpremise")?.longText ?? null;
  return Object.freeze({
    formattedAddress: place.formattedAddress,
    street,
    houseNumber,
    houseNumberAddition: addition,
    postalCode: component("postal_code")?.longText ?? null,
    city:
      component("locality", "postal_town")?.longText ??
      component("administrative_area_level_2")?.longText ??
      null,
    region: component("administrative_area_level_1")?.longText ?? null,
    countryCode: component("country")?.shortText ?? "NL",
    coordinates:
      typeof place.location?.latitude === "number" &&
      typeof place.location?.longitude === "number"
        ? Object.freeze({
            latitude: place.location.latitude,
            longitude: place.location.longitude,
          })
        : null,
    provider: "GOOGLE",
    providerPlaceId: place.id,
    obtainedAt,
  });
}

function validationPlace(
  result: {
    address?: {
      formattedAddress?: string;
      addressComponents?: Array<{
        componentName?: { text?: string };
        componentType?: string;
      }>;
    };
    geocode?: {
      location?: { latitude?: number; longitude?: number };
      placeId?: string;
    };
  },
  obtainedAt: string,
): ResolvedPlace | null {
  const address = result.address;
  const placeId = result.geocode?.placeId;
  if (!address?.formattedAddress || !placeId) return null;
  const components: GoogleAddressComponent[] = (
    address.addressComponents ?? []
  ).map((item) => ({
    longText: item.componentName?.text,
    shortText: item.componentName?.text,
    types: item.componentType ? [item.componentType] : [],
  }));
  return resolveGooglePlace(
    {
      id: placeId,
      formattedAddress: address.formattedAddress,
      addressComponents: components,
      location: result.geocode?.location,
    },
    obtainedAt,
  );
}

function safePlaceId(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{3,300}$/.test(trimmed)) {
    throw new Error("Ongeldige providerreferentie.");
  }
  return trimmed;
}
