/**
 * Lesson-reminder job (cron-invoked).
 *
 * An external scheduler (VPS cron / GitHub Actions) POSTs here on an interval
 * with the shared `x-cron-secret` header. For every tenant whose reminder
 * window is enabled, it finds `planned` lessons starting within that window
 * and sends each student a reminder exactly once (idempotency enforced by the
 * notification_log dedupe key on the lesson id).
 *
 * Server-side only: uses the service role client and is gated behind a shared
 * secret. If no secret is configured the route fails closed (503).
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getReminderSettings } from "@/lib/notifications/settings";
import { notifyLessonReminder } from "@/lib/notifications/dispatch";

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
    console.error("[lesson-reminders] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;
    const settings = await getReminderSettings(service, tenantId);
    if (!settings.enabled) continue;

    const windowEnd = new Date(
      now + settings.hoursBefore * 3_600_000,
    ).toISOString();

    const { data: lessons } = await service
      .from("lessons")
      .select("id, starts_at, location, student_id")
      .eq("tenant_id", tenantId)
      .eq("status", "planned")
      .gte("starts_at", nowIso)
      .lte("starts_at", windowEnd);

    for (const lesson of lessons ?? []) {
      processed++;
      try {
        const res = await notifyLessonReminder(service, tenantId, {
          id: lesson.id as string,
          starts_at: lesson.starts_at as string,
          location: (lesson.location as string | null) ?? null,
          student_id: lesson.student_id as string,
        });
        if (res.outcome === "sent") sent++;
        else if (res.outcome === "already_sent") skipped++;
      } catch (err) {
        console.error("[lesson-reminders] send failed", err);
      }
    }
  }

  return NextResponse.json({ ok: true, processed, sent, skipped });
}
