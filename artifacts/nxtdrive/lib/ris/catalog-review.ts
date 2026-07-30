import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RISTreeModule } from "@workspace/leskaart";
import { loadRisCatalog, loadTenantRisSettings, type RisCatalog } from "./data";

export type RisCatalogVersionOption = {
  id: string;
  name: string;
  description: string | null;
  activeFrom: string;
  isActive: boolean;
  curriculumVersionId: string | null;
  curriculumStatus:
    | "DRAFT"
    | "AWAITING_EXPERT_VALIDATION"
    | "PUBLISHED"
    | "RETIRED"
    | null;
};

export type RisCatalogValidationStatus =
  | "AWAITING_EXPERT_VALIDATION"
  | "IN_REVIEW"
  | "CHANGES_REQUIRED"
  | "APPROVED";

export type RisCatalogReview = {
  versions: RisCatalogVersionOption[];
  selectedVersion: RisCatalogVersionOption;
  catalog: RisCatalog;
  snapshot: {
    contentHash: string;
    document: Record<string, unknown>;
  };
  curriculum: {
    id: string;
    versionCode: string;
    status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
    storedContentHash: string;
    changeNote: string | null;
    publishedAt: string | null;
  } | null;
  validation: {
    id: string;
    status: RisCatalogValidationStatus;
    reviewerName: string | null;
    reviewerEmail: string | null;
    reviewerCredentials: string | null;
    scenarioResults: Array<{
      key?: string;
      label?: string;
      passed?: boolean;
    }>;
    limitationNote: string | null;
    signedAt: string | null;
    updatedAt: string;
  } | null;
  releaseGate: {
    catalogContentComplete: boolean;
    validationMatchesCurrentHash: boolean;
    curriculumPublished: boolean;
    readinessPolicyPublished: boolean;
    moduleOneDefinitionPublished: boolean;
    moduleTwoDefinitionPublished: boolean;
    tenantUsesSelectedVersion: boolean;
    tenantRisMode: boolean;
    releaseReady: boolean;
  };
  counts: {
    modules: number;
    categories: number;
    scripts: number;
    variants: number;
    steps: number;
  };
};

type VersionRow = {
  id: string;
  name: string;
  description: string | null;
  active_from: string;
  is_active: boolean;
  curriculum_version_id: string | null;
};

type CurriculumRow = {
  id: string;
  source_ris_version_id: string | null;
  version_code: string;
  status: "DRAFT" | "AWAITING_EXPERT_VALIDATION" | "PUBLISHED" | "RETIRED";
  content_hash: string;
  expert_validation_record_id: string | null;
  change_note: string | null;
  published_at: string | null;
};

type ValidationRow = {
  id: string;
  status: RisCatalogValidationStatus;
  content_hash: string;
  reviewer_user_id: string | null;
  reviewer_credentials: string | null;
  scenario_results: unknown;
  limitation_note: string | null;
  signed_at: string | null;
  updated_at: string;
};

function countCatalog(tree: readonly RISTreeModule[], steps: number) {
  let categories = 0;
  let scripts = 0;
  let variants = 0;
  for (const module of tree) {
    categories += module.categories.length;
    for (const category of module.categories) {
      scripts += category.scripts.length;
      for (const script of category.scripts) {
        variants += script.variants.length;
      }
    }
  }
  return {
    modules: tree.length,
    categories,
    scripts,
    variants,
    steps,
  };
}

function normalizeScenarioResults(
  value: unknown,
): Array<{ key?: string; label?: string; passed?: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    return [
      {
        key: typeof candidate.key === "string" ? candidate.key : undefined,
        label:
          typeof candidate.label === "string" ? candidate.label : undefined,
        passed:
          typeof candidate.passed === "boolean" ? candidate.passed : undefined,
      },
    ];
  });
}

export async function loadRisCatalogReview(
  client: SupabaseClient,
  tenantId: string,
  requestedVersionId?: string | null,
): Promise<RisCatalogReview> {
  const [versionsRes, curriculaRes, tenantSettings] = await Promise.all([
    client
      .from("ris_versions")
      .select(
        "id, name, description, active_from, is_active, curriculum_version_id",
      )
      .order("active_from", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("curriculum_versions")
      .select(
        "id, source_ris_version_id, version_code, status, content_hash, expert_validation_record_id, change_note, published_at",
      )
      .eq("training_method", "RIS_2_0"),
    loadTenantRisSettings(client, tenantId),
  ]);

  if (versionsRes.error) {
    throw new Error(
      `RIS catalogusversies laden mislukt: ${versionsRes.error.message}`,
    );
  }
  if (curriculaRes.error) {
    throw new Error(
      `RIS curriculumversies laden mislukt: ${curriculaRes.error.message}`,
    );
  }

  const versionRows = (versionsRes.data ?? []) as VersionRow[];
  const curricula = (curriculaRes.data ?? []) as CurriculumRow[];
  const curriculumBySourceId = new Map(
    curricula
      .filter((row) => row.source_ris_version_id)
      .map((row) => [row.source_ris_version_id as string, row]),
  );
  const versions: RisCatalogVersionOption[] = versionRows.map((row) => {
    const curriculum = curriculumBySourceId.get(row.id);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      activeFrom: row.active_from,
      isActive: row.is_active,
      curriculumVersionId: row.curriculum_version_id,
      curriculumStatus: curriculum?.status ?? null,
    };
  });

  const selectedVersion =
    versions.find((version) => version.id === requestedVersionId) ??
    versions.find(
      (version) => version.id === tenantSettings.activeRisVersionId,
    ) ??
    versions.find((version) => version.isActive) ??
    versions[0];
  if (!selectedVersion) {
    throw new Error("Er is nog geen RIS-catalogusversie beschikbaar.");
  }

  const curriculum = curriculumBySourceId.get(selectedVersion.id) ?? null;
  const [catalog, snapshotRes, validationsRes, policiesRes, definitionsRes] =
    await Promise.all([
      loadRisCatalog(client, selectedVersion.id),
      client.rpc("get_ris_catalog_validation_snapshot", {
        p_ris_version_id: selectedVersion.id,
      }),
      curriculum
        ? client
            .from("expert_validation_records")
            .select(
              "id, status, content_hash, reviewer_user_id, reviewer_credentials, scenario_results, limitation_note, signed_at, updated_at",
            )
            .eq("target_type", "CURRICULUM")
            .eq("target_id", curriculum.id)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      curriculum
        ? client
            .from("readiness_policies")
            .select("id, status, tenant_id")
            .eq("curriculum_version_id", curriculum.id)
        : Promise.resolve({ data: [], error: null }),
      curriculum
        ? client
            .from("assessment_definitions")
            .select("id, assessment_type, status")
            .eq("curriculum_version_id", curriculum.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (snapshotRes.error) {
    throw new Error(
      `RIS validatiesnapshot laden mislukt: ${snapshotRes.error.message}`,
    );
  }
  if (validationsRes.error) {
    throw new Error(
      `RIS expertvalidatie laden mislukt: ${validationsRes.error.message}`,
    );
  }
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

  const snapshotRaw = snapshotRes.data as {
    contentHash?: unknown;
    document?: unknown;
  } | null;
  const contentHash =
    typeof snapshotRaw?.contentHash === "string" ? snapshotRaw.contentHash : "";
  const document =
    snapshotRaw?.document &&
    typeof snapshotRaw.document === "object" &&
    !Array.isArray(snapshotRaw.document)
      ? (snapshotRaw.document as Record<string, unknown>)
      : {};
  if (!contentHash) {
    throw new Error("De RIS-catalogushash kon niet worden vastgesteld.");
  }

  const validations = (validationsRes.data ?? []) as ValidationRow[];
  const currentValidation =
    validations.find((record) => record.content_hash === contentHash) ?? null;
  let reviewer: { full_name: string | null; email: string | null } | null =
    null;
  if (currentValidation?.reviewer_user_id) {
    const reviewerRes = await client
      .from("profiles")
      .select("full_name, email")
      .eq("id", currentValidation.reviewer_user_id)
      .maybeSingle();
    if (reviewerRes.error) {
      throw new Error(
        `RIS beoordelaar laden mislukt: ${reviewerRes.error.message}`,
      );
    }
    reviewer = reviewerRes.data as {
      full_name: string | null;
      email: string | null;
    } | null;
  }

  const policies = (policiesRes.data ?? []) as Array<{
    status: string;
    tenant_id: string | null;
  }>;
  const definitions = (definitionsRes.data ?? []) as Array<{
    assessment_type: string;
    status: string;
  }>;
  const counts = countCatalog(catalog.tree, catalog.steps.length);
  const catalogContentComplete =
    counts.modules === 4 && counts.scripts === 46 && counts.steps === 9;
  const validationMatchesCurrentHash =
    currentValidation?.status === "APPROVED" &&
    curriculum?.content_hash === contentHash &&
    curriculum.expert_validation_record_id === currentValidation.id;
  const curriculumPublished = curriculum?.status === "PUBLISHED";
  const readinessPolicyPublished = policies.some(
    (policy) =>
      policy.status === "PUBLISHED" &&
      (policy.tenant_id === null || policy.tenant_id === tenantId),
  );
  const moduleOneDefinitionPublished = definitions.some(
    (definition) =>
      definition.assessment_type === "RIS_MODULE_1" &&
      definition.status === "PUBLISHED",
  );
  const moduleTwoDefinitionPublished = definitions.some(
    (definition) =>
      definition.assessment_type === "RIS_MODULE_2" &&
      definition.status === "PUBLISHED",
  );
  const tenantUsesSelectedVersion =
    tenantSettings.activeRisVersionId === selectedVersion.id;
  const tenantRisMode = tenantSettings.lessonCardMode === "ris";

  return {
    versions,
    selectedVersion,
    catalog,
    snapshot: { contentHash, document },
    curriculum: curriculum
      ? {
          id: curriculum.id,
          versionCode: curriculum.version_code,
          status: curriculum.status,
          storedContentHash: curriculum.content_hash,
          changeNote: curriculum.change_note,
          publishedAt: curriculum.published_at,
        }
      : null,
    validation: currentValidation
      ? {
          id: currentValidation.id,
          status: currentValidation.status,
          reviewerName: reviewer?.full_name ?? null,
          reviewerEmail: reviewer?.email ?? null,
          reviewerCredentials: currentValidation.reviewer_credentials,
          scenarioResults: normalizeScenarioResults(
            currentValidation.scenario_results,
          ),
          limitationNote: currentValidation.limitation_note,
          signedAt: currentValidation.signed_at,
          updatedAt: currentValidation.updated_at,
        }
      : null,
    releaseGate: {
      catalogContentComplete,
      validationMatchesCurrentHash,
      curriculumPublished,
      readinessPolicyPublished,
      moduleOneDefinitionPublished,
      moduleTwoDefinitionPublished,
      tenantUsesSelectedVersion,
      tenantRisMode,
      releaseReady:
        catalogContentComplete &&
        validationMatchesCurrentHash &&
        curriculumPublished &&
        readinessPolicyPublished &&
        moduleOneDefinitionPublished &&
        moduleTwoDefinitionPublished,
    },
    counts,
  };
}
