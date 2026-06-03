/**
 * Low-credit job (cron-invoked) — Task #107.
 *
 * An external scheduler (VPS cron / GitHub Actions) POSTs here on an interval
 * with the shared `x-cron-secret` header. For every tenant whose low-credit
 * alert is enabled, it finds active students whose remaining lestegoed (minutes)
 * has dropped to or below the configured threshold (but is still > 0) and mails
 * them a "lestegoed bijna op" heads-up.
 *
 * Idempotency + re-arm: the dedupe key embeds the student's top-up epoch (the
 * number of positive credit_ledger mutations). One alert is sent per epoch, so
 * after the student buys a new package the epoch advances and a future dip below
 * the threshold can alert again — exactly once — without any extra state.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getLowCreditSettings } from "@/lib/notifications/settings";
import { notifyCreditLow } from "@/lib/notifications/dispatch";

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
    console.error("[credit-low] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const settings = await getLowCreditSettings(service, tenantId);
    if (!settings.enabled) continue;

    // Active students whose balance is low but not depleted. The balance view
    // sums all ledger deltas (minutes) per student.
    const { data: balances } = await service
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("tenant_id", tenantId)
      .gt("balance", 0)
      .lte("balance", settings.thresholdMinutes);

    for (const row of balances ?? []) {
      const studentId = row.student_id as string;
      const balance = row.balance as number;

      // Only alert active students.
      const { data: student } = await service
        .from("students")
        .select("active")
        .eq("id", studentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!student || student.active === false) continue;

      // Top-up epoch: number of positive ledger mutations (purchases/refunds/
      // openings). Advances on every top-up so the dedupe key re-arms.
      const { count } = await service
        .from("credit_ledger")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("student_id", studentId)
        .gt("delta", 0);
      const topupEpoch = count ?? 0;

      processed++;
      try {
        const res = await notifyCreditLow(
          service,
          tenantId,
          studentId,
          balance,
          topupEpoch,
        );
        if (res.outcome === "sent") sent++;
        else if (res.outcome === "already_sent") skipped++;
      } catch (err) {
        console.error("[credit-low] send failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}
