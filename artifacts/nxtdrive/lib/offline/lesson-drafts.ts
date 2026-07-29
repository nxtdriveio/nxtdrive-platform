export type DraftSyncStatus =
  | "LOCAL_ONLY"
  | "SYNC_PENDING"
  | "SYNCING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED";

export type DraftObservation = {
  competencyId: string;
  instructionStage: null | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  performanceOutcome:
    | "NOT_OBSERVED"
    | "ATTENTION_REQUIRED"
    | "DEVELOPING"
    | "SUFFICIENT"
    | "STABLE";
  safetyStatus: "NOT_ASSESSED" | "NO_BLOCKER" | "ATTENTION" | "BLOCKER";
  note?: string;
};

export type OfflineLessonDraft = {
  localId: string;
  lessonId: string;
  tenantId: string;
  actorId: string;
  idempotencyKey: string;
  localRevision: number;
  serverRevision: number | null;
  syncStatus: DraftSyncStatus;
  updatedAt: string;
  expiresAt: string;
  observations: DraftObservation[];
  studentReflection?: string;
  instructorReflection?: string;
  nextFocusCompetencyIds: string[];
};

export type DraftConflict = {
  competencyId: string;
  local: DraftObservation;
  server: DraftObservation;
  reason: "BOTH_CHANGED" | "SAFETY_EVIDENCE_CHANGED";
};

export type DraftMergeResult =
  | { status: "MERGED"; draft: OfflineLessonDraft }
  | {
      status: "CONFLICT";
      draft: OfflineLessonDraft;
      conflicts: DraftConflict[];
    };

function observationsEqual(
  left: DraftObservation,
  right: DraftObservation,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Three-way merge. A changed observation is never silently overwritten when
 * both local and server revisions changed; safety differences always conflict.
 */
export function mergeLessonDraft(input: {
  base: OfflineLessonDraft;
  local: OfflineLessonDraft;
  server: OfflineLessonDraft;
}): DraftMergeResult {
  const baseById = new Map(
    input.base.observations.map((item) => [item.competencyId, item]),
  );
  const localById = new Map(
    input.local.observations.map((item) => [item.competencyId, item]),
  );
  const serverById = new Map(
    input.server.observations.map((item) => [item.competencyId, item]),
  );
  const ids = new Set([
    ...baseById.keys(),
    ...localById.keys(),
    ...serverById.keys(),
  ]);
  const observations: DraftObservation[] = [];
  const conflicts: DraftConflict[] = [];

  for (const competencyId of [...ids].sort()) {
    const base = baseById.get(competencyId);
    const local = localById.get(competencyId);
    const server = serverById.get(competencyId);
    if (!local && server) {
      observations.push(server);
      continue;
    }
    if (local && !server) {
      observations.push(local);
      continue;
    }
    if (!local || !server) continue;
    if (observationsEqual(local, server)) {
      observations.push(local);
      continue;
    }
    const localChanged = !base || !observationsEqual(local, base);
    const serverChanged = !base || !observationsEqual(server, base);
    if (localChanged && serverChanged) {
      conflicts.push({
        competencyId,
        local,
        server,
        reason:
          local.safetyStatus !== server.safetyStatus
            ? "SAFETY_EVIDENCE_CHANGED"
            : "BOTH_CHANGED",
      });
      observations.push(local);
      continue;
    }
    observations.push(localChanged ? local : server);
  }

  const merged: OfflineLessonDraft = {
    ...input.local,
    serverRevision: input.server.serverRevision,
    localRevision:
      Math.max(input.local.localRevision, input.server.localRevision) + 1,
    syncStatus: conflicts.length > 0 ? "CONFLICT" : "SYNC_PENDING",
    observations,
    updatedAt: new Date(
      Math.max(
        Date.parse(input.local.updatedAt),
        Date.parse(input.server.updatedAt),
      ),
    ).toISOString(),
  };
  return conflicts.length > 0
    ? { status: "CONFLICT", draft: merged, conflicts }
    : { status: "MERGED", draft: merged };
}

export function createOfflineLessonDraft(input: {
  lessonId: string;
  tenantId: string;
  actorId: string;
  now: Date;
  expiresAt: Date;
}): OfflineLessonDraft {
  if (input.expiresAt <= input.now) {
    throw new Error("Offline draft expiry must be in the future.");
  }
  return {
    localId: crypto.randomUUID(),
    lessonId: input.lessonId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    idempotencyKey: crypto.randomUUID(),
    localRevision: 1,
    serverRevision: null,
    syncStatus: "LOCAL_ONLY",
    updatedAt: input.now.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    observations: [],
    nextFocusCompetencyIds: [],
  };
}
