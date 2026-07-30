/**
 * Static guardrails for the browser-driven E2E business-flow suite.
 *
 *   pnpm --filter @workspace/scripts run test-e2e-business-flows-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

function repoPath(pathFromRepoRoot: string): string {
  return fileURLToPath(new URL(`../../${pathFromRepoRoot}`, import.meta.url));
}

function source(pathFromRepoRoot: string): string {
  return readFileSync(repoPath(pathFromRepoRoot), "utf8");
}

const runner = source("scripts/src/e2e-business-flows.ts");
const scriptsPackage = source("scripts/package.json");
const authenticatedWorkflow = source(".github/workflows/e2e-authenticated.yml");
const qualityWorkflow = source(".github/workflows/ci.yml");
const journeyBot = source("scripts/src/lib/ris-journey-bot.ts");
const journeyBaseline = source("scripts/ris-journey-baseline.json");
const journeyDocumentation = source("docs/RIS_JOURNEY_BOT.md");
const instructorMessageComposer = source(
  "artifacts/nxtdrive/components/instructor/InstructorMessageComposer.tsx",
);
const runbook = source("docs/PRODUCTION_RUNBOOK.md");
const readiness = source("docs/PRODUCTION_READINESS_CHECKLIST.md");

check(
  "scripts package exposes E2E business-flow commands",
  scriptsPackage.includes('"e2e:business-flows"') &&
    scriptsPackage.includes('"e2e:ris-journey-bot"') &&
    scriptsPackage.includes('"test-ris-journey-bot"') &&
    scriptsPackage.includes('"test-e2e-business-flows-foundation"'),
);

check(
  "authenticated staging workflow maps database secrets to the runner contract",
  authenticatedWorkflow.includes(
    "SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}",
  ) &&
    authenticatedWorkflow.includes(
      "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.STAGING_SUPABASE_SERVICE_ROLE_KEY }}",
    ),
);

check(
  "RIS journeybot has explainable release checks and three report formats",
  journeyBot.includes("RIS.PREFLIGHT.CATALOG_STRUCTURE") &&
    journeyBot.includes("RIS.JOURNEY.DRAFT_PRIVACY") &&
    journeyBot.includes("RIS.JOURNEY.STAGE_NOT_MASTERY") &&
    journeyBot.includes("RIS.JOURNEY.AUDIT_TRAIL") &&
    journeyBot.includes("renderMarkdown") &&
    journeyBot.includes("renderJUnit") &&
    journeyBaseline.includes('"minExplainabilityScore": 100'),
);

check(
  "authenticated workflow retains RIS reports even when the journey fails",
  authenticatedWorkflow.includes("Upload explainable RIS journey report") &&
    authenticatedWorkflow.includes("if: always()") &&
    authenticatedWorkflow.includes("test-results/ris-journey/"),
);

check(
  "quality gate executes the journeybot contract tests",
  qualityWorkflow.includes("RIS journeybot contract tests") &&
    qualityWorkflow.includes("run test-ris-journey-bot"),
);

check(
  "RIS journeybot runbook documents baseline, privacy and evidence semantics",
  journeyDocumentation.includes("baselinevergelijking") &&
    journeyDocumentation.includes("Geen persoonsgegevens") &&
    journeyDocumentation.includes("JUnit XML") &&
    journeyDocumentation.includes("E2E_RIS_PREVIOUS_REPORT"),
);

check(
  "runner covers the critical browser-driven business flows",
  runner.includes("login + session persistence") &&
    runner.includes("session retention") &&
    runner.includes("verifyLeadToTrialToStudent") &&
    runner.includes("verifyLessonPlanningAndCompletion") &&
    runner.includes("verifyMessaging") &&
    runner.includes("verifyBranchIsolation") &&
    runner.includes("verifyWhiteLabelHost") &&
    runner.includes("verifyPayments"),
);

check(
  "instructor message composer persists instead of exposing a dead send control",
  instructorMessageComposer.includes("sendChatMessageAction") &&
    instructorMessageComposer.includes("router.refresh()") &&
    instructorMessageComposer.includes('aria-label="Verzenden"'),
);

check(
  "runner wires business-critical routes and RPC-backed setup paths",
  runner.includes("/backoffice/leads") &&
    runner.includes("createPlannedLessonForFlow") &&
    runner.includes("/instructeur/lessen/") &&
    runner.includes("/leerling/berichten") &&
    runner.includes("/backoffice/leerlingen") &&
    runner.includes("book_trial_lesson") &&
    runner.includes("create_invoice") &&
    runner.includes("set_membership_branches"),
);

check(
  "runbook documents how to execute business-flow E2E checks",
  runbook.includes("E2E business flows") &&
    runbook.includes("e2e:business-flows") &&
    runbook.includes("session retention") &&
    runbook.includes("E2E_ENABLE_PAYMENT_REDIRECT"),
);

check(
  "readiness checklist records the browser-driven E2E foundation",
  readiness.includes("browser-driven E2E business-flow runner") &&
    readiness.includes("session retention") &&
    readiness.includes("lead to trial lesson to student conversion") &&
    readiness.includes("white-label host resolution and themed shells"),
);

console.log("");
let failed = 0;
for (const result of results) {
  const mark = result.ok ? "OK" : "FAIL";
  console.log(`${mark} ${result.name}`);
  if (!result.ok) failed++;
}
console.log("");

if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}

console.log("All E2E business-flow guardrails passed.");
