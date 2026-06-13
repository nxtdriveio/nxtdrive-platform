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
    "Schrijf in het Nederlands rechtstreeks tegen de leerling in de tweede persoon",
    "(je/jij/jouw). Houd de toon vriendelijk, menselijk en licht informeel, maar",
    "wel professioneel en constructief. Gebruik 2 tot 4 korte alinea's: wat er",
    "behandeld is, wat goed ging, en aandachtspunten of de volgende stap.",
    "Verzin geen feiten die niet uit de aangeleverde informatie volgen. Gebruik",
    "geen markdown-opmaak of kopjes met symbolen. Vermijd afstandelijke formuleringen",
    "in de derde persoon zoals 'de leerling' of het herhalen van de volledige naam,",
    "tenzij dat echt nodig is.",
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

// ---------------------------------------------------------------------------
// Module 15 — AI-pakketadvies (lead detail). Combines the structured intake
// analysis profile with the tenant's REAL active packages and asks the model to
// propose the best-fitting package + rationale + an evaluation moment. Advisory
// only: nothing is persisted, and the model may only recommend from the
// packages that are actually passed in.
// ---------------------------------------------------------------------------

export type PackageOption = {
  name: string;
  creditsTotal: number;
  priceCents: number;
  category: string;
  validDays: number | null;
};

export type PackageAdviceInput = {
  leadName: string;
  profileSummary: string;
  labels: string[];
  attentionPoints: string[];
  recommendedStep: string;
  packages: PackageOption[];
};

export type PackageAdvice = {
  aanbevolenPakket: string | null;
  onderbouwing: string;
  alternatief: { pakket: string; onderbouwing: string } | null;
  evaluatiemoment: string;
};

function eurosFromCents(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/**
 * Proposes a package for a lead based on the intake-analysis profile and the
 * tenant's actual active packages. The recommendation is constrained to the
 * provided package names; the result is advisory and never auto-applied.
 */
export async function generatePackageAdvice(
  input: PackageAdviceInput,
): Promise<PackageAdvice> {
  if (input.packages.length === 0) {
    throw new Error(
      "Er zijn geen actieve pakketten om een advies op te baseren.",
    );
  }

  const allowed = input.packages.map((p) => p.name);

  const system = [
    "Je bent een Nederlandse rijschool-assistent die de backoffice adviseert over",
    "welk lespakket het beste past bij een nieuwe lead, op basis van het",
    "intake-profiel en de daadwerkelijk beschikbare pakketten. Je geeft uitsluitend",
    "advies; de rijschool beslist. Kies ALLEEN uit de aangeleverde pakketten en",
    "gebruik exact dezelfde pakketnaam. Verzin geen pakketten, prijzen of feiten.",
    "Antwoord in het Nederlands. Geef ALLEEN geldige JSON terug met exact deze",
    'structuur: {"aanbevolenPakket":string,"onderbouwing":string,',
    '"alternatief":{"pakket":string,"onderbouwing":string}|null,',
    '"evaluatiemoment":string}.',
    "onderbouwing: kort en concreet, gekoppeld aan het profiel (ervaring, tempo,",
    "aandachtspunten). alternatief: een tweede passend pakket of null. ",
    "evaluatiemoment: één concrete suggestie wanneer het pakket geëvalueerd moet",
    "worden (bv. na een aantal lessen of bij een mijlpaal).",
  ].join(" ");

  const lines: string[] = [];
  lines.push(`Lead: ${input.leadName}`);
  lines.push(`Intake-profiel: ${input.profileSummary}`);
  if (input.labels.length > 0) {
    lines.push(`Labels: ${input.labels.join(", ")}.`);
  }
  if (input.attentionPoints.length > 0) {
    lines.push(`Aandachtspunten: ${input.attentionPoints.join("; ")}.`);
  }
  if (input.recommendedStep) {
    lines.push(`Aanbevolen vervolgstap uit intake: ${input.recommendedStep}.`);
  }
  lines.push("Beschikbare pakketten:");
  for (const p of input.packages) {
    lines.push(
      `- ${p.name} — ${p.creditsTotal} min tegoed, ${eurosFromCents(p.priceCents)}` +
        `, categorie ${p.category}` +
        (p.validDays != null ? `, geldig ${p.validDays} dagen` : "") +
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
    throw new Error("De AI gaf geen pakketadvies terug. Probeer het opnieuw.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Het AI-pakketadvies kon niet worden verwerkt. Probeer het opnieuw.",
    );
  }
  return normalizePackageAdvice(parsed, allowed);
}

function matchAllowed(value: unknown, allowed: string[]): string | null {
  const name = String(value ?? "").trim();
  if (!name) return null;
  const exact = allowed.find((a) => a === name);
  if (exact) return exact;
  const ci = allowed.find((a) => a.toLowerCase() === name.toLowerCase());
  return ci ?? null;
}

function normalizePackageAdvice(
  value: unknown,
  allowed: string[],
): PackageAdvice {
  const obj = (value ?? {}) as Record<string, unknown>;

  const aanbevolenPakket = matchAllowed(obj.aanbevolenPakket, allowed);

  const altRaw = (obj.alternatief ?? null) as Record<string, unknown> | null;
  let alternatief: PackageAdvice["alternatief"] = null;
  if (altRaw) {
    const altPkg = matchAllowed(altRaw.pakket, allowed);
    const altText = String(altRaw.onderbouwing ?? "").trim();
    if (altPkg && altPkg !== aanbevolenPakket) {
      alternatief = { pakket: altPkg, onderbouwing: altText };
    }
  }

  return {
    aanbevolenPakket,
    onderbouwing: String(obj.onderbouwing ?? "").trim(),
    alternatief,
    evaluatiemoment: String(obj.evaluatiemoment ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Module 15 — AI interne aandachtspunten (instructor cockpit, staff-only).
// Summarizes recurring attention points across recent lessons + notes and gives
// concrete advice for the next lesson. This is an internal staff aid, kept
// visually and functionally separate from the student-facing lesson report.
// Advisory only: nothing is persisted.
// ---------------------------------------------------------------------------

export type InternalAttentionInput = {
  studentName: string;
  attentionPoints: string[];
  recentNotes: string[];
  weakestSkills: WeakSkill[];
  readiness: ReadinessResult;
};

export type InternalAttention = {
  terugkerendePunten: { thema: string; observatie: string }[];
  adviesVolgendeLes: string[];
  samenvatting: string;
};

/**
 * Internal staff summary of recurring attention points + advice for the next
 * lesson, derived from the structured lesson data the instructor already
 * produced. Returns concrete, non-binding guidance. Nothing is persisted.
 */
export async function generateInternalAttention(
  input: InternalAttentionInput,
): Promise<InternalAttention> {
  const hasSignal =
    input.attentionPoints.length > 0 ||
    input.recentNotes.length > 0 ||
    input.weakestSkills.length > 0;
  if (!hasSignal) {
    throw new Error(
      "Nog te weinig gegevens (lessen, notities of cijfers) voor een interne analyse.",
    );
  }

  const system = [
    "Je bent een Nederlandse rijschool-assistent die een rij-instructeur intern",
    "ondersteunt. Vat de TERUGKERENDE aandachtspunten van een leerling samen over",
    "de afgelopen lessen en geef concreet advies voor de volgende les. Dit is een",
    "interne notitie voor de instructeur — niet voor de leerling. Je geeft",
    "uitsluitend advies; de instructeur beslist. Baseer je alleen op de",
    "aangeleverde gegevens en verzin niets. Antwoord in het Nederlands. Geef ALLEEN",
    "geldige JSON terug met exact deze structuur:",
    '{"terugkerendePunten":[{"thema":string,"observatie":string}],',
    '"adviesVolgendeLes":[string],"samenvatting":string}.',
    "terugkerendePunten: maximaal 5 thema's die meerdere keren terugkomen.",
    "adviesVolgendeLes: 2 tot 4 concrete, niet-bindende suggesties. samenvatting:",
    "één korte alinea. Houd alles bondig.",
  ].join(" ");

  const lines: string[] = [];
  lines.push(`Leerling: ${input.studentName}`);
  lines.push(
    `Examenrijpheid-advies (L1): ${ADVICE_LABELS[input.readiness.advice]} ` +
      `(${input.readiness.readinessPct}% rijpheid, fase ${PHASE_LABELS[input.readiness.phase]}).`,
  );
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
  if (input.attentionPoints.length > 0) {
    lines.push("Aandachtspunten uit eerdere lessen:");
    for (const a of input.attentionPoints) lines.push(`- ${a}`);
  }
  if (input.recentNotes.length > 0) {
    lines.push("Recente lesnotities:");
    for (const n of input.recentNotes) lines.push(`- ${n}`);
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
    throw new Error("De AI gaf geen interne analyse terug. Probeer het opnieuw.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "De interne AI-analyse kon niet worden verwerkt. Probeer het opnieuw.",
    );
  }
  return normalizeInternalAttention(parsed);
}

function normalizeInternalAttention(value: unknown): InternalAttention {
  const obj = (value ?? {}) as Record<string, unknown>;

  const terugkerendePunten = Array.isArray(obj.terugkerendePunten)
    ? obj.terugkerendePunten
        .map((item) => {
          const r = (item ?? {}) as Record<string, unknown>;
          return {
            thema: String(r.thema ?? "").trim(),
            observatie: String(r.observatie ?? "").trim(),
          };
        })
        .filter((p) => p.thema || p.observatie)
        .slice(0, 5)
    : [];

  const adviesVolgendeLes = Array.isArray(obj.adviesVolgendeLes)
    ? obj.adviesVolgendeLes
        .map((a) => String(a ?? "").trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    terugkerendePunten,
    adviesVolgendeLes,
    samenvatting: String(obj.samenvatting ?? "").trim(),
  };
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
