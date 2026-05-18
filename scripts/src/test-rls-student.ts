/**
 * RLS tests for the Student PWA (Phase 2F).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-student
 *   pnpm --filter @workspace/scripts run db:test-rls-student -- --env=production
 *
 * Asserts (under a real authenticated student JWT):
 *   1. Student sees their own students row, not the other student's.
 *   2. Student sees their own lessons, not the other student's.
 *   3. Student sees their own credit_ledger rows, not the other student's.
 *   4. Student sees only their own balance via student_credit_balance.
 *   5. Student CANNOT read raw lesson_notes (zero rows even for own lessons).
 *   6. Anonymous role cannot read student_credit_balance.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running student RLS tests`);

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
  const createdStudentIds: string[] = [];
  const createdPackageIds: string[] = [];

  try {
    // --- tenant + instructor (for lesson scheduling) ----------------------
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

    const { data: instructorMembership } = await serviceClient
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("role", ["tenant_admin", "instructor"])
      .limit(1)
      .maybeSingle();
    if (!instructorMembership) {
      console.error("No instructor in demo-academy — add one with db:add-membership");
      process.exit(1);
    }
    const instructorId = instructorMembership.user_id as string;

    // --- helper to create a logged-in student -----------------------------
    const studentPassword = `s-pass-${stamp}`;

    async function createLoggedInStudent(label: string) {
      const email = `student-${label}-${stamp}@nxtdrive.test`;
      const { data: u, error: uErr } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password: studentPassword,
      });
      if (uErr || !u?.user) throw new Error(`createUser: ${uErr?.message}`);
      const userId = u.user.id;
      createdUserIds.push(userId);

      // Profile is auto-created by trigger on auth.users insert; ensure it exists.
      await serviceClient
        .from("profiles")
        .upsert({ id: userId, email, full_name: `Student ${label}` });

      const { data: student } = await serviceClient
        .from("students")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          full_name: `Student ${label} ${stamp}`,
          email,
        })
        .select("id")
        .single();
      if (!student) throw new Error("could not create student row");
      createdStudentIds.push(student.id);

      await serviceClient.from("memberships").insert({
        user_id: userId,
        tenant_id: tenantId,
        role: "student",
      });

      return { userId, studentId: student.id as string, email };
    }

    const A = await createLoggedInStudent("a");
    const B = await createLoggedInStudent("b");

    // --- give each student a package + schedule a lesson ------------------
    const { data: pack } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: `RLS Student Pack ${stamp}`,
        credits_total: 4,
        price_cents: 8000,
        active: true,
      })
      .select("id")
      .single();
    if (!pack) throw new Error("could not create package");
    createdPackageIds.push(pack.id);

    for (const S of [A, B]) {
      await serviceClient.rpc("grant_package", {
        p_student_id: S.studentId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_package_id: pack.id,
      });
      const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const sch = await serviceClient.rpc("schedule_lesson", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_instructor_id: instructorId,
        p_student_id: S.studentId,
        p_starts_at: start,
        p_duration_min: 60,
        p_credits_cost: 1,
        p_location: `Locatie ${S.studentId.slice(0, 6)}`,
        p_notes: null,
      });
      const lessonId = (sch.data as string | null) ?? null;
      if (!lessonId) {
        throw new Error(`schedule_lesson failed: ${sch.error?.message}`);
      }
      // Add a lesson note for A so we can verify the leak protection.
      if (S === A) {
        const note = await serviceClient.rpc("add_lesson_note", {
          p_lesson_id: lessonId,
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_body: "Privé instructeursnotitie — mag niet zichtbaar zijn voor leerling",
        });
        if (note.error) {
          throw new Error(`add_lesson_note failed: ${note.error.message}`);
        }
      }
    }

    // --- sign in as student A and run assertions --------------------------
    const aClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signIn, error: signInErr } =
      await aClient.auth.signInWithPassword({
        email: A.email,
        password: studentPassword,
      });
    if (signInErr || !signIn.session) {
      throw new Error(`signIn failed: ${signInErr?.message}`);
    }

    // 1. students row visibility
    {
      const { data } = await aClient
        .from("students")
        .select("id, user_id")
        .in("id", [A.studentId, B.studentId]);
      const ids = (data ?? []).map((r) => r.id);
      results.push({
        name: "student sees own students row, not other student's",
        ok: ids.length === 1 && ids[0] === A.studentId,
        detail: `visible_ids=${ids.join(",")}`,
      });
    }

    // 2. lessons visibility
    {
      const { data } = await aClient.from("lessons").select("id, student_id");
      const rows = data ?? [];
      const onlyOwn = rows.every((r) => r.student_id === A.studentId);
      const hasOwn = rows.some((r) => r.student_id === A.studentId);
      results.push({
        name: "student sees own lessons, not other student's",
        ok: hasOwn && onlyOwn,
        detail: `rows=${rows.length} only_own=${onlyOwn}`,
      });
    }

    // 3. credit_ledger visibility
    {
      const { data } = await aClient
        .from("credit_ledger")
        .select("id, student_id, delta");
      const rows = data ?? [];
      const onlyOwn = rows.every((r) => r.student_id === A.studentId);
      const hasOwn = rows.some((r) => r.student_id === A.studentId);
      results.push({
        name: "student sees own credit_ledger rows, not other student's",
        ok: hasOwn && onlyOwn,
        detail: `rows=${rows.length} only_own=${onlyOwn}`,
      });
    }

    // 4. balance view scoped to self
    {
      const { data } = await aClient
        .from("student_credit_balance")
        .select("student_id, balance");
      const rows = data ?? [];
      const onlyOwn = rows.every((r) => r.student_id === A.studentId);
      const balanceForA =
        rows.find((r) => r.student_id === A.studentId)?.balance ?? null;
      results.push({
        name: "student sees only own student_credit_balance row",
        ok: onlyOwn && rows.length === 1 && balanceForA === 3,
        detail: `rows=${rows.length} balanceA=${balanceForA}`,
      });
    }

    // 5. raw lesson_notes hidden from student
    {
      const { data, error } = await aClient
        .from("lesson_notes")
        .select("id, body");
      results.push({
        name: "student CANNOT read raw lesson_notes (own or other)",
        ok: !error && (data ?? []).length === 0,
        detail: error ? error.message : `rows=${(data ?? []).length}`,
      });
    }

    // 6. anon cannot read balance view
    {
      const { data, error } = await anonClient
        .from("student_credit_balance")
        .select("student_id, balance")
        .limit(5);
      results.push({
        name: "anon cannot read student_credit_balance",
        ok: (data ?? []).length === 0,
        detail: error ? error.message : `rows=${(data ?? []).length}`,
      });
    }

    await aClient.auth.signOut();
  } finally {
    // --- cleanup ---------------------------------------------------------
    // Note: credit_ledger is insert-only (BEFORE DELETE trigger blocks
    // mutations), so we cannot delete ledger rows. Student/lesson rows that
    // FK into ledger therefore also resist cascade deletes — best-effort
    // cleanup, mirroring the instructor RLS test pattern.
    for (const sid of createdStudentIds) {
      await serviceClient
        .from("lessons")
        .delete()
        .eq("student_id", sid)
        .then(() => undefined, () => undefined);
    }
    await serviceClient
      .from("students")
      .delete()
      .in("id", createdStudentIds.length ? createdStudentIds : ["00000000-0000-0000-0000-000000000000"])
      .then(() => undefined, () => undefined);
    for (const pid of createdPackageIds) {
      await serviceClient
        .from("packages")
        .delete()
        .eq("id", pid)
        .then(() => undefined, () => undefined);
    }
    for (const uid of createdUserIds) {
      await serviceClient.from("memberships").delete().eq("user_id", uid);
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
  console.log("All student RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
