import { NextRequest, NextResponse } from "next/server";

import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { getCurrentUser } from "@/lib/auth/session";
import {
  createPrivacyRequest,
  type PrivacyRequestType,
} from "@/lib/privacy/service";
import {
  consumeRateLimit,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service";

const ALLOWED_REQUESTS = new Set<PrivacyRequestType>([
  "DATA_EXPORT",
  "ACCOUNT_DELETION",
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("privacy_requests")
    .select(
      "id, request_type, status, requested_at, updated_at, export_expires_at, completed_at",
    )
    .or(`subject_user_id.eq.${user.id},requested_by.eq.${user.id}`)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      { error: "Verzoeken konden niet worden geladen." },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { requests: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveActiveTenant(user);
  if (!tenant) {
    return NextResponse.json(
      { error: "Selecteer eerst een rijschool." },
      { status: 409 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    requestType?: string;
  } | null;
  const requestType = body?.requestType as PrivacyRequestType | undefined;
  if (!requestType || !ALLOWED_REQUESTS.has(requestType)) {
    return NextResponse.json(
      { error: "Ongeldig verzoekstype." },
      { status: 400 },
    );
  }

  const decision = await consumeRateLimit({
    purpose:
      requestType === "DATA_EXPORT"
        ? "privacy_export"
        : "privacy_deletion",
    identifiers: [tenant.id, user.id],
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "Te veel verzoeken. Probeer het later opnieuw." },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  const service = createServiceRoleClient();
  const { data: student } = await service
    .from("students")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const suppliedIdempotency = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey =
    suppliedIdempotency &&
    /^[A-Za-z0-9._:-]{8,128}$/.test(suppliedIdempotency)
      ? suppliedIdempotency
      : crypto.randomUUID();
  const record = await createPrivacyRequest(service, {
    tenantId: tenant.id,
    requestType,
    subjectUserId: user.id,
    subjectStudentId: (student?.id as string | undefined) ?? null,
    requestedBy: user.id,
    idempotencyKey,
  });
  return NextResponse.json(
    { id: record.id, status: record.status },
    { status: 202, headers: rateLimitHeaders(decision) },
  );
}
