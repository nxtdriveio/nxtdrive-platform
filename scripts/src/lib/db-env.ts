/**
 * Resolves the Postgres connection string for a target environment.
 *
 * Pass `--env=staging` or `--env=production` to select which secret to use:
 *   - staging    → STAGING_DATABASE_URL, falls back to DATABASE_URL
 *   - production → PRODUCTION_DATABASE_URL (no fallback; must be set explicitly)
 *
 * When no `--env` flag is given, defaults to staging.
 */
export type DbEnv = "staging" | "production";

export function parseEnvFromArgv(argv: string[]): DbEnv {
  for (const arg of argv) {
    if (arg === "--env=staging") return "staging";
    if (arg === "--env=production" || arg === "--env=prod") return "production";
  }
  return "staging";
}

export function resolveConnectionString(env: DbEnv): string {
  if (env === "production") {
    const url = process.env["PRODUCTION_DATABASE_URL"];
    if (!url) {
      throw new Error(
        "PRODUCTION_DATABASE_URL must be set to run against production. " +
          "Add it to your environment (do NOT commit it to git).",
      );
    }
    return url;
  }
  const url = process.env["STAGING_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "STAGING_DATABASE_URL (or DATABASE_URL) must be set for staging.",
    );
  }
  return url;
}

export function bannerFor(env: DbEnv): string {
  return env === "production"
    ? "🔴 PRODUCTION database"
    : "🟡 STAGING database";
}
