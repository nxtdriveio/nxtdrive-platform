// RIS lesson card foundation.
//
// Pure helpers only: no IO, no Supabase dependency. The canonical RIS model is
// `N` (niet beoordeeld) followed by didactic instruction stages `1`..`8`.
// These stages describe the teaching/support sequence; they are not quality
// scores and are never averaged into readiness. Older null values are treated
// as `N` when read.

export type RISStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type RISStepValue = "N" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";

export type RISPhase =
  | "niet_beoordeeld"
  | "voorbereiding"
  | "begeleid"
  | "zelfstandig"
  | "transfer";

export type RISStepDefinition = {
  stepValue: RISStepValue;
  instructorLabel: string;
  studentLabel: string;
  explanation: string;
  phase: RISPhase;
  sortOrder: number;
};

export type RISTreeModule = {
  id: string;
  moduleNumber: number;
  title: string;
  description: string | null;
  sortOrder: number;
  categories: RISTreeCategory[];
};

export type RISTreeCategory = {
  id: string;
  moduleId: string;
  title: string;
  sortOrder: number;
  scripts: RISTreeScript[];
};

export type RISTreeScript = {
  id: string;
  moduleId: string;
  categoryId: string;
  scriptNumber: number;
  code: string;
  title: string;
  descriptionShort: string | null;
  sortOrder: number;
  isActive: boolean;
  variants: RISTreeScriptVariant[];
};

export type RISTreeScriptVariant = {
  id: string;
  scriptId: string;
  code: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
};

export type RISModuleRow = {
  id: string;
  module_number: number;
  title: string;
  description: string | null;
  sort_order: number;
};

export type RISCategoryRow = {
  id: string;
  ris_module_id: string;
  title: string;
  sort_order: number;
};

export type RISScriptRow = {
  id: string;
  module_id: string;
  category_id: string;
  script_number: number;
  code: string;
  title: string;
  description_short: string | null;
  sort_order: number;
  is_active: boolean;
};

export type RISScriptVariantRow = {
  id: string;
  script_id: string;
  code: string;
  title: string;
  sort_order: number;
  is_active: boolean;
};

export type RISProgressInput = {
  scriptId: string;
  moduleNumber: number;
  step: RISStepValue | null;
  isAttentionPoint?: boolean;
  isCritical?: boolean;
  performanceOutcome?:
    | "NOT_OBSERVED"
    | "ATTENTION_REQUIRED"
    | "DEVELOPING"
    | "SUFFICIENT"
    | "STABLE";
  supportLevel?:
    | "DIRECT_INSTRUCTION"
    | "PROMPTING"
    | "COACHING"
    | "OBSERVATION_ONLY";
  safetyStatus?: "NOT_ASSESSED" | "NO_BLOCKER" | "ATTENTION" | "BLOCKER";
  contextTags?: readonly string[];
  /**
   * @deprecated Historical display-only value. It is ignored by readiness and
   * can never override blockers.
   */
  readyForModuleTest?: boolean;
};

export type RISModuleProgress = {
  moduleNumber: number;
  totalScripts: number;
  assessedScripts: number;
  /** @deprecated RIS instruction stages are not averaged. New results are null. */
  averageStep: number | null;
  /** Coverage of assessed scripts; never a mastery/readiness percentage. */
  progressPct: number;
  attentionPoints: number;
  readyForModuleTest: boolean;
};

export type RISOverallProgress = {
  totalScripts: number;
  assessedScripts: number;
  /** @deprecated RIS instruction stages are not averaged. New results are null. */
  averageStep: number | null;
  progressPct: number;
  modules: RISModuleProgress[];
};

export type RISModuleReadiness = {
  moduleNumber: number;
  ready: boolean;
  blockers: string[];
  assessedScripts: number;
  totalScripts: number;
  /** @deprecated RIS instruction stages are not averaged. New results are null. */
  averageStep: number | null;
};

/** Highest didactic instruction stage; not a quality-score maximum. */
export const RIS_SCORE_MAX = 8;
/** @deprecated Readiness is no longer derived from an instruction stage. */
export const RIS_READY_SCORE = 8;

export const RIS_UNASSESSED_STEP_DEFINITION: RISStepDefinition = {
  stepValue: "N",
  instructorLabel: "Niet beoordeeld",
  studentLabel: "Nog niet beoordeeld",
  explanation: "Er is nog geen betrouwbare beoordeling vastgelegd.",
  phase: "niet_beoordeeld",
  sortOrder: 0,
};

export const RIS_STEP_DEFINITIONS: RISStepDefinition[] = [
  RIS_UNASSESSED_STEP_DEFINITION,
  {
    stepValue: "1",
    instructorLabel: "Huiswerk",
    studentLabel: "Je bereidt dit onderdeel voor",
    explanation:
      "De leerling bereidt het onderwerp voor met afgesproken huiswerk of voorkennis.",
    phase: "voorbereiding",
    sortOrder: 10,
  },
  {
    stepValue: "2",
    instructorLabel: "Motivatie en demonstratie",
    studentLabel: "Je krijgt uitleg en een demonstratie",
    explanation:
      "De instructeur motiveert het leerdoel, legt uit en demonstreert de uitvoering.",
    phase: "voorbereiding",
    sortOrder: 20,
  },
  {
    stepValue: "3",
    instructorLabel: "Doe mee met mij",
    studentLabel: "Je voert dit samen met je instructeur uit",
    explanation:
      "De leerling voert de handeling mee uit terwijl de instructeur actief voordoet en begeleidt.",
    phase: "begeleid",
    sortOrder: 30,
  },
  {
    stepValue: "4",
    instructorLabel: "Doe op aanwijzing",
    studentLabel: "Je voert dit op aanwijzing uit",
    explanation:
      "De leerling voert de handeling uit op concrete aanwijzingen van de instructeur.",
    phase: "begeleid",
    sortOrder: 40,
  },
  {
    stepValue: "5",
    instructorLabel: "Doe op minder aanwijzing",
    studentLabel: "Je hebt minder aanwijzingen nodig",
    explanation:
      "De instructeur bouwt aanwijzingen af; coaching blijft beschikbaar waar nodig.",
    phase: "begeleid",
    sortOrder: 50,
  },
  {
    stepValue: "6",
    instructorLabel: "Doe zonder aanwijzing",
    studentLabel: "Je voert dit zonder aanwijzing uit",
    explanation:
      "De leerling voert de handeling zonder voorafgaande aanwijzing uit; prestaties en veiligheid worden apart beoordeeld.",
    phase: "zelfstandig",
    sortOrder: 60,
  },
  {
    stepValue: "7",
    instructorLabel: "Gewijzigde omstandigheden",
    studentLabel: "Je oefent dit onder gewijzigde omstandigheden",
    explanation:
      "De leerling past de handeling toe wanneer één of meer omstandigheden doelgericht wijzigen.",
    phase: "transfer",
    sortOrder: 70,
  },
  {
    stepValue: "8",
    instructorLabel: "Wisselende situaties",
    studentLabel: "Je oefent dit in wisselende situaties",
    explanation:
      "De leerling past de handeling toe in wisselende situaties. Dit is geen kwaliteitscijfer of examenclaim.",
    phase: "transfer",
    sortOrder: 80,
  },
];

export function normalizeRisStep(value: unknown): RISStepValue | null {
  if (value === null || value === undefined || value === "") return "N";
  if (String(value).toUpperCase() === "N") return "N";
  const asNumber = typeof value === "number" ? value : Number(value);
  if (
    Number.isInteger(asNumber) &&
    asNumber >= 1 &&
    asNumber <= RIS_SCORE_MAX
  ) {
    return String(asNumber) as RISStepValue;
  }
  return null;
}

export function risStepNumber(
  step: RISStepValue | null | undefined,
): number | null {
  const normalized = normalizeRisStep(step);
  if (normalized === null || normalized === "N") return null;
  return Number(normalized);
}

export function translateRisStepForStudent(
  step: RISStepValue | null | undefined,
  definitions: readonly RISStepDefinition[] = RIS_STEP_DEFINITIONS,
): RISStepDefinition {
  const normalized = normalizeRisStep(step);
  if (!normalized) {
    return RIS_UNASSESSED_STEP_DEFINITION;
  }
  return (
    definitions.find((definition) => definition.stepValue === normalized) ??
    RIS_UNASSESSED_STEP_DEFINITION
  );
}

export function buildRisTree(input: {
  modules: readonly RISModuleRow[];
  categories: readonly RISCategoryRow[];
  scripts: readonly RISScriptRow[];
  variants?: readonly RISScriptVariantRow[];
}): RISTreeModule[] {
  const variantsByScript = new Map<string, RISTreeScriptVariant[]>();
  for (const variant of input.variants ?? []) {
    const list = variantsByScript.get(variant.script_id) ?? [];
    list.push({
      id: variant.id,
      scriptId: variant.script_id,
      code: variant.code,
      title: variant.title,
      sortOrder: variant.sort_order,
      isActive: variant.is_active,
    });
    variantsByScript.set(variant.script_id, list);
  }

  const scriptsByCategory = new Map<string, RISTreeScript[]>();
  for (const script of input.scripts) {
    const list = scriptsByCategory.get(script.category_id) ?? [];
    list.push({
      id: script.id,
      moduleId: script.module_id,
      categoryId: script.category_id,
      scriptNumber: script.script_number,
      code: script.code,
      title: script.title,
      descriptionShort: script.description_short,
      sortOrder: script.sort_order,
      isActive: script.is_active,
      variants: (variantsByScript.get(script.id) ?? []).sort(
        bySortOrderThenTitle,
      ),
    });
    scriptsByCategory.set(script.category_id, list);
  }

  const categoriesByModule = new Map<string, RISTreeCategory[]>();
  for (const category of input.categories) {
    const list = categoriesByModule.get(category.ris_module_id) ?? [];
    list.push({
      id: category.id,
      moduleId: category.ris_module_id,
      title: category.title,
      sortOrder: category.sort_order,
      scripts: (scriptsByCategory.get(category.id) ?? []).sort(
        bySortOrderThenTitle,
      ),
    });
    categoriesByModule.set(category.ris_module_id, list);
  }

  return input.modules
    .map((module) => ({
      id: module.id,
      moduleNumber: module.module_number,
      title: module.title,
      description: module.description,
      sortOrder: module.sort_order,
      categories: (categoriesByModule.get(module.id) ?? []).sort(
        bySortOrderThenTitle,
      ),
    }))
    .sort(bySortOrderThenTitle);
}

export function computeRisProgress(
  input: readonly RISProgressInput[],
): RISOverallProgress {
  const modules = new Map<number, RISProgressInput[]>();
  for (const item of input) {
    const list = modules.get(item.moduleNumber) ?? [];
    list.push(item);
    modules.set(item.moduleNumber, list);
  }

  const moduleResults = [...modules.entries()]
    .sort(([left], [right]) => left - right)
    .map(([moduleNumber, items]) =>
      computeRisModuleProgress(moduleNumber, items),
    );

  const totalScripts = input.length;
  const assessedScripts = input.filter(
    (item) => risStepNumber(item.step) !== null,
  ).length;
  const progressPct =
    totalScripts === 0 ? 0 : Math.round((assessedScripts / totalScripts) * 100);

  return {
    totalScripts,
    assessedScripts,
    averageStep: null,
    progressPct,
    modules: moduleResults,
  };
}

export function computeRisModuleReadiness(
  moduleNumber: number,
  items: readonly RISProgressInput[],
  _minimumStepDeprecated = 6,
): RISModuleReadiness {
  const progress = computeRisModuleProgress(moduleNumber, items);
  const blockers: string[] = [];
  if (progress.totalScripts === 0) {
    blockers.push("Deze module heeft nog geen RIS-scripts.");
  }
  if (progress.assessedScripts < progress.totalScripts) {
    blockers.push("Nog niet alle scripts in deze module zijn beoordeeld.");
  }
  const missingPerformance = items.filter(
    (item) =>
      !item.performanceOutcome || item.performanceOutcome === "NOT_OBSERVED",
  ).length;
  if (missingPerformance > 0) {
    blockers.push(
      `${missingPerformance} ${missingPerformance === 1 ? "script heeft" : "scripts hebben"} nog geen aparte prestatiebeoordeling.`,
    );
  }
  const belowPerformance = items.filter(
    (item) =>
      item.performanceOutcome === "ATTENTION_REQUIRED" ||
      item.performanceOutcome === "DEVELOPING",
  ).length;
  if (belowPerformance > 0) {
    blockers.push(
      `${belowPerformance} ${belowPerformance === 1 ? "script vraagt" : "scripts vragen"} nog beheersingsontwikkeling.`,
    );
  }
  const safetyBlockers = items.filter(
    (item) =>
      item.safetyStatus === "BLOCKER" || item.safetyStatus === "ATTENTION",
  ).length;
  if (safetyBlockers > 0) {
    blockers.push(
      `${safetyBlockers} open ${safetyBlockers === 1 ? "veiligheidspunt" : "veiligheidspunten"}.`,
    );
  }
  const criticalSafetyUnknown = items.filter(
    (item) =>
      item.isCritical &&
      (!item.safetyStatus || item.safetyStatus === "NOT_ASSESSED"),
  ).length;
  if (criticalSafetyUnknown > 0) {
    blockers.push(
      `${criticalSafetyUnknown} kritieke ${criticalSafetyUnknown === 1 ? "competentie heeft" : "competenties hebben"} geen expliciete veiligheidsbeoordeling.`,
    );
  }
  if (progress.attentionPoints > 0) {
    blockers.push(
      `${progress.attentionPoints} aandachtspunt${progress.attentionPoints === 1 ? "" : "en"} open.`,
    );
  }

  return {
    moduleNumber,
    ready: blockers.length === 0,
    blockers,
    assessedScripts: progress.assessedScripts,
    totalScripts: progress.totalScripts,
    averageStep: progress.averageStep,
  };
}

function computeRisModuleProgress(
  moduleNumber: number,
  items: readonly RISProgressInput[],
): RISModuleProgress {
  const totalScripts = items.length;
  const assessedScripts = items.filter(
    (item) => risStepNumber(item.step) !== null,
  ).length;
  const progressPct =
    totalScripts === 0 ? 0 : Math.round((assessedScripts / totalScripts) * 100);
  const attentionPoints = items.filter((item) => item.isAttentionPoint).length;
  const observationComplete =
    totalScripts > 0 &&
    items.every(
      (item) =>
        risStepNumber(item.step) !== null &&
        item.performanceOutcome !== undefined &&
        item.performanceOutcome !== "NOT_OBSERVED" &&
        item.safetyStatus !== undefined,
    );
  const performanceMet = items.every(
    (item) =>
      item.performanceOutcome === "SUFFICIENT" ||
      item.performanceOutcome === "STABLE",
  );
  const safetyClear = items.every(
    (item) =>
      item.safetyStatus === "NO_BLOCKER" ||
      (!item.isCritical && item.safetyStatus === "NOT_ASSESSED"),
  );

  return {
    moduleNumber,
    totalScripts,
    assessedScripts,
    averageStep: null,
    progressPct,
    attentionPoints,
    readyForModuleTest:
      observationComplete &&
      performanceMet &&
      safetyClear &&
      attentionPoints === 0,
  };
}

function bySortOrderThenTitle<T extends { sortOrder: number; title: string }>(
  left: T,
  right: T,
): number {
  return (
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title)
  );
}
