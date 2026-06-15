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
const runbook = source("docs/PRODUCTION_RUNBOOK.md");
const readiness = source("docs/PRODUCTION_READINESS_CHECKLIST.md");

check(
  "scripts package exposes E2E business-flow commands",
  scriptsPackage.includes('"e2e:business-flows"') &&
    scriptsPackage.includes('"test-e2e-business-flows-foundation"'),
);

check(
  "runner covers the critical browser-driven business flows",
  runner.includes('login + session persistence') &&
    runner.includes("verifyLeadToTrialToStudent") &&
    runner.includes("verifyLessonPlanningAndCompletion") &&
    runner.includes("verifyMessaging") &&
    runner.includes("verifyBranchIsolation") &&
    runner.includes("verifyWhiteLabelHost") &&
    runner.includes("verifyPayments"),
);

check(
  "runner wires business-critical routes and RPC-backed setup paths",
  runner.includes("/backoffice/leads") &&
    runner.includes("createPlannedLessonForFlow") &&
    runner.includes("/instructor/") &&
    runner.includes("/student/berichten") &&
    runner.includes("/backoffice/leerlingen") &&
    runner.includes("book_trial_lesson") &&
    runner.includes("create_invoice") &&
    runner.includes("set_membership_branches"),
);

check(
  "runbook documents how to execute business-flow E2E checks",
  runbook.includes("E2E business flows") &&
    runbook.includes("e2e:business-flows") &&
    runbook.includes("E2E_ENABLE_PAYMENT_REDIRECT"),
);

check(
  "readiness checklist records the browser-driven E2E foundation",
  readiness.includes("browser-driven E2E business-flow runner") &&
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
