import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      service: "nxtdrive",
      appVersion: process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0-dev",
      commit: process.env["GIT_SHA"] ?? process.env["VERCEL_GIT_COMMIT_SHA"] ?? null,
      migrationVersion: process.env["DATABASE_MIGRATION_VERSION"] ?? null,
      readinessEngineVersion:
        process.env["READINESS_ENGINE_VERSION"] ?? "shadow-unpublished",
      builtAt: process.env["BUILD_TIMESTAMP"] ?? null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
