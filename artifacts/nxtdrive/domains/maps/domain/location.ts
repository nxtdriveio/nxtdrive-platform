import type {
  AppointmentStop,
  Coordinates,
  LocationSource,
  LocationValidationStatus,
  LocationVersion,
} from "./types";

export type LocationVersionDraft = Readonly<{
  tenantId: string;
  locationRecordId: string;
  versionNumber: number;
  label: string;
  formattedAddress: string;
  street?: string | null;
  houseNumber?: string | null;
  houseNumberAddition?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  source: LocationSource;
  provider?: "GOOGLE" | null;
  providerPlaceId?: string | null;
  validationStatus?: LocationValidationStatus;
  changeReason?: string | null;
}>;

export function coordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Coordinates | null {
  const lat = latitude ?? null;
  const lng = longitude ?? null;
  if ((lat === null) !== (lng === null)) {
    throw new Error("Latitude en longitude moeten samen worden vastgelegd.");
  }
  if (lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Ongeldige latitude.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Ongeldige longitude.");
  }
  return Object.freeze({ latitude: lat, longitude: lng });
}

export function normalizeDutchPostalCode(value: string | null | undefined) {
  const normalized = value?.toUpperCase().replaceAll(/\s+/g, "") ?? "";
  if (!normalized) return null;
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(normalized)) {
    throw new Error("Ongeldige Nederlandse postcode.");
  }
  return `${normalized.slice(0, 4)} ${normalized.slice(4)}`;
}

export function validateLocationVersionDraft(
  input: LocationVersionDraft,
): LocationVersionDraft & { coordinates: Coordinates | null } {
  if (!input.tenantId.trim() || !input.locationRecordId.trim()) {
    throw new Error("Tenant en locatie zijn verplicht.");
  }
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new Error("Versienummer moet positief en geheel zijn.");
  }
  if (!input.label.trim() || input.label.trim().length > 160) {
    throw new Error("Locatielabel moet 1 tot 160 tekens bevatten.");
  }
  if (
    !input.formattedAddress.trim() ||
    input.formattedAddress.trim().length > 500
  ) {
    throw new Error("Adres moet 1 tot 500 tekens bevatten.");
  }
  const validatedCoordinates = coordinates(input.latitude, input.longitude);
  if (input.provider === null && input.providerPlaceId) {
    throw new Error("Provider Place ID vereist providerprovenance.");
  }
  if (
    input.validationStatus === "MANUALLY_CONFIRMED" &&
    !input.changeReason?.trim()
  ) {
    throw new Error("Handmatige bevestiging vereist een reden.");
  }
  return Object.freeze({ ...input, coordinates: validatedCoordinates });
}

export function snapshotLocation(
  version: LocationVersion,
  input: Pick<
    AppointmentStop,
    | "id"
    | "tenantId"
    | "appointmentType"
    | "appointmentId"
    | "stopType"
    | "sequenceNumber"
    | "publicationStatus"
    | "publishedAt"
    | "supersededAt"
  >,
): AppointmentStop {
  if (version.tenantId !== input.tenantId) {
    throw new Error("Cross-tenant locatiesnapshot geweigerd.");
  }
  return deepFreeze({
    ...input,
    sourceLocationRecordId: version.locationRecordId,
    sourceLocationVersionId: version.id,
    labelSnapshot: version.label,
    formattedAddressSnapshot: version.formattedAddress,
    coordinatesSnapshot: version.coordinates
      ? { ...version.coordinates }
      : null,
  });
}

export function locationDeduplicationKey(
  input: Pick<
    LocationVersionDraft,
    "formattedAddress" | "postalCode" | "providerPlaceId"
  >,
): string {
  if (input.providerPlaceId?.trim()) {
    return `google:${input.providerPlaceId.trim()}`;
  }
  const address = input.formattedAddress
    .normalize("NFKC")
    .toLocaleLowerCase("nl-NL")
    .replaceAll(/[.,]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const postalCode = input.postalCode?.replaceAll(/\s+/g, "").toUpperCase();
  return `address:${postalCode ?? ""}:${address}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
