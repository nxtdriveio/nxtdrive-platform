/**
 * End-to-end live dispatch + cron idempotency test for the lesson-reminder job.
 *
 *   pnpm --filter @workspace/scripts run db:test-notifications-send
 *
 * Requires the nxtdrive app to be running and CRON_SECRET to be set. The cron
 * route lives in the Next.js app under /api/jobs/lesson-reminders. IMPORTANT:
 * the shared proxy (localhost:80) routes /api to the Express api-server, so the
 * Next.js route is only reachable LOCALLY on the app's own port. This test
 * therefore defaults APP_BASE_URL to the nxtdrive dev port (http://localhost:22557).
 * Override APP_BASE_URL to target another host (e.g. a deployed staging URL,
 * where Caddy routes nxtdrive.io straight to Next.js).
 *
 * What it proves (against the demo-academy tenant, with throwaway fixtures):
 *   1. The cron route rejects calls without / with a wrong x-cron-secret.
 *   2. A planned lesson in the reminder window is processed via the real
 *      dispatch flow (enqueue -> send -> mark) and logged in notification_log.
 *   3. When SendGrid is configured: status becomes 'sent' with a real
 *      provider_message_id (a real email is delivered to the test recipient).
 *      When it is not: status degrades to 'skipped' and nothing crashes.
 *   4. A second identical run never double-sends (idempotent): exactly one log
 *      row, unchanged sent_at, and the job reports it as skipped/already-sent.
 *
 * Recipient (when SendGrid is configured): TEST_NOTIFICATION_EMAIL, falling back
 * to SENDGRID_FROM_EMAIL.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const DEDUPE_PREFIX = "lesson_reminder:lesson:";

async function postCron(
  baseUrl: string,
  secret: string | null,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (secret !== null) headers["x-cron-secret"] = secret;
  const res = await fetch(`${baseUrl}/api/jobs/lesson-reminders`, {
    method: "POST",
    headers,
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running lesson-reminder live dispatch test`);

  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const cronSecret = process.env["CRON_SECRET"];
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  if (!cronSecret) {
    throw new Error("CRON_SECRET must be set (the cron route fails closed without it).");
  }

  const baseUrl = (process.env["APP_BASE_URL"] ?? "http://localhost:22557").replace(/\/$/, "");
  const emailConfigured = Boolean(
    process.env["SENDGRID_API_KEY"] && process.env["SENDGRID_FROM_EMAIL"],
  );
  const recipient =
    process.env["TEST_NOTIFICATION_EMAIL"] ??
    process.env["SENDGRID_FROM_EMAIL"] ??
    "smoketest@example.com";

  console.log(
    emailConfigured
      ? `SendGrid configured — expecting a real send to ${recipient}`
      : "SendGrid NOT configured — expecting graceful 'skipped' degradation",
  );

  const service: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  let instructorUserId: string | null = null;
  let studentId: string | null = null;
  let lessonId: string | null = null;

  try {
    const { data: tenant } = await service
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      console.error("demo-academy tenant missing — run db:seed first");
      process.exit(1);
    }
    const tenantId = tenant.id as string;

    // --- Auth: secret gating ------------------------------------------------
    const noSecret = await postCron(baseUrl, null);
    results.push({
      name: "POST without x-cron-secret is rejected (401)",
      ok: noSecret.status === 401,
      detail: `status=${noSecret.status}`,
    });

    const wrongSecret = await postCron(baseUrl, `wrong-${stamp}`);
    results.push({
      name: "POST with wrong x-cron-secret is rejected (401)",
      ok: wrongSecret.status === 401,
      detail: `status=${wrongSecret.status}`,
    });

    // --- Fixtures: throwaway instructor, student, planned lesson ------------
    // A dedicated auth user as instructor avoids the no-overlap exclusion
    // constraint against any seeded lessons.
    const { data: created, error: userErr } = await service.auth.admin.createUser({
      email: `notif-instr-${stamp}@example.com`,
      password: `n-pass-${stamp}`,
      email_confirm: true,
    });
    if (userErr || !created.user) {
      throw new Error(`create instructor user: ${userErr?.message}`);
    }
    instructorUserId = created.user.id;

    const { data: student, error: studErr } = await service
      .from("students")
      .insert({
        tenant_id: tenantId,
        full_name: `Notif Smoke Student ${stamp}`,
        email: recipient,
      })
      .select("id")
      .single();
    if (studErr || !student) throw new Error(`create student: ${studErr?.message}`);
    studentId = student.id as string;

    // Within the default 24h reminder window.
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();
    const { data: lesson, error: lessonErr } = await service
      .from("lessons")
      .insert({
        tenant_id: tenantId,
        instructor_id: instructorUserId,
        student_id: studentId,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "planned",
        location: "Smoke Test Lokatie",
      })
      .select("id")
      .single();
    if (lessonErr || !lesson) throw new Error(`create lesson: ${lessonErr?.message}`);
    lessonId = lesson.id as string;
    const dedupeKey = `${DEDUPE_PREFIX}${lessonId}`;

    // --- Run 1: the real dispatch flow -------------------------------------
    const run1 = await postCron(baseUrl, cronSecret);
    results.push({
      name: "Authenticated cron run returns 200",
      ok: run1.status === 200,
      detail: `status=${run1.status} body=${run1.body}`,
    });

    const { data: row1 } = await service
      .from("notification_log")
      .select("id, status, provider, provider_message_id, sent_at")
      .eq("tenant_id", tenantId)
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();

    results.push({
      name: "notification_log row created for the lesson",
      ok: Boolean(row1),
      detail: row1 ? `status=${row1.status}` : "no row",
    });

    if (emailConfigured) {
      results.push({
        name: "status is 'sent' with a provider_message_id (real delivery)",
        ok:
          row1?.status === "sent" &&
          row1?.provider === "sendgrid" &&
          Boolean(row1?.provider_message_id),
        detail: row1
          ? `status=${row1.status} provider=${row1.provider} msgId=${row1.provider_message_id ?? "(none)"}`
          : "no row",
      });
    } else {
      results.push({
        name: "status degrades to 'skipped' (graceful, no crash)",
        ok: row1?.status === "skipped",
        detail: row1 ? `status=${row1.status}` : "no row",
      });
    }

    const firstSentAt = row1?.sent_at ?? null;

    // --- Run 2: idempotency -------------------------------------------------
    const run2 = await postCron(baseUrl, cronSecret);
    results.push({
      name: "Second cron run returns 200",
      ok: run2.status === 200,
      detail: `status=${run2.status} body=${run2.body}`,
    });

    const { data: rowsAfter } = await service
      .from("notification_log")
      .select("id, status, sent_at")
      .eq("tenant_id", tenantId)
      .eq("dedupe_key", dedupeKey);

    results.push({
      name: "Idempotent: exactly one log row after a repeat run",
      ok: (rowsAfter?.length ?? 0) === 1,
      detail: `rows=${rowsAfter?.length ?? 0}`,
    });

    if (emailConfigured) {
      const sentAtUnchanged =
        rowsAfter?.[0]?.sent_at === firstSentAt && firstSentAt !== null;
      results.push({
        name: "Idempotent: sent_at unchanged (no re-send)",
        ok: sentAtUnchanged,
        detail: `before=${firstSentAt} after=${rowsAfter?.[0]?.sent_at ?? null}`,
      });
    }
  } finally {
    // --- Cleanup ------------------------------------------------------------
    if (lessonId) {
      await service.from("notification_log").delete().eq("related_id", lessonId);
      await service.from("lessons").delete().eq("id", lessonId);
    }
    if (studentId) await service.from("students").delete().eq("id", studentId);
    if (instructorUserId) await service.auth.admin.deleteUser(instructorUserId);
  }

  console.log();
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (!r.ok) failed++;
  }
  console.log();
  if (failed > 0) {
    console.error(`${failed}/${results.length} checks failed.`);
    process.exit(1);
  }
  console.log(`All ${results.length} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
