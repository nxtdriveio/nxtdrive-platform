import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Examenflow A — tenant-configureerbaar examenvoorbereidingsbeleid.
//
// De standaard documentenlijst en de tips voor de examendag worden per rijschool
// ingesteld via tenant_settings (key `exam_preparation_policy`), nooit hardcoded.
// Deze module geeft een veilige lees/merge-laag: een ontbrekende of malformede
// instelling valt altijd terug op platform-defaults, zodat een nieuwe tenant
// (of een corrupte write) nooit zonder bruikbare voorbereiding komt te zitten.
// Spiegelt het lead_score_policy / cancellation_policy patroon.
// ---------------------------------------------------------------------------

export const EXAM_PREP_POLICY_KEY = "exam_preparation_policy";

/** Een standaard-document in het beleid (zonder afvinkstatus). */
export type ExamPolicyDocument = {
  code: string;
  label: string;
};

export type ExamPreparationPolicy = {
  required_documents: ExamPolicyDocument[];
  exam_day_tips: string[];
};

// Platform-defaults: een nieuwe rijschool start hiermee. Algemeen gehouden —
// nooit op één specifieke rijschool toegesneden.
export const DEFAULT_EXAM_PREP_POLICY: ExamPreparationPolicy = {
  required_documents: [
    { code: "id", label: "Geldig identiteitsbewijs (paspoort, ID-kaart of rijbewijs)" },
    { code: "theory_certificate", label: "Geldig theoriecertificaat" },
    { code: "glasses", label: "Bril of lenzen (indien van toepassing)" },
  ],
  exam_day_tips: [
    "Zorg dat je goed uitgerust en ruim op tijd bent.",
    "Neem een geldig identiteitsbewijs mee.",
    "Blijf rustig en rijd zoals je het geleerd hebt.",
    "Stel gerust vragen als een instructie onduidelijk is.",
  ],
};

const MAX_DOCUMENTS = 20;
const MAX_TIPS = 20;
const MAX_LABEL_LEN = 200;
const MAX_CODE_LEN = 60;
const MAX_TIP_LEN = 300;

function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, maxLen);
}

function defaultDocuments(): ExamPolicyDocument[] {
  return DEFAULT_EXAM_PREP_POLICY.required_documents.map((d) => ({ ...d }));
}

/**
 * Merge een onvertrouwde tenant-override op de platform-defaults. Saneert elke
 * waarde en levert altijd een compleet, geldig beleid.
 *
 * - `required_documents`: elk item moet een niet-lege `code` + `label` hebben;
 *   malformede items vallen af, dubbele codes worden gededupliceerd (eerste
 *   wint). Een expliciete lege array blijft behouden (bewuste "geen documenten");
 *   alleen een ontbrekende/ongeldige sleutel valt terug op de defaults.
 * - `exam_day_tips`: niet-lege strings, gededupliceerd; een lege array blijft
 *   behouden, een ontbrekende/ongeldige sleutel valt terug op de defaults.
 */
export function mergeExamPrepPolicy(override: unknown): ExamPreparationPolicy {
  if (!override || typeof override !== "object") {
    return {
      required_documents: defaultDocuments(),
      exam_day_tips: [...DEFAULT_EXAM_PREP_POLICY.exam_day_tips],
    };
  }
  const o = override as Record<string, unknown>;

  let documents: ExamPolicyDocument[];
  if (Array.isArray(o.required_documents)) {
    const seen = new Set<string>();
    const collected: ExamPolicyDocument[] = [];
    for (const raw of o.required_documents) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const code = cleanString(r.code, MAX_CODE_LEN);
      const label = cleanString(r.label, MAX_LABEL_LEN);
      if (!code || !label) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      collected.push({ code, label });
    }
    documents = collected.slice(0, MAX_DOCUMENTS);
  } else {
    documents = defaultDocuments();
  }

  let tips: string[];
  if (Array.isArray(o.exam_day_tips)) {
    const seen = new Set<string>();
    const collected: string[] = [];
    for (const raw of o.exam_day_tips) {
      const tip = cleanString(raw, MAX_TIP_LEN);
      if (!tip) continue;
      if (seen.has(tip)) continue;
      seen.add(tip);
      collected.push(tip);
    }
    tips = collected.slice(0, MAX_TIPS);
  } else {
    tips = [...DEFAULT_EXAM_PREP_POLICY.exam_day_tips];
  }

  return { required_documents: documents, exam_day_tips: tips };
}

/**
 * Lees het examenvoorbereidingsbeleid van de tenant. De client moet
 * tenant_settings voor deze tenant kunnen lezen (RLS staat tenantleden toe;
 * service role werkt ook). Valt bij elke leesfout terug op de platform-defaults.
 */
export async function loadExamPrepPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<ExamPreparationPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", EXAM_PREP_POLICY_KEY)
    .maybeSingle();
  if (error) return mergeExamPrepPolicy(null);
  return mergeExamPrepPolicy(data?.value ?? null);
}
