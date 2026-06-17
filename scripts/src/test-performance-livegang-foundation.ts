/**
 * Static guardrails for the performance/livegang pass.
 *
 *   pnpm --filter @workspace/scripts run test-performance-livegang-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const passwordField = source("artifacts/nxtdrive/components/ui/password-field.tsx");
const passwordForm = source(
  "artifacts/nxtdrive/app/account/wachtwoord-wijzigen/wachtwoord-wijzigen-form.tsx",
);
const adminTemplatePage = source(
  "artifacts/nxtdrive/app/admin/notifications/templates/[key]/[channel]/page.tsx",
);
const tenantTemplatePage = source(
  "artifacts/nxtdrive/app/backoffice/instellingen/notificaties/templates/[key]/[channel]/page.tsx",
);
const editorShell = source(
  "artifacts/nxtdrive/app/admin/notifications/templates/[key]/[channel]/editor-shell.tsx",
);
const e2eRunner = source("scripts/src/e2e-business-flows.ts");
const routePerformance = source("scripts/src/check-route-performance.ts");
const scriptsPackage = source("scripts/package.json");
const runbook = source("docs/PRODUCTION_RUNBOOK.md");
const readiness = source("docs/PRODUCTION_READINESS_CHECKLIST.md");

check(
  "password strength loads lazily instead of bundling zxcvbn eagerly",
  passwordField.includes('import("zxcvbn")') &&
    passwordField.includes("React.useDeferredValue") &&
    passwordForm.includes("onStrengthChange={setStrength}"),
);

check(
  "notification template editor routes lazy-load the heavy tiptap editor",
  adminTemplatePage.includes("TemplateEditorShell") &&
    tenantTemplatePage.includes("TemplateEditorShell") &&
    editorShell.includes("dynamic(") &&
    editorShell.includes("ssr: false"),
);

check(
  "business-flow E2E verifies persistent auth cookies",
  e2eRunner.includes("session retention") &&
    e2eRunner.includes("auth-token") &&
    e2eRunner.includes("expire too soon"),
);

check(
  "route performance script enforces livegang budgets",
  routePerformance.includes("/account/wachtwoord-wijzigen") &&
    routePerformance.includes("/admin/notifications/templates/[key]/[channel]") &&
    routePerformance.includes("sharedBudgetKb") &&
    routePerformance.includes("middlewareBudgetKb"),
);

check(
  "scripts package exposes the performance budget runner",
  scriptsPackage.includes('"check-route-performance"') &&
    scriptsPackage.includes('"test-performance-livegang-foundation"'),
);

check(
  "runbook documents performance budgets and session retention verification",
  runbook.includes("Route performance budgets") &&
    runbook.includes("session retention") &&
    runbook.includes("check-route-performance"),
);

check(
  "readiness checklist records performance budgets and cookie persistence verification",
  readiness.includes("route performance budgets") &&
    readiness.includes("session retention") &&
    readiness.includes("auth cookies"),
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

console.log("All performance/livegang guardrails passed.");
