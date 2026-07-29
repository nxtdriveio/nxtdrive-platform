import assert from "node:assert/strict";
import test from "node:test";
import {
  AssessmentLifecycleError,
  Ris10LegacyEvidenceAdapter,
  Ris20ReadinessEvidenceAdapter,
  assertTrainingMethodOperationAllowed,
  canTransitionAssessment,
  computeRisModuleReadiness,
  computeRisProgress,
  createAssessmentRetest,
  evaluateReadiness,
  guardAssessmentPlanning,
  guardCurriculumPublication,
  guardReadinessPolicyPublication,
  guardRisLessonPublication,
  learnerCanViewAssessment,
  transitionAssessment,
  type AssessmentRecord,
  type CurriculumPublicationCandidate,
  type EvaluateReadinessInput,
  type ReadinessDecision,
  type ReadinessEvaluation,
  type ReadinessPolicy,
  type RisScriptObservation,
} from "@workspace/leskaart";
import {
  ReadinessEvaluationService,
  type ReadinessEvaluationRepository,
} from "./evaluation-service";

const NOW = "2026-07-29T10:00:00.000Z";

function policy(overrides: Partial<ReadinessPolicy> = {}): ReadinessPolicy {
  return {
    id: "policy-1",
    version: "1.0.0",
    curriculumVersionId: "curriculum-1",
    engineVersion: "2.0.0",
    status: "PUBLISHED",
    competencyRules: [
      {
        competencyId: "safe-looking",
        critical: true,
        requiredCompetenceBand: "SUFFICIENT",
        requiredIndependenceBand: "INDEPENDENT",
        minimumEvidenceCount: 1,
        minimumContextCount: 1,
        stabilityWindow: 1,
        minimumStableObservations: 1,
        requireSafetyClear: true,
        compensable: false,
      },
    ],
    prerequisiteRules: [],
    assessmentRules: [],
    expertValidation: {
      required: true,
      status: "APPROVED",
      validationRecordId: "expert-validation-1",
      validatedContentHash: "hash-1",
      currentContentHash: "hash-1",
    },
    ...overrides,
  };
}

function risObservation(
  overrides: Partial<RisScriptObservation> = {},
): RisScriptObservation {
  return {
    id: "evidence-1",
    scriptId: "script-1",
    competencyId: "safe-looking",
    observedAt: NOW,
    instructionStage: 6,
    performanceOutcome: "SUFFICIENT",
    supportLevel: "OBSERVATION_ONLY",
    safetyStatus: "NO_BLOCKER",
    contextTags: ["urban"],
    instructorId: "instructor-1",
    lessonId: "lesson-1",
    ...overrides,
  };
}

function evaluationInput(
  observations: readonly RisScriptObservation[],
  overrides: Partial<EvaluateReadinessInput> = {},
): EvaluateReadinessInput {
  return {
    evaluationId: "evaluation-1",
    tenantId: "tenant-1",
    enrollmentId: "enrollment-1",
    trainingMethod: "RIS_2_0",
    curriculumVersionId: "curriculum-1",
    evaluatedAt: NOW,
    requestedMode: "ACTIVE",
    policy: policy(),
    evidence: new Ris20ReadinessEvidenceAdapter().normalize(observations),
    prerequisites: [],
    assessments: [],
    ...overrides,
  };
}

function readyEvaluation(): ReadinessEvaluation {
  return evaluateReadiness(evaluationInput([risObservation()]));
}

test("RIS N stays unobserved and lowers coverage instead of becoming a score", () => {
  const observation = risObservation({
    id: "evidence-N",
    instructionStage: null,
    performanceOutcome: "NOT_OBSERVED",
    safetyStatus: "NOT_ASSESSED",
  });
  const normalized = new Ris20ReadinessEvidenceAdapter().normalize([
    observation,
  ]);

  assert.equal(normalized[0]?.observed, false);
  assert.equal(normalized[0]?.competenceBand, "UNKNOWN");
  assert.equal(normalized[0]?.independenceBand, "UNKNOWN");

  const result = evaluateReadiness(
    evaluationInput([], {
      evidence: normalized,
    }),
  );
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.coverage.missingCompetencyIds, ["safe-looking"]);
  const reason = result.reasons.find(
    (item) => item.code === "CRITICAL_EVIDENCE_MISSING",
  );
  assert.ok(reason);
  assert.deepEqual(reason.evidenceIds, ["evidence-N"]);
});

test("RIS instruction stage 8 never raises mastery or gets averaged", () => {
  const normalized = new Ris20ReadinessEvidenceAdapter().normalize([
    risObservation({
      id: "stage-8-developing",
      instructionStage: 8,
      performanceOutcome: "DEVELOPING",
      safetyStatus: "NO_BLOCKER",
    }),
  ]);
  assert.equal(normalized[0]?.independenceBand, "TRANSFERABLE");
  assert.equal(normalized[0]?.competenceBand, "DEVELOPING");

  const progress = computeRisProgress([
    { scriptId: "a", moduleNumber: 1, step: "8" },
    { scriptId: "b", moduleNumber: 1, step: "N" },
  ]);
  assert.equal(progress.averageStep, null);
  assert.equal(
    progress.progressPct,
    50,
    "progress is coverage, not stage quality",
  );

  const readiness = evaluateReadiness(
    evaluationInput([], { evidence: normalized }),
  );
  assert.equal(readiness.status, "BLOCKED");
  assert.ok(
    readiness.reasons.some(
      (item) => item.code === "CRITICAL_COMPETENCE_BELOW_POLICY",
    ),
  );
});

test("module readiness uses explicit performance and safety, never readyForModuleTest", () => {
  const result = computeRisModuleReadiness(1, [
    {
      scriptId: "critical",
      moduleNumber: 1,
      step: "8",
      isCritical: true,
      performanceOutcome: "STABLE",
      supportLevel: "OBSERVATION_ONLY",
      safetyStatus: "BLOCKER",
      readyForModuleTest: true,
    },
  ]);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.includes("veiligheidspunt")));
  assert.equal(result.averageStep, null);
});

test("critical safety blocker cannot be compensated and keeps evidence/reason IDs", () => {
  const evidence = new Ris20ReadinessEvidenceAdapter().normalize([
    risObservation({
      id: "critical-blocker-evidence",
      performanceOutcome: "STABLE",
      instructionStage: 8,
      safetyStatus: "BLOCKER",
    }),
    risObservation({
      id: "unrelated-strong-evidence",
      competencyId: "unrelated",
      performanceOutcome: "STABLE",
      instructionStage: 8,
      safetyStatus: "NO_BLOCKER",
    }),
  ]);
  const result = evaluateReadiness(
    evaluationInput([], {
      evidence,
    }),
  );

  assert.equal(result.status, "BLOCKED");
  const blocker = result.criticalBlockers.find(
    (item) => item.code === "SAFETY_BLOCKER_OPEN",
  );
  assert.ok(blocker);
  assert.equal(blocker.safetyRelated, true);
  assert.equal(blocker.overridableByDefault, false);
  assert.deepEqual(blocker.evidenceIds, ["critical-blocker-evidence"]);
  assert.ok(result.reasons.some((item) => item.id === blocker.reasonId));
  assert.ok(!("readinessPct" in result));
});

test("expert guard forces shadow mode and snapshots are deterministic/immutable", () => {
  const input = evaluationInput([risObservation()], {
    policy: policy({
      expertValidation: {
        required: true,
        status: "AWAITING_EXPERT_VALIDATION",
        currentContentHash: "hash-2",
      },
    }),
  });
  const first = evaluateReadiness(input);
  const second = evaluateReadiness(input);

  assert.equal(first.executionMode, "SHADOW");
  assert.equal(first.productionClaimAllowed, false);
  assert.equal(first.inputSnapshot.id, second.inputSnapshot.id);
  assert.equal(first.resultSnapshot.id, second.resultSnapshot.id);
  assert.ok(
    first.reasons.some((item) => item.code === "EXPERT_VALIDATION_REQUIRED"),
  );
  assert.throws(() => {
    Reflect.apply(Array.prototype.push, first.inputSnapshot.evidence, [
      first.inputSnapshot.evidence[0],
    ]);
  }, TypeError);
});

test("legacy evidence is import-only and legacy evaluation can never activate", () => {
  assert.throws(
    () => assertTrainingMethodOperationAllowed("RIS_1_0_LEGACY", "PLAN_LESSON"),
    /not allowed|alleen/i,
  );
  const evidence = new Ris10LegacyEvidenceAdapter().normalize([
    {
      id: "legacy-1",
      competencyId: "safe-looking",
      observedAt: NOW,
      legacyLevel: 8,
      confidence: "LOW",
      contextTags: ["unknown-context"],
    },
  ]);
  assert.equal(evidence[0]?.sourceType, "LEGACY_IMPORT");
  assert.equal(evidence[0]?.safetyStatus, "UNKNOWN");

  const result = evaluateReadiness({
    ...evaluationInput([]),
    trainingMethod: "RIS_1_0_LEGACY",
    requestedMode: "ACTIVE",
    evidence,
  });
  assert.equal(result.executionMode, "SHADOW");
});

test("curriculum and policy publication guards require completeness and real expert hash", () => {
  const validCandidate: CurriculumPublicationCandidate = {
    id: "curriculum-1",
    trainingMethod: "RIS_2_0",
    status: "AWAITING_EXPERT_VALIDATION",
    version: "2.0.1",
    contentHash: "curriculum-hash",
    createdBy: "author",
    reviewedBy: "reviewer",
    changeNote: "Validated publication candidate",
    moduleNumbers: [1, 2, 3, 4],
    scriptIds: Array.from({ length: 46 }, (_, index) => `script-${index + 1}`),
    scriptCodes: Array.from({ length: 46 }, (_, index) => `M-S${index + 1}`),
    activePublishedVersionIds: [],
    expertValidation: {
      required: true,
      status: "APPROVED",
      validationRecordId: "expert-1",
      validatedContentHash: "curriculum-hash",
    },
    readinessPolicyPublicationReady: true,
    assessmentDefinitions: [
      {
        type: "RIS_MODULE_1",
        version: "1",
        status: "PUBLISHED",
        criterionCount: 1,
      },
      {
        type: "RIS_MODULE_2",
        version: "1",
        status: "PUBLISHED",
        criterionCount: 1,
      },
    ],
  };
  assert.equal(guardCurriculumPublication(validCandidate).allowed, true);
  assert.equal(
    guardCurriculumPublication({
      ...validCandidate,
      expertValidation: {
        required: true,
        status: "APPROVED",
        validationRecordId: "expert-1",
        validatedContentHash: "old-hash",
      },
    }).allowed,
    false,
  );

  const invalidPolicy = policy({
    competencyRules: [
      {
        ...policy().competencyRules[0]!,
        compensable: true,
      },
    ],
  });
  const guard = guardReadinessPolicyPublication(invalidPolicy);
  assert.equal(guard.allowed, false);
  assert.ok(
    guard.reasons.some((item) => item.code === "CRITICAL_RULE_COMPENSABLE"),
  );
});

test("RIS lesson publication stays blocked without approved catalog/policy", () => {
  const result = guardRisLessonPublication({
    trainingMethod: "RIS_2_0",
    actorAuthorized: true,
    curriculumStatus: "AWAITING_EXPERT_VALIDATION",
    policyStatus: "DRAFT",
    expertValidationStatus: "AWAITING_EXPERT_VALIDATION",
    conceptObservations: [
      {
        evidenceId: "evidence-1",
        instructionStage: 6,
        performanceOutcome: "SUFFICIENT",
        safetyStatus: "NO_BLOCKER",
      },
    ],
    reflectionPresent: true,
  });
  assert.equal(result.allowed, false);
  assert.ok(
    result.reasons.some((item) => item.code === "EXPERT_VALIDATION_MISSING"),
  );
});

function draftAssessment(evaluation: ReadinessEvaluation): AssessmentRecord {
  return {
    id: "assessment-1",
    tenantId: "tenant-1",
    enrollmentId: "enrollment-1",
    trainingMethod: "RIS_2_0",
    assessmentDefinitionId: "definition-1",
    assessmentDefinitionVersion: "1.0.0",
    assessmentType: "RIS_MODULE_1",
    curriculumVersionId: evaluation.curriculumVersionId,
    policyVersionId: evaluation.policyId,
    readinessEvaluationId: evaluation.id,
    status: "DRAFT",
    criterionResults: [],
    attemptNumber: 1,
  };
}

test("assessment lifecycle is explicit and learners see only PUBLISHED", () => {
  const evaluation = readyEvaluation();
  const draft = draftAssessment(evaluation);
  assert.equal(canTransitionAssessment("DRAFT", "PLANNED"), true);
  assert.equal(learnerCanViewAssessment(draft), false);
  assert.throws(
    () => transitionAssessment(draft, "IN_PROGRESS", { startedAt: NOW }),
    AssessmentLifecycleError,
  );

  const planned = transitionAssessment(draft, "PLANNED", {
    scheduledAt: NOW,
  });
  const inProgress = transitionAssessment(planned, "IN_PROGRESS", {
    startedAt: NOW,
  });
  const awaiting = transitionAssessment(inProgress, "AWAITING_REVIEW");
  const completed = transitionAssessment(awaiting, "COMPLETED", {
    completedAt: NOW,
    assessorId: "assessor-1",
    result: "PASSED",
  });
  const published = transitionAssessment(completed, "PUBLISHED", {
    publication: { publishedBy: "publisher-1", publishedAt: NOW },
  });
  assert.equal(learnerCanViewAssessment(completed), false);
  assert.equal(learnerCanViewAssessment(published), true);
  assert.equal(canTransitionAssessment("PUBLISHED", "VOIDED"), false);
});

test("open safety blocker rejects override even with a complete audit decision", () => {
  const evaluation = evaluateReadiness(
    evaluationInput([
      risObservation({
        id: "safety-blocker",
        performanceOutcome: "STABLE",
        safetyStatus: "BLOCKER",
      }),
    ]),
  );
  const record = draftAssessment(evaluation);
  const decision: ReadinessDecision = {
    id: "decision-1",
    decision: "OVERRIDE_APPROVED",
    evaluationId: evaluation.id,
    reasonCode: "OPERATIONAL_REVIEW",
    note: "Volledige gemotiveerde notitie.",
    decidedBy: "actor-1",
    decidedAt: NOW,
    blockerSnapshot: evaluation.criticalBlockers,
  };
  const result = guardAssessmentPlanning({
    record,
    evaluation,
    decision,
    overridePolicy: {
      overridesAllowed: true,
      secondApprovalRequired: false,
      safetyBlockersOverridable: false,
      maximumEvaluationAgeMinutes: 1440,
    },
    plannedAt: NOW,
  });
  assert.equal(result.allowed, false);
  assert.match(result.allowed ? "" : result.message, /veiligheidsblocker/i);
});

test("retest creates a new attempt without overwriting history", () => {
  const evaluation = readyEvaluation();
  const previous: AssessmentRecord = {
    ...draftAssessment(evaluation),
    status: "PUBLISHED",
    completedAt: NOW,
    assessorId: "assessor-1",
    result: "NOT_PASSED",
    publication: { publishedBy: "publisher-1", publishedAt: NOW },
  };
  const retest = createAssessmentRetest(previous, {
    id: "assessment-2",
    assessmentDefinitionId: "definition-2",
    assessmentDefinitionVersion: "2.0.0",
    curriculumVersionId: "curriculum-2",
    policyVersionId: "policy-2",
    readinessEvaluationId: "evaluation-2",
    scheduledAt: "2026-08-01T09:00:00.000Z",
  });
  assert.equal(retest.id, "assessment-2");
  assert.equal(retest.previousAttemptId, previous.id);
  assert.equal(retest.attemptNumber, 2);
  assert.equal(retest.status, "PLANNED");
  assert.equal(previous.attemptNumber, 1);
  assert.equal(previous.result, "NOT_PASSED");
});

test("server application service persists both immutable snapshots once", async () => {
  const saved: ReadinessEvaluation[] = [];
  const repository: ReadinessEvaluationRepository = {
    async saveEvaluation(evaluation) {
      saved.push(evaluation);
    },
  };
  const service = new ReadinessEvaluationService(
    repository,
    { now: () => new Date(NOW) },
    { shadowEnabled: true, activeEnabled: true },
  );
  const result = await service.evaluate({
    evaluationId: "evaluation-service-1",
    tenantId: "tenant-1",
    enrollmentId: "enrollment-1",
    curriculumVersionId: "curriculum-1",
    policy: policy(),
    prerequisites: [],
    assessments: [],
    source: {
      trainingMethod: "RIS_2_0",
      observations: [risObservation()],
    },
  });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.inputSnapshot.id, result.inputSnapshot.id);
  assert.equal(saved[0]?.resultSnapshot.id, result.resultSnapshot.id);
  assert.equal(result.status, "REVIEW_ELIGIBLE");
});
