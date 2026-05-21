/**
 * Mollie webhook receiver.
 *
 * Mollie POSTs form-encoded `id=tr_xxx` to this URL whenever a payment
 * status changes. The body is not signed; per Mollie's spec we authenticate
 * by re-fetching the payment from Mollie's API using the per-tenant API
 * key. Only the tenant that owns the Mollie account holds that key, which
 * is what makes cross-tenant forgery hard.
 *
 * We always return 200 unless the request is malformed — Mollie retries on
 * non-2xx, and we want to avoid retry storms when our own processing fails
 * transiently. Real failures are still surfaced via audit_log + server logs.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKey } from "@/lib/mollie/secrets";
import { getPayment, mollieAmountToCents } from "@/lib/mollie/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await ctx.params;
  if (!/^[0-9a-f-]{32,40}$/i.test(tenantId)) {
    return new NextResponse("invalid tenant", { status: 400 });
  }

  let paymentId: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      paymentId = params.get("id");
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { id?: string };
      paymentId = body.id ?? null;
    } else {
      // Mollie always uses form-encoded; still try as fallback.
      const text = await request.text();
      paymentId = new URLSearchParams(text).get("id");
    }
  } catch {
    return new NextResponse("malformed body", { status: 400 });
  }

  if (!paymentId || !/^[A-Za-z0-9_]+$/.test(paymentId)) {
    return new NextResponse("missing payment id", { status: 400 });
  }

  const service = createServiceRoleClient();

  // Verify tenant exists.
  const { data: tenantRow } = await service
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenantRow) {
    // Don't leak existence; just 200 so Mollie doesn't retry forever.
    return new NextResponse("ok", { status: 200 });
  }

  let apiKey: string | null;
  try {
    apiKey = await getMollieApiKey(service, tenantId);
  } catch (err) {
    // Decrypting the per-tenant key failed (corrupted ciphertext or
    // wrong master secret). Surface as 5xx so Mollie keeps retrying
    // while we fix configuration.
    console.error("[mollie webhook] getMollieApiKey failed", err);
    return new NextResponse("key error", { status: 500 });
  }
  if (!apiKey) {
    // No API key configured for this tenant — Mollie shouldn't have been
    // able to send this webhook in the first place. Acknowledge so we
    // don't enter a retry loop; the operator will see the orphaned
    // payment in their Mollie dashboard.
    return new NextResponse("ok", { status: 200 });
  }

  let payment;
  try {
    payment = await getPayment(apiKey, paymentId);
  } catch (err) {
    // Mollie unreachable / 5xx. Return 503 so Mollie retries with backoff.
    // (4xx from Mollie typically means our key is wrong / payment doesn't
    // exist for this account — also worth retrying briefly while the
    // operator investigates.)
    console.error("[mollie webhook] getPayment failed", err);
    return new NextResponse("upstream fetch failed", { status: 503 });
  }

  // Cross-tenant guard: the metadata recorded at create-time must point
  // back to this tenant. If not, refuse to touch anything.
  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const metaTenant =
    typeof meta["tenant_id"] === "string" ? (meta["tenant_id"] as string) : null;
  const metaInvoice =
    typeof meta["invoice_id"] === "string" ? (meta["invoice_id"] as string) : null;
  if (!metaTenant || !metaInvoice || metaTenant !== tenantId) {
    return new NextResponse("ok", { status: 200 });
  }

  const amountCents = mollieAmountToCents(payment.amount);
  const paidAt = payment.paidAt ? new Date(payment.paidAt).toISOString() : null;

  const { error: rpcErr } = await service.rpc("confirm_mollie_payment", {
    p_tenant_id: tenantId,
    p_actor: null,
    p_invoice_id: metaInvoice,
    p_mollie_payment_id: payment.id,
    p_status: payment.status,
    p_amount_cents: amountCents,
    p_currency: payment.amount.currency,
    p_method: payment.method,
    p_paid_at: paidAt,
    p_raw_payload: payment as unknown as Record<string, unknown>,
  });
  if (rpcErr) {
    // DB-level failure (transient pg error, connection drop, etc). Return
    // 500 so Mollie retries — the RPC is idempotent, so a retry is safe.
    console.error("[mollie webhook] confirm_mollie_payment failed", rpcErr);
    return new NextResponse("rpc failed", { status: 500 });
  }

  return new NextResponse("ok", { status: 200 });
}

// Mollie also sends a GET to validate the webhook URL. Accept it.
export async function GET() {
  return new NextResponse("ok", { status: 200 });
}
