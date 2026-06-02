/**
 * RLS + RPC tests for lessons.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-lessons
 *   pnpm --filter @workspace/scripts run db:test-rls-lessons -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read lessons.
 *  2. schedule_lesson with insufficient credits is rejected — no lesson row, no ledger row.
 *  3. schedule_lesson succeeds, deducts credits, creates audit row.
 *  4. Overlap constraint blocks a second planned lesson for the same instructor.
 *  5. cancel_lesson respects tenant cancellation_policy (100% / 50% / 0%).
 *  6. Cross-tenant student rejected by schedule_lesson.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

type PgError = { code?: string; message?: string } | null;

/**
 * A mutation RPC is properly locked down only when the `anon` role is blocked
 * by PRIVILEGE — Postgres reports 42501 (insufficient_privilege), surfaced by
 * PostgREST as "permission denied for function ...". A generic runtime error
 * (e.g. a raised "not authorized" exception, P0001) means the RPC is still
 * callable and would have run if the arguments had been valid — that does NOT
 * prove the execute grant was revoked, so it must fail this assertion.
 */
function isExecuteRevoked(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42501") return true;
  return /permission denied for function/i.test(error.message ?? "");
}

function describePrivError(error: PgError): string {
  if (!error) return "no error returned — RPC is callable!";
  if (isExecuteRevoked(error)) return error.message ?? "permission denied";
  return `wrong failure mode (not a privilege block): ${error.message ?? error.code ?? "unknown"}`;
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running lessons RLS/RPC tests`);

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
  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];

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

  // Find a tenant_admin or instructor of demo-academy to use as instructor.
  const { data: membership } = await serviceClient
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["tenant_admin", "instructor"])
    .limit(1)
    .maybeSingle();
  if (!membership) {
    console.error(
      "No tenant_admin/instructor membership in demo-academy — add one with db:add-membership",
    );
    process.exit(1);
  }
  const instructorId = membership.user_id as string;

  // ---- 1. anon cannot read lessons ---------------------------------------
  {
    const { data, error } = await anonClient
      .from("lessons")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read lessons",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // Set up a fresh student with a small saldo via grant_package (1-credit Proefles).
  const { data: student } = await serviceClient
    .from("students")
    .insert({
      tenant_id: tenantId,
      full_name: `RLS Lesson Student ${Date.now()}`,
    })
    .select("id")
    .single();
  const { data: pack1 } = await serviceClient
    .from("packages")
    .insert({
      tenant_id: tenantId,
      name: `Lesson Test Pack ${Date.now()}`,
      credits_total: 120, // 120 minutes = 2 uur tegoed
      price_cents: 5000,
      active: true,
    })
    .select("id")
    .single();
  if (!student || !pack1) {
    console.error("Could not set up student/package");
    process.exit(1);
  }
  await serviceClient.rpc("grant_package", {
    p_student_id: student.id,
    p_tenant_id: tenantId,
    p_actor: instructorId,
    p_package_id: pack1.id,
  });

  // ---- 2. insufficient tegoed rejected -----------------------------------
  // Tegoed is consumed by lesson duration in minutes; a 180-min lesson costs
  // more than the 120-min balance, so it must be rejected.
  {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tooExpensive = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: student.id,
      p_starts_at: future.toISOString(),
      p_duration_min: 180,
      p_credits_cost: 180,
      p_location: null,
      p_notes: null,
    });
    const { data: anyLessons } = await serviceClient
      .from("lessons")
      .select("id")
      .eq("student_id", student.id);
    results.push({
      name: "schedule_lesson rejects insufficient tegoed",
      ok:
        tooExpensive.error !== null && (anyLessons ?? []).length === 0,
      detail:
        tooExpensive.error?.message ??
        `lessons=${(anyLessons ?? []).length} (expected 0)`,
    });
  }

  // ---- 3. successful schedule deducts tegoed by duration -----------------
  let lessonId: string | null = null;
  {
    const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d ahead
    const ok = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: student.id,
      p_starts_at: start.toISOString(),
      p_duration_min: 60,
      p_credits_cost: 60,
      p_location: "Testlocatie",
      p_notes: null,
    });
    lessonId = (ok.data as string | null) ?? null;
    const { data: balRow } = await serviceClient
      .from("student_credit_balance")
      .select("balance")
      .eq("student_id", student.id)
      .maybeSingle();
    const { data: audit } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("action", "lesson.scheduled")
      .eq("target_id", lessonId ?? "");
    results.push({
      name: "schedule_lesson succeeds and deducts tegoed (120 − 60 = 60)",
      ok:
        !ok.error &&
        lessonId !== null &&
        (balRow?.balance ?? -1) === 60 &&
        (audit ?? []).length === 1,
      detail: ok.error
        ? ok.error.message
        : `lesson=${lessonId} balance=${balRow?.balance} audit=${(audit ?? []).length}`,
    });
  }

  // ---- 4. overlap constraint -------------------------------------------
  {
    if (!lessonId) {
      results.push({
        name: "overlap constraint blocks double-booking",
        ok: false,
        detail: "previous schedule failed",
      });
    } else {
      const { data: firstLesson } = await serviceClient
        .from("lessons")
        .select("starts_at")
        .eq("id", lessonId)
        .single();
      // Overlap: starts inside the existing lesson's range.
      const overlap = new Date(
        new Date(firstLesson!.starts_at).getTime() + 30 * 60 * 1000,
      );
      const dup = await serviceClient.rpc("schedule_lesson", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_instructor_id: instructorId,
        p_student_id: student.id,
        p_starts_at: overlap.toISOString(),
        p_duration_min: 60,
        p_credits_cost: 1,
        p_location: null,
        p_notes: null,
      });
      results.push({
        name: "overlap constraint blocks double-booking",
        ok: dup.error !== null,
        detail: dup.error?.message ?? "overlap was accepted!",
      });
    }
  }

  // ---- 5. cancellation tiers (100% / 50% / 0%) ---------------------------
  // We rely on the seed policy: 72h→100, 24h→50, 0h→0.
  async function scheduleAt(hoursAhead: number): Promise<string | null> {
    // Grant fresh tegoed so the student can afford another lesson.
    await serviceClient.rpc("grant_package", {
      p_student_id: student!.id,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_package_id: pack1!.id, // 120 min each call — plenty
    });
    const start = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
    const res = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: student!.id,
      p_starts_at: start.toISOString(),
      p_duration_min: 30, // 30-min lesson costs 30 min tegoed
      p_credits_cost: 30,
      p_location: null,
      p_notes: null,
    });
    return (res.data as string | null) ?? null;
  }

  // Refund is a percentage of the lesson cost (30 min): 100%→30, 50%→15, 0%→0.
  for (const [hoursAhead, expectedRefund, label] of [
    [100, 30, "100% tier (≥72h)"],
    [40, 15, "50% tier (≥24h)"],
    [2, 0, "0% tier (<24h)"],
  ] as const) {
    const lid = await scheduleAt(hoursAhead);
    if (!lid) {
      results.push({
        name: `cancel_lesson refund: ${label}`,
        ok: false,
        detail: "could not schedule",
      });
      continue;
    }
    const cancel = await serviceClient.rpc("cancel_lesson", {
      p_lesson_id: lid,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_reason: "rls-test",
    });
    const got = cancel.data as number | null;
    results.push({
      name: `cancel_lesson refund: ${label}`,
      ok: !cancel.error && got === expectedRefund,
      detail: cancel.error
        ? cancel.error.message
        : `expected=${expectedRefund} got=${got}`,
    });
  }

  // ---- 6b. concurrent schedules cannot overspend -------------------------
  {
    // Fresh student with exactly 1 credit; fire two parallel 1-credit
    // schedule attempts at non-overlapping times. Only one must succeed.
    const { data: raceStudent } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        full_name: `Race Student ${Date.now()}`,
      })
      .select("id")
      .single();
    const { data: onePack } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: `Single ${Date.now()}`,
        credits_total: 60, // exactly one 60-min lesson worth of tegoed
        price_cents: 2500,
        active: true,
      })
      .select("id")
      .single();
    if (raceStudent && onePack) {
      await serviceClient.rpc("grant_package", {
        p_student_id: raceStudent.id,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_package_id: onePack.id,
      });
      const t1 = new Date(Date.now() + 200 * 60 * 60 * 1000).toISOString();
      const t2 = new Date(Date.now() + 220 * 60 * 60 * 1000).toISOString();
      const [a, b] = await Promise.all([
        serviceClient.rpc("schedule_lesson", {
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_instructor_id: instructorId,
          p_student_id: raceStudent.id,
          p_starts_at: t1,
          p_duration_min: 60,
          p_credits_cost: 1,
          p_location: null,
          p_notes: null,
        }),
        serviceClient.rpc("schedule_lesson", {
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_instructor_id: instructorId,
          p_student_id: raceStudent.id,
          p_starts_at: t2,
          p_duration_min: 60,
          p_credits_cost: 1,
          p_location: null,
          p_notes: null,
        }),
      ]);
      const successes = [a, b].filter((r) => !r.error).length;
      const { data: bal } = await serviceClient
        .from("student_credit_balance")
        .select("balance")
        .eq("student_id", raceStudent.id)
        .maybeSingle();
      results.push({
        name: "concurrent schedules cannot overspend",
        ok: successes === 1 && (bal?.balance ?? -1) === 0,
        detail: `successes=${successes}/2 balance=${bal?.balance}`,
      });
      await serviceClient.from("lessons").delete().eq("student_id", raceStudent.id);
      await serviceClient.from("students").delete().eq("id", raceStudent.id);
      await serviceClient.from("packages").delete().eq("id", onePack.id);
    }
  }

  // ---- 6c. unauthorized actor rejected -----------------------------------
  {
    // Create a throwaway auth user with no membership in demo-academy.
    const email = `noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const future = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString();
      const res = await serviceClient.rpc("schedule_lesson", {
        p_tenant_id: tenantId,
        p_actor: strangerId,
        p_instructor_id: instructorId,
        p_student_id: student.id,
        p_starts_at: future,
        p_duration_min: 60,
        p_credits_cost: 1,
        p_location: null,
        p_notes: null,
      });
      results.push({
        name: "unauthorized actor rejected by schedule_lesson",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 6. cross-tenant student rejected ----------------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `rls-other-${Date.now()}`, name: "Other RLS Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      const { data: foreignStudent } = await serviceClient
        .from("students")
        .insert({
          tenant_id: otherTenant.id,
          full_name: "Cross-tenant Student",
        })
        .select("id")
        .single();
      if (foreignStudent) {
        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const cross = await serviceClient.rpc("schedule_lesson", {
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_instructor_id: instructorId,
          p_student_id: foreignStudent.id,
          p_starts_at: future.toISOString(),
          p_duration_min: 60,
          p_credits_cost: 1,
          p_location: null,
          p_notes: null,
        });
        results.push({
          name: "cross-tenant student rejected",
          ok: cross.error !== null,
          detail: cross.error?.message ?? "cross-tenant accepted!",
        });
        await serviceClient.from("students").delete().eq("id", foreignStudent.id);
      }
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    }
  }

  // ---- RPC execute grant lockdown (migration 0023) -----------------------
  // The mutation RPCs must be service-role only. Calling them with the anon
  // key (which authenticates as the `anon` PostgREST role) must fail.
  {
    const { error } = await anonClient.rpc("schedule_lesson", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_actor: "00000000-0000-0000-0000-000000000000",
      p_instructor_id: "00000000-0000-0000-0000-000000000000",
      p_student_id: "00000000-0000-0000-0000-000000000000",
      p_starts_at: new Date().toISOString(),
      p_duration_min: 60,
      p_credits_cost: 1,
      p_location: null,
      p_notes: null,
    });
    results.push({
      name: "anon CANNOT call schedule_lesson RPC (execute revoked)",
      ok: isExecuteRevoked(error),
      detail: describePrivError(error),
    });
  }
  {
    const { error } = await anonClient.rpc("set_lesson_progress", {
      p_lesson_id: "00000000-0000-0000-0000-000000000000",
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_actor: "00000000-0000-0000-0000-000000000000",
      p_score: 3,
      p_summary: null,
    });
    results.push({
      name: "anon CANNOT call set_lesson_progress RPC (execute revoked)",
      ok: isExecuteRevoked(error),
      detail: describePrivError(error),
    });
  }

  // ---- cleanup -----------------------------------------------------------
  await serviceClient.from("lessons").delete().eq("student_id", student.id);
  await serviceClient.from("students").delete().eq("id", student.id);
  await serviceClient.from("packages").delete().eq("id", pack1.id);

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
  console.log("All lessons RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
