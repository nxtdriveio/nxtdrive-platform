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
        message: "Database query failed.",
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
      message: "Database connection failed.",
    };
  }
}

async function migrationCheck(): Promise<CheckResult> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("tenants")
      .select("id, timezone", { count: "exact", head: true })
      .limit(1);
    return error
      ? { ok: false, message: "Expected database schema is not available." }
      : { ok: true };
  } catch {
    return { ok: false, message: "Migration compatibility check failed." };
  }
}

async function queueCheck(): Promise<CheckResult> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .limit(1);
    return error
      ? { ok: false, message: "Notification outbox is unavailable." }
      : { ok: true };
  } catch {
    return { ok: false, message: "Notification outbox check failed." };
  }
}

async function storageCheck(): Promise<CheckResult> {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.storage.listBuckets();
    return error
      ? { ok: false, message: "Object storage is unavailable." }
      : { ok: true };
  } catch {
    return { ok: false, message: "Object storage check failed." };
  }
}

export async function GET() {
  const env = envCheck();
  const skipped = {
    ok: false,
    message: "Skipped because runtime environment is incomplete.",
  };
  const [database, migrations, queue, storage] = env.ok
    ? await Promise.all([
        databaseCheck(),
        migrationCheck(),
        queueCheck(),
        storageCheck(),
      ])
    : [skipped, skipped, skipped, skipped];

  const ok =
    env.ok && database.ok && migrations.ok && queue.ok && storage.ok;

  return NextResponse.json(
    {
      status: ok ? "ready" : "degraded",
      service: "nxtdrive",
      timestamp: new Date().toISOString(),
      checks: {
        env,
        database,
        migrations,
        queue,
        storage,
      },
    },
    {
      status: ok ? 200 : 503,
      headers,
    },
  );
}
