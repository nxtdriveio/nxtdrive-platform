/**
 * RLS + RPC tests for the instructor dashboard (Phase 2E).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-instructor
 *   pnpm --filter @workspace/scripts run db:test-rls-instructor -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read lesson_notes.
 *  2. add_lesson_note rejects unauthorized actor.
 *  3. add_lesson_note succeeds for tenant_admin/instructor, writes audit row.
 *  4. mark_lesson_no_show flips status, no refund, audit row created.
 *  5. mark_lesson_no_show rejects non-planned lessons.
 *  6. set_lesson_progress stores score+summary for an in-progress lesson;
 *     rejects out-of-range score.
 *  7. Cross-tenant access to lesson_notes blocked by RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running instructor RLS/RPC tests`);

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

  // Set up a fresh student + package + planned lesson.
  const { data: student } = await serviceClient
    .from("students")
    .insert({
      tenant_id: tenantId,
      full_name: `Instructor Test Student ${Date.now()}`,
    })
    .select("id")
    .single();
  const { data: pack } = await serviceClient
    .from("packages")
    .insert({
      tenant_id: tenantId,
      name: `Instructor Test Pack ${Date.now()}`,
      credits_total: 4,
      price_cents: 8000,
      active: true,
    })
    .select("id")
    .single();
  if (!student || !pack) {
    console.error("Could not set up student/package");
    process.exit(1);
  }
  await serviceClient.rpc("grant_package", {
    p_student_id: student.id,
    p_tenant_id: tenantId,
    p_actor: instructorId,
    p_package_id: pack.id,
  });
  const startAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
  const scheduleRes = await serviceClient.rpc("schedule_lesson", {
    p_tenant_id: tenantId,
    p_actor: instructorId,
    p_instructor_id: instructorId,
    p_student_id: student.id,
    p_starts_at: startAt,
    p_duration_min: 60,
    p_credits_cost: 1,
    p_location: null,
    p_notes: null,
  });
  const lessonId = (scheduleRes.data as string | null) ?? null;
  if (!lessonId) {
    console.error("Failed to schedule lesson for tests:", scheduleRes.error);
    process.exit(1);
  }

  // ---- 1. anon cannot read lesson_notes ----------------------------------
  {
    const { data, error } = await anonClient
      .from("lesson_notes")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read lesson_notes",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. add_lesson_note rejects unauthorized actor ---------------------
  {
    const email = `stranger-notes-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const res = await serviceClient.rpc("add_lesson_note", {
        p_lesson_id: lessonId,
        p_tenant_id: tenantId,
        p_actor: strangerId,
        p_body: "should never land",
      });
      results.push({
        name: "add_lesson_note rejects unauthorized actor",
        ok: res.error !== null,
        detail: res.error?.message ?? "stranger note accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 3. add_lesson_note succeeds + audit row ---------------------------
  {
    const res = await serviceClient.rpc("add_lesson_note", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_body: "  Stuurfouten in bochten, oefenen volgende les  ",
    });
    const noteId = (res.data as string | null) ?? null;
    const { data: noteRow } = await serviceClient
      .from("lesson_notes")
      .select("body")
      .eq("id", noteId ?? "")
      .maybeSingle();
    const { data: audit } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("action", "lesson.note_added")
      .eq("target_id", lessonId);
    const trimmed =
      noteRow?.body === "Stuurfouten in bochten, oefenen volgende les";
    results.push({
      name: "add_lesson_note succeeds and trims body",
      ok: !res.error && noteId !== null && trimmed && (audit ?? []).length === 1,
      detail: res.error
        ? res.error.message
        : `noteId=${noteId} trimmed=${trimmed} audit=${(audit ?? []).length}`,
    });
  }

  // ---- 4. mark_lesson_no_show flips status, no refund --------------------
  let noShowLessonId: string | null = null;
  {
    // Schedule a separate lesson to mark as no-show (current one stays planned
    // for the next tests).
    const t2 = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const sch = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: student.id,
      p_starts_at: t2,
      p_duration_min: 60,
      p_credits_cost: 1,
      p_location: null,
      p_notes: null,
    });
    noShowLessonId = (sch.data as string | null) ?? null;
    const { data: balBefore } = await serviceClient
      .from("student_credit_balance")
      .select("balance")
      .eq("student_id", student.id)
      .maybeSingle();
    const before = (balBefore?.balance as number | undefined) ?? -1;

    const ns = await serviceClient.rpc("mark_lesson_no_show", {
      p_lesson_id: noShowLessonId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
    });
    const { data: lessonRow } = await serviceClient
      .from("lessons")
      .select("status")
      .eq("id", noShowLessonId ?? "")
      .maybeSingle();
    const { data: balAfter } = await serviceClient
      .from("student_credit_balance")
      .select("balance")
      .eq("student_id", student.id)
      .maybeSingle();
    const after = (balAfter?.balance as number | undefined) ?? -2;
    const { data: audit } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("action", "lesson.no_show")
      .eq("target_id", noShowLessonId ?? "");
    results.push({
      name: "mark_lesson_no_show flips status, no refund, audit row",
      ok:
        !ns.error &&
        lessonRow?.status === "no_show" &&
        after === before &&
        (audit ?? []).length === 1,
      detail: ns.error
        ? ns.error.message
        : `status=${lessonRow?.status} balance ${before}→${after} audit=${(audit ?? []).length}`,
    });
  }

  // ---- 5. mark_lesson_no_show rejects non-planned ------------------------
  {
    if (!noShowLessonId) {
      results.push({
        name: "mark_lesson_no_show rejects non-planned",
        ok: false,
        detail: "previous no_show setup failed",
      });
    } else {
      const res = await serviceClient.rpc("mark_lesson_no_show", {
        p_lesson_id: noShowLessonId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
      });
      results.push({
        name: "mark_lesson_no_show rejects non-planned",
        ok: res.error !== null,
        detail: res.error?.message ?? "double no_show accepted!",
      });
    }
  }

  // ---- 6. set_lesson_progress stores for in-progress + rejects out-of-range
  {
    const started = await serviceClient.rpc("start_lesson", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
    });
    const ok = await serviceClient.rpc("set_lesson_progress", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_score: 7,
      p_summary: "  Goed bezig met spiegelgebruik  ",
    });
    const { data: row } = await serviceClient
      .from("lessons")
      .select("progress_score, progress_summary")
      .eq("id", lessonId)
      .maybeSingle();
    const stored =
      row?.progress_score === 7 &&
      row?.progress_summary === "Goed bezig met spiegelgebruik";

    const bad = await serviceClient.rpc("set_lesson_progress", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_score: 99,
      p_summary: null,
    });

    results.push({
      name: "set_lesson_progress stores for in-progress lesson & rejects out-of-range",
      ok: !started.error && !ok.error && stored && bad.error !== null,
      detail: started.error
        ? started.error.message
        : ok.error
          ? ok.error.message
          : `stored=${stored} rejected_high=${bad.error !== null}`,
    });
  }

  // ---- 7. cross-tenant student rejected by add_lesson_note ---------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `rls-other-i-${Date.now()}`, name: "Other Tenant I" })
      .select("id")
      .single();
    if (otherTenant) {
      const res = await serviceClient.rpc("add_lesson_note", {
        p_lesson_id: lessonId,
        p_tenant_id: otherTenant.id,
        p_actor: instructorId,
        p_body: "cross-tenant attempt",
      });
      results.push({
        name: "add_lesson_note rejects cross-tenant (lesson not in tenant)",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant accepted!",
      });
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    }
  }

  // ---- cleanup -----------------------------------------------------------
  await serviceClient.from("lessons").delete().eq("student_id", student.id);
  await serviceClient.from("students").delete().eq("id", student.id);
  await serviceClient.from("packages").delete().eq("id", pack.id);

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
  console.log("All instructor RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
