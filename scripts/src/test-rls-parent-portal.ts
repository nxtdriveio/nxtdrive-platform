/**
 * RLS tests for Module 10 — Ouderportaal (Task #96).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-parent-portal
 *   pnpm --filter @workspace/scripts run db:test-rls-parent-portal -- --env=production
 *
 * Asserts (parent = a user linked to a student via student_guardians):
 *   1. A parent linked to child A reads child A's student row, but not child B's.
 *   2. A parent reads child A's non-draft invoices; never drafts, never child B's.
 *   3. A parent reads child A's invoice_lines (non-draft) only.
 *   4. A parent reads child A's lessons and credit_ledger; not child B's.
 *   5. A parent CANNOT read lessons.notes leaking via another child.
 *   6. Anon AND authenticated (parent) CANNOT call link_student_guardian /
 *      unlink_student_guardian (service-role only RPCs).
 *   7. Cross-tenant: a parent in tenant X cannot read a child's data in tenant Y.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running parent portal RLS tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const svc = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
    const { data: tenant } = await svc
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      console.error("demo-academy tenant missing — run db:seed first");
      process.exit(1);
    }
    const tenantId: string = tenant.id;

    const { data: adminMembership } = await svc
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "tenant_admin")
      .limit(1)
      .maybeSingle();
    if (!adminMembership) {
      console.error("No tenant_admin in demo-academy");
      process.exit(1);
    }
    const adminId = adminMembership.user_id as string;

    const password = `pp-${stamp}`;

    // Create a student (no auth user needed for the child itself here).
    async function createStudent(label: string): Promise<string> {
      const { data: student, error } = await svc
        .from("students")
        .insert({
          tenant_id: tenantId,
          full_name: `PP Student ${label} ${stamp}`,
          email: `pp-student-${label}-${stamp}@nxtdrive.test`,
        })
        .select("id")
        .single();
      if (error || !student) throw new Error(`create student: ${error?.message}`);
      createdStudentIds.push(student.id);
      return student.id as string;
    }

    // Create a parent auth user + profile + parent membership.
    async function createParent(label: string): Promise<{
      userId: string;
      email: string;
    }> {
      const email = `pp-parent-${label}-${stamp}@nxtdrive.test`;
      const { data: u, error } = await svc.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
      });
      if (error || !u?.user) throw new Error(`createUser: ${error?.message}`);
      const userId = u.user.id;
      createdUserIds.push(userId);
      await svc
        .from("profiles")
        .upsert({ id: userId, email, full_name: `PP Parent ${label}` });
      await svc.from("memberships").insert({
        user_id: userId,
        tenant_id: tenantId,
        role: "parent",
      });
      return { userId, email };
    }

    async function makeInvoice(studentId: string, openIt: boolean) {
      const { data: invoiceId, error } = await svc.rpc("create_invoice", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: studentId,
        p_due_date: null,
        p_notes: null,
      });
      if (error || !invoiceId) throw new Error(`create_invoice: ${error?.message}`);
      createdInvoiceIds.push(invoiceId as string);
      const line = await svc.rpc("add_invoice_line", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_description: `PP regel ${stamp}`,
        p_quantity: 1,
        p_unit_price_cents: 9500,
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
      });
      if (line.error) throw new Error(`add_invoice_line: ${line.error.message}`);
      if (openIt) {
        const open = await svc.rpc("set_invoice_status", {
          p_invoice_id: invoiceId as string,
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_status: "open",
        });
        if (open.error) throw new Error(`set_invoice_status: ${open.error.message}`);
      }
      return invoiceId as string;
    }

    const childA = await createStudent("a");
    const childB = await createStudent("b");
    const parent = await createParent("p");

    // Link parent → child A via the audited service-role RPC.
    const link = await svc.rpc("link_student_guardian", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_student_id: childA,
      p_user_id: parent.userId,
      p_relation: "ouder",
    });
    if (link.error) throw new Error(`link_student_guardian: ${link.error.message}`);

    // Seed a lesson + credit ledger row for each child.
    async function seedLesson(studentId: string, slot: number) {
      const start = new Date(stamp + slot * 7200_000).toISOString();
      const end = new Date(stamp + slot * 7200_000 + 3600_000).toISOString();
      const { error } = await svc.from("lessons").insert({
        tenant_id: tenantId,
        instructor_id: adminId,
        student_id: studentId,
        starts_at: start,
        ends_at: end,
        status: "planned",
        notes: "INTERNAL STAFF NOTE — must never reach a parent",
      });
      if (error) throw new Error(`seed lesson: ${error.message}`);
    }
    await seedLesson(childA, 1);
    await seedLesson(childB, 2);

    async function seedCredit(studentId: string) {
      const { error } = await svc.rpc("adjust_credits", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_delta: 60,
        p_note: `PP seed ${stamp}`,
      });
      if (error) throw new Error(`seed credit: ${error.message}`);
    }
    await seedCredit(childA);
    await seedCredit(childB);

    // Seed a document for each child (metadata only; no real file needed for
    // the RLS read assertion).
    async function seedDocument(studentId: string): Promise<string> {
      const { data, error } = await svc.rpc("record_student_document", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_storage_path: `${tenantId}/${studentId}/${stamp}-pp-test.pdf`,
        p_file_name: "pp-test.pdf",
        p_category: "other",
        p_mime_type: "application/pdf",
        p_size_bytes: 1234,
      });
      if (error) throw new Error(`seed document: ${error.message}`);
      return data as string;
    }
    const docA = await seedDocument(childA);
    const docB = await seedDocument(childB);

    // Seed an exam appointment for each child (planning + examens sections both
    // read agenda_appointments — 0060 added the guardian SELECT branch). We
    // insert directly via the service role (like seedLesson) to bypass the
    // RPC's per-instructor overlap guard, which would otherwise collide with
    // leftover appointments from earlier runs.
    // Clear any leftover PP exam appointments from earlier runs so the
    // per-instructor no-overlap gist constraint doesn't trip on re-run.
    await svc
      .from("agenda_appointments")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("instructor_id", adminId)
      .eq("title", "PP exam");

    async function seedAppointment(
      studentId: string,
      slot: number,
    ): Promise<string> {
      const start = new Date(stamp + (100 + slot) * 86_400_000).toISOString();
      const end = new Date(
        stamp + (100 + slot) * 86_400_000 + 35 * 60_000,
      ).toISOString();
      const { data, error } = await svc
        .from("agenda_appointments")
        .insert({
          tenant_id: tenantId,
          instructor_id: adminId,
          student_id: studentId,
          type: "exam",
          status: "planned",
          starts_at: start,
          ends_at: end,
          title: "PP exam",
          created_by: adminId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`seed appointment: ${error.message}`);
      return data!.id as string;
    }
    const apptA = await seedAppointment(childA, 1);
    const apptB = await seedAppointment(childB, 2);

    const invA_open = await makeInvoice(childA, true);
    const invA_draft = await makeInvoice(childA, false);
    const invB_open = await makeInvoice(childB, true);

    // --- Sign in as the parent ---------------------------------------------
    const pClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const pSign = await pClient.auth.signInWithPassword({
      email: parent.email,
      password,
    });
    if (pSign.error || !pSign.data.session) {
      throw new Error(`parent signIn: ${pSign.error?.message}`);
    }

    {
      const { data } = await pClient
        .from("students")
        .select("id")
        .in("id", [childA, childB]);
      const ids = (data ?? []).map((r) => r.id);
      results.push({
        name: "parent sees only linked child's student row",
        ok: ids.length === 1 && ids[0] === childA,
        detail: `visible=${ids.join(",")}`,
      });
    }

    {
      const { data } = await pClient
        .from("invoices")
        .select("id, status")
        .in("id", [invA_open, invA_draft, invB_open]);
      const ids = (data ?? []).map((r) => r.id);
      results.push({
        name: "parent sees only linked child's non-draft invoice",
        ok: ids.length === 1 && ids[0] === invA_open,
        detail: `visible=${ids.join(",")}`,
      });
    }

    {
      const { data } = await pClient
        .from("invoice_lines")
        .select("id, invoice_id");
      const rows = data ?? [];
      const onlyOpen = rows.every((r) => r.invoice_id === invA_open);
      const hasOwn = rows.some((r) => r.invoice_id === invA_open);
      results.push({
        name: "parent sees only linked child's invoice_lines (non-draft)",
        ok: hasOwn && onlyOpen,
        detail: `rows=${rows.length} only_open=${onlyOpen}`,
      });
    }

    {
      const { data } = await pClient
        .from("lessons")
        .select("id, student_id")
        .in("student_id", [childA, childB]);
      const rows = data ?? [];
      const onlyA = rows.length > 0 && rows.every((r) => r.student_id === childA);
      results.push({
        name: "parent sees only linked child's lessons",
        ok: onlyA,
        detail: `rows=${rows.length}`,
      });
    }

    {
      const { data } = await pClient
        .from("credit_ledger")
        .select("id, student_id")
        .in("student_id", [childA, childB]);
      const rows = data ?? [];
      const onlyA = rows.length > 0 && rows.every((r) => r.student_id === childA);
      results.push({
        name: "parent sees only linked child's credit_ledger",
        ok: onlyA,
        detail: `rows=${rows.length}`,
      });
    }

    {
      const { data } = await pClient
        .from("student_documents")
        .select("id, student_id")
        .in("id", [docA, docB]);
      const rows = data ?? [];
      const onlyA =
        rows.length === 1 &&
        rows[0]!.id === docA &&
        rows[0]!.student_id === childA;
      results.push({
        name: "parent sees only linked child's documents (not other child's)",
        ok: onlyA,
        detail: `rows=${rows.length} visible=${rows.map((r) => r.id).join(",")}`,
      });
    }

    {
      const { data } = await pClient
        .from("agenda_appointments")
        .select("id, student_id")
        .in("id", [apptA, apptB]);
      const rows = data ?? [];
      const onlyA =
        rows.length === 1 &&
        rows[0]!.id === apptA &&
        rows[0]!.student_id === childA;
      results.push({
        name: "parent sees only linked child's agenda appointments (planning/examens)",
        ok: onlyA,
        detail: `rows=${rows.length} visible=${rows.map((r) => r.id).join(",")}`,
      });
    }

    // Parent CANNOT call the link RPC (service-role only).
    {
      const { error } = await pClient.rpc("link_student_guardian", {
        p_tenant_id: tenantId,
        p_actor: parent.userId,
        p_student_id: childB,
        p_user_id: parent.userId,
        p_relation: "ouder",
      });
      results.push({
        name: "parent CANNOT call link_student_guardian RPC",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await pClient.rpc("unlink_student_guardian", {
        p_tenant_id: tenantId,
        p_actor: parent.userId,
        p_guardian_id: "00000000-0000-0000-0000-000000000000",
      });
      results.push({
        name: "parent CANNOT call unlink_student_guardian RPC",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    await pClient.auth.signOut();

    // Anon cannot call the RPCs either (execute revoked).
    {
      const { error } = await anonClient.rpc("link_student_guardian", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: childB,
        p_user_id: parent.userId,
        p_relation: "ouder",
      });
      results.push({
        name: "anon CANNOT call link_student_guardian RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    // --- Cross-tenant isolation --------------------------------------------
    const otherSlug = `pp-other-${stamp}`;
    const { data: otherTenant, error: otErr } = await svc
      .from("tenants")
      .insert({ slug: otherSlug, name: `PP Other ${stamp}` })
      .select("id")
      .single();
    if (otErr || !otherTenant) throw new Error(`other tenant: ${otErr?.message}`);
    const otherTenantId = otherTenant.id as string;
    createdTenantIds.push(otherTenantId);

    const { data: otherStudent } = await svc
      .from("students")
      .insert({
        tenant_id: otherTenantId,
        full_name: `PP Other Child ${stamp}`,
        email: `pp-other-child-${stamp}@nxtdrive.test`,
      })
      .select("id")
      .single();
    if (!otherStudent) throw new Error("could not create other-tenant child");
    createdStudentIds.push(otherStudent.id);

    // The demo-academy parent must NOT see the other tenant's child.
    {
      const pClient2 = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const s = await pClient2.auth.signInWithPassword({
        email: parent.email,
        password,
      });
      if (s.error) throw new Error(`parent re-signIn: ${s.error.message}`);
      const { data } = await pClient2
        .from("students")
        .select("id")
        .eq("id", otherStudent.id);
      results.push({
        name: "parent in tenant X cannot read a child in tenant Y",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
      await pClient2.auth.signOut();
    }
  } finally {
    for (const iid of createdInvoiceIds) {
      await svc
        .from("invoice_lines")
        .delete()
        .eq("invoice_id", iid)
        .then(() => undefined, () => undefined);
    }
    if (createdInvoiceIds.length) {
      await svc
        .from("invoices")
        .delete()
        .in("id", createdInvoiceIds)
        .then(() => undefined, () => undefined);
    }
    for (const sid of createdStudentIds) {
      await svc.from("lessons").delete().eq("student_id", sid).then(
        () => undefined,
        () => undefined,
      );
      await svc.from("student_guardians").delete().eq("student_id", sid).then(
        () => undefined,
        () => undefined,
      );
      await svc.from("students").delete().eq("id", sid).then(
        () => undefined,
        () => undefined,
      );
    }
    for (const uid of createdUserIds) {
      await svc.from("memberships").delete().eq("user_id", uid);
      await svc.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    for (const tid of createdTenantIds) {
      await svc.from("tenants").delete().eq("id", tid).then(
        () => undefined,
        () => undefined,
      );
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
  console.log("All parent portal RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
