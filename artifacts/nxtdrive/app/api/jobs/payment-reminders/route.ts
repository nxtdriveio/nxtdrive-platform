/**
 * Payment-reminder job (cron-invoked).
 *
 * An external scheduler (VPS cron / GitHub Actions) POSTs here on an interval
 * with the shared `x-cron-secret` header. For every tenant whose payment-
 * reminder policy is enabled, it finds open (kind='invoice') invoices whose
 * due_date has passed and sends a reminder for each cadence step that is now
 * due (days after due_date, e.g. 1/7/14). Idempotency is enforced by the
 * notification_log dedupe key on (invoice, step), so repeated cron runs never
 * double-send. To avoid a burst when an invoice becomes very overdue, only the
 * HIGHEST due step is sent per invoice per run.
 *
 * Server-side only: uses the service role client and is gated behind a shared
 * secret. If no secret is configured the route fails closed (503).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadPaymentReminderPolicy } from "@/lib/invoices/payment-reminder-policy";
import { notifyPaymentReminder } from "@/lib/notifications/dispatch";

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
    console.error("[payment-reminders] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const policy = await loadPaymentReminderPolicy(service, tenantId);
    if (!policy.enabled || policy.days.length === 0) continue;

    const { data: invoices } = await service
      .from("invoices")
      .select("id, due_date")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .eq("kind", "invoice")
      .not("due_date", "is", null)
      .lt("due_date", todayIso);

    for (const invoice of invoices ?? []) {
      const dueRaw = invoice.due_date as string | null;
      if (!dueRaw) continue;
      const due = new Date(dueRaw);
      const daysOverdue = Math.floor((now - due.getTime()) / 86_400_000);
      // Highest cadence step that has been reached. Earlier steps were already
      // sent (idempotently) on previous runs; sending only the top step avoids
      // a burst when an invoice surfaces well past its due date.
      const dueStep = policy.days
        .filter((d) => daysOverdue >= d)
        .reduce<number | null>((max, d) => (max === null || d > max ? d : max), null);
      if (dueStep === null) continue;

      processed++;
      try {
        const res = await notifyPaymentReminder(
          service,
          tenantId,
          invoice.id as string,
          dueStep,
        );
        if (res.outcome === "sent") sent++;
        else if (res.outcome === "already_sent") skipped++;
      } catch (err) {
        console.error("[payment-reminders] send failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}
