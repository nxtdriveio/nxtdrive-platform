import { NextRequest, NextResponse } from "next/server";

import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { getCurrentUser } from "@/lib/auth/session";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service";

function validLessonId(value: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveActiveTenant(user);
  const { lessonId } = await context.params;
  if (!tenant || !validLessonId(lessonId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data, error } = await createServiceRoleClient()
    .from("offline_lesson_drafts")
    .select("revision, status, payload, expires_at, updated_at")
    .eq("tenant_id", tenant.id)
    .eq("lesson_id", lessonId)
    .eq("actor_user_id", user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Draft unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { draft: data ?? null },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveActiveTenant(user);
  const { lessonId } = await context.params;
  if (!tenant || !validLessonId(lessonId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const decision = await consumeRateLimit({
    purpose: "offline_sync",
    identifiers: [tenant.id, user.id],
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Sync rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    idempotencyKey?: string;
    expectedServerRevision?: number | null;
    payload?: Record<string, unknown>;
    expiresAt?: string;
  } | null;
  if (
    !body ||
    !body.idempotencyKey ||
    !/^[A-Za-z0-9._:-]{8,128}$/.test(body.idempotencyKey) ||
    !body.payload ||
    !body.expiresAt ||
    !Number.isFinite(Date.parse(body.expiresAt))
  ) {
    return NextResponse.json(
      { error: "Invalid draft payload" },
      { status: 400 },
    );
  }
  const { data, error } = await createServiceRoleClient().rpc(
    "sync_offline_lesson_draft",
    {
      p_tenant_id: tenant.id,
      p_lesson_id: lessonId,
      p_actor: user.id,
      p_idempotency_key: body.idempotencyKey,
      p_expected_server_revision: body.expectedServerRevision ?? 0,
      p_payload: body.payload,
      p_expires_at: body.expiresAt,
    },
  );
  if (error) {
    return NextResponse.json({ error: "Draft sync failed" }, { status: 409 });
  }
  const result = data as {
    status?: string;
    revision?: number;
    serverPayload?: Record<string, unknown>;
    reason?: string;
  };
  return NextResponse.json(result, {
    status: result.status === "CONFLICT" ? 409 : 200,
    headers: {
      ...rateLimitHeaders(decision),
      "Cache-Control": "no-store, private",
    },
  });
}
