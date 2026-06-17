/**
 * Static guardrails for the go-live readiness foundation.
 *
 *   pnpm --filter @workspace/scripts run test-live-readiness-foundation
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

const cookieOptions = source("artifacts/nxtdrive/lib/supabase/cookie-options.ts");
const middleware = source("artifacts/nxtdrive/middleware.ts");
const nextConfig = source("artifacts/nxtdrive/next.config.mjs");
const platformManifest = source("artifacts/nxtdrive/app/manifest.webmanifest/route.ts");
const studentManifest = source("artifacts/nxtdrive/app/student/manifest.webmanifest/route.ts");
const instructorManifest = source("artifacts/nxtdrive/app/instructor/manifest.webmanifest/route.ts");
const tlsCheck = source("artifacts/nxtdrive/app/api/tls-check/route.ts");
const readinessDocs = source("docs/PRODUCTION_READINESS_CHECKLIST.md");
const scriptsPackage = source("scripts/package.json");

check(
  "session cookies default to persistent configurable retention",
  cookieOptions.includes("DEFAULT_SESSION_MAX_AGE_DAYS = 90") &&
    cookieOptions.includes("NXTDRIVE_SESSION_MAX_AGE_DAYS") &&
    cookieOptions.includes("getSupabaseSessionMaxAgeSeconds") &&
    cookieOptions.includes("maxAge: getSupabaseSessionMaxAgeSeconds()"),
);

check(
  "middleware auth refresh is limited to protected app routes",
  middleware.includes("PROTECTED_PATHS") &&
    middleware.includes("isProtectedPath") &&
    middleware.includes("shouldSkipAuthRefresh") &&
    middleware.includes('"/backoffice/:path*"') &&
    middleware.includes('"/student/:path*"') &&
    middleware.includes('"/instructor/:path*"') &&
    !middleware.includes('/((?!api/health'),
);

check(
  "middleware adds baseline app security headers",
  middleware.includes("withAppSecurityHeaders") &&
    middleware.includes("X-Content-Type-Options") &&
    middleware.includes("Referrer-Policy") &&
    middleware.includes("X-Frame-Options"),
);

check(
  "PWA manifests are cacheable but host-aware",
  [platformManifest, studentManifest, instructorManifest].every(
    (manifest) =>
      manifest.includes("stale-while-revalidate=86400") &&
      manifest.includes('"Vary": "Host, X-Forwarded-Host"'),
  ),
);

check(
  "TLS ask endpoint fails closed with no-store responses",
  tlsCheck.includes("tlsResponse") &&
    tlsCheck.includes('"Cache-Control": "no-store, max-age=0"') &&
    tlsCheck.includes("lookup failed") &&
    tlsCheck.includes("unknown host"),
);

check(
  "Next config optimizes icon/chart package imports",
  nextConfig.includes("optimizePackageImports") &&
    nextConfig.includes("lucide-react") &&
    nextConfig.includes("recharts"),
);

check(
  "production readiness checklist records the live-readiness pass",
  readinessDocs.includes("Performance and session-retention pass") &&
    readinessDocs.includes("session persistence is verified in production"),
);

check(
  "scripts package registers live readiness guardrail",
  scriptsPackage.includes("test-live-readiness-foundation"),
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

console.log("All live readiness guardrails passed.");
