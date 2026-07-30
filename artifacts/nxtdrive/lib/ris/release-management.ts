import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRisCatalogReview,
  type RisCatalogReview,
  type RisCatalogValidationStatus,
} from "./catalog-review";

export type RisReadinessRule = {
  competencyId: string;
  label: string;
  moduleNumber: number;
  critical: boolean;
  minimumEvidenceCount: number;
  minimumContextCount: number;
  maximumEvidenceAgeDays: number;
  stabilityWindow: number;
  minimumStableObservations: number;
};

export type RisAssessmentCriterion = {
  criterionId: string;
  scriptCode: string;
  label: string;
  moduleNumber: number;
  required: boolean;
  safetyCritical: boolean;
};

export type RisDefinitionValidation = {
  id: string;
  status: RisCatalogValidationStatus;
  reviewerCredentials: string | null;
  limitationNote: string | null;
  scenarioResults: Array<{
    key?: string;
    label?: string;
    passed?: boolean;
  }>;
  signedAt: string | null;
  updatedAt: string;
};

export type RisReadinessPolicyManagement = {
  id: string;
  versionCode: string;
  engineVersion: string;
  status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
  contentHash: string;
  changeNote: string | null;
  publishedAt: string | null;
  rules: RisReadinessRule[];
  validation: RisDefinitionValidation | null;
  validationMatchesCurrentHash: boolean;
};

export type RisAssessmentDefinitionManagement = {
  id: string;
  assessmentType: "RIS_MODULE_1" | "RIS_MODULE_2";
  moduleNumber: 1 | 2;
  versionCode: string;
  status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
  contentHash: string;
  changeNote: string | null;
  publishedAt: string | null;
  criteria: RisAssessmentCriterion[];
  validation: RisDefinitionValidation | null;
  validationMatchesCurrentHash: boolean;
};

export type RisReleaseManagement = {
  catalog: RisCatalogReview;
  policy: RisReadinessPolicyManagement | null;
  assessments: RisAssessmentDefinitionManagement[];
  release: {
    catalogApproved: boolean;
    policyApproved: boolean;
    policyPublished: boolean;
    moduleOneApproved: boolean;
    moduleOnePublished: boolean;
    moduleTwoApproved: boolean;
    moduleTwoPublished: boolean;
    curriculumPublished: boolean;
    tenantActive: boolean;
    readyToPublishCurriculum: boolean;
    readyToActivateTenant: boolean;
  };
};

type PolicyRow = {
  id: string;
  version_code: string;
  engine_version: string;
  status: RisReadinessPolicyManagement["status"];
  policy_document: unknown;
  content_hash: string;
  expert_validation_record_id: string | null;
  change_note: string | null;
  published_at: string | null;
  created_at: string;
};

type DefinitionRow = {
  id: string;
  assessment_type: string;
  version_code: string;
  status: RisAssessmentDefinitionManagement["status"];
  criteria_document: unknown;
  content_hash: string;
  expert_validation_record_id: string | null;
  change_note: string | null;
  published_at: string | null;
  created_at: string;
};

type ValidationRow = {
  id: string;
  target_id: string;
  status: RisCatalogValidationStatus;
  content_hash: string;
  reviewer_credentials: string | null;
  scenario_results: unknown;
  limitation_note: string | null;
  signed_at: string | null;
  updated_at: string;
};

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeValidation(
  value: ValidationRow | null,
): RisDefinitionValidation | null {
  if (!value) return null;
  return {
    id: value.id,
    status: value.status,
    reviewerCredentials: value.reviewer_credentials,
    limitationNote: value.limitation_note,
    scenarioResults: records(value.scenario_results).map((scenario) => ({
      key: typeof scenario.key === "string" ? scenario.key : undefined,
      label: typeof scenario.label === "string" ? scenario.label : undefined,
      passed:
        typeof scenario.passed === "boolean" ? scenario.passed : undefined,
    })),
    signedAt: value.signed_at,
    updatedAt: value.updated_at,
  };
}

function policyRules(value: unknown): RisReadinessRule[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const document = value as Record<string, unknown>;
  return records(document.competencyRules).map((rule) => ({
    competencyId: stringValue(rule.competencyId),
    label: stringValue(rule.label),
    moduleNumber: numberValue(rule.moduleNumber, 0),
    critical: rule.critical === true,
    minimumEvidenceCount: numberValue(rule.minimumEvidenceCount, 2),
    minimumContextCount: numberValue(rule.minimumContextCount, 2),
    maximumEvidenceAgeDays: numberValue(rule.maximumEvidenceAgeDays, 90),
    stabilityWindow: numberValue(rule.stabilityWindow, 3),
    minimumStableObservations: numberValue(rule.minimumStableObservations, 2),
  }));
}

function assessmentCriteria(value: unknown): RisAssessmentCriterion[] {
  return records(value).map((criterion) => ({
    criterionId: stringValue(criterion.criterionId),
    scriptCode: stringValue(criterion.scriptCode),
    label: stringValue(criterion.label),
    moduleNumber: numberValue(criterion.moduleNumber, 0),
    required: criterion.required === true,
    safetyCritical: criterion.safetyCritical === true,
  }));
}

function currentEntity<T extends { status: string; created_at: string }>(
  rows: T[],
): T | null {
  return (
    rows.find((row) => row.status === "PUBLISHED") ??
    rows.find(
      (row) =>
        row.status === "AWAITING_EXPERT_VALIDATION" || row.status === "DRAFT",
    ) ??
    rows[0] ??
    null
  );
}

export async function loadRisReleaseManagement(
  client: SupabaseClient,
  tenantId: string,
  requestedVersionId?: string | null,
): Promise<RisReleaseManagement> {
  const catalog = await loadRisCatalogReview(
    client,
    tenantId,
    requestedVersionId,
  );
  const curriculumId = catalog.curriculum?.id;
  if (!curriculumId) {
    return {
      catalog,
      policy: null,
      assessments: [],
      release: {
        catalogApproved: false,
        policyApproved: false,
        policyPublished: false,
        moduleOneApproved: false,
        moduleOnePublished: false,
        moduleTwoApproved: false,
        moduleTwoPublished: false,
        curriculumPublished: false,
        tenantActive: false,
        readyToPublishCurriculum: false,
        readyToActivateTenant: false,
      },
    };
  }

  const [policiesRes, definitionsRes] = await Promise.all([
    client
      .from("readiness_policies")
      .select(
        "id, version_code, engine_version, status, policy_document, content_hash, expert_validation_record_id, change_note, published_at, created_at",
      )
      .eq("curriculum_version_id", curriculumId)
      .is("tenant_id", null)
      .order("created_at", { ascending: false }),
    client
      .from("assessment_definitions")
      .select(
        "id, assessment_type, version_code, status, criteria_document, content_hash, expert_validation_record_id, change_note, published_at, created_at",
      )
      .eq("curriculum_version_id", curriculumId)
      .in("assessment_type", ["RIS_MODULE_1", "RIS_MODULE_2"])
      .order("created_at", { ascending: false }),
  ]);
  if (policiesRes.error) {
    throw new Error(
      `RIS readinessbeleid laden mislukt: ${policiesRes.error.message}`,
    );
  }
  if (definitionsRes.error) {
    throw new Error(
      `RIS toetsdefinities laden mislukt: ${definitionsRes.error.message}`,
    );
  }

  const policyRow = currentEntity((policiesRes.data ?? []) as PolicyRow[]);
  const definitionRows = (definitionsRes.data ?? []) as DefinitionRow[];
  const selectedDefinitions = (
    ["RIS_MODULE_1", "RIS_MODULE_2"] as const
  ).flatMap((assessmentType) => {
    const definition = currentEntity(
      definitionRows.filter((row) => row.assessment_type === assessmentType),
    );
    return definition ? [definition] : [];
  });
  const targetIds = [
    policyRow?.id,
    ...selectedDefinitions.map((definition) => definition.id),
  ].filter((id): id is string => Boolean(id));
  const validationsRes =
    targetIds.length > 0
      ? await client
          .from("expert_validation_records")
          .select(
            "id, target_id, status, content_hash, reviewer_credentials, scenario_results, limitation_note, signed_at, updated_at",
          )
          .in("target_id", targetIds)
          .in("target_type", ["READINESS_POLICY", "ASSESSMENT_DEFINITION"])
          .order("updated_at", { ascending: false })
      : { data: [], error: null };
  if (validationsRes.error) {
    throw new Error(
      `RIS definitievalidaties laden mislukt: ${validationsRes.error.message}`,
    );
  }
  const validations = (validationsRes.data ?? []) as ValidationRow[];
  const validationFor = (
    targetId: string,
    contentHash: string,
  ): ValidationRow | null =>
    validations.find(
      (validation) =>
        validation.target_id === targetId &&
        validation.content_hash === contentHash,
    ) ?? null;

  const policyValidation = policyRow
    ? validationFor(policyRow.id, policyRow.content_hash)
    : null;
  const policy: RisReadinessPolicyManagement | null = policyRow
    ? {
        id: policyRow.id,
        versionCode: policyRow.version_code,
        engineVersion: policyRow.engine_version,
        status: policyRow.status,
        contentHash: policyRow.content_hash,
        changeNote: policyRow.change_note,
        publishedAt: policyRow.published_at,
        rules: policyRules(policyRow.policy_document),
        validation: normalizeValidation(policyValidation),
        validationMatchesCurrentHash:
          policyValidation?.status === "APPROVED" &&
          policyRow.expert_validation_record_id === policyValidation.id,
      }
    : null;
  const assessments: RisAssessmentDefinitionManagement[] =
    selectedDefinitions.map((row) => {
      const validation = validationFor(row.id, row.content_hash);
      const moduleNumber = row.assessment_type === "RIS_MODULE_1" ? 1 : 2;
      return {
        id: row.id,
        assessmentType: row.assessment_type as "RIS_MODULE_1" | "RIS_MODULE_2",
        moduleNumber,
        versionCode: row.version_code,
        status: row.status,
        contentHash: row.content_hash,
        changeNote: row.change_note,
        publishedAt: row.published_at,
        criteria: assessmentCriteria(row.criteria_document),
        validation: normalizeValidation(validation),
        validationMatchesCurrentHash:
          validation?.status === "APPROVED" &&
          row.expert_validation_record_id === validation.id,
      };
    });

  const moduleOne = assessments.find(
    (definition) => definition.moduleNumber === 1,
  );
  const moduleTwo = assessments.find(
    (definition) => definition.moduleNumber === 2,
  );
  const catalogApproved = catalog.releaseGate.validationMatchesCurrentHash;
  const policyApproved = policy?.validationMatchesCurrentHash === true;
  const policyPublished = policy?.status === "PUBLISHED";
  const moduleOneApproved = moduleOne?.validationMatchesCurrentHash === true;
  const moduleOnePublished = moduleOne?.status === "PUBLISHED";
  const moduleTwoApproved = moduleTwo?.validationMatchesCurrentHash === true;
  const moduleTwoPublished = moduleTwo?.status === "PUBLISHED";
  const curriculumPublished = catalog.curriculum?.status === "PUBLISHED";
  const tenantActive =
    catalog.releaseGate.tenantRisMode &&
    catalog.releaseGate.tenantUsesSelectedVersion;
  const readyToPublishCurriculum =
    catalogApproved &&
    policyPublished &&
    moduleOnePublished &&
    moduleTwoPublished;

  return {
    catalog,
    policy,
    assessments,
    release: {
      catalogApproved,
      policyApproved,
      policyPublished,
      moduleOneApproved,
      moduleOnePublished,
      moduleTwoApproved,
      moduleTwoPublished,
      curriculumPublished,
      tenantActive,
      readyToPublishCurriculum,
      readyToActivateTenant: curriculumPublished && policyPublished,
    },
  };
}
