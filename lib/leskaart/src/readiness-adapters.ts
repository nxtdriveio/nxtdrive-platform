import type {
  CompetenceBand,
  EvidenceSafetyStatus,
  IndependenceBand,
  NormalizedCompetencyEvidence,
  ReadinessEvidenceAdapter,
} from "./readiness-types";

export type StandardCompetencyObservation = Readonly<{
  id: string;
  competencyId: string;
  observedAt: string;
  observed: boolean;
  competenceBand: CompetenceBand;
  independenceBand: IndependenceBand;
  safetyStatus: EvidenceSafetyStatus;
  contextTags?: readonly string[];
  instructorId?: string;
  lessonId?: string;
}>;

export class StandardReadinessEvidenceAdapter implements ReadinessEvidenceAdapter<
  readonly StandardCompetencyObservation[]
> {
  readonly method = "STANDARD" as const;

  normalize(
    input: readonly StandardCompetencyObservation[],
  ): NormalizedCompetencyEvidence[] {
    return input.map((item) =>
      normalized({
        competencyId: item.competencyId,
        observedAt: item.observedAt,
        sourceType: "STANDARD_LESSON",
        observed: item.observed,
        competenceBand: item.observed ? item.competenceBand : "UNKNOWN",
        independenceBand: item.observed ? item.independenceBand : "UNKNOWN",
        safetyStatus: item.observed ? item.safetyStatus : "UNKNOWN",
        contextTags: item.contextTags ?? [],
        ...(item.instructorId ? { instructorId: item.instructorId } : {}),
        ...(item.lessonId ? { lessonId: item.lessonId } : {}),
        sourceEvidenceId: item.id,
      }),
    );
  }
}

export type RisInstructionStage = null | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type RisPerformanceOutcome =
  | "NOT_OBSERVED"
  | "ATTENTION_REQUIRED"
  | "DEVELOPING"
  | "SUFFICIENT"
  | "STABLE";

export type RisSupportLevel =
  | "DIRECT_INSTRUCTION"
  | "PROMPTING"
  | "COACHING"
  | "OBSERVATION_ONLY";

export type RisSafetyStatus =
  | "NOT_ASSESSED"
  | "NO_BLOCKER"
  | "ATTENTION"
  | "BLOCKER";

export type RisScriptObservation = Readonly<{
  id: string;
  scriptId: string;
  competencyId: string;
  observedAt: string;
  instructionStage: RisInstructionStage;
  performanceOutcome: RisPerformanceOutcome;
  supportLevel: RisSupportLevel;
  safetyStatus: RisSafetyStatus;
  contextTags: readonly string[];
  instructorId?: string;
  lessonId?: string;
}>;

export class Ris20ReadinessEvidenceAdapter implements ReadinessEvidenceAdapter<
  readonly RisScriptObservation[]
> {
  readonly method = "RIS_2_0" as const;

  normalize(
    input: readonly RisScriptObservation[],
  ): NormalizedCompetencyEvidence[] {
    return input.map((item) => {
      const observed =
        item.instructionStage !== null ||
        item.performanceOutcome !== "NOT_OBSERVED";
      return normalized({
        competencyId: item.competencyId,
        observedAt: item.observedAt,
        sourceType: "RIS_SCRIPT",
        observed,
        // Deliberately derived only from the explicit performance outcome.
        // The RIS instruction stage never raises the mastery band.
        competenceBand: observed
          ? performanceToCompetence(item.performanceOutcome)
          : "UNKNOWN",
        // Instruction stage and explicit support describe independence only.
        independenceBand: observed
          ? instructionToIndependence(item.instructionStage, item.supportLevel)
          : "UNKNOWN",
        safetyStatus: observed
          ? risSafetyToEvidenceSafety(item.safetyStatus)
          : "UNKNOWN",
        contextTags: item.contextTags,
        ...(item.instructorId ? { instructorId: item.instructorId } : {}),
        ...(item.lessonId ? { lessonId: item.lessonId } : {}),
        sourceEvidenceId: item.id,
      });
    });
  }
}

export type LegacyImportedObservation = Readonly<{
  id: string;
  competencyId: string;
  observedAt: string;
  /** Original legacy value. Null means not assessed and is never coerced. */
  legacyLevel: number | null;
  contextTags?: readonly string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  instructorId?: string;
  lessonId?: string;
}>;

export class Ris10LegacyEvidenceAdapter implements ReadinessEvidenceAdapter<
  readonly LegacyImportedObservation[]
> {
  readonly method = "RIS_1_0_LEGACY" as const;

  normalize(
    input: readonly LegacyImportedObservation[],
  ): NormalizedCompetencyEvidence[] {
    return input.map((item) => {
      const observed = item.legacyLevel !== null;
      return normalized({
        competencyId: item.competencyId,
        observedAt: item.observedAt,
        sourceType: "LEGACY_IMPORT",
        observed,
        competenceBand: observed
          ? legacyCompetence(item.legacyLevel)
          : "UNKNOWN",
        independenceBand: observed
          ? legacyIndependence(item.legacyLevel)
          : "UNKNOWN",
        // Legacy values do not prove an explicitly assessed safety dimension.
        safetyStatus: "UNKNOWN",
        contextTags: item.contextTags ?? [],
        ...(item.instructorId ? { instructorId: item.instructorId } : {}),
        ...(item.lessonId ? { lessonId: item.lessonId } : {}),
        sourceEvidenceId: item.id,
        legacyConfidence: item.confidence,
      });
    });
  }
}

function performanceToCompetence(
  outcome: RisPerformanceOutcome,
): CompetenceBand {
  switch (outcome) {
    case "NOT_OBSERVED":
      return "UNKNOWN";
    case "ATTENTION_REQUIRED":
      return "ATTENTION_REQUIRED";
    case "DEVELOPING":
      return "DEVELOPING";
    case "SUFFICIENT":
      return "SUFFICIENT";
    case "STABLE":
      return "STABLE";
  }
}

function instructionToIndependence(
  stage: RisInstructionStage,
  support: RisSupportLevel,
): IndependenceBand {
  if (stage === null) return "UNKNOWN";
  if (stage <= 3 || support === "DIRECT_INSTRUCTION") return "INSTRUCTED";
  if (stage === 4 || support === "PROMPTING") return "SUPPORTED";
  if (stage === 5 || support === "COACHING") return "COACHED";
  if (stage === 6) return "INDEPENDENT";
  return "TRANSFERABLE";
}

function risSafetyToEvidenceSafety(
  status: RisSafetyStatus,
): EvidenceSafetyStatus {
  switch (status) {
    case "NOT_ASSESSED":
      return "UNKNOWN";
    case "NO_BLOCKER":
      return "CLEAR";
    case "ATTENTION":
      return "ATTENTION";
    case "BLOCKER":
      return "BLOCKER";
  }
}

function legacyCompetence(level: number | null): CompetenceBand {
  if (level === null) return "UNKNOWN";
  if (level <= 2) return "ATTENTION_REQUIRED";
  if (level <= 5) return "DEVELOPING";
  if (level <= 7) return "SUFFICIENT";
  return "STABLE";
}

function legacyIndependence(level: number | null): IndependenceBand {
  if (level === null) return "UNKNOWN";
  if (level <= 2) return "INSTRUCTED";
  if (level <= 4) return "SUPPORTED";
  if (level <= 5) return "COACHED";
  if (level <= 7) return "INDEPENDENT";
  return "TRANSFERABLE";
}

function normalized(
  evidence: NormalizedCompetencyEvidence,
): NormalizedCompetencyEvidence {
  if (!evidence.sourceEvidenceId.trim()) {
    throw new Error("Normalized evidence requires a stable sourceEvidenceId.");
  }
  if (!evidence.competencyId.trim()) {
    throw new Error("Normalized evidence requires a competencyId.");
  }
  if (!Number.isFinite(Date.parse(evidence.observedAt))) {
    throw new Error(
      `Evidence ${evidence.sourceEvidenceId} has an invalid observedAt timestamp.`,
    );
  }
  return Object.freeze({
    ...evidence,
    contextTags: Object.freeze([...new Set(evidence.contextTags)].sort()),
  });
}
