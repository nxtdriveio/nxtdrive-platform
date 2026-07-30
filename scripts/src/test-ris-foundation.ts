import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildRisTree,
  computeRisModuleReadiness,
  computeRisProgress,
  normalizeRisStep,
  risStepNumber,
  translateRisStepForStudent,
} from "../../lib/leskaart/src/ris.ts";

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
const cleanStartMigration = source(
  "supabase/migrations/20260616181232_ris_clean_start_default.sql",
);
const scoreModelMigration = source(
  "supabase/migrations/20260624081046_ris_score_model_n_1_to_8.sql",
);
const leskaartIndex = source("lib/leskaart/src/index.ts");
const risEngine = source("lib/leskaart/src/ris.ts");
const risData = source("artifacts/nxtdrive/lib/ris/data.ts");
const risActions = source("artifacts/nxtdrive/lib/ris/actions.ts");
const docs = source("docs/RIS_LESKAART_IMPLEMENTATION.md");
const packageJson = source("scripts/package.json");

const requiredTables = [
  "ris_versions",
  "ris_modules",
  "ris_categories",
  "ris_scripts",
  "ris_script_variants",
  "ris_step_definitions",
  "tenant_ris_settings",
  "ris_lesson_cards",
  "ris_script_assessments",
  "student_ris_progress",
  "ris_lesson_observations",
  "ris_guided_reflections",
  "ris_module_tests",
];

for (const table of requiredTables) {
  check(
    `migration creates ${table}`,
    new RegExp(`create table if not exists public\\.${table}\\b`).test(
      migration,
    ),
  );
  check(
    `migration enables RLS for ${table}`,
    migration.includes(`alter table public.${table} enable row level security`),
  );
}

for (const rpc of [
  "seed_default_ris_taxonomy",
  "set_tenant_ris_settings",
  "set_ris_concept_score",
  "publish_ris_lesson_card",
  "set_guided_reflection",
  "set_ris_module_test",
  "recompute_student_ris_progress",
]) {
  check(
    `migration defines RPC ${rpc}`,
    migration.includes(`function public.${rpc}`),
  );
  check(
    `RPC ${rpc} is service-role only`,
    migration.includes(`grant execute on function public.${rpc}`),
  );
}

check(
  "RIS mode starts as default while legacy remains fallback",
  /lesson_card_mode\s+text\s+not null default 'legacy'/.test(migration) &&
    cleanStartMigration.includes(
      "alter column lesson_card_mode set default 'ris'",
    ) &&
    cleanStartMigration.includes("values (new.id, 'ris', v_version_id)") &&
    cleanStartMigration.includes(
      "coalesce(v_settings.lesson_card_mode, 'ris') <> 'ris'",
    ) &&
    migration.includes("RIS lesson card mode is not enabled"),
);
check(
  "published lesson cards are immutable for concept scoring",
  migration.includes("publication_status <> 'draft'") &&
    migration.includes("already published or archived"),
);
check(
  "published cards recompute student progress",
  migration.includes("publish_ris_lesson_card") &&
    migration.includes("public.recompute_student_ris_progress"),
);
check(
  "students only see published RIS cards through RLS",
  migration.includes("publication_status = 'published'") &&
    migration.includes("student_id in (") &&
    migration.includes("public.student_guardians"),
);
check(
  "concept/final scores use canonical N/1-8 validation",
  migration.includes("check (public._ris_step_valid(concept_ris_step))") &&
    migration.includes("check (public._ris_step_valid(final_ris_step))") &&
    scoreModelMigration.includes("p_step = 'N'") &&
    scoreModelMigration.includes("p_step ~ '^[1-8]$'") &&
    scoreModelMigration.includes("where concept_ris_step in ('9', '10')"),
);
check(
  "legacy lesson score path is constrained to N/1-8",
  scoreModelMigration.includes("lessons_progress_score_range") &&
    scoreModelMigration.includes(
      "progress_score is null or progress_score between 1 and 8",
    ) &&
    scoreModelMigration.includes("lesson_skill_scores_score_range") &&
    scoreModelMigration.includes("check (score between 1 and 8)") &&
    scoreModelMigration.includes("skill score must be between 1 and 8") &&
    scoreModelMigration.includes(
      "progress score must be N/null or between 1 and 8",
    ),
);

check(
  "leskaart package exports RIS helpers",
  leskaartIndex.includes('export * from "./ris"'),
);
check(
  "RIS engine exposes core pure helpers",
  risEngine.includes("computeRisProgress") &&
    risEngine.includes("computeRisModuleReadiness") &&
    risEngine.includes("translateRisStepForStudent") &&
    risEngine.includes("buildRisTree"),
);
check(
  "N lowers coverage and instruction stages are never averaged",
  normalizeRisStep("N") === "N" &&
    risStepNumber("N") === null &&
    computeRisProgress([
      { scriptId: "a", moduleNumber: 1, step: "N" },
      { scriptId: "b", moduleNumber: 1, step: "8" },
    ]).averageStep === null &&
    computeRisProgress([
      { scriptId: "a", moduleNumber: 1, step: "N" },
      { scriptId: "b", moduleNumber: 1, step: "8" },
    ]).progressPct === 50,
);
check(
  "RIS readiness blocks unassessed scripts",
  computeRisModuleReadiness(1, [
    { scriptId: "a", moduleNumber: 1, step: "6" },
    { scriptId: "b", moduleNumber: 1, step: null },
  ]).ready === false,
);
check(
  "student translation is friendly and deterministic",
  translateRisStepForStudent("5").studentLabel.includes("minder aanwijzingen"),
);
check(
  "RIS tree groups modules/categories/scripts/variants",
  buildRisTree({
    modules: [
      {
        id: "m1",
        module_number: 1,
        title: "Module 1",
        description: null,
        sort_order: 1,
      },
    ],
    categories: [
      { id: "c1", ris_module_id: "m1", title: "Categorie", sort_order: 1 },
    ],
    scripts: [
      {
        id: "s1",
        module_id: "m1",
        category_id: "c1",
        script_number: 1,
        code: "M1-S1",
        title: "Script",
        description_short: null,
        sort_order: 1,
        is_active: true,
      },
    ],
    variants: [
      {
        id: "v1",
        script_id: "s1",
        code: "M1-S1a",
        title: "Variant",
        sort_order: 1,
        is_active: true,
      },
    ],
  })[0]?.categories[0]?.scripts[0]?.variants.length === 1,
);
check(
  "Next loaders expose instructor, student and backoffice RIS views",
  risData.includes("loadInstructorRisLessonCard") &&
    risData.includes("loadStudentRisProgress") &&
    risData.includes("loadBackofficeRisOverview"),
);
check(
  "server actions use RIS RPC contract",
  risActions.includes("setRisConceptScoreAction") &&
    risActions.includes("publishRisLessonCardAction") &&
    risActions.includes("setTenantRisSettingsAction") &&
    risActions.includes("setRisModuleTestAction"),
);
check(
  "implementation docs describe rollout and next sprints",
  docs.includes("# RIS-leskaart implementatie") &&
    docs.includes("RIS-3") &&
    docs.includes("legacy"),
);
check(
  "package script exposes RIS foundation guard",
  packageJson.includes('"test-ris-foundation"'),
);

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS foundation check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-foundation: ok");
