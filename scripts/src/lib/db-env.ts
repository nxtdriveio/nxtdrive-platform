/**
 * Resolves the Postgres connection string for a target environment.
 *
 * Pass `--env=staging` or `--env=production` to select which secret to use:
 *   - staging    → STAGING_DATABASE_URL, falls back to DATABASE_URL
 *   - production → PRODUCTION_DATABASE_URL (no fallback; must be set explicitly)
 *
 * When no `--env` flag is given, defaults to staging.
 *
 * resolveSupabaseAdminClient() resolves the Supabase Admin client:
 *   - staging    → SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - production → PRODUCTION_SUPABASE_URL + PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export function resolveSupabaseAdminClient(env: DbEnv): SupabaseClient {
  let url: string;
  let serviceKey: string;

  if (env === "production") {
    url = process.env["PRODUCTION_SUPABASE_URL"] ?? "";
    serviceKey = process.env["PRODUCTION_SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    if (!url || !serviceKey) {
      throw new Error(
        "PRODUCTION_SUPABASE_URL and PRODUCTION_SUPABASE_SERVICE_ROLE_KEY must be set " +
          "to run against production. Add them to your environment (do NOT commit them to git).",
      );
    }
  } else {
    url = process.env["SUPABASE_URL"] ?? "";
    serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
    if (!url || !serviceKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for staging.",
      );
    }
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function bannerFor(env: DbEnv): string {
  return env === "production"
    ? "🔴 PRODUCTION database"
    : "🟡 STAGING database";
}
