/**
 * RLS + RPC tests for the wachtlijst / refill-invitation flow (Task #93).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-refill
 *   pnpm --filter @workspace/scripts run db:test-rls-refill -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read lesson_refill_invitations.
 *  2. anon CANNOT call the mutation RPCs (execute revoked):
 *     create / respond / cancel / set_student_refill_preference.
 *  3. create_lesson_refill_invitation creates a pending invitation.
 *  4. A student sees only their OWN open invitation, not another student's.
 *  5. Expired invitation does NOT book on accept (lazy-expire).
 *  6. Accept books the lesson + writes a lesson_consumed ledger row + cancels
 *     the sibling pending invitations for the same freed block.
 *  7. Double-accept is impossible (second accept errors, books nothing extra).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running refill (wachtlijst) RLS/RPC tests`);

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
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdInvitationIds: string[] = [];
  const createdLessonIds: string[] = [];

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
  const studentPassword = `s-pass-${stamp}`;

  // Future time, clean hour, to avoid scheduling overlaps.
  function future(daysAhead: number, hourUtc = 10): string {
    const d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString();
  }

  // Create a logged-in student with `creditMin` of tegoed. Opted in to the
  // wachtlijst by default (the invitation flow requires opt-in); pass
  // `optIn=false` to exercise the opt-in enforcement guardrail.
  async function makeStudent(label: string, creditMin: number, optIn = true) {
    const email = `refill-${label}-${stamp}@nxtdrive.test`;
    const { data: u, error: uErr } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: studentPassword,
    });
    if (uErr || !u?.user) throw new Error(`createUser: ${uErr?.message}`);
    const userId = u.user.id;
    createdUserIds.push(userId);

    await serviceClient
      .from("profiles")
      .upsert({ id: userId, email, full_name: `Refill ${label}` });

    const { data: student, error: sErr } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        full_name: `Refill ${label} ${stamp}`,
        email,
        refill_opt_in: optIn,
      })
      .select("id")
      .single();
    if (sErr || !student) throw new Error(`student insert: ${sErr?.message}`);
    createdStudentIds.push(student.id);

    await serviceClient.from("memberships").insert({
      user_id: userId,
      tenant_id: tenantId,
      role: "student",
    });

    if (creditMin > 0) {
      const { error: lErr } = await serviceClient.from("credit_ledger").insert({
        tenant_id: tenantId,
        student_id: student.id,
        delta: creditMin,
        reason: "opening_balance",
        note: "refill test seed",
      });
      if (lErr) throw new Error(`credit seed: ${lErr.message}`);
    }

    return { userId, studentId: student.id as string, email };
  }

  async function loginClient(email: string) {
    const c = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email,
      password: studentPassword,
    });
    if (error) throw new Error(`signIn ${email}: ${error.message}`);
    return c;
  }

  // ---- 1. anon cannot read lesson_refill_invitations --------------------
  {
    const { data, error } = await anonClient
      .from("lesson_refill_invitations")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read lesson_refill_invitations",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. anon CANNOT call the mutation RPCs (execute revoked) ------------
  {
    const zero = "00000000-0000-0000-0000-000000000000";
    const create = await anonClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: zero,
      p_actor: zero,
      p_student_id: zero,
      p_instructor_id: zero,
      p_starts_at: future(7),
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 3,
    });
    const isPermDenied = (e: { message: string } | null) =>
      e !== null && /permission denied for function/i.test(e.message);
    results.push({
      name: "anon CANNOT call create_lesson_refill_invitation (execute revoked)",
      ok: isPermDenied(create.error),
      detail: create.error ? create.error.message : "RPC is callable!",
    });

    const respond = await anonClient.rpc("respond_lesson_refill_invitation", {
      p_invitation_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_accept: true,
    });
    results.push({
      name: "anon CANNOT call respond_lesson_refill_invitation (execute revoked)",
      ok: isPermDenied(respond.error),
      detail: respond.error ? respond.error.message : "RPC is callable!",
    });

    const cancel = await anonClient.rpc("cancel_lesson_refill_invitation", {
      p_invitation_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call cancel_lesson_refill_invitation (execute revoked)",
      ok: isPermDenied(cancel.error),
      detail: cancel.error ? cancel.error.message : "RPC is callable!",
    });

    const pref = await anonClient.rpc("set_student_refill_preference", {
      p_tenant_id: zero,
      p_actor: zero,
      p_student_id: zero,
      p_opt_in: true,
      p_dayparts: [],
    });
    results.push({
      name: "anon CANNOT call set_student_refill_preference (execute revoked)",
      ok: isPermDenied(pref.error),
      detail: pref.error ? pref.error.message : "RPC is callable!",
    });
  }

  // ---- 3. create_lesson_refill_invitation creates a pending invitation ----
  // Source lesson = a cancelled lesson freeing a future block.
  const sourceStudent = await makeStudent("source", 0);
  let sourceLessonId: string | null = null;
  {
    const { data: lid } = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_student_id: sourceStudent.studentId,
      p_starts_at: future(7),
      p_duration_min: 60,
      p_location: null,
      p_notes: null,
      p_location_lat: null,
      p_location_lng: null,
      p_location_place_id: null,
    });
    sourceLessonId = (lid as string | null) ?? null;
    if (sourceLessonId) {
      createdLessonIds.push(sourceLessonId);
      await serviceClient.rpc("cancel_lesson", {
        p_lesson_id: sourceLessonId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_reason: "refill test source",
      });
    }
  }

  const studentA = await makeStudent("a", 120);
  const studentB = await makeStudent("b", 120);
  let inviteA: string | null = null;
  let inviteB: string | null = null;
  {
    const res = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: studentA.studentId,
      p_instructor_id: instructorId,
      p_starts_at: future(7),
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 3,
      p_source_lesson_id: sourceLessonId,
      p_score: 50,
      p_reason: "beschikbaar gesteld",
    });
    inviteA = (res.data as string | null) ?? null;
    if (inviteA) createdInvitationIds.push(inviteA);

    const { data: row } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status, student_id")
      .eq("id", inviteA ?? "")
      .maybeSingle();
    results.push({
      name: "create_lesson_refill_invitation creates a pending invitation",
      ok: !res.error && inviteA !== null && row?.status === "pending",
      detail: res.error ? res.error.message : `status=${row?.status}`,
    });

    // Sibling invite for student B on the same freed block.
    const resB = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: studentB.studentId,
      p_instructor_id: instructorId,
      p_starts_at: future(7),
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 3,
      p_source_lesson_id: sourceLessonId,
      p_score: 40,
      p_reason: "beschikbaar gesteld",
    });
    inviteB = (resB.data as string | null) ?? null;
    if (inviteB) createdInvitationIds.push(inviteB);
  }

  // ---- 3a. create enforces student opt-in --------------------------------
  {
    const notOptedIn = await makeStudent("noopt", 120, false);
    const res = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: notOptedIn.studentId,
      p_instructor_id: instructorId,
      p_starts_at: future(9),
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 3,
    });
    const created = (res.data as string | null) ?? null;
    if (created) createdInvitationIds.push(created);
    results.push({
      name: "create rejects a student who did not opt in",
      ok: res.error !== null && created === null,
      detail: res.error ? res.error.message : "invitation was created!",
    });
  }

  // ---- 3b. create rejects when invitations are disabled -------------------
  {
    const res = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: studentA.studentId,
      p_instructor_id: instructorId,
      p_starts_at: future(10),
      p_duration_min: 60,
      p_enabled: false,
      p_valid_minutes: 1440,
      p_max_candidates: 3,
    });
    results.push({
      name: "create rejects when herbezet-uitnodigingen are disabled",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "invitation was created!",
    });
  }

  // ---- 3c. max concurrent candidates is enforced -------------------------
  {
    const startsAt = future(11);
    const s1 = await makeStudent("max1", 120);
    const s2 = await makeStudent("max2", 120);
    const first = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: s1.studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsAt,
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 1,
    });
    const firstId = (first.data as string | null) ?? null;
    if (firstId) createdInvitationIds.push(firstId);
    const second = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: s2.studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsAt,
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 1,
    });
    const secondId = (second.data as string | null) ?? null;
    if (secondId) createdInvitationIds.push(secondId);
    results.push({
      name: "create enforces max concurrent candidates per block",
      ok: !first.error && firstId !== null && second.error !== null,
      detail: second.error
        ? second.error.message
        : "second invitation over the cap was created!",
    });
  }

  // ---- 3d. no duplicate pending invitation for same student + block ------
  {
    const startsAt = future(12);
    const s = await makeStudent("dup", 120);
    const first = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: s.studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsAt,
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 5,
    });
    const firstId = (first.data as string | null) ?? null;
    if (firstId) createdInvitationIds.push(firstId);
    const dup = await serviceClient.rpc("create_lesson_refill_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_student_id: s.studentId,
      p_instructor_id: instructorId,
      p_starts_at: startsAt,
      p_duration_min: 60,
      p_enabled: true,
      p_valid_minutes: 1440,
      p_max_candidates: 5,
    });
    const dupId = (dup.data as string | null) ?? null;
    if (dupId) createdInvitationIds.push(dupId);
    results.push({
      name: "create rejects a duplicate pending invitation",
      ok: !first.error && firstId !== null && dup.error !== null,
      detail: dup.error ? dup.error.message : "duplicate invitation was created!",
    });
  }

  // ---- 4. student sees only their OWN open invitation --------------------
  {
    const clientA = await loginClient(studentA.email);
    const { data, error } = await clientA
      .from("lesson_refill_invitations")
      .select("id, student_id")
      .eq("status", "pending");
    const ids = (data ?? []).map((r) => r.id);
    const onlyOwn =
      (data ?? []).every((r) => r.student_id === studentA.studentId) &&
      ids.includes(inviteA ?? "") &&
      !ids.includes(inviteB ?? "");
    results.push({
      name: "student sees only their own open invitation",
      ok: !error && onlyOwn,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 5. expired invitation does NOT book on accept --------------------
  {
    const expStudent = await makeStudent("expired", 120);
    const { data: eid } = await serviceClient.rpc(
      "create_lesson_refill_invitation",
      {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: expStudent.studentId,
        p_instructor_id: instructorId,
        p_starts_at: future(8),
        p_duration_min: 60,
        p_enabled: true,
        p_valid_minutes: 1440,
        p_max_candidates: 3,
        p_source_lesson_id: null,
        p_score: 10,
        p_reason: null,
      },
    );
    const expId = (eid as string | null) ?? null;
    if (expId) {
      createdInvitationIds.push(expId);
      // Force-expire by backdating expires_at.
      await serviceClient
        .from("lesson_refill_invitations")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", expId);

      const { count: lessonsBefore } = await serviceClient
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("student_id", expStudent.studentId);

      const res = await serviceClient.rpc("respond_lesson_refill_invitation", {
        p_invitation_id: expId,
        p_tenant_id: tenantId,
        p_actor: expStudent.userId,
        p_accept: true,
      });

      const { count: lessonsAfter } = await serviceClient
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("student_id", expStudent.studentId);
      const { data: row } = await serviceClient
        .from("lesson_refill_invitations")
        .select("status, booked_lesson_id")
        .eq("id", expId)
        .maybeSingle();

      // The RPC raises on an expired invitation; that rolls back the lazy-expire
      // status write, so the row may stay `pending` — what matters is that NO
      // lesson was booked and booked_lesson_id stays null.
      results.push({
        name: "expired invitation does not book on accept",
        ok:
          res.error !== null &&
          (lessonsBefore ?? 0) === (lessonsAfter ?? -1) &&
          row?.booked_lesson_id == null,
        detail: res.error
          ? `err=${res.error.message} lessons ${lessonsBefore}→${lessonsAfter}`
          : `unexpected success: lessons ${lessonsBefore}→${lessonsAfter} status=${row?.status}`,
      });

      // Hardening assertion: the lazy-expiry branch must raise BEFORE any
      // mutation, so it must NOT leave a rolled-back-or-otherwise audit trail.
      const { count: expiredAudit } = await serviceClient
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("action", "lesson_refill.expired")
        .eq("target_id", expId);
      results.push({
        name: "expired response writes no lesson_refill.expired audit row",
        ok: (expiredAudit ?? 0) === 0,
        detail: `audit rows=${expiredAudit ?? 0}`,
      });
    }
  }

  // ---- 6. accept books + ledger + cancels siblings ----------------------
  {
    const { count: ledgerBefore } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentA.studentId);

    const res = await serviceClient.rpc("respond_lesson_refill_invitation", {
      p_invitation_id: inviteA,
      p_tenant_id: tenantId,
      p_actor: studentA.userId,
      p_accept: true,
    });

    const { data: invRow } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status, booked_lesson_id")
      .eq("id", inviteA ?? "")
      .maybeSingle();
    if (invRow?.booked_lesson_id)
      createdLessonIds.push(invRow.booked_lesson_id);

    const { data: ledgerRows } = await serviceClient
      .from("credit_ledger")
      .select("delta, reason")
      .eq("student_id", studentA.studentId);
    const consumed = (ledgerRows ?? []).filter(
      (r) => r.reason === "lesson_consumed",
    );

    const { data: siblingRow } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status")
      .eq("id", inviteB ?? "")
      .maybeSingle();

    results.push({
      name: "accept books lesson + lesson_consumed ledger + cancels siblings",
      ok:
        !res.error &&
        invRow?.status === "accepted" &&
        invRow?.booked_lesson_id != null &&
        consumed.length === 1 &&
        (ledgerRows ?? []).length === (ledgerBefore ?? 0) + 1 &&
        siblingRow?.status === "cancelled",
      detail: res.error
        ? res.error.message
        : `status=${invRow?.status} consumed=${consumed.length} sibling=${siblingRow?.status}`,
    });
  }

  // ---- 7. double-accept impossible --------------------------------------
  {
    const { count: lessonsBefore } = await serviceClient
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentA.studentId);

    const res = await serviceClient.rpc("respond_lesson_refill_invitation", {
      p_invitation_id: inviteA,
      p_tenant_id: tenantId,
      p_actor: studentA.userId,
      p_accept: true,
    });

    const { count: lessonsAfter } = await serviceClient
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentA.studentId);

    results.push({
      name: "double-accept is impossible (no extra booking)",
      ok: res.error !== null && (lessonsBefore ?? 0) === (lessonsAfter ?? -1),
      detail: res.error
        ? res.error.message
        : `second accept succeeded! lessons ${lessonsBefore}→${lessonsAfter}`,
    });
  }

  // ---- 8. accept is blocked when tegoed is insufficient -----------------
  {
    const poor = await makeStudent("poor", 30); // 30 < 60 min lesson
    const { data: pid } = await serviceClient.rpc(
      "create_lesson_refill_invitation",
      {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: poor.studentId,
        p_instructor_id: instructorId,
        p_starts_at: future(13),
        p_duration_min: 60,
        p_enabled: true,
        p_valid_minutes: 1440,
        p_max_candidates: 3,
      },
    );
    const poorInvite = (pid as string | null) ?? null;
    if (poorInvite) createdInvitationIds.push(poorInvite);

    const { count: lessonsBefore } = await serviceClient
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", poor.studentId);

    const res = await serviceClient.rpc("respond_lesson_refill_invitation", {
      p_invitation_id: poorInvite,
      p_tenant_id: tenantId,
      p_actor: poor.userId,
      p_accept: true,
    });

    const { count: lessonsAfter } = await serviceClient
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("student_id", poor.studentId);
    const { data: row } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status, booked_lesson_id")
      .eq("id", poorInvite ?? "")
      .maybeSingle();

    results.push({
      name: "accept blocked on insufficient tegoed (no booking)",
      ok:
        res.error !== null &&
        (lessonsBefore ?? 0) === (lessonsAfter ?? -1) &&
        row?.booked_lesson_id == null,
      detail: res.error
        ? `err=${res.error.message} lessons ${lessonsBefore}→${lessonsAfter}`
        : `unexpected booking: lessons ${lessonsBefore}→${lessonsAfter}`,
    });
  }

  // ---- 9. cancel: unauthorized actor blocked, staff cancel works --------
  {
    const cs = await makeStudent("cancel", 120);
    const { data: cid } = await serviceClient.rpc(
      "create_lesson_refill_invitation",
      {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: cs.studentId,
        p_instructor_id: instructorId,
        p_starts_at: future(14),
        p_duration_min: 60,
        p_enabled: true,
        p_valid_minutes: 1440,
        p_max_candidates: 3,
      },
    );
    const cancelInvite = (cid as string | null) ?? null;
    if (cancelInvite) createdInvitationIds.push(cancelInvite);

    // The invited student (non-staff) must NOT be able to cancel.
    const unauthorized = await serviceClient.rpc(
      "cancel_lesson_refill_invitation",
      {
        p_invitation_id: cancelInvite,
        p_tenant_id: tenantId,
        p_actor: cs.userId,
      },
    );
    const { data: afterUnauthorized } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status")
      .eq("id", cancelInvite ?? "")
      .maybeSingle();
    results.push({
      name: "cancel rejects a non-staff actor",
      ok:
        unauthorized.error !== null &&
        afterUnauthorized?.status === "pending",
      detail: unauthorized.error
        ? unauthorized.error.message
        : `non-staff cancel succeeded! status=${afterUnauthorized?.status}`,
    });

    // Staff cancel sets the invitation to cancelled.
    const staffCancel = await serviceClient.rpc(
      "cancel_lesson_refill_invitation",
      {
        p_invitation_id: cancelInvite,
        p_tenant_id: tenantId,
        p_actor: instructorId,
      },
    );
    const { data: afterStaff } = await serviceClient
      .from("lesson_refill_invitations")
      .select("status")
      .eq("id", cancelInvite ?? "")
      .maybeSingle();
    results.push({
      name: "staff can cancel an open invitation",
      ok: !staffCancel.error && afterStaff?.status === "cancelled",
      detail: staffCancel.error
        ? staffCancel.error.message
        : `status=${afterStaff?.status}`,
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const id of createdInvitationIds) {
    await serviceClient.from("lesson_refill_invitations").delete().eq("id", id);
  }
  for (const id of createdLessonIds) {
    await serviceClient.from("lessons").delete().eq("id", id);
  }
  for (const sid of createdStudentIds) {
    await serviceClient.from("credit_ledger").delete().eq("student_id", sid);
    await serviceClient.from("students").delete().eq("id", sid);
  }
  for (const uid of createdUserIds) {
    await serviceClient.from("memberships").delete().eq("user_id", uid);
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
  console.log("All refill (wachtlijst) RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
