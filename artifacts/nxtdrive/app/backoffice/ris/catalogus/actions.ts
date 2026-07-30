"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

const SCENARIOS = [
  {
    key: "catalog_structure",
    label: "Vier modules en 46 actieve scripts zijn inhoudelijk gecontroleerd.",
  },
  {
    key: "script_content",
    label: "Scriptnamen, omschrijvingen en varianten zijn gecontroleerd.",
  },
  {
    key: "step_content",
    label: "N en instructiestappen 1–8 zijn didactisch gecontroleerd.",
  },
  {
    key: "module_test_logic",
    label: "De relatie met moduletoetsen en CBR-momenten is gecontroleerd.",
  },
  {
    key: "source_rights",
    label: "Bronvermelding en gebruiksrechten zijn gecontroleerd.",
  },
] as const;

function text(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, maxLength) : null;
}

function reviewRedirect(
  versionId: string | null,
  result: { saved?: string; error?: string },
): never {
  const params = new URLSearchParams();
  if (versionId) params.set("version", versionId);
  if (result.saved) params.set("saved", result.saved);
  if (result.error) params.set("error", result.error);
  redirect(`/backoffice/ris/catalogus?${params.toString()}`);
}

export async function reviewRisCatalogAction(formData: FormData) {
  const risVersionId = text(formData.get("ris_version_id"), 80);
  const { user } = await requireActiveTenant(["tenant_admin"]);
  let saved: string | undefined;
  let failure: string | undefined;

  try {
    if (user.profile?.is_platform_admin !== true) {
      throw new Error(
        "Alleen een platformbeheerder kan een deskundigenbeoordeling registreren.",
      );
    }

    if (!risVersionId) throw new Error("RIS-catalogusversie ontbreekt.");
    const expectedContentHash = text(formData.get("content_hash"), 128);
    if (!expectedContentHash) throw new Error("Catalogushash ontbreekt.");

    const decisionRaw = text(formData.get("decision"), 40)?.toUpperCase();
    const decision =
      decisionRaw === "IN_REVIEW" ||
      decisionRaw === "CHANGES_REQUIRED" ||
      decisionRaw === "APPROVED"
        ? decisionRaw
        : null;
    if (!decision) throw new Error("Kies een geldige beoordelingsuitkomst.");

    const credentials = text(formData.get("reviewer_credentials"), 500);
    const limitationNote = text(formData.get("limitation_note"), 3000);
    const changeNote = text(formData.get("change_note"), 1000);
    const scenarioResults = SCENARIOS.map((scenario) => ({
      ...scenario,
      passed: formData.get(`scenario_${scenario.key}`) === "on",
    }));

    if (decision === "APPROVED") {
      if (!credentials) {
        throw new Error(
          "Vul de relevante RIS-bevoegdheid en deskundigenkwalificatie in.",
        );
      }
      if (scenarioResults.some((scenario) => !scenario.passed)) {
        throw new Error(
          "Alle vijf validatieonderdelen moeten zijn gecontroleerd voor goedkeuring.",
        );
      }
      if (
        text(formData.get("approval_confirmation"), 80) !==
        "RIS CATALOGUS GOEDGEKEURD"
      ) {
        throw new Error(
          "Typ exact ‘RIS CATALOGUS GOEDGEKEURD’ om digitaal te ondertekenen.",
        );
      }
    }
    if (decision === "CHANGES_REQUIRED" && !limitationNote) {
      throw new Error("Beschrijf welke wijzigingen nodig zijn.");
    }

    const service = createServiceRoleClient();
    const { error } = await service.rpc("review_ris_catalog", {
      p_ris_version_id: risVersionId,
      p_actor: user.id,
      p_expected_content_hash: expectedContentHash,
      p_decision: decision,
      p_reviewer_credentials: credentials,
      p_scenario_results: scenarioResults,
      p_limitation_note: limitationNote,
      p_change_note: changeNote,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/backoffice/ris");
    revalidatePath("/backoffice/ris/catalogus");
    saved =
      decision === "APPROVED"
        ? "approved"
        : decision === "CHANGES_REQUIRED"
          ? "changes"
          : "review";
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : "RIS-catalogusbeoordeling opslaan mislukt.";
  }

  reviewRedirect(risVersionId, { saved, error: failure });
}
