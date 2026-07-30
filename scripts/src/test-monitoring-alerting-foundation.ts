/**
 * Static guardrails for deploy-integrated smoke and issue-based monitoring alerts.
 *
 *   pnpm --filter @workspace/scripts run test-monitoring-alerting-foundation
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

const deployProduction = source(".github/workflows/deploy-production.yml");
const deployStaging = source(".github/workflows/deploy-staging.yml");
const monitorWorkflow = source(".github/workflows/monitor-smoke-alerts.yml");
const smokeRunner = source("scripts/src/smoke-production.ts");
const scriptsPackage = source("scripts/package.json");
const runbook = source("docs/PRODUCTION_RUNBOOK.md");
const readiness = source("docs/PRODUCTION_READINESS_CHECKLIST.md");

for (const [label, workflow] of [
  ["production deploy workflow", deployProduction],
  ["staging deploy workflow", deployStaging],
] as const) {
  check(
    `${label} runs deploy-integrated smoke in http mode`,
    workflow.includes("Deploy-integrated smoke") &&
      workflow.includes("SMOKE_BROWSER_MODE: off") &&
      workflow.includes(
        "pnpm --filter @workspace/scripts run smoke:production",
      ) &&
      workflow.includes("SMOKE_TENANT_HOST") &&
      workflow.includes("SMOKE_CUSTOM_DOMAIN_HOST"),
  );
  check(
    `${label} publishes traceable version metadata`,
    workflow.includes("GIT_SHA=$GITHUB_SHA") &&
      workflow.includes("BUILD_TIMESTAMP=$build_timestamp") &&
      workflow.includes("DATABASE_MIGRATION_VERSION=$migration_version"),
  );
}

check(
  "scheduled monitoring workflow runs browser smoke for production and staging",
  monitorWorkflow.includes('cron: "*/30 * * * *"') &&
    monitorWorkflow.includes("smoke-production:") &&
    monitorWorkflow.includes("smoke-staging:") &&
    monitorWorkflow.includes("environment: production") &&
    monitorWorkflow.includes("environment: staging") &&
    monitorWorkflow.includes("playwright install --with-deps chromium") &&
    monitorWorkflow.includes(
      "pnpm --filter @workspace/scripts run smoke:production",
    ),
);

check(
  "monitoring workflow manages issue-based alerts",
  monitorWorkflow.includes("actions/github-script@v7") &&
    monitorWorkflow.includes("[ops] Production smoke monitor failing") &&
    monitorWorkflow.includes("[ops] Staging smoke monitor failing") &&
    monitorWorkflow.includes("Smoke-monitor hersteld"),
);

check(
  "smoke runner supports browser-off deploy mode",
  smokeRunner.includes('type BrowserMode = "required" | "off"') &&
    smokeRunner.includes('process.env["SMOKE_BROWSER_MODE"]') &&
    smokeRunner.includes(
      'record("SKIP", "student login", "browser mode off")',
    ) &&
    smokeRunner.includes(
      'checkLoginPageHttp("/login", "GET /login html shell")',
    ),
);

check(
  "scripts package exposes monitoring alert guardrail",
  scriptsPackage.includes('"test-monitoring-alerting-foundation"'),
);

check(
  "runbook documents deploy-integrated smoke and monitor workflow",
  runbook.includes("Deploy-integrated smoke") &&
    runbook.includes("Monitor smoke and alerts") &&
    runbook.includes("[ops] Production smoke monitor failing"),
);

check(
  "readiness checklist records deploy smoke and monitoring issue alerts",
  readiness.includes("deploy-integrated smoke") &&
    readiness.includes("scheduled GitHub smoke monitor") &&
    readiness.includes("issue-based alerting"),
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

console.log("All monitoring and alerting guardrails passed.");
