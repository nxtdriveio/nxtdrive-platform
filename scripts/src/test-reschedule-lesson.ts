/**
 * RLS + RPC tests for student self-rescheduling (Task #166, migration 0085).
 *
 *   pnpm --filter @workspace/scripts run db:test-reschedule-lesson
 *   pnpm --filter @workspace/scripts run db:test-reschedule-lesson -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call student_reschedule_lesson (execute revoked).
 *  2. the owning student CAN reschedule their own planned, future lesson; the
 *     start/end move and the duration is preserved.
 *  3. credits are preserved — NO new credit_ledger row, balance unchanged.
 *  4. an audit row (lesson.rescheduled) is written.
 *  5. rescheduling onto a slot that overlaps another planned lesson of the same
 *     instructor is rejected (instructor availability respected).
 *  6. rescheduling to a past moment is rejected (future invariant).
 *  7. an unauthorized (stranger) actor is rejected.
 *  8. a linked guardian actor CAN reschedule for the child.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };
type PgError = { code?: string; message?: string } | null;

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
  console.log(`${bannerFor(env)} — running reschedule-lesson RLS/RPC tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }
  const password = "test-pass-1234";
  const zero = "00000000-0000-0000-0000-000000000000";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];

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
    console.error("No tenant_admin/instructor membership in demo-academy.");
    process.exit(1);
  }
  const instructorId = membership.user_id as string;

  async function makeUser(label: string): Promise<string> {
    const email = `resched-${label}-${stamp}-${Math.random()
      .toString(36)
      .slice(2, 6)}@nxtdrive.test`;
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    const userId = data?.user?.id;
    if (error || !userId) throw new Error(`createUser ${label}: ${error?.message}`);
    createdUserIds.push(userId);
    await serviceClient
      .from("profiles")
      .upsert({ id: userId, email, full_name: `Resched ${label}` });
    return userId;
  }

  async function makeStudentWithTegoed(
    userId: string | null,
    name: string,
  ): Promise<string> {
    const { data, error } = await serviceClient
      .from("students")
      .insert({ tenant_id: tenantId, full_name: name, user_id: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeStudent failed: ${error?.message}`);
    const studentId = data.id as string;
    createdStudentIds.push(studentId);
    const { data: pack } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: `Resched Pack ${stamp}-${Math.random().toString(36).slice(2, 5)}`,
        credits_total: 600,
        price_cents: 5000,
        active: true,
      })
      .select("id")
      .single();
    await serviceClient.rpc("grant_package", {
      p_student_id: studentId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_package_id: pack!.id,
    });
    return studentId;
  }

  async function scheduleLesson(
    studentId: string,
    hoursAhead: number,
  ): Promise<string> {
    const start = new Date(Date.now() + hoursAhead * 3_600_000).toISOString();
    const res = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: studentId,
      p_starts_at: start,
      p_duration_min: 60,
      p_credits_cost: 60,
      p_location: null,
      p_notes: null,
    });
    if (res.error || typeof res.data !== "string") {
      throw new Error(`scheduleLesson failed: ${res.error?.message}`);
    }
    return res.data;
  }

  async function ledgerCount(studentId: string): Promise<number> {
    const { count } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("tenant_id", tenantId);
    return count ?? -1;
  }

  // Owning student + their student row with tegoed.
  const studentUserId = await makeUser("student");
  const studentId = await makeStudentWithTegoed(studentUserId, "Resched Student");

  // ---- 1. anon CANNOT call student_reschedule_lesson --------------------
  {
    const { error } = await anonClient.rpc("student_reschedule_lesson", {
      p_lesson_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_new_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    results.push({
      name: "anon CANNOT call student_reschedule_lesson (execute revoked)",
      ok: isExecuteRevoked(error),
      detail: describePrivError(error),
    });
  }

  // ---- 2 + 3 + 4. owner reschedules; duration + credits preserved -------
  {
    const lessonId = await scheduleLesson(studentId, 240); // 10 days ahead-ish
    const ledgerBefore = await ledgerCount(studentId);
    const newStart = new Date(Date.now() + 300 * 3_600_000).toISOString();
    const res = await serviceClient.rpc("student_reschedule_lesson", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: studentUserId,
      p_new_starts_at: newStart,
    });
    const { data: lessonRow } = await serviceClient
      .from("lessons")
      .select("starts_at, ends_at, status, credits_cost")
      .eq("id", lessonId)
      .single();
    const movedStart =
      lessonRow != null &&
      new Date(lessonRow.starts_at as string).getTime() ===
        new Date(newStart).getTime();
    const durationMin = lessonRow
      ? Math.round(
          (new Date(lessonRow.ends_at as string).getTime() -
            new Date(lessonRow.starts_at as string).getTime()) /
            60000,
        )
      : -1;
    results.push({
      name: "owner reschedules own planned lesson (start moves, duration kept)",
      ok:
        !res.error &&
        movedStart &&
        durationMin === 60 &&
        lessonRow?.status === "planned",
      detail: res.error
        ? res.error.message
        : `start_moved=${movedStart} duration=${durationMin} status=${lessonRow?.status}`,
    });

    const ledgerAfter = await ledgerCount(studentId);
    results.push({
      name: "credits preserved — no new credit_ledger row on reschedule",
      ok: ledgerAfter === ledgerBefore,
      detail: `before=${ledgerBefore} after=${ledgerAfter}`,
    });

    const { count: auditCount } = await serviceClient
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "lesson.rescheduled")
      .eq("target_id", lessonId);
    results.push({
      name: "audit row (lesson.rescheduled) written",
      ok: (auditCount ?? 0) === 1,
      detail: `audit=${auditCount}`,
    });
  }

  // ---- 5. overlap with another planned lesson rejected ------------------
  {
    const target = await scheduleLesson(studentId, 500); // fixed busy slot
    const { data: targetRow } = await serviceClient
      .from("lessons")
      .select("starts_at")
      .eq("id", target)
      .single();
    const movable = await scheduleLesson(studentId, 520);
    // Try to move `movable` onto a time overlapping the `target` slot.
    const overlapStart = new Date(
      new Date(targetRow!.starts_at as string).getTime() + 30 * 60000,
    ).toISOString();
    const res = await serviceClient.rpc("student_reschedule_lesson", {
      p_lesson_id: movable,
      p_tenant_id: tenantId,
      p_actor: studentUserId,
      p_new_starts_at: overlapStart,
    });
    results.push({
      name: "reschedule onto an overlapping slot is rejected",
      ok: res.error !== null,
      detail: res.error?.message ?? "overlap was accepted!",
    });
  }

  // ---- 6. reschedule to the past rejected -------------------------------
  {
    const lessonId = await scheduleLesson(studentId, 600);
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const res = await serviceClient.rpc("student_reschedule_lesson", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: studentUserId,
      p_new_starts_at: past,
    });
    results.push({
      name: "reschedule to a past moment is rejected",
      ok: res.error !== null,
      detail: res.error?.message ?? "past time accepted!",
    });
  }

  // ---- 7. unauthorized stranger rejected --------------------------------
  {
    const strangerId = await makeUser("stranger");
    const lessonId = await scheduleLesson(studentId, 700);
    const res = await serviceClient.rpc("student_reschedule_lesson", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: strangerId,
      p_new_starts_at: new Date(Date.now() + 720 * 3_600_000).toISOString(),
    });
    results.push({
      name: "unauthorized (stranger) actor rejected",
      ok: res.error !== null,
      detail: res.error?.message ?? "stranger accepted!",
    });
  }

  // ---- 8. linked guardian CAN reschedule --------------------------------
  {
    const guardianId = await makeUser("guardian");
    const childId = await makeStudentWithTegoed(null, "Resched Child");
    await serviceClient.from("student_guardians").insert({
      tenant_id: tenantId,
      student_id: childId,
      user_id: guardianId,
    });
    const lessonId = await scheduleLesson(childId, 800);
    const newStart = new Date(Date.now() + 850 * 3_600_000).toISOString();
    const res = await serviceClient.rpc("student_reschedule_lesson", {
      p_lesson_id: lessonId,
      p_tenant_id: tenantId,
      p_actor: guardianId,
      p_new_starts_at: newStart,
    });
    const { data: lessonRow } = await serviceClient
      .from("lessons")
      .select("starts_at")
      .eq("id", lessonId)
      .single();
    results.push({
      name: "linked guardian CAN reschedule for the child",
      ok:
        !res.error &&
        lessonRow != null &&
        new Date(lessonRow.starts_at as string).getTime() ===
          new Date(newStart).getTime(),
      detail: res.error?.message ?? `start=${lessonRow?.starts_at}`,
    });
  }

  // ---- cleanup ----------------------------------------------------------
  for (const sid of createdStudentIds) {
    await serviceClient.from("lessons").delete().eq("student_id", sid);
    await serviceClient.from("student_guardians").delete().eq("student_id", sid);
    await serviceClient.from("credit_ledger").delete().eq("student_id", sid);
    await serviceClient.from("students").delete().eq("id", sid);
  }
  for (const uid of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(uid);
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
  console.log("All reschedule-lesson RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
