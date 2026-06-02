/**
 * Package threshold signal sweep (cron-invoked) — Module 4/5.
 *
 * An external scheduler POSTs here on an interval with the shared
 * `x-cron-secret` header. The actual work runs inside the
 * `ensure_package_signals` service-role RPC (migration 0066): per tenant it
 * allocates each student's consumption FIFO across their package grants
 * (oldest first) so a grant only signals on the minutes drawn from its own
 * lot — multiple overlapping grants no longer mis-attribute each other's
 * usage. A grant whose package defines `signal_threshold_minutes` raises a
 * single backoffice follow-up task once its allocated minutes reach the
 * threshold, deduped per grant so it fires exactly once.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured. No tegoed is mutated here — only a task is created.
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
    console.error("[package-thresholds] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  let signalled = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const { data, error } = await service.rpc("ensure_package_signals", {
      p_tenant_id: tenantId,
      p_actor: null,
    });
    if (error) {
      console.error("[package-thresholds] ensure_package_signals failed", tenantId, error);
      continue;
    }
    signalled += typeof data === "number" ? data : 0;
  }

  return NextResponse.json({ ok: true, signalled });
}
