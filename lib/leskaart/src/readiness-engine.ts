import {
  READINESS_ENGINE_VERSION,
  type CompetenceBand,
  type CompetencyReadiness,
  type EvaluateReadinessInput,
  type IndependenceBand,
  type NormalizedCompetencyEvidence,
  type ReadinessBlocker,
  type ReadinessEvaluation,
  type ReadinessReason,
  type ReadinessReasonCode,
  type ReadinessReasonDimension,
  type ReadinessStatus,
} from "./readiness-types";
import { assertTrainingMethodOperationAllowed } from "./training-methods";

const DAY_MS = 86_400_000;

const COMPETENCE_RANK: Readonly<Record<CompetenceBand, number>> = {
  UNKNOWN: 0,
  ATTENTION_REQUIRED: 1,
  DEVELOPING: 2,
  SUFFICIENT: 3,
  STABLE: 4,
};

const INDEPENDENCE_RANK: Readonly<Record<IndependenceBand, number>> = {
  UNKNOWN: 0,
  INSTRUCTED: 1,
  SUPPORTED: 2,
  COACHED: 3,
  INDEPENDENT: 4,
  TRANSFERABLE: 5,
};

type MutableCompetencyResult = Omit<CompetencyReadiness, "reasonIds"> & {
  reasonIds: string[];
};

type ReasonInput = {
  code: ReadinessReasonCode;
  dimension: ReadinessReasonDimension;
  severity: ReadinessReason["severity"];
  message: string;
  competencyId?: string;
  prerequisiteId?: string;
  assessmentType?: ReadinessReason["assessmentType"];
  evidenceIds?: readonly string[];
};

/**
 * Pure, deterministic readiness evaluation.
 *
 * The engine deliberately exposes no readiness percentage and performs no
 * averaging across competencies. Instruction/independence, mastery, coverage,
 * safety, prerequisites, stability, regression and assessments are evaluated
 * independently. A critical failure is therefore never compensated by a
 * stronger unrelated competency.
 */
export function evaluateReadiness(
  rawInput: EvaluateReadinessInput,
): ReadinessEvaluation {
  assertTrainingMethodOperationAllowed(
    rawInput.trainingMethod,
    "EVALUATE_READINESS",
  );

  const input = immutableClone(rawInput);
  const reasons: ReadinessReason[] = [];
  const blockers: ReadinessBlocker[] = [];
  const reasonIdCounts = new Map<string, number>();
  const addReason = (value: ReasonInput): ReadinessReason => {
    const discriminator =
      value.competencyId ??
      value.prerequisiteId ??
      value.assessmentType ??
      "global";
    const baseId = `${value.code}:${discriminator}`;
    const count = (reasonIdCounts.get(baseId) ?? 0) + 1;
    reasonIdCounts.set(baseId, count);
    const reason: ReadinessReason = deepFreeze({
      id: count === 1 ? baseId : `${baseId}:${count}`,
      code: value.code,
      dimension: value.dimension,
      severity: value.severity,
      message: value.message,
      ...(value.competencyId ? { competencyId: value.competencyId } : {}),
      ...(value.prerequisiteId ? { prerequisiteId: value.prerequisiteId } : {}),
      ...(value.assessmentType ? { assessmentType: value.assessmentType } : {}),
      evidenceIds: uniqueSorted(value.evidenceIds ?? []),
    });
    reasons.push(reason);
    return reason;
  };
  const addBlocker = (
    reason: ReadinessReason,
    options: {
      safetyRelated?: boolean;
      overridableByDefault?: boolean;
    } = {},
  ): void => {
    if (!isBlockerCode(reason.code)) {
      throw new Error(`Reason ${reason.code} cannot be promoted to a blocker.`);
    }
    blockers.push(
      deepFreeze({
        id: `blocker:${reason.id}`,
        reasonId: reason.id,
        code: reason.code,
        ...(reason.competencyId ? { competencyId: reason.competencyId } : {}),
        evidenceIds: reason.evidenceIds,
        safetyRelated: options.safetyRelated ?? false,
        overridableByDefault: options.overridableByDefault ?? true,
      }),
    );
  };

  const configurationReasonIds = validateConfiguration(input, addReason);
  const expertApproved =
    !input.policy.expertValidation.required ||
    (input.policy.expertValidation.status === "APPROVED" &&
      Boolean(input.policy.expertValidation.validationRecordId) &&
      input.policy.expertValidation.validatedContentHash ===
        input.policy.expertValidation.currentContentHash);
  if (!expertApproved) {
    addReason({
      code: "EXPERT_VALIDATION_REQUIRED",
      dimension: "EXPERT_VALIDATION",
      severity: "WARNING",
      message:
        "Deze policy is nog niet inhoudelijk goedgekeurd door een bevoegde deskundige; de evaluatie blijft shadow-only.",
    });
  }

  const executionMode: ReadinessEvaluation["executionMode"] =
    input.requestedMode === "ACTIVE" &&
    input.trainingMethod !== "RIS_1_0_LEGACY" &&
    input.policy.status === "PUBLISHED" &&
    expertApproved &&
    configurationReasonIds.length === 0
      ? "ACTIVE"
      : "SHADOW";

  const allEvidence = sortEvidence(input.evidence);
  const competencyResults: MutableCompetencyResult[] = [];

  for (const rule of [...input.policy.competencyRules].sort((left, right) =>
    left.competencyId.localeCompare(right.competencyId),
  )) {
    const matching = allEvidence.filter(
      (item) => item.competencyId === rule.competencyId,
    );
    const observed = matching.filter((item) => item.observed);
    const latest = observed.at(-1);
    const previous = observed.at(-2);
    const evidenceIds = uniqueSorted(
      matching.map((item) => item.sourceEvidenceId),
    );
    const contextTags = uniqueSorted(
      observed.flatMap((item) => item.contextTags),
    );
    const coverageMet = observed.length >= rule.minimumEvidenceCount;
    const contextCoverageMet = contextTags.length >= rule.minimumContextCount;
    const evidenceCurrent = isEvidenceCurrent(
      latest,
      rule.maximumEvidenceAgeDays,
      input.evaluatedAt,
    );
    const masteryMet =
      latest !== undefined &&
      COMPETENCE_RANK[latest.competenceBand] >=
        COMPETENCE_RANK[rule.requiredCompetenceBand];
    const independenceMet =
      latest !== undefined &&
      INDEPENDENCE_RANK[latest.independenceBand] >=
        INDEPENDENCE_RANK[rule.requiredIndependenceBand];
    const stabilitySlice = observed.slice(-Math.max(1, rule.stabilityWindow));
    const stableObservations = stabilitySlice.filter(
      (item) =>
        COMPETENCE_RANK[item.competenceBand] >=
          COMPETENCE_RANK[rule.requiredCompetenceBand] &&
        INDEPENDENCE_RANK[item.independenceBand] >=
          INDEPENDENCE_RANK[rule.requiredIndependenceBand] &&
        (!rule.requireSafetyClear || item.safetyStatus === "CLEAR"),
    );
    const stabilityMet =
      stableObservations.length >= rule.minimumStableObservations;
    const regressionDetected =
      latest !== undefined &&
      previous !== undefined &&
      (COMPETENCE_RANK[latest.competenceBand] <
        COMPETENCE_RANK[previous.competenceBand] ||
        INDEPENDENCE_RANK[latest.independenceBand] <
          INDEPENDENCE_RANK[previous.independenceBand]);
    const competencyReasonIds: string[] = [];

    if (!coverageMet) {
      const reason = addReason({
        code: rule.critical ? "CRITICAL_EVIDENCE_MISSING" : "EVIDENCE_MISSING",
        dimension: rule.critical ? "CRITICAL_BLOCKER" : "COVERAGE",
        severity: rule.critical ? "BLOCKER" : "WARNING",
        message: `Voor competentie ${rule.competencyId} zijn ${observed.length}/${rule.minimumEvidenceCount} vereiste observaties beschikbaar.`,
        competencyId: rule.competencyId,
        evidenceIds,
      });
      competencyReasonIds.push(reason.id);
      if (rule.critical) addBlocker(reason);
    }
    if (!evidenceCurrent && latest) {
      const reason = addReason({
        code: "EVIDENCE_TOO_OLD",
        dimension: "COVERAGE",
        severity: "WARNING",
        message: `Het laatste bewijs voor ${rule.competencyId} is niet actueel genoeg voor deze policy.`,
        competencyId: rule.competencyId,
        evidenceIds: [latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
    }
    if (!contextCoverageMet) {
      const reason = addReason({
        code: "CONTEXT_COVERAGE_INSUFFICIENT",
        dimension: "COVERAGE",
        severity: "WARNING",
        message: `Competentie ${rule.competencyId} is in ${contextTags.length}/${rule.minimumContextCount} vereiste contexten geobserveerd.`,
        competencyId: rule.competencyId,
        evidenceIds,
      });
      competencyReasonIds.push(reason.id);
    }
    if (latest && !masteryMet) {
      const reason = addReason({
        code: rule.critical
          ? "CRITICAL_COMPETENCE_BELOW_POLICY"
          : "COMPETENCE_BELOW_POLICY",
        dimension: rule.critical ? "CRITICAL_BLOCKER" : "MASTERY",
        severity: rule.critical ? "BLOCKER" : "WARNING",
        message: `Beheersing van ${rule.competencyId} is ${latest.competenceBand}; vereist is ${rule.requiredCompetenceBand}.`,
        competencyId: rule.competencyId,
        evidenceIds: [latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
      if (rule.critical) addBlocker(reason);
    }
    if (latest && !independenceMet) {
      const reason = addReason({
        code: rule.critical
          ? "CRITICAL_INDEPENDENCE_BELOW_POLICY"
          : "INDEPENDENCE_BELOW_POLICY",
        dimension: rule.critical ? "CRITICAL_BLOCKER" : "INDEPENDENCE",
        severity: rule.critical ? "BLOCKER" : "WARNING",
        message: `Zelfstandigheid van ${rule.competencyId} is ${latest.independenceBand}; vereist is ${rule.requiredIndependenceBand}.`,
        competencyId: rule.competencyId,
        evidenceIds: [latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
      if (rule.critical) addBlocker(reason);
    }
    if (
      latest &&
      rule.requireSafetyClear &&
      latest.safetyStatus !== "CLEAR" &&
      latest.safetyStatus !== "BLOCKER"
    ) {
      const reason = addReason({
        code: "CRITICAL_SAFETY_NOT_CLEARED",
        dimension: "CRITICAL_BLOCKER",
        severity: "BLOCKER",
        message: `De veiligheid voor ${rule.competencyId} is niet expliciet vrijgegeven.`,
        competencyId: rule.competencyId,
        evidenceIds: [latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
      addBlocker(reason, {
        safetyRelated: true,
        overridableByDefault: false,
      });
    }
    if (latest?.safetyStatus === "BLOCKER") {
      const reason = addReason({
        code: "SAFETY_BLOCKER_OPEN",
        dimension: "CRITICAL_BLOCKER",
        severity: "BLOCKER",
        message: `Er staat een open veiligheidsblocker op ${rule.competencyId}.`,
        competencyId: rule.competencyId,
        evidenceIds: [latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
      addBlocker(reason, {
        safetyRelated: true,
        overridableByDefault: false,
      });
    }
    if (!stabilityMet) {
      const reason = addReason({
        code: "STABILITY_INSUFFICIENT",
        dimension: "STABILITY",
        severity: "WARNING",
        message: `Competentie ${rule.competencyId} heeft ${stableObservations.length}/${rule.minimumStableObservations} stabiele observaties.`,
        competencyId: rule.competencyId,
        evidenceIds: stabilitySlice.map((item) => item.sourceEvidenceId),
      });
      competencyReasonIds.push(reason.id);
    }
    if (regressionDetected && latest && previous) {
      const reason = addReason({
        code: "REGRESSION_DETECTED",
        dimension: "REGRESSION",
        severity: "WARNING",
        message: `De meest recente observatie van ${rule.competencyId} laat regressie zien.`,
        competencyId: rule.competencyId,
        evidenceIds: [previous.sourceEvidenceId, latest.sourceEvidenceId],
      });
      competencyReasonIds.push(reason.id);
    }

    competencyResults.push({
      competencyId: rule.competencyId,
      critical: rule.critical,
      observedEvidenceCount: observed.length,
      observedContextTags: contextTags,
      latestCompetenceBand: latest?.competenceBand ?? "UNKNOWN",
      latestIndependenceBand: latest?.independenceBand ?? "UNKNOWN",
      latestSafetyStatus: latest?.safetyStatus ?? "UNKNOWN",
      coverageMet,
      contextCoverageMet,
      evidenceCurrent,
      masteryMet,
      independenceMet,
      stabilityMet,
      regressionDetected,
      evidenceIds,
      reasonIds: competencyReasonIds,
    });
  }

  const metPrerequisites: string[] = [];
  const unmetPrerequisites: string[] = [];
  for (const rule of input.policy.prerequisiteRules) {
    if (!rule.required) continue;
    const value = input.prerequisites.find(
      (item) => item.prerequisiteId === rule.id,
    );
    if (value?.met) {
      metPrerequisites.push(rule.id);
      continue;
    }
    unmetPrerequisites.push(rule.id);
    const reason = addReason({
      code: "PREREQUISITE_NOT_MET",
      dimension: "PREREQUISITE",
      severity: rule.blockReview ? "BLOCKER" : "WARNING",
      message: `Randvoorwaarde "${rule.label}" is niet voldaan.`,
      prerequisiteId: rule.id,
      evidenceIds: value?.sourceEvidenceIds ?? [],
    });
    if (rule.blockReview) addBlocker(reason);
  }

  const satisfiedAssessments: ReadinessEvaluation["assessments"]["satisfiedTypes"][number][] =
    [];
  const unsatisfiedAssessments: ReadinessEvaluation["assessments"]["unsatisfiedTypes"][number][] =
    [];
  for (const rule of input.policy.assessmentRules) {
    if (!rule.required) continue;
    const matching = [...input.assessments]
      .filter((item) => item.assessmentType === rule.assessmentType)
      .sort((left, right) =>
        (left.publishedAt ?? left.completedAt ?? "").localeCompare(
          right.publishedAt ?? right.completedAt ?? "",
        ),
      );
    const latest = matching.at(-1);
    if (
      latest?.status === "PUBLISHED" &&
      latest.result === rule.requiredResult
    ) {
      satisfiedAssessments.push(rule.assessmentType);
      continue;
    }
    unsatisfiedAssessments.push(rule.assessmentType);
    const code =
      latest?.status === "PUBLISHED"
        ? "ASSESSMENT_RESULT_NOT_MET"
        : "ASSESSMENT_NOT_PUBLISHED";
    const reason = addReason({
      code,
      dimension: "ASSESSMENT",
      severity: rule.blockReview ? "BLOCKER" : "WARNING",
      message:
        code === "ASSESSMENT_NOT_PUBLISHED"
          ? `Vereiste toets ${rule.assessmentType} is niet gepubliceerd.`
          : `Vereiste toets ${rule.assessmentType} heeft niet het vereiste resultaat.`,
      assessmentType: rule.assessmentType,
      evidenceIds: latest?.sourceEvidenceIds ?? [],
    });
    if (rule.blockReview) addBlocker(reason);
  }

  const missingCompetencyIds = competencyResults
    .filter((item) => !item.coverageMet)
    .map((item) => item.competencyId);
  const staleCompetencyIds = competencyResults
    .filter((item) => !item.evidenceCurrent)
    .map((item) => item.competencyId);
  const contextIncompleteCompetencyIds = competencyResults
    .filter((item) => !item.contextCoverageMet)
    .map((item) => item.competencyId);
  const belowPolicyCompetencyIds = competencyResults
    .filter((item) => !item.masteryMet || !item.independenceMet)
    .map((item) => item.competencyId);
  const unstableCompetencyIds = competencyResults
    .filter((item) => !item.stabilityMet)
    .map((item) => item.competencyId);
  const regressionCompetencyIds = competencyResults
    .filter((item) => item.regressionDetected)
    .map((item) => item.competencyId);

  let status: ReadinessStatus;
  if (configurationReasonIds.length > 0) {
    status = "CONFIGURATION_INCOMPLETE";
  } else if (blockers.length > 0) {
    status = "BLOCKED";
  } else if (
    missingCompetencyIds.length > 0 ||
    staleCompetencyIds.length > 0 ||
    contextIncompleteCompetencyIds.length > 0
  ) {
    status = "INSUFFICIENT_EVIDENCE";
  } else if (belowPolicyCompetencyIds.length > 0) {
    status = "DEVELOPING";
  } else if (
    unstableCompetencyIds.length > 0 ||
    regressionCompetencyIds.length > 0 ||
    unmetPrerequisites.length > 0 ||
    unsatisfiedAssessments.length > 0
  ) {
    status = "NEARLY_REVIEWABLE";
  } else {
    status = "REVIEW_ELIGIBLE";
    addReason({
      code: "REVIEW_ELIGIBLE",
      dimension: "MASTERY",
      severity: "INFO",
      message:
        "Alle configureerde reviewvoorwaarden zijn voldaan; een bevoegde professional neemt het formele besluit.",
      evidenceIds: allEvidence.map((item) => item.sourceEvidenceId),
    });
  }

  const inputSnapshotPayload = {
    schemaVersion: "readiness-input.v1" as const,
    evaluatedAt: input.evaluatedAt,
    tenantId: input.tenantId,
    enrollmentId: input.enrollmentId,
    trainingMethod: input.trainingMethod,
    curriculumVersionId: input.curriculumVersionId,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    evidence: allEvidence,
    prerequisites: input.prerequisites,
    assessments: input.assessments,
  };
  const inputSnapshot = deepFreeze({
    id: `readiness-input:${stableHash(inputSnapshotPayload)}`,
    ...inputSnapshotPayload,
  });
  const resultSnapshotPayload = {
    schemaVersion: "readiness-result.v1" as const,
    inputSnapshotId: inputSnapshot.id,
    engineVersion: READINESS_ENGINE_VERSION,
    status,
    executionMode,
    reasonIds: reasons.map((item) => item.id),
    blockerIds: blockers.map((item) => item.id),
  };
  const resultSnapshot = deepFreeze({
    id: `readiness-result:${stableHash(resultSnapshotPayload)}`,
    ...resultSnapshotPayload,
  });

  return deepFreeze({
    id: input.evaluationId,
    evaluatedAt: input.evaluatedAt,
    status,
    executionMode,
    productionClaimAllowed: executionMode === "ACTIVE",
    trainingMethod: input.trainingMethod,
    curriculumVersionId: input.curriculumVersionId,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    engineVersion: READINESS_ENGINE_VERSION,
    competencies: competencyResults,
    coverage: {
      requiredCompetencyCount: competencyResults.length,
      coveredCompetencyCount:
        competencyResults.length - missingCompetencyIds.length,
      missingCompetencyIds,
      staleCompetencyIds,
      contextIncompleteCompetencyIds,
    },
    mastery: {
      requiredCompetencyCount: competencyResults.length,
      masteredCompetencyCount:
        competencyResults.length - belowPolicyCompetencyIds.length,
      belowPolicyCompetencyIds,
    },
    stability: {
      stableCompetencyCount:
        competencyResults.length - unstableCompetencyIds.length,
      unstableCompetencyIds,
    },
    regression: {
      detected: regressionCompetencyIds.length > 0,
      competencyIds: regressionCompetencyIds,
    },
    prerequisites: {
      metIds: uniqueSorted(metPrerequisites),
      unmetIds: uniqueSorted(unmetPrerequisites),
    },
    assessments: {
      satisfiedTypes: uniqueSorted(satisfiedAssessments),
      unsatisfiedTypes: uniqueSorted(unsatisfiedAssessments),
    },
    criticalBlockers: blockers,
    reasons,
    evidenceIds: uniqueSorted(allEvidence.map((item) => item.sourceEvidenceId)),
    inputSnapshot,
    resultSnapshot,
  });
}

function validateConfiguration(
  input: EvaluateReadinessInput,
  addReason: (reason: ReasonInput) => ReadinessReason,
): string[] {
  const ids: string[] = [];
  const addConfigurationReason = (
    reason: Omit<ReasonInput, "dimension" | "severity">,
  ): void => {
    ids.push(
      addReason({
        ...reason,
        dimension: "CONFIGURATION",
        severity: "BLOCKER",
      }).id,
    );
  };

  if (input.policy.status !== "PUBLISHED") {
    addConfigurationReason({
      code: "POLICY_NOT_PUBLISHED",
      message: `Readiness-policy ${input.policy.id}@${input.policy.version} is niet gepubliceerd.`,
    });
  }
  if (
    input.policy.engineVersion !== READINESS_ENGINE_VERSION ||
    input.policy.curriculumVersionId !== input.curriculumVersionId
  ) {
    addConfigurationReason({
      code: "POLICY_ENGINE_VERSION_MISMATCH",
      message:
        "Policy, curriculum en engineversie vormen geen geldige immutable combinatie.",
    });
  }
  if (input.policy.competencyRules.length === 0) {
    addConfigurationReason({
      code: "POLICY_HAS_NO_COMPETENCIES",
      message: "De readiness-policy bevat geen competentieconfiguratie.",
    });
  }
  const seen = new Set<string>();
  for (const rule of input.policy.competencyRules) {
    if (seen.has(rule.competencyId)) {
      addConfigurationReason({
        code: "POLICY_DUPLICATE_COMPETENCY",
        message: `Competentie ${rule.competencyId} staat meerdere keren in de policy.`,
        competencyId: rule.competencyId,
      });
    }
    seen.add(rule.competencyId);
    if (
      rule.minimumEvidenceCount < 1 ||
      rule.minimumContextCount < 0 ||
      rule.stabilityWindow < 1 ||
      rule.minimumStableObservations < 1 ||
      rule.minimumStableObservations > rule.stabilityWindow ||
      (rule.critical && rule.compensable)
    ) {
      addConfigurationReason({
        code: "POLICY_RULE_INVALID",
        message: `Competentieregel ${rule.competencyId} is intern inconsistent.`,
        competencyId: rule.competencyId,
      });
    }
  }
  return ids;
}

function isEvidenceCurrent(
  latest: NormalizedCompetencyEvidence | undefined,
  maximumAgeDays: number | undefined,
  evaluatedAt: string,
): boolean {
  if (!latest) return false;
  if (maximumAgeDays === undefined) return true;
  const evaluationTime = Date.parse(evaluatedAt);
  const observationTime = Date.parse(latest.observedAt);
  if (
    !Number.isFinite(evaluationTime) ||
    !Number.isFinite(observationTime) ||
    observationTime > evaluationTime
  ) {
    return false;
  }
  return evaluationTime - observationTime <= maximumAgeDays * DAY_MS;
}

function sortEvidence(
  evidence: readonly NormalizedCompetencyEvidence[],
): NormalizedCompetencyEvidence[] {
  return [...evidence].sort(
    (left, right) =>
      left.observedAt.localeCompare(right.observedAt) ||
      left.sourceEvidenceId.localeCompare(right.sourceEvidenceId),
  );
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function isBlockerCode(
  code: ReadinessReasonCode,
): code is ReadinessBlocker["code"] {
  return (
    code === "CRITICAL_EVIDENCE_MISSING" ||
    code === "CRITICAL_COMPETENCE_BELOW_POLICY" ||
    code === "CRITICAL_INDEPENDENCE_BELOW_POLICY" ||
    code === "CRITICAL_SAFETY_NOT_CLEARED" ||
    code === "SAFETY_BLOCKER_OPEN" ||
    code === "PREREQUISITE_NOT_MET" ||
    code === "ASSESSMENT_NOT_PUBLISHED" ||
    code === "ASSESSMENT_RESULT_NOT_MET"
  );
}

function stableHash(value: unknown): string {
  const canonical = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
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

function immutableClone<T>(value: T): T {
  return deepFreeze(JSON.parse(stableStringify(value)) as T);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
