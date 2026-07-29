import type { TrainingMethod } from "./training-methods";

export const READINESS_ENGINE_VERSION = "2.0.0";

export type EvidenceSourceType =
  | "STANDARD_LESSON"
  | "RIS_SCRIPT"
  | "MODULE_TEST"
  | "CBR_RESULT"
  | "LEGACY_IMPORT";

export type CompetenceBand =
  | "UNKNOWN"
  | "ATTENTION_REQUIRED"
  | "DEVELOPING"
  | "SUFFICIENT"
  | "STABLE";

export type IndependenceBand =
  | "UNKNOWN"
  | "INSTRUCTED"
  | "SUPPORTED"
  | "COACHED"
  | "INDEPENDENT"
  | "TRANSFERABLE";

export type EvidenceSafetyStatus =
  | "UNKNOWN"
  | "CLEAR"
  | "ATTENTION"
  | "BLOCKER";

export type NormalizedCompetencyEvidence = Readonly<{
  competencyId: string;
  observedAt: string;
  sourceType: EvidenceSourceType;
  observed: boolean;
  competenceBand: CompetenceBand;
  independenceBand: IndependenceBand;
  safetyStatus: EvidenceSafetyStatus;
  contextTags: readonly string[];
  instructorId?: string;
  lessonId?: string;
  assessmentId?: string;
  sourceEvidenceId: string;
  legacyConfidence?: "LOW" | "MEDIUM" | "HIGH";
}>;

export interface ReadinessEvidenceAdapter<TSource> {
  readonly method: TrainingMethod;
  normalize(input: TSource): NormalizedCompetencyEvidence[];
}

export type ReadinessStatus =
  | "CONFIGURATION_INCOMPLETE"
  | "INSUFFICIENT_EVIDENCE"
  | "BLOCKED"
  | "DEVELOPING"
  | "NEARLY_REVIEWABLE"
  | "REVIEW_ELIGIBLE";

export type ReadinessExecutionMode = "SHADOW" | "ACTIVE";

export type ReadinessPolicyStatus =
  | "DRAFT"
  | "AWAITING_EXPERT_VALIDATION"
  | "PUBLISHED"
  | "RETIRED";

export type ExpertValidationStatus =
  | "NOT_REQUESTED"
  | "AWAITING_EXPERT_VALIDATION"
  | "IN_REVIEW"
  | "CHANGES_REQUIRED"
  | "APPROVED";

export type ReadinessCompetencyRule = Readonly<{
  competencyId: string;
  critical: boolean;
  requiredCompetenceBand: Exclude<CompetenceBand, "UNKNOWN">;
  requiredIndependenceBand: Exclude<IndependenceBand, "UNKNOWN">;
  minimumEvidenceCount: number;
  minimumContextCount: number;
  maximumEvidenceAgeDays?: number;
  stabilityWindow: number;
  minimumStableObservations: number;
  requireSafetyClear: boolean;
  /** Must always be false for critical rules. Kept explicit for publication validation. */
  compensable: boolean;
}>;

export type ReadinessPrerequisiteRule = Readonly<{
  id: string;
  label: string;
  required: boolean;
  blockReview: boolean;
}>;

export type AssessmentType =
  | "RIS_MODULE_1"
  | "RIS_MODULE_2"
  | "RIS_CBR_TEST"
  | "RIS_CBR_EXAM"
  | "INTERNAL_MOCK_EXAM"
  | "STANDARD_PROGRESS_ASSESSMENT";

export type ReadinessAssessmentRule = Readonly<{
  assessmentType: AssessmentType;
  required: boolean;
  requiredResult: "PASSED" | "NOT_PASSED" | "NO_DECISION";
  blockReview: boolean;
}>;

export type ReadinessPolicy = Readonly<{
  id: string;
  version: string;
  curriculumVersionId: string;
  engineVersion: string;
  status: ReadinessPolicyStatus;
  competencyRules: readonly ReadinessCompetencyRule[];
  prerequisiteRules: readonly ReadinessPrerequisiteRule[];
  assessmentRules: readonly ReadinessAssessmentRule[];
  expertValidation: Readonly<{
    required: boolean;
    status: ExpertValidationStatus;
    validationRecordId?: string;
    validatedContentHash?: string;
    currentContentHash: string;
  }>;
}>;

export type ReadinessPrerequisiteValue = Readonly<{
  prerequisiteId: string;
  met: boolean;
  sourceEvidenceIds: readonly string[];
}>;

export type ReadinessAssessmentValue = Readonly<{
  assessmentId: string;
  assessmentType: AssessmentType;
  status:
    | "DRAFT"
    | "PLANNED"
    | "IN_PROGRESS"
    | "AWAITING_REVIEW"
    | "COMPLETED"
    | "PUBLISHED"
    | "VOIDED";
  result: "PASSED" | "NOT_PASSED" | "NO_DECISION";
  completedAt?: string;
  publishedAt?: string;
  sourceEvidenceIds: readonly string[];
}>;

export type ReadinessReasonDimension =
  | "CONFIGURATION"
  | "INDEPENDENCE"
  | "MASTERY"
  | "COVERAGE"
  | "CRITICAL_BLOCKER"
  | "PREREQUISITE"
  | "STABILITY"
  | "REGRESSION"
  | "ASSESSMENT"
  | "EXPERT_VALIDATION";

export type ReadinessReasonCode =
  | "POLICY_NOT_PUBLISHED"
  | "POLICY_ENGINE_VERSION_MISMATCH"
  | "POLICY_HAS_NO_COMPETENCIES"
  | "POLICY_DUPLICATE_COMPETENCY"
  | "POLICY_RULE_INVALID"
  | "EXPERT_VALIDATION_REQUIRED"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_TOO_OLD"
  | "CONTEXT_COVERAGE_INSUFFICIENT"
  | "COMPETENCE_BELOW_POLICY"
  | "INDEPENDENCE_BELOW_POLICY"
  | "CRITICAL_EVIDENCE_MISSING"
  | "CRITICAL_COMPETENCE_BELOW_POLICY"
  | "CRITICAL_INDEPENDENCE_BELOW_POLICY"
  | "CRITICAL_SAFETY_NOT_CLEARED"
  | "SAFETY_BLOCKER_OPEN"
  | "PREREQUISITE_NOT_MET"
  | "STABILITY_INSUFFICIENT"
  | "REGRESSION_DETECTED"
  | "ASSESSMENT_NOT_PUBLISHED"
  | "ASSESSMENT_RESULT_NOT_MET"
  | "REVIEW_ELIGIBLE";

export type ReadinessReason = Readonly<{
  id: string;
  code: ReadinessReasonCode;
  dimension: ReadinessReasonDimension;
  severity: "INFO" | "WARNING" | "BLOCKER";
  message: string;
  competencyId?: string;
  prerequisiteId?: string;
  assessmentType?: AssessmentType;
  evidenceIds: readonly string[];
}>;

export type ReadinessBlocker = Readonly<{
  id: string;
  reasonId: string;
  code: Extract<
    ReadinessReasonCode,
    | "CRITICAL_EVIDENCE_MISSING"
    | "CRITICAL_COMPETENCE_BELOW_POLICY"
    | "CRITICAL_INDEPENDENCE_BELOW_POLICY"
    | "CRITICAL_SAFETY_NOT_CLEARED"
    | "SAFETY_BLOCKER_OPEN"
    | "PREREQUISITE_NOT_MET"
    | "ASSESSMENT_NOT_PUBLISHED"
    | "ASSESSMENT_RESULT_NOT_MET"
  >;
  competencyId?: string;
  evidenceIds: readonly string[];
  safetyRelated: boolean;
  overridableByDefault: boolean;
}>;

export type CompetencyReadiness = Readonly<{
  competencyId: string;
  critical: boolean;
  observedEvidenceCount: number;
  observedContextTags: readonly string[];
  latestCompetenceBand: CompetenceBand;
  latestIndependenceBand: IndependenceBand;
  latestSafetyStatus: EvidenceSafetyStatus;
  coverageMet: boolean;
  contextCoverageMet: boolean;
  evidenceCurrent: boolean;
  masteryMet: boolean;
  independenceMet: boolean;
  stabilityMet: boolean;
  regressionDetected: boolean;
  evidenceIds: readonly string[];
  reasonIds: readonly string[];
}>;

export type ReadinessInputSnapshot = Readonly<{
  id: string;
  schemaVersion: "readiness-input.v1";
  evaluatedAt: string;
  tenantId: string;
  enrollmentId: string;
  trainingMethod: TrainingMethod;
  curriculumVersionId: string;
  policyId: string;
  policyVersion: string;
  evidence: readonly NormalizedCompetencyEvidence[];
  prerequisites: readonly ReadinessPrerequisiteValue[];
  assessments: readonly ReadinessAssessmentValue[];
}>;

export type ReadinessResultSnapshot = Readonly<{
  id: string;
  schemaVersion: "readiness-result.v1";
  inputSnapshotId: string;
  engineVersion: string;
  status: ReadinessStatus;
  executionMode: ReadinessExecutionMode;
  reasonIds: readonly string[];
  blockerIds: readonly string[];
}>;

export type ReadinessEvaluation = Readonly<{
  id: string;
  evaluatedAt: string;
  status: ReadinessStatus;
  executionMode: ReadinessExecutionMode;
  productionClaimAllowed: boolean;
  trainingMethod: TrainingMethod;
  curriculumVersionId: string;
  policyId: string;
  policyVersion: string;
  engineVersion: string;
  competencies: readonly CompetencyReadiness[];
  coverage: Readonly<{
    requiredCompetencyCount: number;
    coveredCompetencyCount: number;
    missingCompetencyIds: readonly string[];
    staleCompetencyIds: readonly string[];
    contextIncompleteCompetencyIds: readonly string[];
  }>;
  mastery: Readonly<{
    requiredCompetencyCount: number;
    masteredCompetencyCount: number;
    belowPolicyCompetencyIds: readonly string[];
  }>;
  stability: Readonly<{
    stableCompetencyCount: number;
    unstableCompetencyIds: readonly string[];
  }>;
  regression: Readonly<{
    detected: boolean;
    competencyIds: readonly string[];
  }>;
  prerequisites: Readonly<{
    metIds: readonly string[];
    unmetIds: readonly string[];
  }>;
  assessments: Readonly<{
    satisfiedTypes: readonly AssessmentType[];
    unsatisfiedTypes: readonly AssessmentType[];
  }>;
  criticalBlockers: readonly ReadinessBlocker[];
  reasons: readonly ReadinessReason[];
  evidenceIds: readonly string[];
  inputSnapshot: ReadinessInputSnapshot;
  resultSnapshot: ReadinessResultSnapshot;
}>;

export type EvaluateReadinessInput = Readonly<{
  evaluationId: string;
  tenantId: string;
  enrollmentId: string;
  trainingMethod: TrainingMethod;
  curriculumVersionId: string;
  evaluatedAt: string;
  requestedMode: ReadinessExecutionMode;
  policy: ReadinessPolicy;
  evidence: readonly NormalizedCompetencyEvidence[];
  prerequisites: readonly ReadinessPrerequisiteValue[];
  assessments: readonly ReadinessAssessmentValue[];
}>;
