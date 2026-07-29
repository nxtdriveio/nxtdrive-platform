import {
  createAssessmentRetest,
  guardAssessmentPlanning,
  transitionAssessment,
  type AssessmentOverridePolicy,
  type AssessmentRecord,
  type ReadinessDecision,
  type ReadinessEvaluation,
} from "@workspace/leskaart";

export interface AssessmentRepository {
  insert(record: AssessmentRecord): Promise<void>;
  updateLifecycle(
    before: AssessmentRecord,
    after: AssessmentRecord,
  ): Promise<void>;
}

export class AssessmentService {
  constructor(private readonly repository: AssessmentRepository) {}

  async plan(input: {
    record: AssessmentRecord;
    evaluation: ReadinessEvaluation;
    decision?: ReadinessDecision;
    overridePolicy: AssessmentOverridePolicy;
    scheduledAt: string;
  }): Promise<AssessmentRecord> {
    const guard = guardAssessmentPlanning({
      ...input,
      plannedAt: input.scheduledAt,
    });
    if (!guard.allowed) {
      throw new AssessmentApplicationError(
        "ASSESSMENT_PLANNING_BLOCKED",
        guard.message,
        guard.reasonIds,
      );
    }
    const planned = transitionAssessment(input.record, "PLANNED", {
      scheduledAt: input.scheduledAt,
    });
    await this.repository.updateLifecycle(input.record, planned);
    return planned;
  }

  async retest(
    previous: AssessmentRecord,
    input: Parameters<typeof createAssessmentRetest>[1],
  ): Promise<AssessmentRecord> {
    const retest = createAssessmentRetest(previous, input);
    await this.repository.insert(retest);
    return retest;
  }
}

export class AssessmentApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly reasonIds: readonly string[],
  ) {
    super(message);
    this.name = "AssessmentApplicationError";
  }
}
