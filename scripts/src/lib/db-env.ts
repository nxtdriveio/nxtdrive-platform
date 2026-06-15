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
