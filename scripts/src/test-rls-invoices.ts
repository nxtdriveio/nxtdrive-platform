/**
 * RLS tests for Phase 3 — Facturen basis.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-invoices
 *   pnpm --filter @workspace/scripts run db:test-rls-invoices -- --env=production
 *
 * Asserts:
 *   1. Student A sees only own non-draft invoice; not student B's, not own draft.
 *   2. Student A sees only own invoice_lines; not student B's.
 *   3. Anonymous role sees no invoices and no invoice_lines.
 *   4. Instructor in tenant can read both A's and B's invoices (incl. drafts).
 *   5. Instructor CANNOT invoke create_invoice / set_invoice_status RPCs
 *      (they are service_role-only).
 *   6. set_invoice_status enforces legal transitions (draft→paid rejected).
 *   7. Cross-tenant: an admin of tenant X cannot read invoices of tenant Y,
 *      and a student of tenant X cannot read invoices of a student in
 *      tenant Y.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running invoices RLS tests`);

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
  const createdInvoiceIds: string[] = [];
  const createdTenantIds: string[] = [];

  try {
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

    // Find an admin actor and any instructor membership.
    const { data: adminMembership } = await serviceClient
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

    const studentPassword = `i-pass-${stamp}`;
    const instructorPassword = `i-inst-${stamp}`;

    // Create a fresh instructor we can sign in as.
    const instEmail = `instructor-inv-${stamp}@nxtdrive.test`;
    const instCreate = await serviceClient.auth.admin.createUser({
      email: instEmail,
      email_confirm: true,
      password: instructorPassword,
    });
    if (instCreate.error || !instCreate.data.user) {
      throw new Error(`createUser instructor: ${instCreate.error?.message}`);
    }
    const instructorId = instCreate.data.user.id;
    createdUserIds.push(instructorId);
    await serviceClient.from("profiles").upsert({
      id: instructorId,
      email: instEmail,
      full_name: "Instructor INV",
    });
    await serviceClient.from("memberships").insert({
      user_id: instructorId,
      tenant_id: tenantId,
      role: "instructor",
    });

    async function createLoggedInStudent(label: string) {
      const email = `student-inv-${label}-${stamp}@nxtdrive.test`;
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
        .upsert({ id: userId, email, full_name: `StudentInv ${label}` });
      const { data: student } = await serviceClient
        .from("students")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          full_name: `StudentInv ${label} ${stamp}`,
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

    // Helper: create an invoice with one line via the RPCs (service role).
    async function makeInvoice(studentId: string, openIt: boolean) {
      const { data: invoiceId, error } = await serviceClient.rpc(
        "create_invoice",
        {
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_student_id: studentId,
          p_due_date: null,
          p_notes: null,
        },
      );
      if (error || !invoiceId) {
        throw new Error(`create_invoice: ${error?.message}`);
      }
      createdInvoiceIds.push(invoiceId as string);
      const addLine = await serviceClient.rpc("add_invoice_line", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_description: `Test regel ${stamp}`,
        p_quantity: 1,
        p_unit_price_cents: 9500,
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
      });
      if (addLine.error) throw new Error(`add_invoice_line: ${addLine.error.message}`);
      if (openIt) {
        const setOpen = await serviceClient.rpc("set_invoice_status", {
          p_invoice_id: invoiceId as string,
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_status: "open",
        });
        if (setOpen.error) throw new Error(`set_invoice_status: ${setOpen.error.message}`);
      }
      return invoiceId as string;
    }

    const invA_open = await makeInvoice(A.studentId, true);
    const invA_draft = await makeInvoice(A.studentId, false);
    const invB_open = await makeInvoice(B.studentId, true);

    // --- Sign in as student A -----------------------------------------------
    const aClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const aSign = await aClient.auth.signInWithPassword({
      email: A.email,
      password: studentPassword,
    });
    if (aSign.error || !aSign.data.session) {
      throw new Error(`student A signIn: ${aSign.error?.message}`);
    }

    {
      const { data } = await aClient
        .from("invoices")
        .select("id, status, student_id")
        .in("id", [invA_open, invA_draft, invB_open]);
      const ids = (data ?? []).map((r) => r.id);
      results.push({
        name: "student sees only own non-draft invoice",
        ok: ids.length === 1 && ids[0] === invA_open,
        detail: `visible_ids=${ids.join(",")}`,
      });
    }

    {
      const { data } = await aClient
        .from("invoice_lines")
        .select("id, invoice_id");
      const rows = data ?? [];
      const onlyOpen = rows.every((r) => r.invoice_id === invA_open);
      const hasOwn = rows.some((r) => r.invoice_id === invA_open);
      results.push({
        name: "student sees only own invoice_lines (non-draft)",
        ok: hasOwn && onlyOpen,
        detail: `rows=${rows.length} only_open=${onlyOpen}`,
      });
    }

    await aClient.auth.signOut();

    // --- Anon visibility ----------------------------------------------------
    {
      const { data } = await anonClient
        .from("invoices")
        .select("id")
        .in("id", [invA_open, invA_draft, invB_open]);
      results.push({
        name: "anon cannot read invoices",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await anonClient
        .from("invoice_lines")
        .select("id")
        .limit(5);
      results.push({
        name: "anon cannot read invoice_lines",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // --- Sign in as instructor ---------------------------------------------
    const iClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const iSign = await iClient.auth.signInWithPassword({
      email: instEmail,
      password: instructorPassword,
    });
    if (iSign.error || !iSign.data.session) {
      throw new Error(`instructor signIn: ${iSign.error?.message}`);
    }

    {
      const { data } = await iClient
        .from("invoices")
        .select("id, status")
        .in("id", [invA_open, invA_draft, invB_open]);
      const ids = (data ?? []).map((r) => r.id).sort();
      const expected = [invA_open, invA_draft, invB_open].sort();
      results.push({
        name: "instructor sees all tenant invoices (incl. drafts)",
        ok:
          ids.length === 3 &&
          ids[0] === expected[0] &&
          ids[1] === expected[1] &&
          ids[2] === expected[2],
        detail: `visible=${ids.length}`,
      });
    }

    // Instructor RPC calls should be rejected (function not granted to authenticated).
    {
      const { error } = await iClient.rpc("create_invoice", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: A.studentId,
        p_due_date: null,
        p_notes: null,
      });
      results.push({
        name: "instructor CANNOT call create_invoice RPC",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }
    {
      const { error } = await iClient.rpc("set_invoice_status", {
        p_invoice_id: invA_open,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_status: "paid",
      });
      results.push({
        name: "instructor CANNOT call set_invoice_status RPC",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }

    await iClient.auth.signOut();

    // Anon JWT must also be rejected (defense-in-depth — migration 0020).
    {
      const { error } = await anonClient.rpc("create_invoice", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: A.studentId,
        p_due_date: null,
        p_notes: null,
      });
      results.push({
        name: "anon CANNOT call create_invoice RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error returned — RPC is callable!",
      });
    }

    // --- Status machine: draft → paid must fail ----------------------------
    {
      const { error } = await serviceClient.rpc("set_invoice_status", {
        p_invoice_id: invA_draft,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_status: "paid",
      });
      results.push({
        name: "set_invoice_status rejects draft → paid",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }

    // --- And: paying an open invoice succeeds ------------------------------
    {
      const { error } = await serviceClient.rpc("set_invoice_status", {
        p_invoice_id: invA_open,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_status: "paid",
      });
      results.push({
        name: "set_invoice_status accepts open → paid",
        ok: !error,
        detail: error ? error.message : "ok",
      });
    }

    // --- Cross-tenant isolation --------------------------------------------
    // Build a second tenant with its own admin + student + invoice, then
    // sign in as each side and verify the other's invoice is invisible.
    const otherSlug = `rls-other-${stamp}`;
    const { data: otherTenant, error: otTenErr } = await serviceClient
      .from("tenants")
      .insert({ slug: otherSlug, name: `RLS Other ${stamp}` })
      .select("id")
      .single();
    if (otTenErr || !otherTenant) {
      throw new Error(`create other tenant: ${otTenErr?.message}`);
    }
    const otherTenantId = otherTenant.id as string;
    createdTenantIds.push(otherTenantId);

    const otherAdminEmail = `admin-other-${stamp}@nxtdrive.test`;
    const otherAdminCreate = await serviceClient.auth.admin.createUser({
      email: otherAdminEmail,
      email_confirm: true,
      password: instructorPassword,
    });
    if (otherAdminCreate.error || !otherAdminCreate.data.user) {
      throw new Error(
        `createUser other admin: ${otherAdminCreate.error?.message}`,
      );
    }
    const otherAdminId = otherAdminCreate.data.user.id;
    createdUserIds.push(otherAdminId);
    await serviceClient
      .from("profiles")
      .upsert({ id: otherAdminId, email: otherAdminEmail, full_name: "Other Admin" });
    await serviceClient.from("memberships").insert({
      user_id: otherAdminId,
      tenant_id: otherTenantId,
      role: "tenant_admin",
    });

    const otherStudentEmail = `student-other-${stamp}@nxtdrive.test`;
    const otherStudentCreate = await serviceClient.auth.admin.createUser({
      email: otherStudentEmail,
      email_confirm: true,
      password: studentPassword,
    });
    if (otherStudentCreate.error || !otherStudentCreate.data.user) {
      throw new Error(
        `createUser other student: ${otherStudentCreate.error?.message}`,
      );
    }
    const otherStudentUserId = otherStudentCreate.data.user.id;
    createdUserIds.push(otherStudentUserId);
    await serviceClient.from("profiles").upsert({
      id: otherStudentUserId,
      email: otherStudentEmail,
      full_name: "Other Student",
    });
    const { data: otherStudent } = await serviceClient
      .from("students")
      .insert({
        tenant_id: otherTenantId,
        user_id: otherStudentUserId,
        full_name: `Other Student ${stamp}`,
        email: otherStudentEmail,
      })
      .select("id")
      .single();
    if (!otherStudent) throw new Error("could not create other student");
    createdStudentIds.push(otherStudent.id);
    await serviceClient.from("memberships").insert({
      user_id: otherStudentUserId,
      tenant_id: otherTenantId,
      role: "student",
    });

    const { data: otherInvoiceId, error: otInvErr } = await serviceClient.rpc(
      "create_invoice",
      {
        p_tenant_id: otherTenantId,
        p_actor: otherAdminId,
        p_student_id: otherStudent.id,
        p_due_date: null,
        p_notes: null,
      },
    );
    if (otInvErr || !otherInvoiceId) {
      throw new Error(`other create_invoice: ${otInvErr?.message}`);
    }
    createdInvoiceIds.push(otherInvoiceId as string);
    await serviceClient.rpc("add_invoice_line", {
      p_invoice_id: otherInvoiceId as string,
      p_tenant_id: otherTenantId,
      p_actor: otherAdminId,
      p_description: "Other tenant line",
      p_quantity: 1,
      p_unit_price_cents: 5000,
      p_tax_rate_bp: 2100,
      p_related_package_id: null,
    });
    await serviceClient.rpc("set_invoice_status", {
      p_invoice_id: otherInvoiceId as string,
      p_tenant_id: otherTenantId,
      p_actor: otherAdminId,
      p_status: "open",
    });

    // demo-academy student A must NOT see the other tenant's open invoice
    {
      const aClient2 = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const aSign2 = await aClient2.auth.signInWithPassword({
        email: A.email,
        password: studentPassword,
      });
      if (aSign2.error) {
        throw new Error(`student A re-signIn: ${aSign2.error.message}`);
      }
      const { data } = await aClient2
        .from("invoices")
        .select("id")
        .eq("id", otherInvoiceId as string);
      results.push({
        name: "student in tenant X cannot read invoice from tenant Y",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
      await aClient2.auth.signOut();
    }

    // Other-tenant admin must NOT see demo-academy invoices
    {
      const oClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const oSign = await oClient.auth.signInWithPassword({
        email: otherAdminEmail,
        password: instructorPassword,
      });
      if (oSign.error) {
        throw new Error(`other admin signIn: ${oSign.error.message}`);
      }
      const { data } = await oClient
        .from("invoices")
        .select("id")
        .in("id", [invA_open, invA_draft, invB_open]);
      results.push({
        name: "admin of tenant Y cannot read invoices from tenant X",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
      await oClient.auth.signOut();
    }

    // --- Mollie secrets isolation (Task #15) -------------------------------
    // anon JWT must not see ANY row in tenant_secrets — the table has RLS
    // enabled with no policies, so PostgREST returns an empty set.
    {
      const { data, error } = await anonClient
        .from("tenant_secrets")
        .select("tenant_id, key")
        .limit(5);
      results.push({
        name: "anon cannot read tenant_secrets",
        ok: (data ?? []).length === 0 && !error,
        detail: `rows=${(data ?? []).length}${error ? ` err=${error.message}` : ""}`,
      });
    }

    // Student (authenticated, non-admin) must also not see tenant_secrets
    // for their own tenant. Sign in as student A again.
    {
      const sClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const sSign = await sClient.auth.signInWithPassword({
        email: A.email,
        password: studentPassword,
      });
      if (sSign.error) throw new Error(`student re-signIn: ${sSign.error.message}`);
      const { data } = await sClient
        .from("tenant_secrets")
        .select("tenant_id, key")
        .eq("tenant_id", tenantId);
      results.push({
        name: "student cannot read tenant_secrets in own tenant",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
      await sClient.auth.signOut();
    }

    // anon cannot read payment_records either.
    {
      const { data } = await anonClient
        .from("payment_records")
        .select("id")
        .limit(5);
      results.push({
        name: "anon cannot read payment_records",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // anon cannot call the new Mollie service-role RPCs.
    {
      const { error } = await anonClient.rpc("set_tenant_secret", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_key: "x",
        p_ciphertext: "x",
        p_iv: "x",
        p_auth_tag: "x",
      });
      results.push({
        name: "anon CANNOT call set_tenant_secret RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: invA_open,
        p_mollie_payment_id: "tr_evil",
        p_status: "paid",
        p_amount_cents: 100,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: {},
      });
      results.push({
        name: "anon CANNOT call confirm_mollie_payment RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    // confirm_mollie_payment must reject cross-tenant invoice references.
    // We pass the other tenant's invoice id under demo-academy's tenant_id.
    {
      const { error } = await serviceClient.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: otherInvoiceId as string,
        p_mollie_payment_id: `tr_xtest_${stamp}`,
        p_status: "paid",
        p_amount_cents: 5000,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: {},
      });
      results.push({
        name: "confirm_mollie_payment rejects cross-tenant invoice",
        ok: !!error && /not found/i.test(error.message),
        detail: error ? error.message : "no error returned",
      });
    }
  } finally {
    // Cleanup. Order matters: lines → invoices → counters → students → users.
    for (const iid of createdInvoiceIds) {
      await serviceClient
        .from("invoice_lines")
        .delete()
        .eq("invoice_id", iid)
        .then(() => undefined, () => undefined);
    }
    if (createdInvoiceIds.length) {
      await serviceClient
        .from("invoices")
        .delete()
        .in("id", createdInvoiceIds)
        .then(() => undefined, () => undefined);
    }
    for (const sid of createdStudentIds) {
      await serviceClient
        .from("students")
        .delete()
        .eq("id", sid)
        .then(() => undefined, () => undefined);
    }
    for (const uid of createdUserIds) {
      await serviceClient.from("memberships").delete().eq("user_id", uid);
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    for (const tid of createdTenantIds) {
      await serviceClient
        .from("tenants")
        .delete()
        .eq("id", tid)
        .then(() => undefined, () => undefined);
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
  console.log("All invoice RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
