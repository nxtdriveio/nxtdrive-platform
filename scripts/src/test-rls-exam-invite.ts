/**
 * RLS + RPC tests for the examenmoment-uitnodiging flow (Task #102).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-exam-invite
 *   pnpm --filter @workspace/scripts run db:test-rls-exam-invite -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read exam_invitations.
 *  2. anon CANNOT call the mutation RPCs (execute revoked):
 *     create / respond / cancel_exam_invitation.
 *  3. create_exam_invitation creates an 'invited' invitation.
 *  4. A student sees only their OWN open exam invitation, not another student's.
 *  5. Expired invitation does NOT link on accept (lazy-expire) and writes no
 *     exam_invitation.expired audit row (raise BEFORE any mutation).
 *  6. Accept links agenda_appointments.student_id, writes NO credit_ledger row
 *     (exams don't consume credit), and cancels the sibling invitations.
 *  7. Double-accept is impossible (second accept errors, links nothing extra).
 *  8. Accept is blocked once the moment is already linked (no double-book).
 *  9. cancel: a non-staff actor is blocked; staff cancel works.
 * 10. create enforces max concurrent candidates per moment.
 * 11. create rejects a duplicate open invitation for the same student + moment.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running exam-invitation RLS/RPC tests`);

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
  const createdAppointmentIds: string[] = [];

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

  // A monotonically increasing future slot so no two exam moments for the same
  // instructor overlap (the planned exclusion constraint forbids it).
  let slotCursor = 0;
  function nextSlot(durationMin = 60): { startsAt: string; endsAt: string } {
    const start = new Date();
    start.setUTCHours(8, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + 7);
    start.setUTCMinutes(start.getUTCMinutes() + slotCursor * 120);
    slotCursor += 1;
    const end = new Date(start.getTime() + durationMin * 60_000);
    return { startsAt: start.toISOString(), endsAt: end.toISOString() };
  }

  async function makeStudent(label: string) {
    const email = `exam-${label}-${stamp}@nxtdrive.test`;
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
      .upsert({ id: userId, email, full_name: `Exam ${label}` });

    const { data: student, error: sErr } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        full_name: `Exam ${label} ${stamp}`,
        email,
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

    return { userId, studentId: student.id as string, email };
  }

  // Create an open exam moment (type 'exam', planned, no student linked).
  async function makeExamMoment(
    type: "exam" | "interim_test" = "exam",
  ): Promise<string> {
    const { startsAt, endsAt } = nextSlot();
    const { data, error } = await serviceClient
      .from("agenda_appointments")
      .insert({
        tenant_id: tenantId,
        instructor_id: instructorId,
        type,
        status: "planned",
        starts_at: startsAt,
        ends_at: endsAt,
        title: `Exam moment ${stamp}`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`exam moment insert: ${error?.message}`);
    createdAppointmentIds.push(data.id);
    return data.id as string;
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

  // ---- 1. anon cannot read exam_invitations -----------------------------
  {
    const { data, error } = await anonClient
      .from("exam_invitations")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read exam_invitations",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. anon CANNOT call the mutation RPCs (execute revoked) -----------
  {
    const zero = "00000000-0000-0000-0000-000000000000";
    const isPermDenied = (e: { message: string } | null) =>
      e !== null && /permission denied for function/i.test(e.message);

    const create = await anonClient.rpc("create_exam_invitation", {
      p_tenant_id: zero,
      p_actor: zero,
      p_appointment_id: zero,
      p_student_id: zero,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    results.push({
      name: "anon CANNOT call create_exam_invitation (execute revoked)",
      ok: isPermDenied(create.error),
      detail: create.error ? create.error.message : "RPC is callable!",
    });

    const respond = await anonClient.rpc("respond_exam_invitation", {
      p_invitation_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_accept: true,
    });
    results.push({
      name: "anon CANNOT call respond_exam_invitation (execute revoked)",
      ok: isPermDenied(respond.error),
      detail: respond.error ? respond.error.message : "RPC is callable!",
    });

    const cancel = await anonClient.rpc("cancel_exam_invitation", {
      p_invitation_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call cancel_exam_invitation (execute revoked)",
      ok: isPermDenied(cancel.error),
      detail: cancel.error ? cancel.error.message : "RPC is callable!",
    });
  }

  // ---- 3. create_exam_invitation creates an 'invited' invitation --------
  const apptMain = await makeExamMoment();
  const studentA = await makeStudent("a");
  const studentB = await makeStudent("b");
  let inviteA: string | null = null;
  let inviteB: string | null = null;
  {
    const res = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: apptMain,
      p_student_id: studentA.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
      p_score: 80,
      p_reason: "examenklaar",
    });
    inviteA = (res.data as string | null) ?? null;
    if (inviteA) createdInvitationIds.push(inviteA);

    const { data: row } = await serviceClient
      .from("exam_invitations")
      .select("status, student_id")
      .eq("id", inviteA ?? "")
      .maybeSingle();
    results.push({
      name: "create_exam_invitation creates an 'invited' invitation",
      ok: !res.error && inviteA !== null && row?.status === "invited",
      detail: res.error ? res.error.message : `status=${row?.status}`,
    });

    // Sibling invite for student B on the same moment.
    const resB = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: apptMain,
      p_student_id: studentB.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
      p_score: 70,
      p_reason: "examenklaar",
    });
    inviteB = (resB.data as string | null) ?? null;
    if (inviteB) createdInvitationIds.push(inviteB);
  }

  // ---- 3a. create rejects when invitations are disabled -----------------
  {
    const appt = await makeExamMoment();
    const res = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: studentA.studentId,
      p_enabled: false,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    results.push({
      name: "create rejects when examenuitnodigingen are disabled",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "invitation was created!",
    });
  }

  // ---- 3b. create rejects a non-exam appointment ------------------------
  {
    const { startsAt, endsAt } = nextSlot();
    const { data: lesson } = await serviceClient
      .from("agenda_appointments")
      .insert({
        tenant_id: tenantId,
        instructor_id: instructorId,
        type: "free_block",
        status: "planned",
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id")
      .single();
    if (lesson) createdAppointmentIds.push(lesson.id);
    const res = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: lesson?.id ?? "",
      p_student_id: studentA.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    results.push({
      name: "create rejects a non-exam appointment",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "invitation was created!",
    });
  }

  // ---- 4. student sees only their OWN open invitation -------------------
  {
    const clientA = await loginClient(studentA.email);
    const { data, error } = await clientA
      .from("exam_invitations")
      .select("id, student_id")
      .eq("status", "invited");
    const ids = (data ?? []).map((r) => r.id);
    const onlyOwn =
      (data ?? []).every((r) => r.student_id === studentA.studentId) &&
      ids.includes(inviteA ?? "") &&
      !ids.includes(inviteB ?? "");
    results.push({
      name: "student sees only their own open exam invitation",
      ok: !error && onlyOwn,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 5. expired invitation does NOT link on accept -------------------
  {
    const appt = await makeExamMoment();
    const expStudent = await makeStudent("expired");
    const { data: eid } = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: expStudent.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    const expId = (eid as string | null) ?? null;
    if (expId) {
      createdInvitationIds.push(expId);
      await serviceClient
        .from("exam_invitations")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", expId);

      const res = await serviceClient.rpc("respond_exam_invitation", {
        p_invitation_id: expId,
        p_tenant_id: tenantId,
        p_actor: expStudent.userId,
        p_accept: true,
      });

      const { data: apptRow } = await serviceClient
        .from("agenda_appointments")
        .select("student_id")
        .eq("id", appt)
        .maybeSingle();

      results.push({
        name: "expired invitation does not link on accept",
        ok: res.error !== null && apptRow?.student_id == null,
        detail: res.error
          ? `err=${res.error.message} student_id=${apptRow?.student_id}`
          : `unexpected success: student_id=${apptRow?.student_id}`,
      });

      // The lazy-expiry branch must raise BEFORE any mutation, so it leaves no
      // rolled-back-or-otherwise audit trail.
      const { count: expiredAudit } = await serviceClient
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("action", "exam_invitation.expired")
        .eq("target_id", expId);
      results.push({
        name: "expired response writes no exam_invitation.expired audit row",
        ok: (expiredAudit ?? 0) === 0,
        detail: `audit rows=${expiredAudit ?? 0}`,
      });
    }
  }

  // ---- 6. accept links appt.student_id + NO ledger + cancels siblings ---
  {
    const { count: ledgerBefore } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentA.studentId);

    const res = await serviceClient.rpc("respond_exam_invitation", {
      p_invitation_id: inviteA,
      p_tenant_id: tenantId,
      p_actor: studentA.userId,
      p_accept: true,
    });

    const { data: invRow } = await serviceClient
      .from("exam_invitations")
      .select("status")
      .eq("id", inviteA ?? "")
      .maybeSingle();
    const { data: apptRow } = await serviceClient
      .from("agenda_appointments")
      .select("student_id")
      .eq("id", apptMain)
      .maybeSingle();
    const { count: ledgerAfter } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentA.studentId);
    const { data: siblingRow } = await serviceClient
      .from("exam_invitations")
      .select("status")
      .eq("id", inviteB ?? "")
      .maybeSingle();

    results.push({
      name: "accept links appt.student_id, writes NO ledger, cancels siblings",
      ok:
        !res.error &&
        invRow?.status === "confirmed" &&
        apptRow?.student_id === studentA.studentId &&
        (ledgerAfter ?? 0) === (ledgerBefore ?? 0) &&
        siblingRow?.status === "cancelled",
      detail: res.error
        ? res.error.message
        : `status=${invRow?.status} linked=${apptRow?.student_id === studentA.studentId} ledger ${ledgerBefore}→${ledgerAfter} sibling=${siblingRow?.status}`,
    });
  }

  // ---- 7. double-accept impossible -------------------------------------
  {
    const res = await serviceClient.rpc("respond_exam_invitation", {
      p_invitation_id: inviteA,
      p_tenant_id: tenantId,
      p_actor: studentA.userId,
      p_accept: true,
    });
    results.push({
      name: "double-accept is impossible",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "second accept succeeded!",
    });
  }

  // ---- 8. accept blocked once the moment is already linked --------------
  {
    // studentB's invite for apptMain was cancelled when A confirmed; recreate a
    // fresh invite and verify it cannot link the already-taken moment. The
    // moment now has a student, so create itself must reject.
    const res = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: apptMain,
      p_student_id: studentB.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    results.push({
      name: "cannot invite onto an already-linked moment",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "invitation was created!",
    });
  }

  // ---- 8b. staff can see confirmed / declined / cancelled status -------
  {
    // apptMain: studentA confirmed (test 6), studentB sibling cancelled.
    const { data: history, error } = await serviceClient
      .from("exam_invitations")
      .select("student_id, status, responded_at")
      .eq("tenant_id", tenantId)
      .eq("appointment_id", apptMain)
      .in("status", ["confirmed", "declined", "cancelled"]);
    const byStudent = new Map(
      (history ?? []).map((r) => [String(r.student_id), r]),
    );
    const aRow = byStudent.get(studentA.studentId);
    const bRow = byStudent.get(studentB.studentId);
    results.push({
      name: "staff sees confirmed + cancelled status history for a moment",
      ok:
        !error &&
        aRow?.status === "confirmed" &&
        aRow?.responded_at != null &&
        bRow?.status === "cancelled",
      detail: error
        ? error.message
        : `A=${aRow?.status} B=${bRow?.status}`,
    });

    // Fresh moment + decline → staff must see 'declined' too.
    const appt = await makeExamMoment();
    const decliner = await makeStudent("decline");
    const { data: did } = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: decliner.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    const declineId = (did as string | null) ?? null;
    if (declineId) createdInvitationIds.push(declineId);
    await serviceClient.rpc("respond_exam_invitation", {
      p_invitation_id: declineId,
      p_tenant_id: tenantId,
      p_actor: decliner.userId,
      p_accept: false,
    });
    const { data: declinedRow } = await serviceClient
      .from("exam_invitations")
      .select("status, responded_at")
      .eq("id", declineId ?? "")
      .maybeSingle();
    const { data: apptRow } = await serviceClient
      .from("agenda_appointments")
      .select("student_id")
      .eq("id", appt)
      .maybeSingle();
    results.push({
      name: "decline sets 'declined' status (visible to staff), moment stays open",
      ok:
        declinedRow?.status === "declined" &&
        declinedRow?.responded_at != null &&
        apptRow?.student_id == null,
      detail: `status=${declinedRow?.status} student_id=${apptRow?.student_id}`,
    });
  }

  // ---- 9. cancel: non-staff blocked, staff works -----------------------
  {
    const appt = await makeExamMoment();
    const cs = await makeStudent("cancel");
    const { data: cid } = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: cs.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 3,
    });
    const cancelInvite = (cid as string | null) ?? null;
    if (cancelInvite) createdInvitationIds.push(cancelInvite);

    const unauthorized = await serviceClient.rpc("cancel_exam_invitation", {
      p_invitation_id: cancelInvite,
      p_tenant_id: tenantId,
      p_actor: cs.userId,
    });
    const { data: afterUnauthorized } = await serviceClient
      .from("exam_invitations")
      .select("status")
      .eq("id", cancelInvite ?? "")
      .maybeSingle();
    results.push({
      name: "cancel rejects a non-staff actor",
      ok:
        unauthorized.error !== null &&
        afterUnauthorized?.status === "invited",
      detail: unauthorized.error
        ? unauthorized.error.message
        : `non-staff cancel succeeded! status=${afterUnauthorized?.status}`,
    });

    const staffCancel = await serviceClient.rpc("cancel_exam_invitation", {
      p_invitation_id: cancelInvite,
      p_tenant_id: tenantId,
      p_actor: instructorId,
    });
    const { data: afterStaff } = await serviceClient
      .from("exam_invitations")
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

  // ---- 10. max concurrent candidates enforced --------------------------
  {
    const appt = await makeExamMoment();
    const s1 = await makeStudent("max1");
    const s2 = await makeStudent("max2");
    const first = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: s1.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 1,
    });
    const firstId = (first.data as string | null) ?? null;
    if (firstId) createdInvitationIds.push(firstId);
    const second = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: s2.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 1,
    });
    const secondId = (second.data as string | null) ?? null;
    if (secondId) createdInvitationIds.push(secondId);
    results.push({
      name: "create enforces max concurrent candidates per moment",
      ok: !first.error && firstId !== null && second.error !== null,
      detail: second.error
        ? second.error.message
        : "second invitation over the cap was created!",
    });
  }

  // ---- 11. no duplicate open invitation for same student + moment -------
  {
    const appt = await makeExamMoment();
    const s = await makeStudent("dup");
    const first = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: s.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 5,
    });
    const firstId = (first.data as string | null) ?? null;
    if (firstId) createdInvitationIds.push(firstId);
    const dup = await serviceClient.rpc("create_exam_invitation", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_appointment_id: appt,
      p_student_id: s.studentId,
      p_enabled: true,
      p_valid_minutes: 2880,
      p_max_candidates: 5,
    });
    const dupId = (dup.data as string | null) ?? null;
    if (dupId) createdInvitationIds.push(dupId);
    results.push({
      name: "create rejects a duplicate open invitation",
      ok: !first.error && firstId !== null && dup.error !== null,
      detail: dup.error ? dup.error.message : "duplicate invitation was created!",
    });
  }

  // ---- cleanup ----------------------------------------------------------
  for (const id of createdInvitationIds) {
    await serviceClient.from("exam_invitations").delete().eq("id", id);
  }
  for (const id of createdAppointmentIds) {
    await serviceClient.from("agenda_appointments").delete().eq("id", id);
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
  console.log("All exam-invitation RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
