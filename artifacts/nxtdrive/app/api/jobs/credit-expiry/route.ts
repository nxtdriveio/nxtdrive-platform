/**
 * Credit-expiry sweep (cron-invoked) — Module 5 tegoed.
 *
 * An external scheduler POSTs here on an interval with the shared
 * `x-cron-secret` header. For every tenant it calls expire_student_credits,
 * which books any tegoed past its package validity as a negative
 * 'credit_expired' ledger row (FIFO, idempotent, never driving the saldo
 * negative) plus an audit entry.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured. All tegoed mutation happens inside the service-role
 * RPC — never client-side, always audited.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return new NextResponse("cron not configured", { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== secret) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: tenants, error: tenantsErr } = await service
    .from("tenants")
    .select("id");
  if (tenantsErr) {
    console.error("[credit-expiry] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  let expired = 0;
  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const { data, error } = await service.rpc("expire_student_credits", {
      p_tenant_id: tenantId,
      p_actor: null,
    });
    if (error) {
      console.error("[credit-expiry] expire failed", tenantId, error);
      continue;
    }
    expired += (data as number | null) ?? 0;
  }

  return NextResponse.json({ ok: true, expired });
}
