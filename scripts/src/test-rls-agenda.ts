/**
 * RLS + RPC tests for the agenda (Task #86 — alle afspraaktypes).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-agenda
 *   pnpm --filter @workspace/scripts run db:test-rls-agenda -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read agenda_appointments.
 *  2. create_agenda_appointment stores a `planned` lesson-like appointment.
 *  3. A block-type appointment (free_block) forces student_id to NULL.
 *  4. A new appointment overlapping a planned appointment is blocked.
 *  5. A lesson overlapping a planned appointment is blocked (schedule_lesson).
 *  6. A trial overlapping a planned appointment is blocked (book_trial_lesson).
 *  7. update_agenda_appointment moves the slot.
 *  8. delete_agenda_appointment removes the row.
 *  9. Cross-tenant student rejected by create_agenda_appointment.
 * 10. Unauthorized actor rejected by create_agenda_appointment.
 * 11. anon CANNOT call the mutation RPCs (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running agenda RLS/RPC tests`);

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

  // A tenant_admin actor is required to call schedule_lesson (test #5). Fall
  // back to the membership user if it already holds tenant_admin.
  const { data: adminMembership } = await serviceClient
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "tenant_admin")
    .limit(1)
    .maybeSingle();
  const adminId = (adminMembership?.user_id as string | undefined) ?? null;

  // Helper: create a fresh student in a tenant.
  async function makeStudent(tid: string): Promise<string> {
    const { data, error } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tid,
        full_name: `Agenda Student ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeStudent failed: ${error?.message}`);
    return data.id as string;
  }

  // Base time well into the future, on a clean hour, to avoid overlaps.
  function future(daysAhead: number, hourUtc = 10): string {
    const d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString();
  }

  const studentId = await makeStudent(tenantId);
  const createdStudentIds: string[] = [studentId];
  const createdApptIds: string[] = [];

  // ---- 1. anon cannot read agenda_appointments --------------------------
  {
    const { data, error } = await anonClient
      .from("agenda_appointments")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read agenda_appointments",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. create_agenda_appointment → planned (exam, student-linked) -----
  let examId: string | null = null;
  {
    const res = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "exam",
      p_starts_at: future(30, 9),
      p_duration_min: 60,
      p_student_id: studentId,
      p_title: "Praktijkexamen",
      p_location: "CBR Examencentrum",
      p_notes: null,
    });
    examId = (res.data as string | null) ?? null;
    if (examId) createdApptIds.push(examId);
    const { data: row } = await serviceClient
      .from("agenda_appointments")
      .select("status, type, student_id")
      .eq("id", examId ?? "")
      .maybeSingle();
    results.push({
      name: "create_agenda_appointment stores planned exam with student",
      ok:
        !res.error &&
        examId !== null &&
        row?.status === "planned" &&
        row?.type === "exam" &&
        row?.student_id === studentId,
      detail: res.error
        ? res.error.message
        : `status=${row?.status} type=${row?.type} student=${row?.student_id}`,
    });
  }

  // ---- 3. block-type appointment forces student_id NULL ------------------
  {
    const res = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "free_block",
      p_starts_at: future(31, 9),
      p_duration_min: 120,
      p_student_id: studentId, // should be ignored / forced null
      p_title: "Vrij blok",
      p_location: null,
      p_notes: null,
    });
    const id = (res.data as string | null) ?? null;
    if (id) createdApptIds.push(id);
    const { data: row } = await serviceClient
      .from("agenda_appointments")
      .select("student_id, type")
      .eq("id", id ?? "")
      .maybeSingle();
    results.push({
      name: "block-type appointment forces student_id NULL",
      ok: !res.error && id !== null && row?.student_id === null,
      detail: res.error ? res.error.message : `student=${row?.student_id}`,
    });
  }

  // ---- 4. overlapping appointment blocked --------------------------------
  {
    // Overlaps the 30-day 09:00 exam by starting 30 min in.
    const overlap = new Date(
      Date.parse(future(30, 9)) + 30 * 60 * 1000,
    ).toISOString();
    const res = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "interim_test",
      p_starts_at: overlap,
      p_duration_min: 60,
      p_student_id: studentId,
      p_title: "TTT",
      p_location: null,
      p_notes: null,
    });
    const id = (res.data as string | null) ?? null;
    if (id) createdApptIds.push(id);
    results.push({
      name: "overlapping appointment blocked",
      ok: res.error !== null,
      detail: res.error?.message ?? "overlap was accepted!",
    });
  }

  // ---- 5. lesson overlapping a planned appointment blocked ---------------
  if (!adminId) {
    results.push({
      name: "lesson overlapping appointment blocked (schedule_lesson)",
      ok: true,
      detail: "skipped — no tenant_admin in demo-academy",
    });
  } else {
    // Grant enough tegoed so the overlap guard (not the balance check) is what
    // rejects the lesson — otherwise schedule_lesson fails earlier on balance.
    await serviceClient.from("credit_ledger").insert({
      tenant_id: tenantId,
      student_id: studentId,
      delta: 600,
      reason: "opening_balance",
      note: "agenda test grant",
    });
    const overlap = new Date(
      Date.parse(future(30, 9)) + 15 * 60 * 1000,
    ).toISOString();
    const res = await serviceClient.rpc("schedule_lesson", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_instructor_id: instructorId,
      p_student_id: studentId,
      p_starts_at: overlap,
      p_duration_min: 60,
      p_location: null,
      p_notes: null,
      p_location_lat: null,
      p_location_lng: null,
      p_location_place_id: null,
    });
    results.push({
      name: "lesson overlapping appointment blocked (schedule_lesson)",
      ok: res.error !== null && /agenda-afspraak/.test(res.error.message),
      detail: res.error?.message ?? "lesson over appointment accepted!",
    });
  }

  // ---- 6. trial overlapping a planned appointment blocked ----------------
  {
    const { data: lead } = await serviceClient
      .from("leads")
      .insert({
        tenant_id: tenantId,
        status: "new",
        source: "website",
        full_name: `Agenda Trial Lead ${Date.now()}`,
        email: `agenda-trial-${Date.now()}@nxtdrive.test`,
      })
      .select("id")
      .single();
    const overlap = new Date(
      Date.parse(future(30, 9)) + 20 * 60 * 1000,
    ).toISOString();
    const res = lead
      ? await serviceClient.rpc("book_trial_lesson", {
          p_lead_id: lead.id,
          p_tenant_id: tenantId,
          p_instructor_id: instructorId,
          p_starts_at: overlap,
          p_duration_min: 60,
          p_pickup_location: null,
          p_score: 0,
          p_reason: null,
        })
      : { error: new Error("lead insert failed") };
    results.push({
      name: "trial overlapping appointment blocked (book_trial_lesson)",
      ok: res.error !== null,
      detail: res.error?.message ?? "trial over appointment accepted!",
    });
    if (lead) {
      await serviceClient.from("trial_lessons").delete().eq("lead_id", lead.id);
      await serviceClient.from("leads").delete().eq("id", lead.id);
    }
  }

  // ---- 7. update_agenda_appointment moves the slot -----------------------
  {
    if (!examId) {
      results.push({
        name: "update_agenda_appointment moves the slot",
        ok: false,
        detail: "no appointment to update",
      });
    } else {
      const newStart = future(33, 14);
      const res = await serviceClient.rpc("update_agenda_appointment", {
        p_appointment_id: examId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_starts_at: newStart,
        p_duration_min: 90,
        p_student_id: studentId,
        p_title: "Praktijkexamen (verzet)",
        p_location: "CBR",
        p_notes: "verzet",
      });
      const { data: row } = await serviceClient
        .from("agenda_appointments")
        .select("starts_at, ends_at")
        .eq("id", examId)
        .maybeSingle();
      const durMin =
        row != null
          ? (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000
          : 0;
      results.push({
        name: "update_agenda_appointment moves the slot",
        ok:
          !res.error &&
          row != null &&
          Date.parse(row.starts_at) === Date.parse(newStart) &&
          durMin === 90,
        detail: res.error
          ? res.error.message
          : `starts_at=${row?.starts_at} dur=${durMin}`,
      });
    }
  }

  // ---- 8. delete_agenda_appointment removes the row ----------------------
  {
    if (!examId) {
      results.push({
        name: "delete_agenda_appointment removes the row",
        ok: false,
        detail: "no appointment to delete",
      });
    } else {
      const res = await serviceClient.rpc("delete_agenda_appointment", {
        p_appointment_id: examId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
      });
      const { data: row } = await serviceClient
        .from("agenda_appointments")
        .select("id")
        .eq("id", examId)
        .maybeSingle();
      results.push({
        name: "delete_agenda_appointment removes the row",
        ok: !res.error && row == null,
        detail: res.error?.message ?? (row == null ? "deleted" : "still present"),
      });
      if (!res.error && row == null) {
        const idx = createdApptIds.indexOf(examId);
        if (idx >= 0) createdApptIds.splice(idx, 1);
      }
    }
  }

  // ---- 9. cross-tenant student rejected ----------------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `agenda-other-${Date.now()}`, name: "Other Agenda Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      const foreignStudent = await makeStudent(otherTenant.id);
      const cross = await serviceClient.rpc("create_agenda_appointment", {
        p_tenant_id: tenantId, // mismatch — student is in otherTenant
        p_actor: instructorId,
        p_instructor_id: instructorId,
        p_type: "theory_guidance",
        p_starts_at: future(40, 9),
        p_duration_min: 60,
        p_student_id: foreignStudent,
        p_title: null,
        p_location: null,
        p_notes: null,
      });
      results.push({
        name: "cross-tenant student rejected by create_agenda_appointment",
        ok: cross.error !== null,
        detail: cross.error?.message ?? "cross-tenant accepted!",
      });
      await serviceClient.from("students").delete().eq("id", foreignStudent);
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    }
  }

  // ---- 10. unauthorized actor rejected -----------------------------------
  {
    const email = `agenda-noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const res = await serviceClient.rpc("create_agenda_appointment", {
        p_tenant_id: tenantId,
        p_actor: strangerId,
        p_instructor_id: instructorId,
        p_type: "exam",
        p_starts_at: future(45, 9),
        p_duration_min: 60,
        p_student_id: studentId,
        p_title: null,
        p_location: null,
        p_notes: null,
      });
      results.push({
        name: "unauthorized actor rejected by create_agenda_appointment",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 11. anon CANNOT call the mutation RPCs (execute revoked) ----------
  {
    const zero = "00000000-0000-0000-0000-000000000000";
    const create = await anonClient.rpc("create_agenda_appointment", {
      p_tenant_id: zero,
      p_actor: zero,
      p_instructor_id: zero,
      p_type: "exam",
      p_starts_at: new Date().toISOString(),
      p_duration_min: 60,
      p_student_id: null,
      p_title: null,
      p_location: null,
      p_notes: null,
    });
    results.push({
      name: "anon CANNOT call create_agenda_appointment RPC (execute revoked)",
      ok: create.error !== null,
      detail: create.error ? create.error.message : "RPC is callable!",
    });

    const upd = await anonClient.rpc("update_agenda_appointment", {
      p_appointment_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_starts_at: new Date().toISOString(),
      p_duration_min: 60,
      p_student_id: null,
      p_title: null,
      p_location: null,
      p_notes: null,
    });
    results.push({
      name: "anon CANNOT call update_agenda_appointment RPC (execute revoked)",
      ok: upd.error !== null,
      detail: upd.error ? upd.error.message : "RPC is callable!",
    });

    const del = await anonClient.rpc("delete_agenda_appointment", {
      p_appointment_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call delete_agenda_appointment RPC (execute revoked)",
      ok: del.error !== null,
      detail: del.error ? del.error.message : "RPC is callable!",
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const aid of createdApptIds) {
    await serviceClient.from("agenda_appointments").delete().eq("id", aid);
  }
  for (const sid of createdStudentIds) {
    await serviceClient.from("credit_ledger").delete().eq("student_id", sid);
    await serviceClient.from("students").delete().eq("id", sid);
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
  console.log("All agenda RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
