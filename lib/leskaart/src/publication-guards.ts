import type {
  AssessmentType,
  ExpertValidationStatus,
  ReadinessPolicy,
} from "./readiness-types";
import type { TrainingMethod } from "./training-methods";

export type PublicationGuardReasonCode =
  | "LEGACY_PUBLICATION_FORBIDDEN"
  | "CATALOG_AUDIT_INCOMPLETE"
  | "CATALOG_CONTENT_INCOMPLETE"
  | "CATALOG_STATUS_INVALID"
  | "CATALOG_ALREADY_ACTIVE"
  | "EXPERT_VALIDATION_MISSING"
  | "EXPERT_VALIDATION_HASH_MISMATCH"
  | "READINESS_POLICY_INCOMPLETE"
  | "CRITICAL_RULE_COMPENSABLE"
  | "ASSESSMENT_CONFIGURATION_INVALID"
  | "ACTOR_UNAUTHORIZED"
  | "LESSON_OBSERVATIONS_INCOMPLETE"
  | "LESSON_REFLECTION_MISSING";

export type PublicationGuardReason = Readonly<{
  id: string;
  code: PublicationGuardReasonCode;
  message: string;
  field?: string;
}>;

export type PublicationGuardResult = Readonly<{
  allowed: boolean;
  reasons: readonly PublicationGuardReason[];
}>;

export type CurriculumPublicationCandidate = Readonly<{
  id: string;
  trainingMethod: TrainingMethod;
  status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
  version: string;
  contentHash: string;
  createdBy?: string;
  reviewedBy?: string;
  changeNote?: string;
  moduleNumbers: readonly number[];
  scriptIds: readonly string[];
  scriptCodes: readonly string[];
  activePublishedVersionIds: readonly string[];
  expertValidation: Readonly<{
    required: boolean;
    status: ExpertValidationStatus;
    validationRecordId?: string;
    validatedContentHash?: string;
  }>;
  readinessPolicyPublicationReady: boolean;
  assessmentDefinitions: readonly Readonly<{
    type: AssessmentType;
    version: string;
    status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
    criterionCount: number;
  }>[];
}>;

export function guardCurriculumPublication(
  candidate: CurriculumPublicationCandidate,
): PublicationGuardResult {
  const reasons: PublicationGuardReason[] = [];
  const add = (
    code: PublicationGuardReasonCode,
    message: string,
    field?: string,
  ) => {
    reasons.push(
      Object.freeze({
        id: `${code}:${field ?? "global"}`,
        code,
        message,
        ...(field ? { field } : {}),
      }),
    );
  };

  if (candidate.trainingMethod === "RIS_1_0_LEGACY") {
    add(
      "LEGACY_PUBLICATION_FORBIDDEN",
      "RIS 1.0 is immutable history and cannot publish a new curriculum.",
    );
  }
  if (
    candidate.status !== "DRAFT" &&
    candidate.status !== "AWAITING_EXPERT_VALIDATION"
  ) {
    add(
      "CATALOG_STATUS_INVALID",
      `Curriculum status ${candidate.status} cannot transition to published.`,
      "status",
    );
  }
  if (
    !candidate.createdBy?.trim() ||
    !candidate.reviewedBy?.trim() ||
    !candidate.changeNote?.trim() ||
    !candidate.version.trim() ||
    !candidate.contentHash.trim()
  ) {
    add(
      "CATALOG_AUDIT_INCOMPLETE",
      "Creator, reviewer, change note, version and content hash are required.",
      "audit",
    );
  }
  if (candidate.activePublishedVersionIds.some((id) => id !== candidate.id)) {
    add(
      "CATALOG_ALREADY_ACTIVE",
      "Another active published curriculum exists for this training method.",
      "activePublishedVersionIds",
    );
  }
  if (candidate.trainingMethod === "RIS_2_0") {
    const modules = [...new Set(candidate.moduleNumbers)].sort();
    const scriptIds = new Set(candidate.scriptIds);
    const scriptCodes = new Set(candidate.scriptCodes);
    if (
      modules.join(",") !== "1,2,3,4" ||
      scriptIds.size !== 46 ||
      scriptCodes.size !== 46 ||
      candidate.scriptIds.length !== 46 ||
      candidate.scriptCodes.length !== 46
    ) {
      add(
        "CATALOG_CONTENT_INCOMPLETE",
        "RIS 2.0 publication requires exactly modules 1–4 and 46 unique versioned scripts.",
        "catalog",
      );
    }
  } else if (candidate.trainingMethod === "STANDARD") {
    if (candidate.scriptIds.length === 0) {
      add(
        "CATALOG_CONTENT_INCOMPLETE",
        "A STANDARD curriculum needs at least one versioned competency.",
        "catalog",
      );
    }
  }
  if (candidate.expertValidation.required) {
    if (
      candidate.expertValidation.status !== "APPROVED" ||
      !candidate.expertValidation.validationRecordId
    ) {
      add(
        "EXPERT_VALIDATION_MISSING",
        "A real approved expert validation record is required.",
        "expertValidation",
      );
    } else if (
      candidate.expertValidation.validatedContentHash !== candidate.contentHash
    ) {
      add(
        "EXPERT_VALIDATION_HASH_MISMATCH",
        "Expert validation does not cover the current content hash.",
        "contentHash",
      );
    }
  }
  if (!candidate.readinessPolicyPublicationReady) {
    add(
      "READINESS_POLICY_INCOMPLETE",
      "The linked readiness policy has not passed its own publication guard.",
      "readinessPolicy",
    );
  }
  const requiredAssessments: AssessmentType[] =
    candidate.trainingMethod === "RIS_2_0"
      ? ["RIS_MODULE_1", "RIS_MODULE_2"]
      : candidate.trainingMethod === "STANDARD"
        ? ["STANDARD_PROGRESS_ASSESSMENT"]
        : [];
  for (const required of requiredAssessments) {
    const matching = candidate.assessmentDefinitions.filter(
      (definition) =>
        definition.type === required &&
        definition.status === "PUBLISHED" &&
        definition.version.trim() &&
        definition.criterionCount > 0,
    );
    if (matching.length !== 1) {
      add(
        "ASSESSMENT_CONFIGURATION_INVALID",
        `Exactly one published, versioned ${required} definition with criteria is required.`,
        required,
      );
    }
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export function guardReadinessPolicyPublication(
  policy: ReadinessPolicy,
): PublicationGuardResult {
  const reasons: PublicationGuardReason[] = [];
  const add = (
    code: PublicationGuardReasonCode,
    message: string,
    field?: string,
  ) =>
    reasons.push(
      Object.freeze({
        id: `${code}:${field ?? "global"}`,
        code,
        message,
        ...(field ? { field } : {}),
      }),
    );

  if (
    !policy.id.trim() ||
    !policy.version.trim() ||
    !policy.curriculumVersionId.trim() ||
    !policy.engineVersion.trim() ||
    policy.competencyRules.length === 0
  ) {
    add(
      "READINESS_POLICY_INCOMPLETE",
      "Policy identity, version, curriculum, engine and competency rules are required.",
    );
  }
  const competencyIds = new Set<string>();
  for (const rule of policy.competencyRules) {
    if (competencyIds.has(rule.competencyId)) {
      add(
        "READINESS_POLICY_INCOMPLETE",
        `Competency ${rule.competencyId} occurs more than once.`,
        rule.competencyId,
      );
    }
    competencyIds.add(rule.competencyId);
    if (
      rule.minimumEvidenceCount < 1 ||
      rule.minimumContextCount < 0 ||
      rule.stabilityWindow < 1 ||
      rule.minimumStableObservations < 1 ||
      rule.minimumStableObservations > rule.stabilityWindow
    ) {
      add(
        "READINESS_POLICY_INCOMPLETE",
        `Competency rule ${rule.competencyId} has invalid coverage or stability constraints.`,
        rule.competencyId,
      );
    }
    if (rule.critical && rule.compensable) {
      add(
        "CRITICAL_RULE_COMPENSABLE",
        `Critical competency ${rule.competencyId} may not be compensable.`,
        rule.competencyId,
      );
    }
  }
  if (policy.expertValidation.required) {
    if (
      policy.expertValidation.status !== "APPROVED" ||
      !policy.expertValidation.validationRecordId
    ) {
      add(
        "EXPERT_VALIDATION_MISSING",
        "Policy publication requires a real approved expert validation record.",
        "expertValidation",
      );
    } else if (
      policy.expertValidation.validatedContentHash !==
      policy.expertValidation.currentContentHash
    ) {
      add(
        "EXPERT_VALIDATION_HASH_MISMATCH",
        "Expert validation covers a different policy content hash.",
        "contentHash",
      );
    }
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export type RisLessonPublicationCandidate = Readonly<{
  trainingMethod: TrainingMethod;
  actorAuthorized: boolean;
  curriculumStatus:
    | "DRAFT"
    | "AWAITING_EXPERT_VALIDATION"
    | "PUBLISHED"
    | "RETIRED";
  policyStatus:
    | "DRAFT"
    | "AWAITING_EXPERT_VALIDATION"
    | "PUBLISHED"
    | "RETIRED";
  expertValidationStatus: ExpertValidationStatus;
  conceptObservations: readonly Readonly<{
    evidenceId: string;
    instructionStage: null | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    performanceOutcome:
      | "NOT_OBSERVED"
      | "ATTENTION_REQUIRED"
      | "DEVELOPING"
      | "SUFFICIENT"
      | "STABLE";
    safetyStatus: "NOT_ASSESSED" | "NO_BLOCKER" | "ATTENTION" | "BLOCKER";
  }>[];
  reflectionPresent: boolean;
}>;

export function guardRisLessonPublication(
  candidate: RisLessonPublicationCandidate,
): PublicationGuardResult {
  const reasons: PublicationGuardReason[] = [];
  const add = (code: PublicationGuardReasonCode, message: string) =>
    reasons.push(Object.freeze({ id: `${code}:lesson`, code, message }));

  if (candidate.trainingMethod !== "RIS_2_0") {
    add(
      "LEGACY_PUBLICATION_FORBIDDEN",
      "Only an active RIS 2.0 enrollment can publish a new RIS lesson card.",
    );
  }
  if (!candidate.actorAuthorized) {
    add("ACTOR_UNAUTHORIZED", "The actor may not publish this lesson card.");
  }
  if (
    candidate.curriculumStatus !== "PUBLISHED" ||
    candidate.policyStatus !== "PUBLISHED"
  ) {
    add(
      "READINESS_POLICY_INCOMPLETE",
      "The curriculum and readiness policy must both be published.",
    );
  }
  if (candidate.expertValidationStatus !== "APPROVED") {
    add(
      "EXPERT_VALIDATION_MISSING",
      "RIS content cannot be published without real expert approval.",
    );
  }
  if (
    candidate.conceptObservations.length === 0 ||
    candidate.conceptObservations.some(
      (item) =>
        !item.evidenceId.trim() ||
        (item.instructionStage === null &&
          item.performanceOutcome === "NOT_OBSERVED") ||
        !item.safetyStatus,
    )
  ) {
    add(
      "LESSON_OBSERVATIONS_INCOMPLETE",
      "At least one normalized concept observation with separate stage, performance and safety is required.",
    );
  }
  if (!candidate.reflectionPresent) {
    add(
      "LESSON_REFLECTION_MISSING",
      "A guided reflection is required before publication.",
    );
  }
  return Object.freeze({
    allowed: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export function assertPublishedDefinitionImmutable(
  before: unknown,
  after: unknown,
  status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED",
): void {
  if (
    status === "PUBLISHED" &&
    stableStringify(before) !== stableStringify(after)
  ) {
    throw new Error(
      "Published curricula, policies and assessment definitions are immutable; create a new version.",
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
