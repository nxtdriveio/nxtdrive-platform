/**
 * Tests for the web-push channel (Task #110 — push-meldingen).
 *
 *   pnpm --filter @workspace/scripts run db:test-web-push
 *   pnpm --filter @workspace/scripts run db:test-web-push -- --env=production
 *
 * Asserts (subscription storage + RLS + graceful degradation, NO real sends):
 *   1. upsert_push_subscription is idempotent per endpoint: re-subscribing the
 *      same browser updates the row (keys/owner) and never duplicates it.
 *   2. RLS: an authenticated user reads ONLY their own subscriptions.
 *   3. RLS: the anon role reads zero subscriptions.
 *   4. delete_push_subscription removes the actor's own endpoint but is a no-op
 *      for an endpoint owned by another user (ownership re-validated).
 *   5. prune_push_subscription removes a dead endpoint (dead-subscription cleanup).
 *   6. Grant lockdown: anon CANNOT call upsert / delete / prune (execute revoked).
 *   7. Graceful degradation: without VAPID config the sender is a silent no-op
 *      and reports "not configured".
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running web-push tests`);

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
  const password = `push-pass-${stamp}`;
  const endpoints: string[] = [];

  async function createLoggedInUser(label: string) {
    const email = `push-${label}-${stamp}@nxtdrive.test`;
    const { data: u, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (error || !u?.user) throw new Error(`createUser: ${error?.message}`);
    const userId = u.user.id;
    createdUserIds.push(userId);
    await serviceClient
      .from("profiles")
      .upsert({ id: userId, email, full_name: `Push ${label}` });
    return { userId, email };
  }

  function upsert(
    tenantId: string,
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
  ) {
    return serviceClient.rpc("upsert_push_subscription", {
      p_tenant_id: tenantId,
      p_recipient_user_id: userId,
      p_endpoint: endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: "vitest-agent",
    });
  }

  function signedInClient() {
    return createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

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

    const A = await createLoggedInUser("a");
    const B = await createLoggedInUser("b");

    // 1. idempotent upsert per endpoint
    const epA = `https://push.example.com/${stamp}/a`;
    endpoints.push(epA);
    const first = await upsert(tenantId, A.userId, epA, "p256-a-1", "auth-a-1");
    const second = await upsert(tenantId, A.userId, epA, "p256-a-2", "auth-a-2");
    const firstRow = (first.data as { id: string; was_created: boolean }[])?.[0];
    const secondRow = (
      second.data as { id: string; was_created: boolean }[]
    )?.[0];
    {
      const { count } = await serviceClient
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", epA);
      const { data: row } = await serviceClient
        .from("push_subscriptions")
        .select("p256dh")
        .eq("endpoint", epA)
        .maybeSingle();
      results.push({
        name: "upsert is idempotent per endpoint (updates, never duplicates)",
        ok:
          !first.error &&
          !second.error &&
          firstRow?.was_created === true &&
          secondRow?.was_created === false &&
          firstRow?.id === secondRow?.id &&
          count === 1 &&
          row?.p256dh === "p256-a-2",
        detail: `created1=${firstRow?.was_created} created2=${secondRow?.was_created} rows=${count} keyUpdated=${row?.p256dh === "p256-a-2"}`,
      });
    }

    // Give B its own subscription so we can prove isolation.
    const epB = `https://push.example.com/${stamp}/b`;
    endpoints.push(epB);
    await upsert(tenantId, B.userId, epB, "p256-b", "auth-b");

    // 2. RLS: user reads only its own subscriptions
    const aClient = signedInClient();
    const aSignIn = await aClient.auth.signInWithPassword({
      email: A.email,
      password,
    });
    if (aSignIn.error || !aSignIn.data.session) {
      throw new Error(`A signIn failed: ${aSignIn.error?.message}`);
    }
    {
      const { data } = await aClient
        .from("push_subscriptions")
        .select("endpoint, recipient_user_id");
      const rows = data ?? [];
      const onlyOwn = rows.every((r) => r.recipient_user_id === A.userId);
      const hasOwn = rows.some((r) => r.endpoint === epA);
      results.push({
        name: "user reads only own subscriptions, never another user's",
        ok: hasOwn && onlyOwn,
        detail: `rows=${rows.length} only_own=${onlyOwn}`,
      });
    }
    await aClient.auth.signOut();

    // 3. anon reads zero subscriptions
    {
      const { data } = await anonClient
        .from("push_subscriptions")
        .select("id")
        .limit(5);
      results.push({
        name: "anon reads zero subscriptions",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // 4. delete removes own endpoint, no-op on a foreign endpoint
    {
      // B tries to delete A's endpoint — must be a no-op (still present).
      await serviceClient.rpc("delete_push_subscription", {
        p_tenant_id: tenantId,
        p_actor: B.userId,
        p_endpoint: epA,
      });
      const { count: stillThere } = await serviceClient
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", epA);
      // A deletes its own endpoint — must be gone.
      await serviceClient.rpc("delete_push_subscription", {
        p_tenant_id: tenantId,
        p_actor: A.userId,
        p_endpoint: epA,
      });
      const { count: gone } = await serviceClient
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", epA);
      results.push({
        name: "delete removes own endpoint but is a no-op for a foreign one",
        ok: stillThere === 1 && gone === 0,
        detail: `afterForeign=${stillThere} afterOwn=${gone}`,
      });
    }

    // 5. prune removes a dead endpoint (cleanup of 404/410 subs)
    {
      const pruned = await serviceClient.rpc("prune_push_subscription", {
        p_endpoint: epB,
      });
      const { count } = await serviceClient
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("endpoint", epB);
      results.push({
        name: "prune removes a dead subscription by endpoint",
        ok: !pruned.error && count === 0,
        detail: `err=${pruned.error ? "raised" : "none"} remaining=${count}`,
      });
    }

    // 6. grant lockdown: anon cannot call the write RPCs
    {
      const zero = "00000000-0000-0000-0000-000000000000";
      const up = await anonClient.rpc("upsert_push_subscription", {
        p_tenant_id: zero,
        p_recipient_user_id: zero,
        p_endpoint: `forbidden-${stamp}`,
        p_p256dh: "x",
        p_auth: "x",
        p_user_agent: null,
      });
      const del = await anonClient.rpc("delete_push_subscription", {
        p_tenant_id: zero,
        p_actor: zero,
        p_endpoint: `forbidden-${stamp}`,
      });
      const prune = await anonClient.rpc("prune_push_subscription", {
        p_endpoint: `forbidden-${stamp}`,
      });
      results.push({
        name: "anon CANNOT call upsert / delete / prune (execute revoked)",
        ok:
          up.error !== null && del.error !== null && prune.error !== null,
        detail: `upErr=${up.error ? "raised" : "NONE"} delErr=${del.error ? "raised" : "NONE"} pruneErr=${prune.error ? "raised" : "NONE"}`,
      });
    }

    // 7. graceful degradation: sender is a silent no-op without VAPID config.
    // Probe the sender in an isolated env with VAPID keys stripped, so the test
    // is independent of whether keys happen to be configured in this env.
    {
      const savedPub = process.env["VAPID_PUBLIC_KEY"];
      const savedPriv = process.env["VAPID_PRIVATE_KEY"];
      delete process.env["VAPID_PUBLIC_KEY"];
      delete process.env["VAPID_PRIVATE_KEY"];
      let configured = true;
      let threw = false;
      try {
        const here = dirname(fileURLToPath(import.meta.url));
        const target = resolve(
          here,
          "..",
          "..",
          "artifacts",
          "nxtdrive",
          "lib",
          "notifications",
          "web-push.ts",
        );
        const mod = (await import(pathToFileURL(target).href)) as {
          isWebPushConfigured: () => boolean;
          sendWebPushToUser: (
            client: typeof serviceClient,
            msg: Record<string, unknown>,
          ) => Promise<void>;
        };
        configured = mod.isWebPushConfigured();
        // Must not throw even though there are no subscriptions / no config.
        await mod.sendWebPushToUser(serviceClient, {
          tenantId,
          userId: A.userId,
          title: "t",
          body: "b",
          link: null,
          type: "lesson_reminder",
          dedupeKey: `degrade-${stamp}`,
        });
      } catch {
        threw = true;
      } finally {
        if (savedPub !== undefined) process.env["VAPID_PUBLIC_KEY"] = savedPub;
        if (savedPriv !== undefined)
          process.env["VAPID_PRIVATE_KEY"] = savedPriv;
      }
      results.push({
        name: "sender degrades gracefully without VAPID (no-op, never throws)",
        ok: configured === false && threw === false,
        detail: `configured=${configured} threw=${threw}`,
      });
    }
  } finally {
    for (const ep of endpoints) {
      await serviceClient
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", ep)
        .then(
          () => undefined,
          () => undefined,
        );
    }
    for (const uid of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
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
  console.log("All web-push tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
