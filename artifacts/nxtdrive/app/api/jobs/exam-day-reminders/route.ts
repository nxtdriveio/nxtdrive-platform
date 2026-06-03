/**
 * Exam-day-reminder job (cron-invoked) — Task #107.
 *
 * An external scheduler (VPS cron / GitHub Actions) POSTs here on an interval
 * with the shared `x-cron-secret` header. For every tenant whose exam-day
 * reminder is enabled, it finds planned exam / TTT appointments
 * (agenda_appointments, type 'exam'/'interim_test', status 'planned') that start
 * within the configured window and mails the linked student a reminder.
 *
 * Idempotency is enforced by the notification_log dedupe key on the appointment
 * id, so repeated runs never double-send.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getExamDayReminderSettings } from "@/lib/notifications/settings";
import { notifyExamDayReminder } from "@/lib/notifications/dispatch";

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
    console.error("[exam-day-reminders] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const settings = await getExamDayReminderSettings(service, tenantId);
    if (!settings.enabled) continue;

    const windowEnd = new Date(
      now + settings.hoursBefore * 3_600_000,
    ).toISOString();

    const { data: appointments } = await service
      .from("agenda_appointments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "planned")
      .in("type", ["exam", "interim_test"])
      .not("student_id", "is", null)
      .gte("starts_at", nowIso)
      .lte("starts_at", windowEnd);

    for (const appt of appointments ?? []) {
      processed++;
      try {
        const res = await notifyExamDayReminder(
          service,
          tenantId,
          appt.id as string,
        );
        if (res.outcome === "sent") sent++;
        else if (res.outcome === "already_sent") skipped++;
      } catch (err) {
        console.error("[exam-day-reminders] send failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}
