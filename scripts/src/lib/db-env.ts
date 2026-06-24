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

type ConnectionTarget = {
  database: string;
  host: string;
  kind: "direct" | "pooler" | "postgres";
  port: string;
  projectRef: string | null;
  user: string;
};

function parsePostgresConnectionString(connectionString: string): URL {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "Database connection string is not a valid URL. Expected a postgres:// or postgresql:// URL.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "Database connection string must start with postgres:// or postgresql://.",
    );
  }

  if (!url.hostname || !url.username) {
    throw new Error(
      "Database connection string must include a host and username.",
    );
  }

  return url;
}

function projectRefFromSupabaseApiUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const match = /^([a-z0-9-]+)\.supabase\.co$/i.exec(url.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function describeConnectionString(connectionString: string): ConnectionTarget {
  const url = parsePostgresConnectionString(connectionString);
  const host = url.hostname.toLowerCase();
  const user = decodeURIComponent(url.username);
  const directMatch = /^db\.([a-z0-9-]+)\.supabase\.co$/i.exec(host);
  const poolerUserMatch = /^postgres\.([a-z0-9-]+)$/i.exec(user);
  const kind = host.endsWith(".pooler.supabase.com")
    ? "pooler"
    : directMatch
      ? "direct"
      : "postgres";

  return {
    database: url.pathname.replace(/^\/+/, "") || "postgres",
    host,
    kind,
    port: url.port || (kind === "pooler" ? "6543" : "5432"),
    projectRef:
      directMatch?.[1]?.toLowerCase() ??
      poolerUserMatch?.[1]?.toLowerCase() ??
      null,
    user,
  };
}

function expectedSupabaseProjectRef(env: DbEnv): string | null {
  if (env === "production") {
    return projectRefFromSupabaseApiUrl(process.env["PRODUCTION_SUPABASE_URL"]);
  }

  return (
    projectRefFromSupabaseApiUrl(process.env["STAGING_SUPABASE_URL"]) ??
    projectRefFromSupabaseApiUrl(process.env["SUPABASE_URL"]) ??
    projectRefFromSupabaseApiUrl(process.env["NEXT_PUBLIC_SUPABASE_URL"])
  );
}

export function describeConnectionTarget(connectionString: string): string {
  const target = describeConnectionString(connectionString);
  return `${target.kind} ${target.host}:${target.port}/${target.database} as ${target.user}`;
}

export function validateConnectionTarget(env: DbEnv, connectionString: string): void {
  const target = describeConnectionString(connectionString);

  if (target.kind === "pooler" && !/^postgres\.[a-z0-9-]+$/i.test(target.user)) {
    throw new Error(
      "Supabase pooler DATABASE_URL must use username postgres.<project-ref>. " +
        `Current username is "${target.user}". Copy a fresh pooler connection string from the Supabase dashboard.`,
    );
  }

  if (target.kind === "direct" && target.user.startsWith("postgres.")) {
    throw new Error(
      "Supabase direct DATABASE_URL (db.<project-ref>.supabase.co) must use username postgres. " +
        "The postgres.<project-ref> username is only for pooler URLs.",
    );
  }

  const expectedRef = expectedSupabaseProjectRef(env);
  if (expectedRef && target.projectRef && expectedRef !== target.projectRef) {
    const envLabel = env === "production" ? "production" : "staging";
    throw new Error(
      `${envLabel} Supabase secrets target different projects. ` +
        `The API URL points at "${expectedRef}", but DATABASE_URL points at "${target.projectRef}". ` +
        `Update the GitHub Environment "${envLabel}" secrets so DATABASE_URL and SUPABASE_URL belong to the same Supabase project.`,
    );
  }
}

export function explainConnectionFailure(
  err: unknown,
  env: DbEnv,
  connectionString: string,
): Error {
  const target = describeConnectionTarget(connectionString);
  const message = err instanceof Error ? err.message : String(err);
  const envLabel = env === "production" ? "PRODUCTION" : "STAGING";

  if (/tenant\/user .* not found/i.test(message)) {
    return new Error(
      `${envLabel}_DATABASE_URL was rejected by the Supabase pooler (${target}). ` +
        "This usually means the connection string was copied from the wrong Supabase project, " +
        "uses the wrong pooler username, or points at a project/pooler tenant that no longer exists. " +
        "Refresh the DATABASE_URL secret from the matching Supabase project. " +
        "Pooler URLs use username postgres.<project-ref>; direct URLs use username postgres. " +
        `Original error: ${message}`,
    );
  }

  return new Error(
    `Could not connect to ${envLabel}_DATABASE_URL (${target}). Original error: ${message}`,
  );
}

function resolveRealtimeTransport(): typeof WebSocket | undefined {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }

  class ScriptOnlyWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = ScriptOnlyWebSocket.CONNECTING;
    readonly OPEN = ScriptOnlyWebSocket.OPEN;
    readonly CLOSING = ScriptOnlyWebSocket.CLOSING;
    readonly CLOSED = ScriptOnlyWebSocket.CLOSED;
    readonly readyState = ScriptOnlyWebSocket.CLOSED;
    binaryType: "blob" | "arraybuffer" = "arraybuffer";
    bufferedAmount = 0;
    extensions = "";
    protocol = "";
    url = "";
    onclose = null;
    onerror = null;
    onmessage = null;
    onopen = null;

    constructor() {
      throw new Error(
        "This script runtime does not provide a native WebSocket transport. " +
          "The admin client is configured for REST-only usage; realtime/channel usage is not supported here.",
      );
    }

    addEventListener(): void {}
    close(): void {}
    dispatchEvent(): boolean {
      return true;
    }
    removeEventListener(): void {}
    send(): void {}
  }

  return ScriptOnlyWebSocket as unknown as typeof WebSocket;
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
    realtime: { transport: resolveRealtimeTransport() },
  });
}

export function bannerFor(env: DbEnv): string {
  return env === "production"
    ? "🔴 PRODUCTION database"
    : "🟡 STAGING database";
}
