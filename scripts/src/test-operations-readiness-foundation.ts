/**
 * Static guardrails for monitoring, smoke flows, runbook and perceived-performance readiness.
 *
 *   pnpm --filter @workspace/scripts run test-operations-readiness-foundation
 */
import { existsSync, readFileSync } from "node:fs";
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

const readyRoute = source("artifacts/nxtdrive/app/api/health/ready/route.ts");
const smokeRunner = source("scripts/src/smoke-production.ts");
const scriptsPackage = source("scripts/package.json");
const runbook = source("docs/PRODUCTION_RUNBOOK.md");
const infraDocs = source("docs/INFRA_DEPLOYMENT.md");
const readinessDocs = source("docs/PRODUCTION_READINESS_CHECKLIST.md");
const wildcardEnableScript = source("infra/enable-wildcard-tls.sh");

check(
  "readiness endpoint checks runtime env and database without caching",
  readyRoute.includes('export const runtime = "nodejs"') &&
    readyRoute.includes("REQUIRED_ENV") &&
    readyRoute.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    readyRoute.includes("SESSION_SECRET") &&
    readyRoute.includes("DATABASE_URL") &&
    readyRoute.includes("createServiceRoleClient") &&
    readyRoute.includes('from("tenants")') &&
    readyRoute.includes('"Cache-Control": "no-store, max-age=0"') &&
    readyRoute.includes("503"),
);

check(
  "production smoke runner covers health, readiness, manifests, login flows and optional host-shell checks",
  smokeRunner.includes('SMOKE_BASE_URL') &&
    smokeRunner.includes("SMOKE_TENANT_HOST") &&
    smokeRunner.includes("SMOKE_CUSTOM_DOMAIN_HOST") &&
    smokeRunner.includes("/api/health/ready") &&
    smokeRunner.includes("/student/manifest.webmanifest") &&
    smokeRunner.includes("/instructor/manifest.webmanifest") &&
    smokeRunner.includes("chromium.launch") &&
    smokeRunner.includes("SMOKE_STUDENT_EMAIL") &&
    smokeRunner.includes("SMOKE_INSTRUCTOR_EMAIL"),
);

check(
  "scripts package exposes operations readiness and smoke commands",
  scriptsPackage.includes("test-operations-readiness-foundation") &&
    scriptsPackage.includes("smoke:production"),
);

check(
  "route-level loading states exist for the heaviest app shells",
  existsSync(repoPath("artifacts/nxtdrive/app/student/loading.tsx")) &&
    existsSync(repoPath("artifacts/nxtdrive/app/instructor/loading.tsx")) &&
    existsSync(repoPath("artifacts/nxtdrive/app/backoffice/loading.tsx")),
);

check(
  "production runbook covers deploy verification, smoke, rollback and incident triage",
  runbook.includes("Deploy verificatie") &&
    runbook.includes("Smoke tests") &&
    runbook.includes("Rollback") &&
    runbook.includes("Incident triage") &&
    runbook.includes("Performance budget"),
);

check(
  "infra docs mention health versus readiness semantics",
  infraDocs.includes("/api/health/ready") &&
    infraDocs.includes("readiness") &&
    infraDocs.includes("smoke:production"),
);

check(
  "wildcard TLS helper exists and validates the expected Caddy prerequisites",
  wildcardEnableScript.includes("dns.providers.cloudflare") &&
    wildcardEnableScript.includes("CLOUDFLARE_API_TOKEN") &&
    wildcardEnableScript.includes("infra/Caddyfile.wildcard") &&
    wildcardEnableScript.includes("caddy validate") &&
    wildcardEnableScript.includes("systemctl restart caddy") &&
    wildcardEnableScript.includes('https://${WILDCARD_TEST_HOST}/login'),
);

check(
  "readiness checklist records monitoring and smoke foundation",
  readinessDocs.includes("Monitoring, smoke and runbook foundation") &&
    readinessDocs.includes("production smoke runner"),
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

console.log("All operations readiness guardrails passed.");
