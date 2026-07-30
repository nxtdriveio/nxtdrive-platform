export type InstructorCandidate = Readonly<{
  instructorId: string;
  displayName: string;
  authorized: boolean;
  available: boolean;
  withinWorkingHours: boolean;
  branchMatch: boolean;
  vehicleMatch: boolean;
  existingHardConflict: boolean;
  continuity: boolean;
  extraTravelSeconds: number | null;
  emptyMeters: number | null;
  bufferSeconds: number | null;
}>;

export function shortlistInstructorCandidates(
  candidates: readonly InstructorCandidate[],
  maximum = 5,
) {
  return candidates
    .filter(
      (candidate) =>
        candidate.authorized &&
        candidate.available &&
        candidate.withinWorkingHours &&
        candidate.vehicleMatch &&
        !candidate.existingHardConflict,
    )
    .sort(
      (a, b) =>
        Number(b.continuity) - Number(a.continuity) ||
        Number(b.branchMatch) - Number(a.branchMatch) ||
        (a.extraTravelSeconds ?? Number.POSITIVE_INFINITY) -
          (b.extraTravelSeconds ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, Math.max(0, Math.min(maximum, 5)))
    .map((candidate) =>
      Object.freeze({
        ...candidate,
        explanation: Object.freeze([
          candidate.continuity
            ? "Eerder aan deze leerling gekoppeld."
            : "Geen bestaande leerlingkoppeling.",
          candidate.branchMatch ? "Zelfde vestiging." : "Andere vestiging.",
          candidate.extraTravelSeconds === null
            ? "Extra reistijd onbekend."
            : `+ ${Math.ceil(candidate.extraTravelSeconds / 60)} min extra reistijd.`,
          candidate.bufferSeconds === null
            ? "Planningbuffer onbekend."
            : `${Math.floor(candidate.bufferSeconds / 60)} min planningbuffer.`,
        ]),
      }),
    );
}

export type ResourceCandidate = Readonly<{
  id: string;
  label: string;
  available: boolean;
  capabilityMatch: boolean;
  maintenanceBlocked: boolean;
  branchMatch: boolean;
  extraTravelSeconds: number | null;
}>;

export function recommendResources(candidates: readonly ResourceCandidate[]) {
  return candidates
    .filter(
      (candidate) =>
        candidate.available &&
        candidate.capabilityMatch &&
        !candidate.maintenanceBlocked,
    )
    .sort(
      (a, b) =>
        Number(b.branchMatch) - Number(a.branchMatch) ||
        (a.extraTravelSeconds ?? Number.POSITIVE_INFINITY) -
          (b.extraTravelSeconds ?? Number.POSITIVE_INFINITY),
    )
    .map((candidate) =>
      Object.freeze({
        ...candidate,
        explanation: Object.freeze([
          candidate.branchMatch ? "Zelfde vestiging." : "Andere vestiging.",
          candidate.extraTravelSeconds === null
            ? "Route-impact onbekend."
            : `${Math.ceil(candidate.extraTravelSeconds / 60)} min extra reistijd.`,
        ]),
      }),
    );
}
