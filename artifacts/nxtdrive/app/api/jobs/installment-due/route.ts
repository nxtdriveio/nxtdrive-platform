/**
 * Installment-due job (cron-invoked) — Task #107.
 *
 * An external scheduler (VPS cron / GitHub Actions) POSTs here on an interval
 * with the shared `x-cron-secret` header. For every tenant whose installment-due
 * reminder is enabled, it finds open termijn-invoices (kind='invoice', with an
 * installment_plan_id) whose due_date falls within the configured lead window
 * (today .. today + lead_days) and sends a friendly heads-up for each.
 *
 * This complements the overdue payment-reminder job (which runs AFTER due_date):
 * this is the gentle reminder AROUND the due date. Idempotency is enforced by
 * the notification_log dedupe key on the invoice id, so repeated runs never
 * double-send.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getInstallmentDueSettings } from "@/lib/notifications/settings";
import { notifyInstallmentDue } from "@/lib/notifications/dispatch";

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
    console.error("[installment-due] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const settings = await getInstallmentDueSettings(service, tenantId);
    if (!settings.enabled) continue;

    const windowEnd = new Date(now + settings.leadDays * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: invoices } = await service
      .from("invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .eq("kind", "invoice")
      .not("installment_plan_id", "is", null)
      .gte("due_date", todayIso)
      .lte("due_date", windowEnd);

    for (const invoice of invoices ?? []) {
      processed++;
      try {
        const res = await notifyInstallmentDue(
          service,
          tenantId,
          invoice.id as string,
        );
        if (res.outcome === "sent") sent++;
        else if (res.outcome === "already_sent") skipped++;
      } catch (err) {
        console.error("[installment-due] send failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}
