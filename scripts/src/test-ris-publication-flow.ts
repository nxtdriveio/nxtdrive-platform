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
const risData = source("artifacts/nxtdrive/lib/ris/data.ts");
const risActions = source("artifacts/nxtdrive/lib/ris/actions.ts");
const evaluationTabs = source(
  "artifacts/nxtdrive/components/ris/RisEvaluationTabs.tsx",
);
const actionsPanel = source(
  "artifacts/nxtdrive/components/instructor/ActionsPanel.tsx",
);
const publicationPanel = source(
  "artifacts/nxtdrive/components/ris/RisLessonPublicationPanel.tsx",
);
const docs = source("docs/RIS_LESKAART_IMPLEMENTATION.md");
const packageJson = source("scripts/package.json");

check(
  "publish RPC refuses non-draft and empty RIS cards",
  migration.includes("RIS lesson card % is already published or archived") &&
    migration.includes("cannot be published without concept scores") &&
    migration.includes("concept_ris_step is not null"),
);

check(
  "guided reflection RPC is draft-only",
  migration.includes(
    "create or replace function public.set_guided_reflection",
  ) && migration.includes("RIS lesson card % is already published or archived"),
);

check(
  "publish RPC makes concepts final and recomputes student progress",
  migration.includes("set final_ris_step = concept_ris_step") &&
    migration.includes("public.recompute_student_ris_progress"),
);

check(
  "RIS loader exposes guided reflection to instructor UI",
  risData.includes("export type RisGuidedReflection") &&
    risData.includes('from("ris_guided_reflections")') &&
    risData.includes("reflection: RisGuidedReflection | null"),
);

check(
  "RIS actions expose reflection and publication contracts",
  risActions.includes("setGuidedReflectionAction") &&
    risActions.includes("publishRisLessonCardAction") &&
    risActions.includes("publish_ris_lesson_card"),
);

check(
  "instructor lesson page renders RIS publication panel after scoring",
  evaluationTabs.includes("<RisScriptScoring") &&
    evaluationTabs.includes("<RisLessonPublicationPanel") &&
    evaluationTabs.includes("studentId={studentId}") &&
    evaluationTabs.includes('mode="quick"'),
);

check(
  "actions panel requires publication before RIS lesson completion",
  actionsPanel.includes("risPublished = false") &&
    actionsPanel.includes("#ris-publicatie") &&
    actionsPanel.includes("Publiceer eerst") &&
    actionsPanel.includes("disabled={pending || !risPublished}"),
);

check(
  "publication panel saves guided reflection before publishing",
  publicationPanel.includes("setGuidedReflectionAction") &&
    publicationPanel.includes("publishRisLessonCardAction") &&
    publicationPanel.indexOf("const reflectionResult") <
      publicationPanel.indexOf("const publishResult"),
);

check(
  "publication panel covers RIS-4 UX requirements",
  publicationPanel.includes("Gewijzigde scripts") &&
    publicationPanel.includes("Reflectie leerling") &&
    publicationPanel.includes("Leerlingvriendelijke samenvatting") &&
    publicationPanel.includes("Het voorstel gebruikt alleen") &&
    publicationPanel.includes("Afronden & publiceren"),
);

check(
  "RIS documentation marks publication flow as implemented",
  docs.includes("RIS-4: Les afronden en publicatie") &&
    docs.includes("Geimplementeerd") &&
    docs.includes("Publicatie kopieert conceptscores naar definitieve scores"),
);

check(
  "package script exposes RIS publication guard",
  packageJson.includes('"test-ris-publication-flow"'),
);

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS publication-flow check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-publication-flow: ok");
