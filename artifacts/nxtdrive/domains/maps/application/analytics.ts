import type { RouteConfidence, RouteMethod } from "../domain/types";

export type PlannedEmptyLeg = Readonly<{
  distanceMeters: number | null;
  durationSeconds: number | null;
  method: RouteMethod;
  confidence: RouteConfidence;
}>;

export function summarizeEmptyMiles(input: {
  legs: readonly PlannedEmptyLeg[];
  appointmentCount: number;
  expectedLegCount: number;
}) {
  const measured = input.legs.filter(
    (leg) => leg.distanceMeters !== null && leg.durationSeconds !== null,
  );
  const distanceMeters = measured.reduce(
    (sum, leg) => sum + (leg.distanceMeters ?? 0),
    0,
  );
  const durationSeconds = measured.reduce(
    (sum, leg) => sum + (leg.durationSeconds ?? 0),
    0,
  );
  const methodCounts = measured.reduce<Record<string, number>>(
    (counts, leg) => {
      counts[leg.method] = (counts[leg.method] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return Object.freeze({
    plannedEmptyKilometers: Math.round((distanceMeters / 1000) * 10) / 10,
    travelMinutes: Math.round(durationSeconds / 60),
    appointmentCount: input.appointmentCount,
    coveragePercent:
      input.expectedLegCount === 0
        ? 100
        : Math.round((measured.length / input.expectedLegCount) * 100),
    missingLegs: Math.max(0, input.expectedLegCount - measured.length),
    methodCounts: Object.freeze(methodCounts),
    disclaimer:
      "Planninginschatting op basis van gepubliceerde stops; geen GPS-gemeten afstand.",
  });
}

export type PostcodeObservation = Readonly<{
  postcode4: string;
  people: number;
  appointments: number;
  leads: number;
  travelSeconds: number;
}>;

export type PrivacyThreshold = Readonly<{
  minimumPeople: number;
  minimumAppointments: number;
  maximumGeographicPrecision: "POSTCODE4" | "CITY";
}>;

export function aggregatePostcodeAnalytics(
  observations: readonly PostcodeObservation[],
  threshold: PrivacyThreshold,
) {
  if (threshold.maximumGeographicPrecision !== "POSTCODE4") {
    return Object.freeze({
      visible: [],
      suppressedCells: observations.length,
      reason: "CITY_AGGREGATION_REQUIRED",
    });
  }
  const grouped = new Map<string, PostcodeObservation>();
  for (const item of observations) {
    if (!/^[1-9][0-9]{3}$/.test(item.postcode4)) continue;
    const existing = grouped.get(item.postcode4);
    grouped.set(item.postcode4, {
      postcode4: item.postcode4,
      people: (existing?.people ?? 0) + item.people,
      appointments: (existing?.appointments ?? 0) + item.appointments,
      leads: (existing?.leads ?? 0) + item.leads,
      travelSeconds: (existing?.travelSeconds ?? 0) + item.travelSeconds,
    });
  }
  const visible = [...grouped.values()]
    .filter(
      (cell) =>
        cell.people >= threshold.minimumPeople &&
        cell.appointments >= threshold.minimumAppointments,
    )
    .map((cell) =>
      Object.freeze({
        postcode4: cell.postcode4,
        people: cell.people,
        appointments: cell.appointments,
        leads: cell.leads,
        averageTravelMinutes:
          cell.appointments === 0
            ? null
            : Math.round(cell.travelSeconds / cell.appointments / 60),
      }),
    );
  return Object.freeze({
    visible: Object.freeze(visible),
    suppressedCells: grouped.size - visible.length,
    reason: visible.length === 0 ? "PRIVACY_THRESHOLD" : null,
  });
}

export function assertSafeAnalyticsDimensions(dimensions: readonly string[]) {
  const forbidden = new Set([
    "student_id",
    "instructor_id",
    "address",
    "house_number",
    "coordinates",
    "postcode6",
  ]);
  const unsafe = dimensions.find((dimension) => forbidden.has(dimension));
  if (unsafe) throw new Error(`Onveilige analyticsdimensie: ${unsafe}.`);
}
