import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    {
      status: "live",
      service: "nxtdrive",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
