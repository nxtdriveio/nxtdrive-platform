import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

const migration = source(
  "supabase/migrations/20260616104647_ris_lesson_card_foundation.sql",
);
const lessonPage = source(
  "artifacts/nxtdrive/app/instructeur/lessen/[lessonId]/page.tsx",
);
const evaluationWorkspace = source(
  "artifacts/nxtdrive/components/instructor/RisEvaluationWorkspace.tsx",
);
const evaluationTabs = source(
  "artifacts/nxtdrive/components/ris/RisEvaluationTabs.tsx",
);
const actionsPanel = source(
  "artifacts/nxtdrive/components/instructor/ActionsPanel.tsx",
);
const risScoring = source(
  "artifacts/nxtdrive/components/ris/RisScriptScoring.tsx",
);
const packageJson = source("scripts/package.json");

check(
  "RIS tables are granted to authenticated readers behind RLS",
  migration.includes(
    "grant select on public.ris_lesson_cards to authenticated",
  ) &&
    migration.includes(
      "grant select on public.ris_script_assessments to authenticated",
    ) &&
    migration.includes(
      "grant select on public.tenant_ris_settings to authenticated",
    ),
);

check(
  "instructor lesson page routes into the RIS evaluation workspace",
  lessonPage.includes("RisEvaluationWorkspace") &&
    evaluationWorkspace.includes("loadInstructorRisLessonCard") &&
    evaluationWorkspace.includes("loadNextOpenLesson") &&
    evaluationWorkspace.includes("RisEvaluationTabs"),
);

check(
  "instructor evaluation workspace exposes the five RIS tabs",
  evaluationTabs.includes('label: "Lesinfo"') &&
    evaluationTabs.includes('label: "Plankaart"') &&
    evaluationTabs.includes('label: "Beoordeling"') &&
    evaluationTabs.includes('label: "Reflectie"') &&
    evaluationTabs.includes('label: "Samenvatting / Afronding"') &&
    evaluationTabs.includes("<RisScriptScoring"),
);

check(
  "actions panel disables legacy finish flow in RIS mode",
  actionsPanel.includes("risMode = false") &&
    actionsPanel.includes("RIS scorekaart") &&
    actionsPanel.includes("Conceptscores worden hieronder per") &&
    actionsPanel.includes("completeLessonAction"),
);

check(
  "RIS scoring exposes module grouping and report labels",
  risScoring.includes("module.moduleNumber") &&
    risScoring.includes('label: "Focus"') &&
    risScoring.includes('label: "Aandacht"') &&
    risScoring.includes('label: "Herhalen"') &&
    risScoring.includes('label: "Toetsklaar"'),
);

check(
  "RIS scoring uses N and 1..8 steps, not the legacy ten-step scale",
  risScoring.includes("const STEP_VALUES: RISStepValue[]") &&
    ["N", "1", "2", "3", "4", "5", "6", "7", "8"].every((step) =>
      risScoring.includes(`"${step}",`),
    ) &&
    !risScoring.includes("Array.from({ length: 10 }"),
);

check(
  "RIS scoring persists concepts through the RPC action",
  risScoring.includes("setRisConceptScoreAction") &&
    risScoring.includes("isFeaturedForLesson") &&
    risScoring.includes("isAttentionPoint") &&
    risScoring.includes("readyForTest"),
);

check(
  "package script exposes RIS instructor-mode guard",
  packageJson.includes('"test-ris-instructor-mode"'),
);

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS instructor-mode check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-instructor-mode: ok");
