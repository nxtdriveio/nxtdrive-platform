/**
 * RLS + RPC tests for CBR-statusbeheer Fase 1 (Module 13).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-cbr
 *   pnpm --filter @workspace/scripts run db:test-rls-cbr -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call set_student_cbr_status (execute revoked).
 *  2. anon CANNOT call set_appointment_result (execute revoked).
 *  3. set_student_cbr_status sets machtiging_status AND mirrors the boolean.
 *  4. machtiging_status='ontvangen' sets machtiging_geregeld=true.
 *  5. invalid machtiging_status rejected.
 *  6. The boolean→3-state migration backfilled machtiging_status='ontvangen'
 *     for every legacy machtiging_geregeld=true row.
 *  7. set_appointment_result records geslaagd/gezakt + note, sets completed.
 *  8. set_appointment_result is idempotent (re-record overwrites cleanly).
 *  9. set_appointment_result rejects a non-resultable type (e.g. free_block).
 * 10. cross-tenant appointment rejected by set_appointment_result.
 * 11. unauthorized actor rejected by set_student_cbr_status.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running CBR RLS/RPC tests`);

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

  async function makeStudent(tid: string): Promise<string> {
    const { data, error } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tid,
        full_name: `CBR Student ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeStudent failed: ${error?.message}`);
    return data.id as string;
  }

  function future(daysAhead: number, hourUtc = 9): string {
    const d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString();
  }

  const studentId = await makeStudent(tenantId);
  const createdStudentIds: string[] = [studentId];
  const createdApptIds: string[] = [];
  const zero = "00000000-0000-0000-0000-000000000000";

  // ---- 1. anon CANNOT call set_student_cbr_status -----------------------
  {
    const res = await anonClient.rpc("set_student_cbr_status", {
      p_student_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_theorie_behaald: false,
      p_machtiging_status: "nog_nodig",
      p_gezondheidsverklaring_vereist: true,
      p_gezondheidsverklaring_geregeld: false,
    });
    results.push({
      name: "anon CANNOT call set_student_cbr_status (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 2. anon CANNOT call set_appointment_result -----------------------
  {
    const res = await anonClient.rpc("set_appointment_result", {
      p_appointment_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_result: "passed",
      p_note: null,
    });
    results.push({
      name: "anon CANNOT call set_appointment_result (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 3. set_student_cbr_status: aangevraagd, boolean stays false -------
  {
    const res = await serviceClient.rpc("set_student_cbr_status", {
      p_student_id: studentId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_theorie_behaald: true,
      p_machtiging_status: "aangevraagd",
      p_gezondheidsverklaring_vereist: true,
      p_gezondheidsverklaring_geregeld: false,
    });
    const { data: row } = await serviceClient
      .from("student_cbr_status")
      .select("machtiging_status, machtiging_geregeld, theorie_behaald")
      .eq("student_id", studentId)
      .maybeSingle();
    results.push({
      name: "set_student_cbr_status sets 3-state and mirrors boolean (aangevraagd→false)",
      ok:
        !res.error &&
        row?.machtiging_status === "aangevraagd" &&
        row?.machtiging_geregeld === false &&
        row?.theorie_behaald === true,
      detail: res.error
        ? res.error.message
        : `status=${row?.machtiging_status} bool=${row?.machtiging_geregeld}`,
    });
  }

  // ---- 4. machtiging_status='ontvangen' → boolean true ------------------
  {
    const res = await serviceClient.rpc("set_student_cbr_status", {
      p_student_id: studentId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_theorie_behaald: true,
      p_machtiging_status: "ontvangen",
      p_gezondheidsverklaring_vereist: true,
      p_gezondheidsverklaring_geregeld: false,
    });
    const { data: row } = await serviceClient
      .from("student_cbr_status")
      .select("machtiging_status, machtiging_geregeld")
      .eq("student_id", studentId)
      .maybeSingle();
    results.push({
      name: "machtiging_status='ontvangen' sets machtiging_geregeld=true",
      ok:
        !res.error &&
        row?.machtiging_status === "ontvangen" &&
        row?.machtiging_geregeld === true,
      detail: res.error
        ? res.error.message
        : `status=${row?.machtiging_status} bool=${row?.machtiging_geregeld}`,
    });
  }

  // ---- 5. invalid machtiging_status rejected ----------------------------
  {
    const res = await serviceClient.rpc("set_student_cbr_status", {
      p_student_id: studentId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_theorie_behaald: true,
      p_machtiging_status: "bogus",
      p_gezondheidsverklaring_vereist: true,
      p_gezondheidsverklaring_geregeld: false,
    });
    results.push({
      name: "invalid machtiging_status rejected",
      ok: res.error !== null,
      detail: res.error?.message ?? "invalid value accepted!",
    });
  }

  // ---- 6. migration backfilled boolean→ontvangen consistently -----------
  {
    const { data: mismatches, error } = await serviceClient
      .from("student_cbr_status")
      .select("student_id")
      .eq("machtiging_geregeld", true)
      .neq("machtiging_status", "ontvangen");
    results.push({
      name: "boolean→3-state backfill consistent (geregeld=true ⇒ ontvangen)",
      ok: !error && (mismatches ?? []).length === 0,
      detail: error ? error.message : `mismatches=${(mismatches ?? []).length}`,
    });
  }

  // ---- 7. set_appointment_result records gezakt + note, completes -------
  let examId: string | null = null;
  {
    const create = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "exam",
      p_starts_at: future(60, 9),
      p_duration_min: 60,
      p_student_id: studentId,
      p_title: "Praktijkexamen",
      p_location: null,
      p_notes: null,
    });
    examId = (create.data as string | null) ?? null;
    if (examId) createdApptIds.push(examId);

    const res = await serviceClient.rpc("set_appointment_result", {
      p_appointment_id: examId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_result: "failed",
      p_note: "Extra aandacht voor invoegen.",
    });
    const { data: row } = await serviceClient
      .from("agenda_appointments")
      .select("result, result_note, status, result_recorded_by")
      .eq("id", examId ?? "")
      .maybeSingle();
    results.push({
      name: "set_appointment_result records gezakt + note, sets completed",
      ok:
        !res.error &&
        row?.result === "failed" &&
        row?.result_note === "Extra aandacht voor invoegen." &&
        row?.status === "completed" &&
        row?.result_recorded_by === instructorId,
      detail: res.error
        ? res.error.message
        : `result=${row?.result} status=${row?.status}`,
    });
  }

  // ---- 8. idempotent re-record (correct the result) ---------------------
  {
    if (!examId) {
      results.push({
        name: "set_appointment_result idempotent re-record",
        ok: false,
        detail: "no appointment",
      });
    } else {
      const res = await serviceClient.rpc("set_appointment_result", {
        p_appointment_id: examId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_result: "passed",
        p_note: null,
      });
      const { data: row } = await serviceClient
        .from("agenda_appointments")
        .select("result, result_note, status")
        .eq("id", examId)
        .maybeSingle();
      results.push({
        name: "set_appointment_result idempotent re-record (gezakt→geslaagd)",
        ok:
          !res.error &&
          row?.result === "passed" &&
          row?.result_note === null &&
          row?.status === "completed",
        detail: res.error
          ? res.error.message
          : `result=${row?.result} note=${row?.result_note}`,
      });
    }
  }

  // ---- 9. non-resultable type rejected ----------------------------------
  {
    const create = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "free_block",
      p_starts_at: future(61, 9),
      p_duration_min: 60,
      p_student_id: null,
      p_title: null,
      p_location: null,
      p_notes: null,
    });
    const blockId = (create.data as string | null) ?? null;
    if (blockId) createdApptIds.push(blockId);
    const res = await serviceClient.rpc("set_appointment_result", {
      p_appointment_id: blockId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_result: "passed",
      p_note: null,
    });
    results.push({
      name: "set_appointment_result rejects non-resultable type (free_block)",
      ok: res.error !== null,
      detail: res.error?.message ?? "free_block result accepted!",
    });
  }

  // ---- 10. cross-tenant appointment rejected ----------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `cbr-other-${Date.now()}`, name: "Other CBR Tenant" })
      .select("id")
      .single();
    if (otherTenant && examId) {
      const res = await serviceClient.rpc("set_appointment_result", {
        p_appointment_id: examId, // belongs to demo-academy tenant
        p_tenant_id: otherTenant.id, // mismatched tenant
        p_actor: instructorId,
        p_result: "passed",
        p_note: null,
      });
      results.push({
        name: "cross-tenant appointment rejected by set_appointment_result",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant result accepted!",
      });
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    } else {
      results.push({
        name: "cross-tenant appointment rejected by set_appointment_result",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 11. unauthorized actor rejected by set_student_cbr_status --------
  {
    const email = `cbr-noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const res = await serviceClient.rpc("set_student_cbr_status", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: strangerId,
        p_theorie_behaald: true,
        p_machtiging_status: "ontvangen",
        p_gezondheidsverklaring_vereist: true,
        p_gezondheidsverklaring_geregeld: false,
      });
      results.push({
        name: "unauthorized actor rejected by set_student_cbr_status",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 12. self-service review consent (Examenflow C) -------------------
  // set_student_review_consent_self: anon rejected; the student's own user can
  // set it; an unrelated user (no student/guardian link) is rejected.
  const consentUserIds: string[] = [];
  {
    // anon CANNOT call it (execute revoked from anon)
    const anonRes = await anonClient.rpc("set_student_review_consent_self", {
      p_student_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_consent: true,
    });
    results.push({
      name: "anon CANNOT call set_student_review_consent_self (execute revoked)",
      ok: anonRes.error !== null,
      detail: anonRes.error ? anonRes.error.message : "RPC is callable!",
    });

    // Provision a student WITH a linked user account.
    const subjEmail = `cbr-consent-subject-${Date.now()}@nxtdrive.test`;
    const { data: subjUser } = await serviceClient.auth.admin.createUser({
      email: subjEmail,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const subjectUserId = subjUser?.user?.id;
    if (subjectUserId) consentUserIds.push(subjectUserId);

    const consentStudentId = await makeStudent(tenantId);
    createdStudentIds.push(consentStudentId);
    await serviceClient
      .from("students")
      .update({ user_id: subjectUserId })
      .eq("id", consentStudentId);

    // The subject (student's own user) CAN set their own consent.
    const okRes = await serviceClient.rpc("set_student_review_consent_self", {
      p_student_id: consentStudentId,
      p_tenant_id: tenantId,
      p_actor: subjectUserId,
      p_consent: true,
    });
    const { data: afterRow } = await serviceClient
      .from("students")
      .select("review_consent, review_consent_by")
      .eq("id", consentStudentId)
      .maybeSingle();
    results.push({
      name: "set_student_review_consent_self: subject can set own consent",
      ok:
        !okRes.error &&
        afterRow?.review_consent === true &&
        afterRow?.review_consent_by === subjectUserId,
      detail: okRes.error
        ? okRes.error.message
        : `consent=${afterRow?.review_consent}`,
    });

    // An unrelated user (no student/guardian link) is rejected.
    const strangerEmail = `cbr-consent-stranger-${Date.now()}@nxtdrive.test`;
    const { data: strangerUser } = await serviceClient.auth.admin.createUser({
      email: strangerEmail,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerUserId = strangerUser?.user?.id;
    if (strangerUserId) consentUserIds.push(strangerUserId);
    const strangerRes = await serviceClient.rpc(
      "set_student_review_consent_self",
      {
        p_student_id: consentStudentId,
        p_tenant_id: tenantId,
        p_actor: strangerUserId,
        p_consent: false,
      },
    );
    results.push({
      name: "set_student_review_consent_self: unrelated actor rejected",
      ok: strangerRes.error !== null,
      detail: strangerRes.error?.message ?? "unrelated actor accepted!",
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const aid of createdApptIds) {
    await serviceClient.from("agenda_appointments").delete().eq("id", aid);
  }
  for (const uid of consentUserIds) {
    await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
  }
  for (const sid of createdStudentIds) {
    await serviceClient.from("student_cbr_status").delete().eq("student_id", sid);
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
  console.log("All CBR RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
