import { NextRequest, NextResponse } from "next/server";

import { processDataExportRequest } from "@/lib/privacy/service";
import { createServiceRoleClient } from "@/lib/supabase/service";

function authorized(request: NextRequest): boolean {
  const expected = process.env["CRON_SECRET"];
  const authorization = request.headers.get("authorization");
  return Boolean(expected && authorization === `Bearer ${expected}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("privacy_requests")
    .select("id")
    .eq("request_type", "DATA_EXPORT")
    .in("status", ["requested", "validating"])
    .order("requested_at", { ascending: true })
    .limit(10);
  if (error) {
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }
  const completed: string[] = [];
  const failed: string[] = [];
  for (const row of data ?? []) {
    try {
      await processDataExportRequest(service, row.id as string);
      completed.push(row.id as string);
    } catch {
      failed.push(row.id as string);
    }
  }
  return NextResponse.json({ completed, failed });
}
