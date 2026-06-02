/**
 * RLS + RPC tests for Examenflow A — examenvoorbereiding + 'niet verschenen'.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-exam-prep
 *   pnpm --filter @workspace/scripts run db:test-rls-exam-prep -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call set_exam_appointment_details (execute revoked).
 *  2. anon CANNOT select exam_appointment_details (RLS — no anon read).
 *  3. set_exam_appointment_details upserts pickup/docs/notes, reads back.
 *  4. set_exam_appointment_details is idempotent (re-call overwrites cleanly).
 *  5. set_exam_appointment_details rejects a non-resultable type (free_block).
 *  6. cross-tenant appointment rejected by set_exam_appointment_details.
 *  7. unauthorized actor rejected by set_exam_appointment_details.
 *  8. audit row written for exam_details_set.
 *  9. set_appointment_result accepts 'no_show', sets completed.
 * 10. set_appointment_result still rejects an invalid result.
 * 11. demo-academy has the exam_preparation_policy tenant setting (seed).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running exam-prep RLS/RPC tests`);

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
        full_name: `Exam Student ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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

  async function makeExam(studentId: string): Promise<string> {
    const create = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "exam",
      p_starts_at: future(70, 9),
      p_duration_min: 60,
      p_student_id: studentId,
      p_title: "Praktijkexamen",
      p_location: null,
      p_notes: null,
    });
    const id = (create.data as string | null) ?? null;
    if (!id) throw new Error(`makeExam failed: ${create.error?.message}`);
    return id;
  }

  const studentId = await makeStudent(tenantId);
  const createdStudentIds: string[] = [studentId];
  const createdApptIds: string[] = [];
  const zero = "00000000-0000-0000-0000-000000000000";

  const examId = await makeExam(studentId);
  createdApptIds.push(examId);

  // ---- 1. anon CANNOT call set_exam_appointment_details ------------------
  {
    const res = await anonClient.rpc("set_exam_appointment_details", {
      p_appointment_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
      p_pickup_at: null,
      p_pickup_location: null,
      p_required_documents: [],
      p_exam_day_notes: null,
    });
    results.push({
      name: "anon CANNOT call set_exam_appointment_details (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 2. anon CANNOT select exam_appointment_details -------------------
  {
    const res = await anonClient
      .from("exam_appointment_details")
      .select("appointment_id")
      .limit(1);
    // RLS denies → either error or empty set; anon must never see rows.
    results.push({
      name: "anon CANNOT read exam_appointment_details (RLS)",
      ok: (res.data ?? []).length === 0,
      detail: res.error ? res.error.message : `rows=${(res.data ?? []).length}`,
    });
  }

  // ---- 3. set_exam_appointment_details upserts + reads back -------------
  {
    const pickup = future(70, 8);
    const docs = [
      { code: "id", label: "Geldig identiteitsbewijs", checked: true },
      { code: "theory_certificate", label: "Theoriecertificaat", checked: false },
    ];
    const res = await serviceClient.rpc("set_exam_appointment_details", {
      p_appointment_id: examId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_pickup_at: pickup,
      p_pickup_location: "Voor het CBR-examencentrum",
      p_required_documents: docs,
      p_exam_day_notes: "Neem rustig de tijd.",
    });
    const { data: row } = await serviceClient
      .from("exam_appointment_details")
      .select(
        "pickup_location, required_documents, exam_day_notes, updated_by, tenant_id",
      )
      .eq("appointment_id", examId)
      .maybeSingle();
    const storedDocs = (row?.required_documents as unknown[]) ?? [];
    results.push({
      name: "set_exam_appointment_details upserts pickup/docs/notes",
      ok:
        !res.error &&
        row?.pickup_location === "Voor het CBR-examencentrum" &&
        row?.exam_day_notes === "Neem rustig de tijd." &&
        row?.updated_by === instructorId &&
        row?.tenant_id === tenantId &&
        storedDocs.length === 2,
      detail: res.error
        ? res.error.message
        : `docs=${storedDocs.length} loc=${row?.pickup_location}`,
    });
  }

  // ---- 4. idempotent re-call (overwrite cleanly) -----------------------
  {
    const res = await serviceClient.rpc("set_exam_appointment_details", {
      p_appointment_id: examId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_pickup_at: null,
      p_pickup_location: null,
      p_required_documents: [
        { code: "id", label: "Geldig identiteitsbewijs", checked: true },
      ],
      p_exam_day_notes: null,
    });
    const { count } = await serviceClient
      .from("exam_appointment_details")
      .select("appointment_id", { count: "exact", head: true })
      .eq("appointment_id", examId);
    const { data: row } = await serviceClient
      .from("exam_appointment_details")
      .select("pickup_location, required_documents, exam_day_notes")
      .eq("appointment_id", examId)
      .maybeSingle();
    const storedDocs = (row?.required_documents as unknown[]) ?? [];
    results.push({
      name: "set_exam_appointment_details idempotent (single row, overwritten)",
      ok:
        !res.error &&
        count === 1 &&
        row?.pickup_location === null &&
        row?.exam_day_notes === null &&
        storedDocs.length === 1,
      detail: res.error
        ? res.error.message
        : `rows=${count} docs=${storedDocs.length}`,
    });
  }

  // ---- 5. non-resultable type rejected ---------------------------------
  {
    const create = await serviceClient.rpc("create_agenda_appointment", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_type: "free_block",
      p_starts_at: future(71, 9),
      p_duration_min: 60,
      p_student_id: null,
      p_title: null,
      p_location: null,
      p_notes: null,
    });
    const blockId = (create.data as string | null) ?? null;
    if (blockId) createdApptIds.push(blockId);
    const res = await serviceClient.rpc("set_exam_appointment_details", {
      p_appointment_id: blockId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_pickup_at: null,
      p_pickup_location: null,
      p_required_documents: [],
      p_exam_day_notes: null,
    });
    results.push({
      name: "set_exam_appointment_details rejects non-resultable type (free_block)",
      ok: res.error !== null,
      detail: res.error?.message ?? "free_block prep accepted!",
    });
  }

  // ---- 6. cross-tenant appointment rejected ----------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `exam-other-${Date.now()}`, name: "Other Exam Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      const res = await serviceClient.rpc("set_exam_appointment_details", {
        p_appointment_id: examId, // belongs to demo-academy tenant
        p_tenant_id: otherTenant.id, // mismatched tenant
        p_actor: instructorId,
        p_pickup_at: null,
        p_pickup_location: null,
        p_required_documents: [],
        p_exam_day_notes: null,
      });
      results.push({
        name: "cross-tenant appointment rejected by set_exam_appointment_details",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant prep accepted!",
      });
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    } else {
      results.push({
        name: "cross-tenant appointment rejected by set_exam_appointment_details",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 7. unauthorized actor rejected ----------------------------------
  {
    const email = `exam-noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const res = await serviceClient.rpc("set_exam_appointment_details", {
        p_appointment_id: examId,
        p_tenant_id: tenantId,
        p_actor: strangerId,
        p_pickup_at: null,
        p_pickup_location: null,
        p_required_documents: [],
        p_exam_day_notes: null,
      });
      results.push({
        name: "unauthorized actor rejected by set_exam_appointment_details",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    } else {
      results.push({
        name: "unauthorized actor rejected by set_exam_appointment_details",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 8. audit row written for exam_details_set -----------------------
  {
    const { data: audit } = await serviceClient
      .from("audit_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("action", "agenda_appointment.exam_details_set")
      .eq("target_id", examId)
      .limit(1);
    results.push({
      name: "audit row written for exam_details_set",
      ok: (audit ?? []).length > 0,
      detail: `audit rows=${(audit ?? []).length}`,
    });
  }

  // ---- 9. set_appointment_result accepts 'no_show' ---------------------
  {
    const res = await serviceClient.rpc("set_appointment_result", {
      p_appointment_id: examId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_result: "no_show",
      p_note: "Leerling is niet verschenen.",
    });
    const { data: row } = await serviceClient
      .from("agenda_appointments")
      .select("result, status, result_note")
      .eq("id", examId)
      .maybeSingle();
    results.push({
      name: "set_appointment_result records 'niet verschenen' (no_show), completes",
      ok:
        !res.error &&
        row?.result === "no_show" &&
        row?.status === "completed" &&
        row?.result_note === "Leerling is niet verschenen.",
      detail: res.error
        ? res.error.message
        : `result=${row?.result} status=${row?.status}`,
    });
  }

  // ---- 10. invalid result rejected -------------------------------------
  {
    const res = await serviceClient.rpc("set_appointment_result", {
      p_appointment_id: examId,
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_result: "bogus",
      p_note: null,
    });
    results.push({
      name: "set_appointment_result rejects invalid result",
      ok: res.error !== null,
      detail: res.error?.message ?? "invalid result accepted!",
    });
  }

  // ---- 11. demo-academy has exam_preparation_policy (seed) --------------
  {
    const { data: row } = await serviceClient
      .from("tenant_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "exam_preparation_policy")
      .maybeSingle();
    const value = (row?.value ?? null) as {
      required_documents?: unknown[];
      exam_day_tips?: unknown[];
    } | null;
    results.push({
      name: "demo-academy has exam_preparation_policy tenant setting (seed)",
      ok:
        !!value &&
        Array.isArray(value.required_documents) &&
        value.required_documents.length > 0 &&
        Array.isArray(value.exam_day_tips) &&
        value.exam_day_tips.length > 0,
      detail: value
        ? `docs=${value.required_documents?.length} tips=${value.exam_day_tips?.length}`
        : "policy missing — run db:seed",
    });
  }

  // ---- cleanup ----------------------------------------------------------
  for (const aid of createdApptIds) {
    await serviceClient.from("exam_appointment_details").delete().eq("appointment_id", aid);
    await serviceClient.from("agenda_appointments").delete().eq("id", aid);
  }
  for (const sid of createdStudentIds) {
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
  console.log("All exam-prep RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
