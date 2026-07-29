import type {
  AssessmentType,
  ReadinessBlocker,
  ReadinessEvaluation,
} from "./readiness-types";
import {
  assertTrainingMethodOperationAllowed,
  type TrainingMethod,
} from "./training-methods";

export type AssessmentStatus =
  | "DRAFT"
  | "PLANNED"
  | "IN_PROGRESS"
  | "AWAITING_REVIEW"
  | "COMPLETED"
  | "PUBLISHED"
  | "VOIDED";

export type AssessmentResult = "PASSED" | "NOT_PASSED" | "NO_DECISION";

export type AssessmentCriterionResult = Readonly<{
  criterionId: string;
  result: "MET" | "NOT_MET" | "NOT_ASSESSED";
  note?: string;
  evidenceIds: readonly string[];
}>;

export type PublicationMetadata = Readonly<{
  publishedBy: string;
  publishedAt: string;
}>;

export type AssessmentRecord = Readonly<{
  id: string;
  tenantId: string;
  enrollmentId: string;
  trainingMethod: TrainingMethod;
  assessmentDefinitionId: string;
  assessmentDefinitionVersion: string;
  assessmentType: AssessmentType;
  curriculumVersionId: string;
  policyVersionId: string;
  readinessEvaluationId?: string;
  readinessDecisionId?: string;
  status: AssessmentStatus;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  assessorId?: string;
  result?: AssessmentResult;
  criterionResults: readonly AssessmentCriterionResult[];
  feedback?: string;
  learnerFeedback?: string;
  publication?: PublicationMetadata;
  previousAttemptId?: string;
  attemptNumber: number;
  voidReason?: string;
}>;

export type ReadinessDecisionType =
  | "APPROVED"
  | "DEFERRED"
  | "OVERRIDE_APPROVED"
  | "OVERRIDE_DEFERRED";

export type ReadinessDecision = Readonly<{
  id: string;
  decision: ReadinessDecisionType;
  evaluationId: string;
  reasonCode: string;
  note: string;
  decidedBy: string;
  decidedAt: string;
  blockerSnapshot: readonly ReadinessBlocker[];
  secondApproval?: Readonly<{
    approvedBy: string;
    approvedAt: string;
  }>;
}>;

export type AssessmentOverridePolicy = Readonly<{
  overridesAllowed: boolean;
  secondApprovalRequired: boolean;
  safetyBlockersOverridable: boolean;
  maximumEvaluationAgeMinutes: number;
}>;

export type AssessmentGuardResult = Readonly<
  | { allowed: true; reasonIds: readonly string[] }
  | {
      allowed: false;
      reasonIds: readonly string[];
      message: string;
    }
>;

const ALLOWED_TRANSITIONS: Readonly<
  Record<AssessmentStatus, readonly AssessmentStatus[]>
> = Object.freeze({
  DRAFT: Object.freeze(["PLANNED", "VOIDED"] as const),
  PLANNED: Object.freeze(["IN_PROGRESS", "VOIDED"] as const),
  IN_PROGRESS: Object.freeze(["AWAITING_REVIEW", "VOIDED"] as const),
  AWAITING_REVIEW: Object.freeze([
    "COMPLETED",
    "IN_PROGRESS",
    "VOIDED",
  ] as const),
  COMPLETED: Object.freeze(["PUBLISHED", "VOIDED"] as const),
  PUBLISHED: Object.freeze([] as AssessmentStatus[]),
  VOIDED: Object.freeze([] as AssessmentStatus[]),
});

export function canTransitionAssessment(
  from: AssessmentStatus,
  to: AssessmentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionAssessment(
  record: AssessmentRecord,
  to: AssessmentStatus,
  patch: Partial<
    Pick<
      AssessmentRecord,
      | "scheduledAt"
      | "startedAt"
      | "completedAt"
      | "assessorId"
      | "result"
      | "criterionResults"
      | "feedback"
      | "publication"
      | "voidReason"
    >
  > = {},
): AssessmentRecord {
  assertTrainingMethodOperationAllowed(
    record.trainingMethod,
    "CREATE_ASSESSMENT",
  );
  if (!canTransitionAssessment(record.status, to)) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_TRANSITION_FORBIDDEN",
      `Assessment transition ${record.status} -> ${to} is not allowed.`,
    );
  }
  validateTransitionPayload(record, to, patch);
  return freeze({
    ...record,
    ...patch,
    status: to,
    criterionResults: patch.criterionResults ?? record.criterionResults,
  });
}

export function guardAssessmentPlanning(input: {
  record: AssessmentRecord;
  evaluation: ReadinessEvaluation;
  decision?: ReadinessDecision;
  overridePolicy: AssessmentOverridePolicy;
  plannedAt: string;
}): AssessmentGuardResult {
  const { record, evaluation, decision, overridePolicy } = input;
  assertTrainingMethodOperationAllowed(
    record.trainingMethod,
    "CREATE_ASSESSMENT",
  );

  const structuralReasons: string[] = [];
  if (evaluation.id !== record.readinessEvaluationId) {
    structuralReasons.push("ASSESSMENT_EVALUATION_MISMATCH");
  }
  if (evaluation.curriculumVersionId !== record.curriculumVersionId) {
    structuralReasons.push("ASSESSMENT_CURRICULUM_MISMATCH");
  }
  if (evaluation.policyId !== record.policyVersionId) {
    structuralReasons.push("ASSESSMENT_POLICY_MISMATCH");
  }
  if (!isEvaluationCurrent(evaluation, input.plannedAt, overridePolicy)) {
    structuralReasons.push("ASSESSMENT_EVALUATION_STALE");
  }
  if (evaluation.executionMode !== "ACTIVE") {
    structuralReasons.push("ASSESSMENT_EVALUATION_SHADOW_ONLY");
  }
  if (structuralReasons.length > 0) {
    return freeze({
      allowed: false,
      reasonIds: structuralReasons,
      message:
        "De toets kan niet worden gepland met een verouderde, shadow- of niet-passende readiness-evaluatie.",
    });
  }

  if (evaluation.status === "REVIEW_ELIGIBLE") {
    if (decision && decision.decision !== "APPROVED") {
      return freeze({
        allowed: false,
        reasonIds: ["ASSESSMENT_DECISION_NOT_APPROVED"],
        message: "De formele readinessbeslissing keurt planning niet goed.",
      });
    }
    return freeze({
      allowed: true,
      reasonIds: ["ASSESSMENT_READINESS_REVIEW_ELIGIBLE"],
    });
  }

  return guardOverride({
    evaluation,
    decision,
    policy: overridePolicy,
  });
}

export function guardOverride(input: {
  evaluation: ReadinessEvaluation;
  decision?: ReadinessDecision;
  policy: AssessmentOverridePolicy;
}): AssessmentGuardResult {
  const { evaluation, decision, policy } = input;
  if (!policy.overridesAllowed) {
    return freeze({
      allowed: false,
      reasonIds: ["ASSESSMENT_OVERRIDE_DISABLED"],
      message: "Het tenantbeleid staat readiness-overrides niet toe.",
    });
  }
  if (!decision || decision.decision !== "OVERRIDE_APPROVED") {
    return freeze({
      allowed: false,
      reasonIds: ["ASSESSMENT_OVERRIDE_REQUIRED"],
      message: "Een expliciet goedgekeurde override is vereist.",
    });
  }
  if (
    !decision.reasonCode.trim() ||
    !decision.note.trim() ||
    !decision.decidedBy.trim() ||
    !Number.isFinite(Date.parse(decision.decidedAt))
  ) {
    return freeze({
      allowed: false,
      reasonIds: ["ASSESSMENT_OVERRIDE_AUDIT_INCOMPLETE"],
      message:
        "Reden, notitie, actor en tijd zijn verplicht voor een override.",
    });
  }
  if (decision.evaluationId !== evaluation.id) {
    return freeze({
      allowed: false,
      reasonIds: ["ASSESSMENT_OVERRIDE_EVALUATION_MISMATCH"],
      message: "De override verwijst niet naar de actuele readiness-evaluatie.",
    });
  }
  if (
    !sameBlockerSnapshot(decision.blockerSnapshot, evaluation.criticalBlockers)
  ) {
    return freeze({
      allowed: false,
      reasonIds: ["ASSESSMENT_OVERRIDE_BLOCKER_SNAPSHOT_MISMATCH"],
      message: "De override bevat niet de volledige actuele blockersnapshot.",
    });
  }
  const safetyBlockers = evaluation.criticalBlockers.filter(
    (blocker) => blocker.safetyRelated,
  );
  if (
    safetyBlockers.length > 0 &&
    (!policy.safetyBlockersOverridable ||
      safetyBlockers.some((blocker) => !blocker.overridableByDefault))
  ) {
    return freeze({
      allowed: false,
      reasonIds: safetyBlockers.map((blocker) => blocker.id),
      message: "Een open veiligheidsblocker mag niet worden overruled.",
    });
  }
  if (policy.secondApprovalRequired) {
    if (
      !decision.secondApproval ||
      !decision.secondApproval.approvedBy.trim() ||
      decision.secondApproval.approvedBy === decision.decidedBy ||
      !Number.isFinite(Date.parse(decision.secondApproval.approvedAt))
    ) {
      return freeze({
        allowed: false,
        reasonIds: ["ASSESSMENT_OVERRIDE_SECOND_APPROVAL_REQUIRED"],
        message: "Deze override vereist goedkeuring door een tweede actor.",
      });
    }
  }
  return freeze({
    allowed: true,
    reasonIds: ["ASSESSMENT_OVERRIDE_AUDITED"],
  });
}

/**
 * Creates a new immutable attempt. Historical records are never reset or
 * overwritten when a learner takes a retest.
 */
export function createAssessmentRetest(
  previous: AssessmentRecord,
  input: {
    id: string;
    assessmentDefinitionId: string;
    assessmentDefinitionVersion: string;
    curriculumVersionId: string;
    policyVersionId: string;
    readinessEvaluationId: string;
    scheduledAt?: string;
  },
): AssessmentRecord {
  assertTrainingMethodOperationAllowed(
    previous.trainingMethod,
    "CREATE_ASSESSMENT",
  );
  if (
    previous.status !== "PUBLISHED" &&
    previous.status !== "VOIDED" &&
    previous.status !== "COMPLETED"
  ) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_RETEST_PREVIOUS_OPEN",
      "A retest can only follow a closed assessment attempt.",
    );
  }
  if (!input.id.trim() || input.id === previous.id) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_RETEST_ID_INVALID",
      "A retest requires a new stable record id.",
    );
  }
  return freeze({
    id: input.id,
    tenantId: previous.tenantId,
    enrollmentId: previous.enrollmentId,
    trainingMethod: previous.trainingMethod,
    assessmentDefinitionId: input.assessmentDefinitionId,
    assessmentDefinitionVersion: input.assessmentDefinitionVersion,
    assessmentType: previous.assessmentType,
    curriculumVersionId: input.curriculumVersionId,
    policyVersionId: input.policyVersionId,
    readinessEvaluationId: input.readinessEvaluationId,
    status: input.scheduledAt ? "PLANNED" : "DRAFT",
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    criterionResults: [],
    previousAttemptId: previous.id,
    attemptNumber: previous.attemptNumber + 1,
  });
}

export function learnerCanViewAssessment(record: AssessmentRecord): boolean {
  return record.status === "PUBLISHED";
}

function validateTransitionPayload(
  record: AssessmentRecord,
  to: AssessmentStatus,
  patch: Partial<AssessmentRecord>,
): void {
  if (to === "PLANNED" && !(patch.scheduledAt ?? record.scheduledAt)) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_SCHEDULE_REQUIRED",
      "A planned assessment requires scheduledAt.",
    );
  }
  if (to === "IN_PROGRESS" && !(patch.startedAt ?? record.startedAt)) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_START_REQUIRED",
      "An in-progress assessment requires startedAt.",
    );
  }
  if (
    (to === "COMPLETED" || to === "PUBLISHED") &&
    (!(patch.completedAt ?? record.completedAt) ||
      !(patch.result ?? record.result) ||
      !(patch.assessorId ?? record.assessorId))
  ) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_COMPLETION_INCOMPLETE",
      "A completed assessment requires completedAt, result and assessor.",
    );
  }
  if (to === "PUBLISHED" && !(patch.publication ?? record.publication)) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_PUBLICATION_METADATA_REQUIRED",
      "A published assessment requires immutable publication metadata.",
    );
  }
  if (to === "VOIDED" && !(patch.voidReason ?? record.voidReason)?.trim()) {
    throw new AssessmentLifecycleError(
      "ASSESSMENT_VOID_REASON_REQUIRED",
      "Voiding an assessment requires a reason.",
    );
  }
}

function isEvaluationCurrent(
  evaluation: ReadinessEvaluation,
  plannedAt: string,
  policy: AssessmentOverridePolicy,
): boolean {
  const evaluationTime = Date.parse(evaluation.evaluatedAt);
  const planningTime = Date.parse(plannedAt);
  return (
    Number.isFinite(evaluationTime) &&
    Number.isFinite(planningTime) &&
    planningTime >= evaluationTime &&
    planningTime - evaluationTime <= policy.maximumEvaluationAgeMinutes * 60_000
  );
}

function sameBlockerSnapshot(
  snapshot: readonly ReadinessBlocker[],
  actual: readonly ReadinessBlocker[],
): boolean {
  const normalize = (items: readonly ReadinessBlocker[]) =>
    items
      .map((item) => ({
        id: item.id,
        reasonId: item.reasonId,
        code: item.code,
        competencyId: item.competencyId ?? null,
        evidenceIds: [...item.evidenceIds].sort(),
        safetyRelated: item.safetyRelated,
        overridableByDefault: item.overridableByDefault,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  return (
    JSON.stringify(normalize(snapshot)) === JSON.stringify(normalize(actual))
  );
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freeze(nested);
    }
  }
  return value;
}

export class AssessmentLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AssessmentLifecycleError";
  }
}
