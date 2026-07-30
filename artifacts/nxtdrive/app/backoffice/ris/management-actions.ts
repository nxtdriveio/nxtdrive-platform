"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  canActivateRisAfterMigration,
  loadRisLegacyMigrationReport,
} from "@/lib/ris/migration";
import { createServiceRoleClient } from "@/lib/supabase/service";

const POLICY_SCENARIOS = [
  [
    "separate_dimensions",
    "Beheersing en dekking zijn afzonderlijk beoordeeld.",
  ],
  ["critical_safety", "Kritieke veiligheid kan niet worden gecompenseerd."],
  ["prerequisites", "Theorie, verklaring en machtiging zijn gecontroleerd."],
  ["stability", "Stabiliteit en terugval zijn over meerdere lessen geborgd."],
  ["explainability", "Elk advies blijft uitlegbaar zonder examenclaim."],
] as const;

const ASSESSMENT_SCENARIOS = [
  [
    "criteria_coverage",
    "Alle scripts van de module zijn als criterium gedekt.",
  ],
  [
    "safety_criteria",
    "Veiligheidskritieke criteria zijn expliciet gemarkeerd.",
  ],
  [
    "decision_rules",
    "Beslisregels maskeren geen blokkades of ontbrekend bewijs.",
  ],
  [
    "student_feedback",
    "Publicatie en leerlingfeedback zijn inhoudelijk passend.",
  ],
  [
    "source_alignment",
    "Definitie en bron-/gebruiksrechten zijn gecontroleerd.",
  ],
] as const;

function text(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, maxLength) : null;
}

function integer(
  value: FormDataEntryValue | null,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} moet tussen ${minimum} en ${maximum} liggen.`);
  }
  return parsed;
}

function id(value: FormDataEntryValue | null, label: string): string {
  const parsed = text(value, 80);
  if (!parsed) throw new Error(`${label} ontbreekt.`);
  return parsed;
}

function decision(value: FormDataEntryValue | null) {
  const parsed = text(value, 40)?.toUpperCase();
  if (
    parsed === "IN_REVIEW" ||
    parsed === "CHANGES_REQUIRED" ||
    parsed === "APPROVED"
  ) {
    return parsed;
  }
  throw new Error("Kies een geldige beoordelingsuitkomst.");
}

function values(formData: FormData, key: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .flatMap((value) => (typeof value === "string" ? [value.trim()] : []))
        .filter(Boolean),
    ),
  );
}

function scenarioResults(
  formData: FormData,
  scenarios: readonly (readonly [string, string])[],
) {
  return scenarios.map(([key, label]) => ({
    key,
    label,
    passed: formData.get(`scenario_${key}`) === "on",
  }));
}

function revalidateRisManagement() {
  revalidatePath("/backoffice/ris");
  revalidatePath("/backoffice/ris/catalogus");
  revalidatePath("/backoffice/ris/beleid");
  revalidatePath("/backoffice/ris/toetsdefinities");
  revalidatePath("/backoffice/ris/release");
}

function resultRedirect(
  path: "beleid" | "toetsdefinities" | "release",
  versionId: string | null,
  result: { saved?: string; error?: string },
): never {
  const params = new URLSearchParams();
  if (versionId) params.set("version", versionId);
  if (result.saved) params.set("saved", result.saved);
  if (result.error) params.set("error", result.error);
  redirect(`/backoffice/ris/${path}?${params.toString()}`);
}

async function platformActor() {
  const context = await requireActiveTenant(["tenant_admin"]);
  if (context.user.profile?.is_platform_admin !== true) {
    throw new Error(
      "Alleen een platformbeheerder kan deze RIS-actie uitvoeren.",
    );
  }
  return context;
}

export async function configureRisReadinessPolicyAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    const stabilityWindow = integer(
      formData.get("stability_window"),
      "Stabiliteitsvenster",
      1,
      20,
    );
    const minimumStableObservations = integer(
      formData.get("minimum_stable_observations"),
      "Minimum stabiele observaties",
      1,
      stabilityWindow,
    );
    const service = createServiceRoleClient();
    const { error } = await service.rpc("configure_ris_readiness_policy", {
      p_curriculum_version_id: id(
        formData.get("curriculum_version_id"),
        "Curriculumversie",
      ),
      p_actor: user.id,
      p_critical_competency_ids: values(formData, "critical_competency_id"),
      p_minimum_evidence_count: integer(
        formData.get("minimum_evidence_count"),
        "Minimum bewijs",
        1,
        20,
      ),
      p_minimum_context_count: integer(
        formData.get("minimum_context_count"),
        "Minimum contexten",
        1,
        20,
      ),
      p_stability_window: stabilityWindow,
      p_minimum_stable_observations: minimumStableObservations,
      p_maximum_evidence_age_days: integer(
        formData.get("maximum_evidence_age_days"),
        "Maximale bewijsleeftijd",
        1,
        365,
      ),
      p_change_note: text(formData.get("change_note"), 1000),
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "policy-configured";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Readinessbeleid opslaan mislukt.";
  }
  resultRedirect("beleid", versionId, { saved, error: failure });
}

export async function reviewRisReadinessPolicyAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    const reviewDecision = decision(formData.get("decision"));
    if (
      reviewDecision === "APPROVED" &&
      text(formData.get("approval_confirmation"), 100) !==
        "READINESSBELEID GOEDGEKEURD"
    ) {
      throw new Error(
        "Typ exact ‘READINESSBELEID GOEDGEKEURD’ om te ondertekenen.",
      );
    }
    const service = createServiceRoleClient();
    const { error } = await service.rpc("review_ris_readiness_policy", {
      p_policy_id: id(formData.get("policy_id"), "Readinessbeleid"),
      p_actor: user.id,
      p_expected_content_hash: id(formData.get("content_hash"), "Beleidshash"),
      p_decision: reviewDecision,
      p_reviewer_credentials: text(formData.get("reviewer_credentials"), 500),
      p_scenario_results: scenarioResults(formData, POLICY_SCENARIOS),
      p_limitation_note: text(formData.get("limitation_note"), 3000),
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved =
      reviewDecision === "APPROVED"
        ? "policy-approved"
        : reviewDecision === "CHANGES_REQUIRED"
          ? "policy-changes"
          : "policy-review";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Readinessbeoordeling opslaan mislukt.";
  }
  resultRedirect("beleid", versionId, { saved, error: failure });
}

export async function publishRisReadinessPolicyAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    if (
      text(formData.get("publication_confirmation"), 100) !==
      "READINESSBELEID PUBLICEREN"
    ) {
      throw new Error(
        "Typ exact ‘READINESSBELEID PUBLICEREN’ om te publiceren.",
      );
    }
    const service = createServiceRoleClient();
    const { error } = await service.rpc("publish_readiness_policy", {
      p_policy_id: id(formData.get("policy_id"), "Readinessbeleid"),
      p_actor: user.id,
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "policy-published";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Readinessbeleid publiceren mislukt.";
  }
  resultRedirect("beleid", versionId, { saved, error: failure });
}

export async function initializeRisAssessmentDefinitionsAction(
  formData: FormData,
) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    const service = createServiceRoleClient();
    const { error } = await service.rpc(
      "initialize_ris_assessment_definitions",
      {
        p_curriculum_version_id: id(
          formData.get("curriculum_version_id"),
          "Curriculumversie",
        ),
        p_actor: user.id,
      },
    );
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "definitions-initialized";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Toetsdefinities aanmaken mislukt.";
  }
  resultRedirect("toetsdefinities", versionId, { saved, error: failure });
}

export async function configureRisAssessmentDefinitionAction(
  formData: FormData,
) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    const service = createServiceRoleClient();
    const { error } = await service.rpc("configure_ris_assessment_definition", {
      p_definition_id: id(formData.get("definition_id"), "Toetsdefinitie"),
      p_actor: user.id,
      p_safety_critical_codes: values(formData, "safety_critical_code"),
      p_change_note: text(formData.get("change_note"), 1000),
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "definition-configured";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Toetsdefinitie opslaan mislukt.";
  }
  resultRedirect("toetsdefinities", versionId, { saved, error: failure });
}

export async function reviewRisAssessmentDefinitionAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    const reviewDecision = decision(formData.get("decision"));
    if (
      reviewDecision === "APPROVED" &&
      text(formData.get("approval_confirmation"), 100) !==
        "TOETSDEFINITIE GOEDGEKEURD"
    ) {
      throw new Error(
        "Typ exact ‘TOETSDEFINITIE GOEDGEKEURD’ om te ondertekenen.",
      );
    }
    const service = createServiceRoleClient();
    const { error } = await service.rpc("review_ris_assessment_definition", {
      p_definition_id: id(formData.get("definition_id"), "Toetsdefinitie"),
      p_actor: user.id,
      p_expected_content_hash: id(
        formData.get("content_hash"),
        "Definitiehash",
      ),
      p_decision: reviewDecision,
      p_reviewer_credentials: text(formData.get("reviewer_credentials"), 500),
      p_scenario_results: scenarioResults(formData, ASSESSMENT_SCENARIOS),
      p_limitation_note: text(formData.get("limitation_note"), 3000),
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved =
      reviewDecision === "APPROVED"
        ? "definition-approved"
        : reviewDecision === "CHANGES_REQUIRED"
          ? "definition-changes"
          : "definition-review";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Toetsbeoordeling opslaan mislukt.";
  }
  resultRedirect("toetsdefinities", versionId, { saved, error: failure });
}

export async function publishRisAssessmentDefinitionAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    if (
      text(formData.get("publication_confirmation"), 100) !==
      "TOETSDEFINITIE PUBLICEREN"
    ) {
      throw new Error(
        "Typ exact ‘TOETSDEFINITIE PUBLICEREN’ om te publiceren.",
      );
    }
    const service = createServiceRoleClient();
    const { error } = await service.rpc("publish_assessment_definition", {
      p_definition_id: id(formData.get("definition_id"), "Toetsdefinitie"),
      p_actor: user.id,
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "definition-published";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "Toetsdefinitie publiceren mislukt.";
  }
  resultRedirect("toetsdefinities", versionId, { saved, error: failure });
}

export async function publishRisCurriculumAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user } = await platformActor();
    if (
      text(formData.get("publication_confirmation"), 100) !==
      "RIS RELEASE PUBLICEREN"
    ) {
      throw new Error(
        "Typ exact ‘RIS RELEASE PUBLICEREN’ om het curriculum te publiceren.",
      );
    }
    const service = createServiceRoleClient();
    const { error } = await service.rpc("publish_curriculum_version", {
      p_curriculum_version_id: id(
        formData.get("curriculum_version_id"),
        "Curriculumversie",
      ),
      p_actor: user.id,
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "release-published";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "RIS-release publiceren mislukt.";
  }
  resultRedirect("release", versionId, { saved, error: failure });
}

export async function activateTenantRisReleaseAction(formData: FormData) {
  const versionId = text(formData.get("ris_version_id"), 80);
  let saved: string | undefined;
  let failure: string | undefined;
  try {
    const { user, tenant } = await platformActor();
    if (
      text(formData.get("activation_confirmation"), 100) !==
      "RIS VOOR TENANT ACTIVEREN"
    ) {
      throw new Error(
        "Typ exact ‘RIS VOOR TENANT ACTIVEREN’ om RIS te activeren.",
      );
    }
    const service = createServiceRoleClient();
    const report = await loadRisLegacyMigrationReport(service, tenant.id);
    if (!canActivateRisAfterMigration(report)) {
      throw new Error(
        report.blockingReasons.join(" ") ||
          "De legacy-migratiecontrole blokkeert RIS-activatie.",
      );
    }
    const { error } = await service.rpc("set_tenant_ris_settings", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_lesson_card_mode: "ris",
      p_active_ris_version_id: id(formData.get("ris_version_id"), "RIS-versie"),
      p_ai_assist_enabled: false,
    });
    if (error) throw new Error(error.message);
    revalidateRisManagement();
    saved = "tenant-activated";
  } catch (error) {
    failure = error instanceof Error ? error.message : "RIS activeren mislukt.";
  }
  resultRedirect("release", versionId, { saved, error: failure });
}
