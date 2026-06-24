import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getServerSupabaseAnonKey,
  getServerSupabaseUrl,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  ok: boolean;
  message?: string;
  missing?: string[];
  latencyMs?: number;
};

const REQUIRED_ENV = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "DATABASE_URL",
] as const;

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function envCheck(): CheckResult {
  const missing: string[] = REQUIRED_ENV.filter((key) => !process.env[key]);

  try {
    getServerSupabaseUrl();
  } catch {
    missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  }

  try {
    getServerSupabaseAnonKey();
  } catch {
    missing.push("SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return missing.length === 0
    ? { ok: true }
    : {
        ok: false,
        missing,
        message: "Required runtime environment variables are missing.",
      };
}

async function databaseCheck(): Promise<CheckResult> {
  const startedAt = Date.now();

  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error.message,
      };
    }

    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown database error.",
    };
  }
}

export async function GET() {
  const env = envCheck();
  const database = env.ok
    ? await databaseCheck()
    : {
        ok: false,
        message: "Skipped because runtime environment is incomplete.",
      };

  const ok = env.ok && database.ok;

  return NextResponse.json(
    {
      status: ok ? "ready" : "degraded",
      service: "nxtdrive",
      timestamp: new Date().toISOString(),
      checks: {
        env,
        database,
      },
    },
    {
      status: ok ? 200 : 503,
      headers,
    },
  );
}
