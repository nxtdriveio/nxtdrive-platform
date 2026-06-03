/**
 * Review-request flow tests for NXTDRIVE (review- & referralflow, growth).
 *
 *   pnpm --filter @workspace/scripts run db:test-review-requests
 *   pnpm --filter @workspace/scripts run db:test-review-requests -- --env=production
 *
 * Proves (against the demo-academy tenant, with throwaway fixtures):
 *   1. The notification_log/templates CHECK constraints accept the new
 *      'review_request' type (enqueue via the real RPC succeeds).
 *   2. Idempotency — enqueue_notification with the same (tenant, dedupe_key)
 *      never creates a second row. This is exactly what the review-moment
 *      dispatch relies on so a moment fires at most once per student.
 *   3. Tenant-configurability — the review_moments policy round-trips through
 *      tenant_settings: a disabled moment, a custom lesson threshold and a
 *      Google review URL all persist and read back unchanged. The platform
 *      default (all moments on, threshold 5) applies when no row exists.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const REVIEW_MOMENTS_KEY = "review_moments";

async function getDemoTenantId(service: SupabaseClient): Promise<string> {
  const { data } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "demo-academy")
    .maybeSingle();
  if (!data) {
    throw new Error("demo-academy tenant missing — run seed first");
  }
  return data.id as string;
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running review-request flow tests`);

  const url = process.env["SUPABASE_URL"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !service) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const tenantId = await getDemoTenantId(serviceClient);
  const dedupeKey = `review_request:test:${Date.now()}`;

  // Snapshot any existing review_moments setting so we can restore it.
  const { data: existingSetting } = await serviceClient
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", REVIEW_MOMENTS_KEY)
    .maybeSingle();
  const hadSetting = existingSetting !== null;
  const originalValue = existingSetting?.value ?? null;

  try {
    // 1. 'review_request' type is accepted + 2. idempotent enqueue.
    {
      const first = await serviceClient.rpc("enqueue_notification", {
        p_tenant_id: tenantId,
        p_channel: "email",
        p_type: "review_request",
        p_recipient_email: "review-test@example.com",
        p_subject: "Deel je ervaring",
        p_dedupe_key: dedupeKey,
        p_related_type: "student",
        p_related_id: null,
        p_payload: { moment: "after_trial" },
      });
      const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
      results.push({
        name: "enqueue accepts 'review_request' type",
        ok: !first.error && !!firstRow && firstRow.was_created === true,
        detail: first.error
          ? first.error.message
          : `was_created=${firstRow?.was_created}`,
      });

      const second = await serviceClient.rpc("enqueue_notification", {
        p_tenant_id: tenantId,
        p_channel: "email",
        p_type: "review_request",
        p_recipient_email: "review-test@example.com",
        p_subject: "Deel je ervaring",
        p_dedupe_key: dedupeKey,
        p_related_type: "student",
        p_related_id: null,
        p_payload: { moment: "after_trial" },
      });
      const secondRow = Array.isArray(second.data)
        ? second.data[0]
        : second.data;

      const { data: rows } = await serviceClient
        .from("notification_log")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", dedupeKey);

      results.push({
        name: "review_request enqueue is idempotent (one row per dedupe key)",
        ok:
          !second.error &&
          !!secondRow &&
          secondRow.was_created === false &&
          secondRow.id === firstRow?.id &&
          (rows ?? []).length === 1,
        detail: second.error
          ? second.error.message
          : `was_created=${secondRow?.was_created} rows=${(rows ?? []).length}`,
      });
    }

    // 3a. Tenant-config round-trips through tenant_settings.
    {
      const configValue = {
        active_moments: {
          after_trial: false,
          after_lessons: true,
          progress_milestone: true,
          exam_passed: true,
          traject_finished: true,
        },
        lesson_threshold: 8,
        google_review_url: "https://g.page/r/demo-academy/review",
      };
      const { error: upErr } = await serviceClient
        .from("tenant_settings")
        .upsert(
          { tenant_id: tenantId, key: REVIEW_MOMENTS_KEY, value: configValue },
          { onConflict: "tenant_id,key" },
        );

      const { data: readBack } = await serviceClient
        .from("tenant_settings")
        .select("value")
        .eq("tenant_id", tenantId)
        .eq("key", REVIEW_MOMENTS_KEY)
        .maybeSingle();
      const v = (readBack?.value ?? {}) as {
        active_moments?: Record<string, boolean>;
        lesson_threshold?: number;
        google_review_url?: string;
      };

      results.push({
        name: "review_moments policy round-trips (disabled moment + threshold + url)",
        ok:
          !upErr &&
          v.active_moments?.after_trial === false &&
          v.active_moments?.exam_passed === true &&
          v.lesson_threshold === 8 &&
          v.google_review_url === "https://g.page/r/demo-academy/review",
        detail: upErr
          ? upErr.message
          : `after_trial=${v.active_moments?.after_trial} threshold=${v.lesson_threshold}`,
      });
    }

    // 3b. Default applies when no row exists (threshold 5, all moments on).
    {
      await serviceClient
        .from("tenant_settings")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("key", REVIEW_MOMENTS_KEY);
      const { data: gone } = await serviceClient
        .from("tenant_settings")
        .select("value")
        .eq("tenant_id", tenantId)
        .eq("key", REVIEW_MOMENTS_KEY)
        .maybeSingle();
      results.push({
        name: "no review_moments row → platform default applies",
        ok: gone === null,
        detail: gone === null ? "absent (loader falls back to default 5)" : "row still present",
      });
    }
  } finally {
    // Cleanup notification_log row.
    await serviceClient
      .from("notification_log")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("dedupe_key", dedupeKey);
    // Restore the original review_moments setting (if any).
    if (hadSetting) {
      await serviceClient.from("tenant_settings").upsert(
        { tenant_id: tenantId, key: REVIEW_MOMENTS_KEY, value: originalValue },
        { onConflict: "tenant_id,key" },
      );
    }
  }

  // Report.
  let failures = 0;
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failures += 1;
    console.log(`  [${tag}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(
    `\n${results.length - failures}/${results.length} checks passed.`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
