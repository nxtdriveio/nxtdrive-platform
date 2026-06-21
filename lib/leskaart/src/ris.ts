// RIS lesson card foundation.
//
// Pure helpers only: no IO, no Supabase dependency. The database stores RIS
// scores as text (`1`..`10`). An empty/null value means "not assessed yet";
// concepts, published scores and student translations use the same contract.

export type RISStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type RISStepValue =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10";

export type RISPhase = "geen_score" | "cognitief" | "associatief" | "geautomatiseerd";

export type RISStepDefinition = {
  stepValue: RISStepValue | null;
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
  readyForModuleTest?: boolean;
};

export type RISModuleProgress = {
  moduleNumber: number;
  totalScripts: number;
  assessedScripts: number;
  averageStep: number | null;
  progressPct: number;
  attentionPoints: number;
  readyForModuleTest: boolean;
};

export type RISOverallProgress = {
  totalScripts: number;
  assessedScripts: number;
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
  averageStep: number | null;
};

export const RIS_SCORE_MAX = 10;
export const RIS_READY_SCORE = 8;

export const RIS_UNASSESSED_STEP_DEFINITION: RISStepDefinition = {
  stepValue: null,
  instructorLabel: "Niet beoordeeld",
  studentLabel: "Nog niet beoordeeld",
  explanation: "Er is nog geen betrouwbare beoordeling vastgelegd.",
  phase: "geen_score",
  sortOrder: 0,
};

export const RIS_STEP_DEFINITIONS: RISStepDefinition[] = [
  {
    stepValue: "1",
    instructorLabel: "Startniveau",
    studentLabel: "Je maakt kennis met dit onderdeel",
    explanation: "De leerling herkent het onderdeel, maar voert het nog niet betrouwbaar uit.",
    phase: "cognitief",
    sortOrder: 10,
  },
  {
    stepValue: "2",
    instructorLabel: "Met veel hulp",
    studentLabel: "Je oefent dit met veel hulp",
    explanation: "De leerling voert het onderdeel alleen uit met voortdurende aanwijzingen.",
    phase: "cognitief",
    sortOrder: 20,
  },
  {
    stepValue: "3",
    instructorLabel: "Met hulp",
    studentLabel: "Je voert dit met hulp uit",
    explanation: "De leerling begrijpt de opdracht en voert uit met duidelijke begeleiding.",
    phase: "cognitief",
    sortOrder: 30,
  },
  {
    stepValue: "4",
    instructorLabel: "Onder begeleiding",
    studentLabel: "Je doet dit al deels zelf",
    explanation: "De leerling voert delen zelfstandig uit, maar correctie blijft nodig.",
    phase: "associatief",
    sortOrder: 40,
  },
  {
    stepValue: "5",
    instructorLabel: "Redelijk zelfstandig",
    studentLabel: "Je rijdt dit redelijk zelfstandig",
    explanation: "De leerling voert de basis meestal zelfstandig uit met beperkte aanwijzingen.",
    phase: "associatief",
    sortOrder: 50,
  },
  {
    stepValue: "6",
    instructorLabel: "Voldoende",
    studentLabel: "Je kunt dit zelfstandig uitvoeren",
    explanation: "De leerling voert het onderdeel zelfstandig, veilig en voldoende stabiel uit.",
    phase: "associatief",
    sortOrder: 60,
  },
  {
    stepValue: "7",
    instructorLabel: "Goed",
    studentLabel: "Je past dit goed toe",
    explanation: "De leerling past het onderdeel goed toe in verschillende situaties.",
    phase: "geautomatiseerd",
    sortOrder: 70,
  },
  {
    stepValue: "8",
    instructorLabel: "Examenwaardig",
    studentLabel: "Je beheerst dit examenwaardig",
    explanation: "De leerling voert het onderdeel zelfstandig, veilig en examenwaardig uit.",
    phase: "geautomatiseerd",
    sortOrder: 80,
  },
  {
    stepValue: "9",
    instructorLabel: "Sterk zelfstandig",
    studentLabel: "Je beheerst dit sterk zelfstandig",
    explanation: "De leerling handelt ruim boven voldoende, anticiperend en consistent.",
    phase: "geautomatiseerd",
    sortOrder: 90,
  },
  {
    stepValue: "10",
    instructorLabel: "Volledig beheerst",
    studentLabel: "Je beheerst dit volledig",
    explanation: "De leerling beheerst het onderdeel volledig en blijft stabiel onder druk.",
    phase: "geautomatiseerd",
    sortOrder: 100,
  },
];

export function normalizeRisStep(value: unknown): RISStepValue | null {
  if (value === null || value === undefined || value === "") return null;
  if (String(value).toUpperCase() === "N") return null;
  const asNumber = typeof value === "number" ? value : Number(value);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= RIS_SCORE_MAX) {
    return String(asNumber) as RISStepValue;
  }
  return null;
}

export function risStepNumber(step: RISStepValue | null | undefined): number | null {
  const normalized = normalizeRisStep(step);
  if (normalized === null) return null;
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
      variants: (variantsByScript.get(script.id) ?? []).sort(bySortOrderThenTitle),
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
      scripts: (scriptsByCategory.get(category.id) ?? []).sort(bySortOrderThenTitle),
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
      categories: (categoriesByModule.get(module.id) ?? []).sort(bySortOrderThenTitle),
    }))
    .sort(bySortOrderThenTitle);
}

export function computeRisProgress(input: readonly RISProgressInput[]): RISOverallProgress {
  const modules = new Map<number, RISProgressInput[]>();
  for (const item of input) {
    const list = modules.get(item.moduleNumber) ?? [];
    list.push(item);
    modules.set(item.moduleNumber, list);
  }

  const moduleResults = [...modules.entries()]
    .sort(([left], [right]) => left - right)
    .map(([moduleNumber, items]) => computeRisModuleProgress(moduleNumber, items));

  const totalScripts = input.length;
  const assessed = input
    .map((item) => risStepNumber(item.step))
    .filter((step): step is number => step !== null);
  const averageStep = assessed.length > 0 ? round1(mean(assessed)) : null;
  const progressPct = totalScripts === 0 ? 0 : Math.round((sum(assessed) / (totalScripts * RIS_SCORE_MAX)) * 100);

  return {
    totalScripts,
    assessedScripts: assessed.length,
    averageStep,
    progressPct,
    modules: moduleResults,
  };
}

export function computeRisModuleReadiness(
  moduleNumber: number,
  items: readonly RISProgressInput[],
  minimumStep = 6,
): RISModuleReadiness {
  const progress = computeRisModuleProgress(moduleNumber, items);
  const blockers: string[] = [];
  if (progress.totalScripts === 0) {
    blockers.push("Deze module heeft nog geen RIS-scripts.");
  }
  if (progress.assessedScripts < progress.totalScripts) {
    blockers.push("Nog niet alle scripts in deze module zijn beoordeeld.");
  }
  const below = items.filter((item) => {
    const step = risStepNumber(item.step);
    return step === null || step < minimumStep;
  }).length;
  if (below > 0) {
    blockers.push(`${below} ${below === 1 ? "script staat" : "scripts staan"} nog onder score ${minimumStep}.`);
  }
  if (progress.attentionPoints > 0) {
    blockers.push(`${progress.attentionPoints} aandachtspunt${progress.attentionPoints === 1 ? "" : "en"} open.`);
  }

  return {
    moduleNumber,
    ready: blockers.length === 0 || progress.readyForModuleTest,
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
  const assessed = items
    .map((item) => risStepNumber(item.step))
    .filter((step): step is number => step !== null);
  const totalScripts = items.length;
  const averageStep = assessed.length > 0 ? round1(mean(assessed)) : null;
  const progressPct = totalScripts === 0 ? 0 : Math.round((sum(assessed) / (totalScripts * RIS_SCORE_MAX)) * 100);
  const attentionPoints = items.filter((item) => item.isAttentionPoint).length;

  return {
    moduleNumber,
    totalScripts,
    assessedScripts: assessed.length,
    averageStep,
    progressPct,
    attentionPoints,
    readyForModuleTest:
      totalScripts > 0 &&
      items.every((item) => {
        const step = risStepNumber(item.step);
        return step !== null && step >= RIS_READY_SCORE;
      }) &&
      attentionPoints === 0,
  };
}

function bySortOrderThenTitle<T extends { sortOrder: number; title: string }>(
  left: T,
  right: T,
): number {
  return left.sortOrder - right.sortOrder || left.title.localeCompare(right.title);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
