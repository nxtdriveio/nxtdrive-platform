import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), "utf8");
}

function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  console.log(`OK ${message}`);
}

const foundationMigration = read(
  "supabase",
  "migrations",
  "20260616104647_ris_lesson_card_foundation.sql",
);
const reflectionRlsMigration = read(
  "supabase",
  "migrations",
  "20260616170639_ris_release_hardening_reflection_rls.sql",
);
const instructorLessonWorkspace = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "RisEvaluationWorkspace.tsx",
);
const actionsPanel = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "ActionsPanel.tsx",
);
const studentProgressPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "leerling",
  "voortgang",
  "page.tsx",
);
const studentRisView = read(
  "artifacts",
  "nxtdrive",
  "components",
  "ris",
  "StudentRisProgressView.tsx",
);
const backofficeRisPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "ris",
  "page.tsx",
);
const risActions = read("artifacts", "nxtdrive", "lib", "ris", "actions.ts");
const featureFlags = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "features",
  "flags.ts",
);
const risMigration = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "ris",
  "migration.ts",
);
const e2eRunner = read("scripts", "src", "e2e-business-flows.ts");
const routePerformance = read("scripts", "src", "check-route-performance.ts");
const packageJson = read("scripts", "package.json");
const risDocs = read("docs", "RIS_LESKAART_IMPLEMENTATION.md");
const runbook = read("docs", "PRODUCTION_RUNBOOK.md");

ok(
  foundationMigration.includes(
    "alter table public.ris_lesson_cards enable row level security",
  ) &&
    foundationMigration.includes("publication_status = 'published'") &&
    foundationMigration.includes("public.student_guardians"),
  "RIS lesson card RLS exposes only published cards to students/guardians",
);

ok(
  foundationMigration.includes("ris_script_assessments_select_members") &&
    foundationMigration.includes("c.publication_status = 'published'") &&
    foundationMigration.includes("student_id in ("),
  "RIS script assessment RLS keeps draft concepts staff-only",
);

ok(
  reflectionRlsMigration.includes("ris_guided_reflections_select_members") &&
    reflectionRlsMigration.includes("c.publication_status = 'published'") &&
    reflectionRlsMigration.includes("public.student_guardians") &&
    reflectionRlsMigration.includes("ris_lesson_cards c"),
  "RIS reflection RLS allows student/guardian read only through published cards",
);

ok(
  foundationMigration.includes("ris_lesson_observations_select_staff") &&
    !reflectionRlsMigration.includes("ris_lesson_observations_select_members"),
  "RIS internal observations remain staff-only",
);

ok(
  instructorLessonWorkspace.includes("loadInstructorRisLessonCard") &&
    instructorLessonWorkspace.includes("loadInstructorLeskaart") &&
    instructorLessonWorkspace.includes("isRisLessonMode") &&
    instructorLessonWorkspace.includes("RisEvaluationTabs") &&
    instructorLessonWorkspace.includes("SkillScoring"),
  "Instructor lesson route keeps RIS and legacy scoring paths side by side",
);

ok(
  actionsPanel.includes("risPublished") &&
    actionsPanel.includes("Publiceer eerst") &&
    actionsPanel.includes("disabled={pending || !risPublished}"),
  "Instructor completion requires RIS publication before completing a RIS lesson",
);

ok(
  studentProgressPage.includes("loadStudentRisProgress") &&
    studentProgressPage.includes('lessonCardMode === "ris"') &&
    studentProgressPage.includes("loadStudentLeskaart"),
  "Student progress route switches between RIS and legacy views per tenant setting",
);

ok(
  studentRisView.includes("Alleen de met jou gedeelde RIS-feedback") &&
    studentRisView.includes("publishedCards") &&
    studentRisView.includes("reflection"),
  "Student RIS view is explicitly based on published feedback",
);

ok(
  backofficeRisPage.includes("Inhoudelijke releasegate") &&
    backofficeRisPage.includes("toetsvoorstellen") &&
    backofficeRisPage.includes("Moduletoets of CBR-moment registreren"),
  "Backoffice RIS cockpit exposes the expert gate, decision support and module tests",
);

ok(
  featureFlags.includes("AI_TEMPORARILY_DISABLED = true") &&
    featureFlags.includes('flag.startsWith("ai.")') &&
    risActions.includes("AI-assistentie is tijdelijk uitgeschakeld.") &&
    !risActions.includes("activateRisAfterMigrationCheckAction"),
  "RIS AI is hard-paused and no activation write is exposed",
);

ok(
  risMigration.includes("orphanLegacyScores") &&
    risMigration.includes("unmappedScoredLeaves") &&
    risMigration.includes("canActivateRisAfterMigration"),
  "RIS migration rollout blocks unsafe legacy-to-RIS activation",
);

ok(
  e2eRunner.includes('expectedPath: "/backoffice"') &&
    e2eRunner.includes('expectedPath: "/instructeur"') &&
    e2eRunner.includes('expectedPath: "/leerling"') &&
    e2eRunner.includes("login + session persistence") &&
    e2eRunner.includes("lead -> trial -> student conversion") &&
    e2eRunner.includes("lesson scheduling -> start -> completion") &&
    e2eRunner.includes("student <-> instructor messaging") &&
    e2eRunner.includes("branch-scoped student visibility") &&
    e2eRunner.includes("student payments + checkout entrypoint") &&
    e2eRunner.includes("assertPersistentSessionCookies"),
  "Business-flow E2E suite covers critical tenant/admin/instructor/student flows",
);

ok(
  routePerformance.includes("/leerling") &&
    routePerformance.includes("/instructeur") &&
    routePerformance.includes("/backoffice") &&
    routePerformance.includes("sharedBudgetKb") &&
    routePerformance.includes("middlewareBudgetKb"),
  "Route performance budget includes student, instructor and backoffice shells",
);

ok(
  runbook.includes("RIS release gate") &&
    runbook.includes("test-ris-release-hardening") &&
    runbook.includes("RIS rollback") &&
    runbook.includes("lesson_card_mode"),
  "Production runbook documents the RIS release gate and rollback path",
);

ok(
  risDocs.includes("RIS-10: Hardening en release") &&
    risDocs.includes("Open release gates") &&
    risDocs.includes("RLS-releaseguard") &&
    risDocs.includes("legacy-regressie"),
  "RIS docs distinguish technical hardening from open external gates",
);

ok(
  packageJson.includes('"test-ris-release-hardening"'),
  "package script exposes RIS-10 guard",
);

console.log("test-ris-release-hardening: ok");
