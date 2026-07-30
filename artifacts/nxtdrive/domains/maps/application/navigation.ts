import type { Coordinates } from "../domain/types";

export function buildExternalNavigationUrl(input: {
  provider: "GOOGLE_MAPS" | "APPLE_MAPS";
  placeId?: string | null;
  coordinates?: Coordinates | null;
  formattedAddress: string;
}): string {
  const destination = input.coordinates
    ? `${input.coordinates.latitude},${input.coordinates.longitude}`
    : input.formattedAddress.trim();
  if (!destination) throw new Error("Navigatiebestemming ontbreekt.");
  if (input.provider === "APPLE_MAPS") {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
  }
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });
  if (input.placeId?.trim()) {
    params.set("destination_place_id", input.placeId.trim());
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function departureAdvice(input: {
  startsAt: string;
  travelSeconds: number | null;
  arrivalBufferSeconds: number;
  now: string;
  fallbackMinutes: number;
}) {
  const startsAt = Date.parse(input.startsAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(startsAt) || !Number.isFinite(now)) {
    throw new Error("Vertrekadvies vereist geldige datums.");
  }
  const travelSeconds = input.travelSeconds ?? input.fallbackMinutes * 60;
  const departureAt = new Date(
    startsAt - (travelSeconds + input.arrivalBufferSeconds) * 1000,
  ).toISOString();
  return Object.freeze({
    departureAt,
    leaveInMinutes: Math.floor((Date.parse(departureAt) - now) / 60_000),
    method: input.travelSeconds === null ? "CONFIGURED_BUFFER" : "ROUTE",
    confidence: input.travelSeconds === null ? "LOW" : "HIGH",
  });
}
