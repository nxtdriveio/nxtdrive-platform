import type { ReadinessResult } from "@workspace/leskaart";
import { ADVICE_LABELS, PHASE_LABELS } from "@workspace/leskaart";
import { getOpenAIClient, AI_MODEL, AI_MAX_TOKENS } from "./client";

/**
 * Leskaart L6 — ADVISORY AI on top of the structured leskaart data (L0–L4) and
 * the L1 readiness engine. These helpers only shape a prompt from data the
 * instructor already entered and ask the model for a draft / analysis. Nothing
 * here is binding: the caller surfaces every result as editable advies. No data
 * is persisted here.
 */

/** Shared one-line advisory disclaimer for any AI output. */
export const AI_ADVIES_DISCLAIMER =
  "AI-gegenereerd advies op basis van de ingevoerde leskaartgegevens. " +
  "Controleer en pas aan waar nodig — de instructeur beslist.";

export type LessonReportInput = {
  studentName: string;
  notes: string;
  todaySkills: { label: string; score: number }[];
  attentionPoints?: string | null;
};

/**
 * Turns the instructor's short jottings into a polished, professional Dutch
 * lesson report. Returns plain text intended to land in an editable textarea.
 */
export async function generateLessonReportDraft(
  input: LessonReportInput,
): Promise<string> {
  const notes = input.notes.trim();
  if (!notes) {
    throw new Error("Voer eerst korte notities in om een lesverslag te maken.");
  }

  const system = [
    "Je bent een Nederlandse rijschool-assistent die rij-instructeurs helpt een",
    "professioneel, beknopt lesverslag te schrijven voor een rijles (rijbewijs B).",
    "Schrijf in het Nederlands, zakelijk en constructief, in de derde persoon over",
    "de leerling. Gebruik 2 tot 4 korte alinea's: wat er behandeld is, wat goed",
    "ging, en aandachtspunten of de volgende stap. Verzin geen feiten die niet uit",
    "de aangeleverde informatie volgen. Geen markdown-opmaak of kopjes met symbolen.",
  ].join(" ");

  const parts: string[] = [`Leerling: ${input.studentName}`];
  if (input.todaySkills.length > 0) {
    parts.push(
      "Vandaag beoordeelde onderdelen (cijfer 1-10): " +
        input.todaySkills.map((s) => `${s.label} (${s.score})`).join("; "),
    );
  }
  if (input.attentionPoints && input.attentionPoints.trim()) {
    parts.push(`Bestaande aandachtspunten: ${input.attentionPoints.trim()}`);
  }
  parts.push(`Korte notities van de instructeur:\n${notes}`);

  const completion = await getOpenAIClient().chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: AI_MAX_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: parts.join("\n") },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("De AI gaf geen lesverslag terug. Probeer het opnieuw.");
  }
  return text;
}

export type WeakSkill = {
  label: string;
  score: number | null;
  isCritical: boolean;
};

export type ProgressAnalysisInput = {
  studentName: string;
  readiness: ReadinessResult;
  weakestSkills: WeakSkill[];
};

export type ProgressAnalysis = {
  zwakkePunten: { onderdeel: string; observatie: string; advies: string }[];
  slagingskans: { indicatie: string; onderbouwing: string };
  planning: string[];
};

/**
 * Produces an advisory analysis (weak areas, qualitative success-chance, and
 * non-binding planning suggestions) purely from the structured readiness verdict
 * and the weakest scored skills. Qualitative success-chance ("Laag/Gemiddeld/
 * Hoog") avoids false numerical precision.
 */
export async function analyzeStudentProgress(
  input: ProgressAnalysisInput,
): Promise<ProgressAnalysis> {
  const { readiness } = input;

  const system = [
    "Je bent een Nederlandse rijschool-assistent die een rij-instructeur",
    "adviseert over de voortgang van een leerling richting het CBR-praktijkexamen",
    "(rijbewijs B). Je geeft uitsluitend advies; de instructeur beslist. Baseer je",
    "analyse alleen op de aangeleverde gegevens en verzin niets. Antwoord in het",
    "Nederlands. Geef ALLEEN geldige JSON terug met exact deze structuur:",
    '{"zwakkePunten":[{"onderdeel":string,"observatie":string,"advies":string}],',
    '"slagingskans":{"indicatie":"Laag"|"Gemiddeld"|"Hoog","onderbouwing":string},',
    '"planning":[string]}.',
    "zwakkePunten: maximaal 5 items, gericht op de laagste of kritieke onderdelen.",
    "planning: 2 tot 4 niet-bindende suggesties voor de focus van komende lessen.",
    "Houd elke tekst kort en concreet.",
  ].join(" ");

  const lines: string[] = [];
  lines.push(`Leerling: ${input.studentName}`);
  lines.push(
    `Examenrijpheid-advies (L1): ${ADVICE_LABELS[readiness.advice]} ` +
      `(${readiness.readinessPct}% rijpheid, fase ${PHASE_LABELS[readiness.phase]}).`,
  );
  lines.push(
    `Gemiddeld cijfer: ${readiness.averageScore.toFixed(1)} over ` +
      `${readiness.scoredLeaves}/${readiness.totalLeaves} beoordeelde onderdelen.`,
  );
  lines.push(
    `Stabiliteit laatste lessen: ${
      readiness.stability.stable ? "stabiel" : "wisselend"
    }.`,
  );
  if (readiness.blockers.length > 0) {
    lines.push(`Openstaande blokkers: ${readiness.blockers.join("; ")}.`);
  }
  if (input.weakestSkills.length > 0) {
    lines.push(
      "Zwakste onderdelen: " +
        input.weakestSkills
          .map(
            (s) =>
              `${s.label} (${s.score == null ? "niet beoordeeld" : `cijfer ${s.score}`}` +
              `${s.isCritical ? ", kritiek" : ""})`,
          )
          .join("; ") +
        ".",
    );
  }

  const completion = await getOpenAIClient().chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: AI_MAX_TOKENS,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: lines.join("\n") },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("De AI gaf geen analyse terug. Probeer het opnieuw.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("De AI-analyse kon niet worden verwerkt. Probeer het opnieuw.");
  }
  return normalizeAnalysis(parsed);
}

function normalizeAnalysis(value: unknown): ProgressAnalysis {
  const obj = (value ?? {}) as Record<string, unknown>;

  const zwakkePunten = Array.isArray(obj.zwakkePunten)
    ? obj.zwakkePunten
        .map((item) => {
          const r = (item ?? {}) as Record<string, unknown>;
          return {
            onderdeel: String(r.onderdeel ?? "").trim(),
            observatie: String(r.observatie ?? "").trim(),
            advies: String(r.advies ?? "").trim(),
          };
        })
        .filter((p) => p.onderdeel || p.observatie || p.advies)
        .slice(0, 5)
    : [];

  const sk = (obj.slagingskans ?? {}) as Record<string, unknown>;
  const indicatieRaw = String(sk.indicatie ?? "").trim();
  const indicatie = ["Laag", "Gemiddeld", "Hoog"].includes(indicatieRaw)
    ? indicatieRaw
    : "Gemiddeld";
  const slagingskans = {
    indicatie,
    onderbouwing: String(sk.onderbouwing ?? "").trim(),
  };

  const planning = Array.isArray(obj.planning)
    ? obj.planning
        .map((p) => String(p ?? "").trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return { zwakkePunten, slagingskans, planning };
}
