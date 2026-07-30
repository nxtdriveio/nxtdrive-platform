import type {
  RouteLeg,
  TravelConflictDecision,
  TravelConflictStatus,
} from "../domain/types";

export type TravelConflictPolicy = Readonly<{
  bufferSeconds: number;
  tightThresholdSeconds: number;
  unknownAction: "ALLOW" | "WARN" | "BLOCK";
  fallbackAction: "ALLOW" | "WARN" | "BLOCK";
  infeasibleAction: "WARN" | "BLOCK";
  overrideAllowed: boolean;
}>;

export function evaluateTravelConflict(input: {
  previousEndsAt: string;
  nextStartsAt: string;
  route: RouteLeg | null;
  policy: TravelConflictPolicy;
}): TravelConflictDecision {
  const previousEnd = Date.parse(input.previousEndsAt);
  const nextStart = Date.parse(input.nextStartsAt);
  if (!Number.isFinite(previousEnd) || !Number.isFinite(nextStart)) {
    throw new Error("Ongeldige afspraakdatum voor reistijdcontrole.");
  }
  if (
    input.policy.bufferSeconds < 0 ||
    input.policy.tightThresholdSeconds < 0
  ) {
    throw new Error("Reistijdbuffers mogen niet negatief zijn.");
  }
  const availableSeconds = Math.max(
    0,
    Math.floor((nextStart - previousEnd) / 1000),
  );
  if (
    !input.route ||
    input.route.status === "NO_ROUTE" ||
    input.route.durationSeconds === null
  ) {
    return decision({
      status: "UNKNOWN",
      action: input.policy.unknownAction,
      availableSeconds,
      requiredSeconds: null,
      shortageSeconds: null,
      route: input.route,
      policy: input.policy,
      explanation: ["Geen betrouwbare route beschikbaar."],
    });
  }
  const requiredSeconds =
    input.route.durationSeconds + input.policy.bufferSeconds;
  const shortageSeconds = Math.max(0, requiredSeconds - availableSeconds);
  const isFallback =
    input.route.status === "FALLBACK" ||
    ["HAVERSINE", "RAYON_MATRIX"].includes(input.route.method);
  if (shortageSeconds > 0) {
    return decision({
      status: isFallback ? "FALLBACK_ESTIMATE" : "INFEASIBLE",
      action: isFallback
        ? input.policy.fallbackAction
        : input.policy.infeasibleAction,
      availableSeconds,
      requiredSeconds,
      shortageSeconds,
      route: input.route,
      policy: input.policy,
      explanation: [
        `Beschikbaar: ${Math.round(availableSeconds / 60)} min.`,
        `Route plus buffer: ${Math.round(requiredSeconds / 60)} min.`,
        `Tekort: ${Math.ceil(shortageSeconds / 60)} min.`,
        isFallback
          ? "De route is een fallbackinschatting."
          : "De route is op providergegevens berekend.",
      ],
    });
  }
  const spareSeconds = availableSeconds - requiredSeconds;
  const status: TravelConflictStatus = isFallback
    ? "FALLBACK_ESTIMATE"
    : spareSeconds <= input.policy.tightThresholdSeconds
      ? "TIGHT"
      : "FEASIBLE";
  return decision({
    status,
    action:
      status === "FEASIBLE"
        ? "ALLOW"
        : status === "TIGHT"
          ? "WARN"
          : input.policy.fallbackAction,
    availableSeconds,
    requiredSeconds,
    shortageSeconds: 0,
    route: input.route,
    policy: input.policy,
    explanation: [
      `Beschikbaar: ${Math.round(availableSeconds / 60)} min.`,
      `Route plus buffer: ${Math.round(requiredSeconds / 60)} min.`,
      status === "TIGHT"
        ? "De resterende marge is klein."
        : isFallback
          ? "Haalbaar volgens een fallbackinschatting."
          : "Haalbaar met de ingestelde buffer.",
    ],
  });
}

function decision(input: {
  status: TravelConflictStatus;
  action: "ALLOW" | "WARN" | "BLOCK";
  availableSeconds: number;
  requiredSeconds: number | null;
  shortageSeconds: number | null;
  route: RouteLeg | null;
  policy: TravelConflictPolicy;
  explanation: readonly string[];
}): TravelConflictDecision {
  return Object.freeze({
    status: input.status,
    action: input.action,
    availableSeconds: input.availableSeconds,
    requiredSeconds: input.requiredSeconds,
    shortageSeconds: input.shortageSeconds,
    bufferSeconds: input.policy.bufferSeconds,
    route: input.route,
    explanation: Object.freeze([...input.explanation]),
    overrideAllowed:
      input.policy.overrideAllowed &&
      (input.action === "BLOCK" || input.action === "WARN"),
  });
}
