/**
 * RLS + behaviour tests for products, package_products, the tegoed breakdown
 * view, credit expiry, the package threshold signal RPC, and the re-locked
 * tegoed RPC grants.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-products
 *   pnpm --filter @workspace/scripts run db:test-rls-products -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read or insert products / package_products.
 *  2. products / package_products are strictly tenant-scoped (composite FK,
 *     anon blocked, service-role sees only its tenant rows).
 *  3. The breakdown view reconciles the canon example (20 gekocht, 12 gereden,
 *     3 ingepland => 5 beschikbaar) and identity available = ledger balance.
 *  4. expire_student_credits is idempotent and never drives the saldo negative.
 *  5. ensure_student_task fires once per dedupe key (idempotent).
 *  6. The new service-role-only RPCs (expire_student_credits,
 *     ensure_student_task) have execute REVOKED from anon/authenticated.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const ZERO = "00000000-0000-0000-0000-000000000000";

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running products/tegoed tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const svc = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  const { data: tenant } = await svc
    .from("tenants")
    .select("id")
    .eq("slug", "demo-academy")
    .maybeSingle();
  if (!tenant) {
    console.error("demo-academy tenant missing — run db:seed first");
    process.exit(1);
  }

  // An instructor (auth.users) for lesson inserts in the canon breakdown test.
  const { data: membership } = await svc
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .in("role", ["tenant_admin", "instructor"])
    .limit(1)
    .maybeSingle();
  const instructorId = (membership?.user_id ?? null) as string | null;

  // 1. anon cannot read products / package_products.
  for (const table of ["products", "package_products"] as const) {
    const { data, error } = await anonClient.from(table).select("id").limit(5);
    results.push({
      name: `anon cannot read ${table}`,
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 1b. anon cannot insert products.
  {
    const { error } = await anonClient.from("products").insert({
      tenant_id: tenant.id,
      name: "Anon Product",
      price_cents: 100,
    });
    results.push({
      name: "anon cannot insert products",
      ok: error !== null,
      detail: error?.message ?? "INSERT succeeded — RLS broken!",
    });
  }

  // 2. package_products composite FK enforces same-tenant binding.
  {
    // Second tenant to attempt a cross-tenant package_products row.
    const otherSlug = `it-tenant-${Date.now()}`;
    const { data: other } = await svc
      .from("tenants")
      .insert({ name: "IT Tenant", slug: otherSlug })
      .select("id")
      .single();
    const { data: pkg } = await svc
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `IT Pack ${Date.now()}`,
        credits_total: 60,
        price_cents: 1000,
        active: true,
      })
      .select("id")
      .single();
    const { data: prodOther } = other
      ? await svc
          .from("products")
          .insert({
            tenant_id: other.id,
            name: `IT Prod Other ${Date.now()}`,
            price_cents: 500,
          })
          .select("id")
          .single()
      : { data: null };

    if (other && pkg && prodOther) {
      // Cross-tenant: package in demo, product in other tenant => must fail
      // on the composite (product_id, tenant_id) FK.
      const { error } = await svc.from("package_products").insert({
        tenant_id: tenant.id,
        package_id: pkg.id,
        product_id: prodOther.id,
        quantity: 1,
      });
      results.push({
        name: "package_products rejects cross-tenant product (composite FK)",
        ok: error !== null,
        detail: error?.message ?? "INSERT succeeded — FK not tenant-scoped!",
      });
      cleanup.push(async () => {
        await svc.from("products").delete().eq("id", prodOther.id);
        await svc.from("tenants").delete().eq("id", other.id);
      });
    } else {
      results.push({
        name: "package_products rejects cross-tenant product (composite FK)",
        ok: false,
        detail: "setup failed",
      });
    }
    if (pkg) {
      cleanup.push(async () => {
        await svc.from("packages").delete().eq("id", pkg.id);
      });
    }
  }

  // 3. Canon breakdown: 20 gekocht, 12 gereden, 3 ingepland => 5 beschikbaar.
  {
    const { data: stu } = await svc
      .from("students")
      .insert({
        tenant_id: tenant.id,
        full_name: `Breakdown Student ${Date.now()}`,
      })
      .select("id")
      .single();

    if (!stu || !instructorId) {
      results.push({
        name: "breakdown reconciles canon 20/12/3/5",
        ok: false,
        detail: !instructorId
          ? "no instructor membership in demo-academy"
          : "student setup failed",
      });
    } else {
      cleanup.push(async () => {
        await svc.from("lessons").delete().eq("student_id", stu.id);
        await svc.from("credit_ledger").delete().eq("student_id", stu.id);
        await svc.from("students").delete().eq("id", stu.id);
      });

      // Purchase 20 hours (1200 min).
      await svc.from("credit_ledger").insert({
        tenant_id: tenant.id,
        student_id: stu.id,
        delta: 1200,
        reason: "package_purchase",
        related_type: "package",
        note: "canon purchase",
      });

      // 12 driven hours: a completed lesson consuming 720 min.
      const drivenStart = new Date(Date.now() - 3 * 86_400_000);
      const drivenLesson = await svc
        .from("lessons")
        .insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          instructor_id: instructorId,
          starts_at: drivenStart.toISOString(),
          ends_at: new Date(drivenStart.getTime() + 720 * 60_000).toISOString(),
          status: "completed",
          credits_cost: 720,
        })
        .select("id")
        .single();
      if (drivenLesson.data) {
        await svc.from("credit_ledger").insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          delta: -720,
          reason: "lesson_consumed",
          related_type: "lesson",
          related_id: drivenLesson.data.id,
        });
      }

      // 3 planned hours: a planned lesson consuming 180 min.
      const plannedStart = new Date(Date.now() + 7 * 86_400_000);
      const plannedLesson = await svc
        .from("lessons")
        .insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          instructor_id: instructorId,
          starts_at: plannedStart.toISOString(),
          ends_at: new Date(plannedStart.getTime() + 180 * 60_000).toISOString(),
          status: "planned",
          credits_cost: 180,
        })
        .select("id")
        .single();
      if (plannedLesson.data) {
        await svc.from("credit_ledger").insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          delta: -180,
          reason: "lesson_consumed",
          related_type: "lesson",
          related_id: plannedLesson.data.id,
        });
      }

      const { data: bd } = await svc
        .from("student_credit_breakdown")
        .select("*")
        .eq("student_id", stu.id)
        .maybeSingle();
      const ok =
        !!bd &&
        bd.purchased_minutes === 1200 &&
        bd.driven_minutes === 720 &&
        bd.planned_minutes === 180 &&
        bd.available_minutes === 300;
      results.push({
        name: "breakdown reconciles canon 20/12/3/5",
        ok,
        detail: bd
          ? `gekocht=${bd.purchased_minutes} gereden=${bd.driven_minutes} ingepland=${bd.planned_minutes} beschikbaar=${bd.available_minutes}`
          : "no breakdown row",
      });

      // identity: available == sum(ledger.delta)
      const { data: ledgerRows } = await svc
        .from("credit_ledger")
        .select("delta")
        .eq("student_id", stu.id);
      const sum = (ledgerRows ?? []).reduce(
        (a, r) => a + (r.delta as number),
        0,
      );
      results.push({
        name: "breakdown available == ledger balance",
        ok: !!bd && bd.available_minutes === sum,
        detail: `available=${bd?.available_minutes} sum=${sum}`,
      });
    }
  }

  // 4. expire_student_credits idempotent + never negative.
  {
    const { data: stu } = await svc
      .from("students")
      .insert({
        tenant_id: tenant.id,
        full_name: `Expiry Student ${Date.now()}`,
      })
      .select("id")
      .single();
    // Package with 1-day validity (so the grant expires immediately).
    const { data: pkg } = await svc
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `Expiry Pack ${Date.now()}`,
        credits_total: 600,
        price_cents: 1000,
        active: true,
        valid_days: 1,
      })
      .select("id")
      .single();

    if (!stu || !pkg) {
      results.push({
        name: "expire_student_credits idempotent + never negative",
        ok: false,
        detail: "setup failed",
      });
    } else {
      cleanup.push(async () => {
        await svc.from("credit_ledger").delete().eq("student_id", stu.id);
        await svc.from("students").delete().eq("id", stu.id);
        await svc.from("packages").delete().eq("id", pkg.id);
      });

      // Insert a package_purchase grant dated 10 days ago (already expired).
      await svc.from("credit_ledger").insert({
        tenant_id: tenant.id,
        student_id: stu.id,
        delta: 600,
        reason: "package_purchase",
        related_type: "package",
        related_id: pkg.id,
        created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        note: "expiry grant",
      });

      const first = await svc.rpc("expire_student_credits", {
        p_tenant_id: tenant.id,
        p_actor: null,
      });
      const { data: afterFirst } = await svc
        .from("student_credit_balance")
        .select("balance")
        .eq("student_id", stu.id)
        .maybeSingle();
      const second = await svc.rpc("expire_student_credits", {
        p_tenant_id: tenant.id,
        p_actor: null,
      });
      const { data: afterSecond } = await svc
        .from("student_credit_balance")
        .select("balance")
        .eq("student_id", stu.id)
        .maybeSingle();

      const bal1 = (afterFirst?.balance ?? null) as number | null;
      const bal2 = (afterSecond?.balance ?? null) as number | null;
      results.push({
        name: "expire_student_credits expires full unused lot",
        ok: !first.error && bal1 === 0,
        detail: first.error ? first.error.message : `balance=${bal1}`,
      });
      results.push({
        name: "expire_student_credits is idempotent (no second expiry)",
        ok: !second.error && bal2 === 0 && (second.data as number) === 0,
        detail: second.error
          ? second.error.message
          : `balance=${bal2} expired2=${second.data}`,
      });
      results.push({
        name: "expire never drives saldo negative",
        ok: bal1 !== null && bal1 >= 0 && bal2 !== null && bal2 >= 0,
        detail: `bal1=${bal1} bal2=${bal2}`,
      });
    }
  }

  // 5. ensure_student_task fires once per dedupe key.
  {
    const { data: stu } = await svc
      .from("students")
      .insert({
        tenant_id: tenant.id,
        full_name: `Signal Student ${Date.now()}`,
      })
      .select("id")
      .single();
    if (!stu) {
      results.push({
        name: "ensure_student_task is idempotent",
        ok: false,
        detail: "setup failed",
      });
    } else {
      const dedupe = `student:${stu.id}:package-signal:test`;
      const a = await svc.rpc("ensure_student_task", {
        p_tenant_id: tenant.id,
        p_actor: null,
        p_student_id: stu.id,
        p_dedupe_key: dedupe,
        p_title: "Signaal test",
        p_description: "test",
        p_priority: "normal",
        p_due_date: new Date().toISOString().slice(0, 10),
      });
      const b = await svc.rpc("ensure_student_task", {
        p_tenant_id: tenant.id,
        p_actor: null,
        p_student_id: stu.id,
        p_dedupe_key: dedupe,
        p_title: "Signaal test",
        p_description: "test",
        p_priority: "normal",
        p_due_date: new Date().toISOString().slice(0, 10),
      });
      const { data: tasks } = await svc
        .from("tasks")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("dedupe_key", dedupe);
      results.push({
        name: "ensure_student_task is idempotent",
        ok:
          !a.error &&
          !b.error &&
          a.data === b.data &&
          (tasks ?? []).length === 1,
        detail:
          a.error?.message ??
          b.error?.message ??
          `tasks=${(tasks ?? []).length} same=${a.data === b.data}`,
      });
      cleanup.push(async () => {
        await svc.from("task_links").delete().eq("entity_id", stu.id);
        await svc.from("tasks").delete().eq("dedupe_key", dedupe);
        await svc.from("students").delete().eq("id", stu.id);
      });
    }
  }

  // 5b. package_products linkage path (same-tenant assignment succeeds, unique).
  {
    const stamp = Date.now();
    const { data: pkg } = await svc
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `Link Pack ${stamp}`,
        credits_total: 600,
        price_cents: 1000,
        active: true,
      })
      .select("id")
      .single();
    const { data: prod } = await svc
      .from("products")
      .insert({
        tenant_id: tenant.id,
        name: `Link Product ${stamp}`,
        category: "los",
        price_cents: 6500,
        active: true,
      })
      .select("id")
      .single();

    if (!pkg || !prod) {
      results.push({
        name: "package_products links a same-tenant product",
        ok: false,
        detail: "setup failed",
      });
    } else {
      cleanup.push(async () => {
        await svc.from("package_products").delete().eq("package_id", pkg.id);
        await svc.from("products").delete().eq("id", prod.id);
        await svc.from("packages").delete().eq("id", pkg.id);
      });

      const insert = await svc.from("package_products").insert({
        tenant_id: tenant.id,
        package_id: pkg.id,
        product_id: prod.id,
        quantity: 2,
      });
      const { data: linkRows } = await svc
        .from("package_products")
        .select("id, quantity")
        .eq("tenant_id", tenant.id)
        .eq("package_id", pkg.id)
        .eq("product_id", prod.id);
      results.push({
        name: "package_products links a same-tenant product",
        ok:
          !insert.error &&
          (linkRows ?? []).length === 1 &&
          linkRows?.[0]?.quantity === 2,
        detail: insert.error
          ? insert.error.message
          : `rows=${(linkRows ?? []).length} qty=${linkRows?.[0]?.quantity}`,
      });

      // Unique (package_id, product_id): a second identical link is rejected.
      const dup = await svc.from("package_products").insert({
        tenant_id: tenant.id,
        package_id: pkg.id,
        product_id: prod.id,
        quantity: 1,
      });
      results.push({
        name: "package_products rejects duplicate product link (unique)",
        ok: !!dup.error,
        detail: dup.error ? dup.error.message : "no error — duplicate allowed!",
      });
    }
  }

  // 5c. ensure_package_signals attributes consumption FIFO across grants.
  {
    const stamp = Date.now();
    const { data: stu } = await svc
      .from("students")
      .insert({
        tenant_id: tenant.id,
        full_name: `Multi-grant Student ${stamp}`,
      })
      .select("id")
      .single();
    // Two packages, each 10h (600 min) with a 5h (300 min) signal threshold.
    const { data: pkgA } = await svc
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `Signal Pack A ${stamp}`,
        credits_total: 600,
        price_cents: 1000,
        active: true,
        signal_threshold_minutes: 300,
      })
      .select("id")
      .single();
    const { data: pkgB } = await svc
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `Signal Pack B ${stamp}`,
        credits_total: 600,
        price_cents: 1000,
        active: true,
        signal_threshold_minutes: 300,
      })
      .select("id")
      .single();

    if (!stu || !pkgA || !pkgB || !instructorId) {
      results.push({
        name: "ensure_package_signals attributes FIFO across grants",
        ok: false,
        detail: !instructorId ? "no instructor membership" : "setup failed",
      });
    } else {
      const dedupeA = `student:${stu.id}:package-signal:`;
      cleanup.push(async () => {
        await svc.from("lessons").delete().eq("student_id", stu.id);
        await svc.from("task_links").delete().eq("entity_id", stu.id);
        await svc.from("tasks").delete().like("dedupe_key", `${dedupeA}%`);
        await svc.from("credit_ledger").delete().eq("student_id", stu.id);
        await svc.from("students").delete().eq("id", stu.id);
        await svc.from("packages").delete().eq("id", pkgA.id);
        await svc.from("packages").delete().eq("id", pkgB.id);
      });

      // Grant A (older), then Grant B (newer).
      const grantA = await svc
        .from("credit_ledger")
        .insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          delta: 600,
          reason: "package_purchase",
          related_type: "package",
          related_id: pkgA.id,
          created_at: new Date(stamp - 5 * 86_400_000).toISOString(),
          note: "grant A",
        })
        .select("id")
        .single();
      await svc.from("credit_ledger").insert({
        tenant_id: tenant.id,
        student_id: stu.id,
        delta: 600,
        reason: "package_purchase",
        related_type: "package",
        related_id: pkgB.id,
        created_at: new Date(stamp - 1 * 86_400_000).toISOString(),
        note: "grant B",
      });

      // Consume 400 min — all FIFO-attributed to grant A (>= 300 threshold).
      const lessonStart = new Date(stamp - 2 * 86_400_000);
      const lesson = await svc
        .from("lessons")
        .insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          instructor_id: instructorId,
          starts_at: lessonStart.toISOString(),
          ends_at: new Date(lessonStart.getTime() + 400 * 60_000).toISOString(),
          status: "completed",
          credits_cost: 400,
        })
        .select("id")
        .single();
      if (lesson.data) {
        await svc.from("credit_ledger").insert({
          tenant_id: tenant.id,
          student_id: stu.id,
          delta: -400,
          reason: "lesson_consumed",
          related_type: "lesson",
          related_id: lesson.data.id,
        });
      }

      const run1 = await svc.rpc("ensure_package_signals", {
        p_tenant_id: tenant.id,
        p_actor: null,
      });
      // Idempotent second run must create nothing.
      const run2 = await svc.rpc("ensure_package_signals", {
        p_tenant_id: tenant.id,
        p_actor: null,
      });
      const { data: tasks1 } = await svc
        .from("tasks")
        .select("id, dedupe_key")
        .eq("tenant_id", tenant.id)
        .like("dedupe_key", `${dedupeA}%`);

      const firedForA =
        !!grantA.data &&
        (tasks1 ?? []).some(
          (t) => t.dedupe_key === `${dedupeA}${grantA.data!.id}`,
        );
      results.push({
        name: "ensure_package_signals fires only the consumed grant (FIFO)",
        ok:
          !run1.error &&
          (run1.data as number) === 1 &&
          (tasks1 ?? []).length === 1 &&
          firedForA,
        detail: run1.error
          ? run1.error.message
          : `fired=${run1.data} tasks=${(tasks1 ?? []).length} forA=${firedForA}`,
      });
      results.push({
        name: "ensure_package_signals is idempotent (no re-fire)",
        ok: !run2.error && (run2.data as number) === 0,
        detail: run2.error ? run2.error.message : `fired2=${run2.data}`,
      });
    }
  }

  // 6. New tegoed RPCs are service-role only (anon execute revoked).
  {
    const expire = await anonClient.rpc("expire_student_credits", {
      p_tenant_id: ZERO,
      p_actor: null,
    });
    results.push({
      name: "anon CANNOT call expire_student_credits (execute revoked)",
      ok: !!expire.error,
      detail: expire.error
        ? expire.error.message
        : "no error — RPC is callable!",
    });

    const task = await anonClient.rpc("ensure_student_task", {
      p_tenant_id: ZERO,
      p_actor: null,
      p_student_id: ZERO,
      p_dedupe_key: "x",
      p_title: "x",
      p_description: "x",
      p_priority: "normal",
      p_due_date: new Date().toISOString().slice(0, 10),
    });
    results.push({
      name: "anon CANNOT call ensure_student_task (execute revoked)",
      ok: !!task.error,
      detail: task.error ? task.error.message : "no error — RPC is callable!",
    });

    const signal = await anonClient.rpc("ensure_package_signals", {
      p_tenant_id: ZERO,
      p_actor: null,
    });
    results.push({
      name: "anon CANNOT call ensure_package_signals (execute revoked)",
      ok: !!signal.error,
      detail: signal.error ? signal.error.message : "no error — RPC is callable!",
    });
  }

  // Clean up (reverse order).
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch {
      /* best effort */
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
  console.log("All products/tegoed tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
