/**
 * RLS + idempotency tests for Task #22 — Automated email notifications.
 *
 *   pnpm --filter @workspace/scripts run db:test-notifications
 *   pnpm --filter @workspace/scripts run db:test-notifications -- --env=production
 *
 * Asserts:
 *   1. enqueue_notification creates a 'queued' row (was_created=true).
 *   2. Re-enqueue with the same (tenant, dedupe_key) is idempotent:
 *      was_created=false, same id, and exactly one row exists.
 *   3. mark_notification_status('sent') sets status + sent_at.
 *   4. A 'sent' row is never overwritten (no destructive history rewrite).
 *   5. mark_notification_status across tenants is rejected (not found).
 *   6. A tenant member can read their own notification_log/templates rows.
 *   7. Cross-tenant: a member of tenant X cannot read tenant Y's rows.
 *   8. Anonymous role can read neither table.
 *   9. Anonymous role cannot call either RPC (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running notifications RLS + idempotency tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdLogIds: string[] = [];
  const password = `n-pass-${stamp}`;

  try {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      console.error("demo-academy tenant missing — run db:seed first");
      process.exit(1);
    }
    const tenantId: string = tenant.id;

    // Second tenant for cross-tenant isolation checks.
    const { data: otherTenant, error: otErr } = await serviceClient
      .from("tenants")
      .insert({ slug: `notif-other-${stamp}`, name: `Notif Other ${stamp}` })
      .select("id")
      .single();
    if (otErr || !otherTenant) {
      throw new Error(`create other tenant: ${otErr?.message}`);
    }
    const otherTenantId = otherTenant.id as string;
    createdTenantIds.push(otherTenantId);

    // A signed-in tenant_admin member for each tenant.
    async function createMember(label: string, tid: string, email: string) {
      const { data: u, error } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
      });
      if (error || !u?.user) throw new Error(`createUser ${label}: ${error?.message}`);
      const userId = u.user.id;
      createdUserIds.push(userId);
      await serviceClient
        .from("profiles")
        .upsert({ id: userId, email, full_name: `Notif ${label}` });
      await serviceClient
        .from("memberships")
        .insert({ user_id: userId, tenant_id: tid, role: "tenant_admin" });
      const client = createClient(url!, anon!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error || !signIn.data.session) {
        throw new Error(`${label} signIn: ${signIn.error?.message}`);
      }
      return client;
    }

    const demoMember = await createMember(
      "demo",
      tenantId,
      `notif-demo-${stamp}@nxtdrive.test`,
    );
    const otherMember = await createMember(
      "other",
      otherTenantId,
      `notif-other-${stamp}@nxtdrive.test`,
    );

    // --- 1. enqueue creates a queued row -----------------------------------
    const dedupeKey = `lesson_reminder:test:${stamp}`;
    const enqArgs = {
      p_tenant_id: tenantId,
      p_channel: "email",
      p_type: "lesson_reminder",
      p_recipient_email: "cursist@example.com",
      p_subject: "Herinnering",
      p_dedupe_key: dedupeKey,
      p_related_type: "lesson",
      p_related_id: `lesson-${stamp}`,
      p_payload: { test: true },
    };
    const { data: enq1, error: enq1Err } = await serviceClient.rpc(
      "enqueue_notification",
      enqArgs,
    );
    const row1 = (enq1 as { id: string; status: string; was_created: boolean }[] | null)?.[0];
    if (row1?.id) createdLogIds.push(row1.id);
    results.push({
      name: "enqueue_notification creates a queued row (was_created=true)",
      ok: !enq1Err && !!row1 && row1.was_created === true && row1.status === "queued",
      detail: enq1Err ? enq1Err.message : `status=${row1?.status} created=${row1?.was_created}`,
    });

    // --- 2. re-enqueue is idempotent ---------------------------------------
    const { data: enq2 } = await serviceClient.rpc("enqueue_notification", enqArgs);
    const row2 = (enq2 as { id: string; was_created: boolean }[] | null)?.[0];
    results.push({
      name: "re-enqueue same dedupe_key is idempotent (was_created=false, same id)",
      ok: !!row2 && row2.was_created === false && row2.id === row1?.id,
      detail: `id_match=${row2?.id === row1?.id} created=${row2?.was_created}`,
    });

    {
      const { count } = await serviceClient
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", dedupeKey);
      results.push({
        name: "exactly one log row exists for the dedupe_key",
        ok: count === 1,
        detail: `count=${count}`,
      });
    }

    // --- 3. mark sent -------------------------------------------------------
    {
      const { error } = await serviceClient.rpc("mark_notification_status", {
        p_id: row1!.id,
        p_tenant_id: tenantId,
        p_status: "sent",
        p_provider: "test",
        p_provider_message_id: "msg-1",
        p_error: null,
      });
      const { data: after } = await serviceClient
        .from("notification_log")
        .select("status, sent_at")
        .eq("id", row1!.id)
        .maybeSingle();
      results.push({
        name: "mark_notification_status('sent') sets status + sent_at",
        ok: !error && after?.status === "sent" && !!after?.sent_at,
        detail: error ? error.message : `status=${after?.status} sent_at=${after?.sent_at ? "set" : "null"}`,
      });
    }

    // --- 4. a sent row is never overwritten --------------------------------
    {
      await serviceClient.rpc("mark_notification_status", {
        p_id: row1!.id,
        p_tenant_id: tenantId,
        p_status: "failed",
        p_provider: "test",
        p_provider_message_id: null,
        p_error: "should be ignored",
      });
      const { data: after } = await serviceClient
        .from("notification_log")
        .select("status, error")
        .eq("id", row1!.id)
        .maybeSingle();
      results.push({
        name: "a 'sent' row is never overwritten by a later status",
        ok: after?.status === "sent" && !after?.error,
        detail: `status=${after?.status}`,
      });
    }

    // --- 5. cross-tenant mark is rejected ----------------------------------
    {
      const { error } = await serviceClient.rpc("mark_notification_status", {
        p_id: row1!.id,
        p_tenant_id: otherTenantId,
        p_status: "failed",
        p_provider: null,
        p_provider_message_id: null,
        p_error: "x",
      });
      results.push({
        name: "mark_notification_status rejects cross-tenant id",
        ok: !!error && /not found/i.test(error.message),
        detail: error ? error.message : "no error returned",
      });
    }

    // A template row + a log row in the OTHER tenant, for isolation checks.
    await serviceClient.from("notification_templates").insert({
      tenant_id: tenantId,
      key: "payment_confirmation",
      channel: "email",
      subject: `Bevestiging ${stamp}`,
      enabled: true,
    });
    const { data: enqOther } = await serviceClient.rpc("enqueue_notification", {
      ...enqArgs,
      p_tenant_id: otherTenantId,
      p_dedupe_key: `lesson_reminder:other:${stamp}`,
    });
    const otherLog = (enqOther as { id: string }[] | null)?.[0];
    if (otherLog?.id) createdLogIds.push(otherLog.id);

    // --- 6 & 7. member read + cross-tenant isolation -----------------------
    {
      const { data } = await demoMember
        .from("notification_log")
        .select("id")
        .eq("id", row1!.id);
      results.push({
        name: "tenant member can read own notification_log row",
        ok: (data ?? []).length === 1,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await demoMember
        .from("notification_templates")
        .select("tenant_id, key")
        .eq("tenant_id", tenantId);
      results.push({
        name: "tenant member can read own notification_templates row",
        ok: (data ?? []).length >= 1,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await demoMember
        .from("notification_log")
        .select("id")
        .eq("id", otherLog?.id ?? "");
      results.push({
        name: "member of tenant X cannot read tenant Y's notification_log",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await otherMember
        .from("notification_log")
        .select("id")
        .eq("id", row1!.id);
      results.push({
        name: "member of tenant Y cannot read tenant X's notification_log",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // --- 8. anon cannot read either table ----------------------------------
    {
      const { data } = await anonClient
        .from("notification_log")
        .select("id")
        .limit(5);
      results.push({
        name: "anon cannot read notification_log",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await anonClient
        .from("notification_templates")
        .select("tenant_id")
        .limit(5);
      results.push({
        name: "anon cannot read notification_templates",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // --- 9. anon cannot call the RPCs --------------------------------------
    {
      const { error } = await anonClient.rpc("enqueue_notification", {
        ...enqArgs,
        p_dedupe_key: `evil-${stamp}`,
      });
      results.push({
        name: "anon CANNOT call enqueue_notification RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("mark_notification_status", {
        p_id: row1!.id,
        p_tenant_id: tenantId,
        p_status: "failed",
        p_provider: null,
        p_provider_message_id: null,
        p_error: "x",
      });
      results.push({
        name: "anon CANNOT call mark_notification_status RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    await demoMember.auth.signOut();
    await otherMember.auth.signOut();
  } finally {
    if (createdLogIds.length) {
      await serviceClient
        .from("notification_log")
        .delete()
        .in("id", createdLogIds)
        .then(() => undefined, () => undefined);
    }
    for (const tid of createdTenantIds) {
      await serviceClient
        .from("notification_templates")
        .delete()
        .eq("tenant_id", tid)
        .then(() => undefined, () => undefined);
    }
    // demo-academy template row created during the run.
    await serviceClient
      .from("notification_templates")
      .delete()
      .eq("subject", `Bevestiging ${stamp}`)
      .then(() => undefined, () => undefined);
    for (const uid of createdUserIds) {
      await serviceClient.from("memberships").delete().eq("user_id", uid);
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    for (const tid of createdTenantIds) {
      await serviceClient
        .from("tenants")
        .delete()
        .eq("id", tid)
        .then(() => undefined, () => undefined);
    }
  }

  console.log("");
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    if (!r.ok) failed++;
  }
  console.log("");
  if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log("All notification tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
