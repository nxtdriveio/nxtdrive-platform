import {
  Ris10LegacyEvidenceAdapter,
  Ris20ReadinessEvidenceAdapter,
  StandardReadinessEvidenceAdapter,
  evaluateReadiness,
  type EvaluateReadinessInput,
  type LegacyImportedObservation,
  type ReadinessAssessmentValue,
  type ReadinessEvaluation,
  type ReadinessPolicy,
  type ReadinessPrerequisiteValue,
  type RisScriptObservation,
  type StandardCompetencyObservation,
  type TrainingMethod,
} from "@workspace/leskaart";

export interface ReadinessClock {
  now(): Date;
}

export interface ReadinessEvaluationRepository {
  /**
   * Persists input snapshot, result snapshot and evaluation atomically. The
   * database adapter must reject updates/deletes to either snapshot.
   */
  saveEvaluation(evaluation: ReadinessEvaluation): Promise<void>;
}

export type ReadinessFeatureFlags = Readonly<{
  shadowEnabled: boolean;
  activeEnabled: boolean;
}>;

type EvaluationSource =
  | Readonly<{
      trainingMethod: "STANDARD";
      observations: readonly StandardCompetencyObservation[];
    }>
  | Readonly<{
      trainingMethod: "RIS_2_0";
      observations: readonly RisScriptObservation[];
    }>
  | Readonly<{
      trainingMethod: "RIS_1_0_LEGACY";
      observations: readonly LegacyImportedObservation[];
    }>;

export type EvaluateReadinessCommand = Readonly<{
  evaluationId: string;
  tenantId: string;
  enrollmentId: string;
  curriculumVersionId: string;
  policy: ReadinessPolicy;
  prerequisites: readonly ReadinessPrerequisiteValue[];
  assessments: readonly ReadinessAssessmentValue[];
  source: EvaluationSource;
}>;

/**
 * Server-side application boundary for the framework-independent engine.
 *
 * UI code receives stored results; it never reimplements or recalculates
 * readiness. Shadow mode is the safe default and expert validation in the
 * engine can still downgrade an active request to SHADOW.
 */
export class ReadinessEvaluationService {
  constructor(
    private readonly repository: ReadinessEvaluationRepository,
    private readonly clock: ReadinessClock,
    private readonly flags: ReadinessFeatureFlags,
  ) {}

  async evaluate(
    command: EvaluateReadinessCommand,
  ): Promise<ReadinessEvaluation> {
    if (!this.flags.shadowEnabled && !this.flags.activeEnabled) {
      throw new Error("Readiness evaluation is disabled by feature policy.");
    }
    const evidence = normalizeSource(command.source);
    const input: EvaluateReadinessInput = {
      evaluationId: required(command.evaluationId, "evaluationId"),
      tenantId: required(command.tenantId, "tenantId"),
      enrollmentId: required(command.enrollmentId, "enrollmentId"),
      trainingMethod: command.source.trainingMethod,
      curriculumVersionId: required(
        command.curriculumVersionId,
        "curriculumVersionId",
      ),
      evaluatedAt: this.clock.now().toISOString(),
      requestedMode: this.flags.activeEnabled ? "ACTIVE" : "SHADOW",
      policy: command.policy,
      evidence,
      prerequisites: command.prerequisites,
      assessments: command.assessments,
    };
    const evaluation = evaluateReadiness(input);
    await this.repository.saveEvaluation(evaluation);
    return evaluation;
  }
}

function normalizeSource(source: EvaluationSource) {
  switch (source.trainingMethod) {
    case "STANDARD":
      return new StandardReadinessEvidenceAdapter().normalize(
        source.observations,
      );
    case "RIS_2_0":
      return new Ris20ReadinessEvidenceAdapter().normalize(source.observations);
    case "RIS_1_0_LEGACY":
      return new Ris10LegacyEvidenceAdapter().normalize(source.observations);
  }
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

export type { EvaluationSource, TrainingMethod };
