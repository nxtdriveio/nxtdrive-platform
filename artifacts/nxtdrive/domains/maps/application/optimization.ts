import type { OptimizationResult, OptimizationStop } from "./contracts";
import type { Coordinates } from "../domain/types";
import { haversineMeters } from "./route-gateway";

export type PlanningMutation = Readonly<{
  appointmentId: string;
  fromPosition: number;
  toPosition: number;
  accepted: boolean;
}>;

export type OptimizationScenario = Readonly<{
  status: "DRAFT" | "ACCEPTED" | "REJECTED" | "PUBLISHED" | "ROLLED_BACK";
  currentOrder: readonly string[];
  proposedOrder: readonly string[];
  mutations: readonly PlanningMutation[];
  result: OptimizationResult;
  requiresHumanApproval: true;
  automaticallyPublished: false;
}>;

export function optimizeSingleInstructorLocally(input: {
  start: Coordinates;
  end: Coordinates;
  stops: readonly OptimizationStop[];
}): OptimizationScenario {
  const eligible = input.stops.filter(
    (stop) => !stop.published && stop.flexible,
  );
  if (eligible.length !== input.stops.length) {
    throw new Error(
      "Optimalisatie accepteert uitsluitend expliciet flexibele, ongepubliceerde afspraken.",
    );
  }
  const currentOrder = input.stops.map((stop) => stop.appointmentId);
  const remaining = [...input.stops];
  const ordered: OptimizationStop[] = [];
  let cursor = input.start;
  while (remaining.length > 0) {
    remaining.sort(
      (a, b) =>
        haversineMeters(cursor, a.coordinates) -
          haversineMeters(cursor, b.coordinates) ||
        a.windowStart.localeCompare(b.windowStart),
    );
    const selected = remaining.shift()!;
    ordered.push(selected);
    cursor = selected.coordinates;
  }
  const proposedOrder = ordered.map((stop) => stop.appointmentId);
  const currentMeters = chainDistance(input.start, input.end, input.stops);
  const proposedMeters = chainDistance(input.start, input.end, ordered);
  const mutations = currentOrder
    .map((appointmentId, fromPosition) => ({
      appointmentId,
      fromPosition,
      toPosition: proposedOrder.indexOf(appointmentId),
      accepted: false,
    }))
    .filter((item) => item.fromPosition !== item.toPosition);
  return Object.freeze({
    status: "DRAFT",
    currentOrder: Object.freeze(currentOrder),
    proposedOrder: Object.freeze(proposedOrder),
    mutations: Object.freeze(
      mutations.map((mutation) => Object.freeze(mutation)),
    ),
    result: Object.freeze({
      status: "FALLBACK",
      provider: "INTERNAL",
      orderedAppointmentIds: Object.freeze(proposedOrder),
      currentTravelSeconds: null,
      proposedTravelSeconds: null,
      currentEmptyMeters: currentMeters,
      proposedEmptyMeters: proposedMeters,
      explanations: Object.freeze([
        "Lokale nearest-neighbourheuristiek zonder verkeersinformatie.",
        "Planner moet het scenario beoordelen en expliciet publiceren.",
      ]),
      automaticallyPublished: false,
    }),
    requiresHumanApproval: true,
    automaticallyPublished: false,
  });
}

export function acceptScenarioMutations(
  scenario: OptimizationScenario,
  appointmentIds: readonly string[],
): OptimizationScenario {
  if (scenario.status !== "DRAFT") {
    throw new Error("Alleen een conceptscenario kan worden geaccepteerd.");
  }
  const accepted = new Set(appointmentIds);
  if (
    appointmentIds.some(
      (id) => !scenario.mutations.some((item) => item.appointmentId === id),
    )
  ) {
    throw new Error("Onbekende scenariomutatie.");
  }
  return Object.freeze({
    ...scenario,
    status: "ACCEPTED",
    mutations: Object.freeze(
      scenario.mutations.map((mutation) =>
        Object.freeze({
          ...mutation,
          accepted: accepted.has(mutation.appointmentId),
        }),
      ),
    ),
  });
}

function chainDistance(
  start: Coordinates,
  end: Coordinates,
  stops: readonly OptimizationStop[],
) {
  let total = 0;
  let cursor = start;
  for (const stop of stops) {
    total += haversineMeters(cursor, stop.coordinates);
    cursor = stop.coordinates;
  }
  return total + haversineMeters(cursor, end);
}
