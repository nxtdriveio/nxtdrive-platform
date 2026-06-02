/**
 * Module 6 tests — termijnfacturen (installments) + creditfacturen (credit notes).
 *
 *   pnpm --filter @workspace/scripts run db:test-invoices-module6
 *   pnpm --filter @workspace/scripts run db:test-invoices-module6 -- --env=production
 *
 * Asserts:
 *   1. create_installment_plan splits the NET total exactly across N invoices
 *      (sum of subtotal_cents == p_total_cents, no rounding leak).
 *   2. Each installment is tagged (installment_plan_id, installment_no,
 *      installment_count), labelled "Termijn X van N", and opened.
 *   3. create_credit_note produces a kind='credit_note' invoice with a negative
 *      total that references the original, so open-balance sums net to ~0.
 *   4. create_credit_note enforces the single-credit guard (second call fails)
 *      and refuses to credit a credit note / a draft invoice.
 *   5. Grant lockdown: neither anon nor an authenticated instructor can call
 *      create_installment_plan or create_credit_note (service_role only).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running invoices Module 6 tests`);

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
  const createdPlanIds: string[] = [];

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

    const studentPassword = `m6-pass-${stamp}`;
    const instructorPassword = `m6-inst-${stamp}`;

    // Fresh instructor we can sign in as (for grant-lockdown checks).
    const instEmail = `instructor-m6-${stamp}@nxtdrive.test`;
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
      full_name: "Instructor M6",
    });
    await serviceClient.from("memberships").insert({
      user_id: instructorId,
      tenant_id: tenantId,
      role: "instructor",
    });

    // A student to bill.
    const studentEmail = `student-m6-${stamp}@nxtdrive.test`;
    const sCreate = await serviceClient.auth.admin.createUser({
      email: studentEmail,
      email_confirm: true,
      password: studentPassword,
    });
    if (sCreate.error || !sCreate.data.user) {
      throw new Error(`createUser student: ${sCreate.error?.message}`);
    }
    const studentUserId = sCreate.data.user.id;
    createdUserIds.push(studentUserId);
    await serviceClient
      .from("profiles")
      .upsert({ id: studentUserId, email: studentEmail, full_name: "Student M6" });
    const { data: studentRow } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: studentUserId,
        full_name: `Student M6 ${stamp}`,
        email: studentEmail,
      })
      .select("id")
      .single();
    if (!studentRow) throw new Error("could not create student");
    const studentId = studentRow.id as string;
    createdStudentIds.push(studentId);
    await serviceClient.from("memberships").insert({
      user_id: studentUserId,
      tenant_id: tenantId,
      role: "student",
    });

    // --- 1 & 2: installment plan splits NET total exactly --------------------
    // 1000 over 3 → 334 + 333 + 333 = 1000 (base+remainder, no leak).
    const NET_TOTAL = 1000;
    const COUNT = 3;
    const { data: planId, error: planErr } = await serviceClient.rpc(
      "create_installment_plan",
      {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: studentId,
        p_total_cents: NET_TOTAL,
        p_installment_count: COUNT,
        p_first_due_date: null,
        p_interval_days: 30,
        p_description: `Rijpakket M6 ${stamp}`,
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
        p_notes: null,
      },
    );
    if (planErr || !planId) {
      throw new Error(`create_installment_plan: ${planErr?.message}`);
    }
    createdPlanIds.push(planId as string);

    const { data: planInvoices } = await serviceClient
      .from("invoices")
      .select(
        "id, kind, status, subtotal_cents, installment_no, installment_count, installment_plan_id",
      )
      .eq("installment_plan_id", planId as string)
      .order("installment_no", { ascending: true });
    const plan = planInvoices ?? [];
    for (const inv of plan) createdInvoiceIds.push(inv.id as string);

    {
      const subtotalSum = plan.reduce(
        (acc, r) => acc + (r.subtotal_cents as number),
        0,
      );
      results.push({
        name: "installment plan splits NET total exactly (no rounding leak)",
        ok: plan.length === COUNT && subtotalSum === NET_TOTAL,
        detail: `n=${plan.length} sum=${subtotalSum} expected=${NET_TOTAL}`,
      });
    }
    {
      const allTagged = plan.every(
        (r, i) =>
          r.kind === "invoice" &&
          r.installment_count === COUNT &&
          r.installment_no === i + 1 &&
          r.status === "open",
      );
      results.push({
        name: "each installment tagged (no/count) and opened",
        ok: plan.length === COUNT && allTagged,
        detail: `nos=${plan.map((r) => r.installment_no).join(",")}`,
      });
    }
    {
      const { data: firstLines } = await serviceClient
        .from("invoice_lines")
        .select("description")
        .eq("invoice_id", plan[0]?.id as string);
      const desc = (firstLines ?? [])[0]?.description ?? "";
      results.push({
        name: 'installment line labelled "Termijn X van N"',
        ok: /Termijn\s+1\s+van\s+3/i.test(desc),
        detail: `desc="${desc}"`,
      });
    }

    // --- 3: credit note nets the original to ~0 ------------------------------
    const { data: origId, error: origErr } = await serviceClient.rpc(
      "create_invoice",
      {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: studentId,
        p_due_date: null,
        p_notes: null,
      },
    );
    if (origErr || !origId) throw new Error(`create_invoice: ${origErr?.message}`);
    createdInvoiceIds.push(origId as string);
    await serviceClient.rpc("add_invoice_line", {
      p_invoice_id: origId as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_description: `Te crediteren regel ${stamp}`,
      p_quantity: 1,
      p_unit_price_cents: 9500,
      p_tax_rate_bp: 2100,
      p_related_package_id: null,
    });
    await serviceClient.rpc("set_invoice_status", {
      p_invoice_id: origId as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_status: "open",
    });

    const { data: creditId, error: creditErr } = await serviceClient.rpc(
      "create_credit_note",
      {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_invoice_id: origId as string,
        p_reason: "Test creditering",
      },
    );
    if (creditErr || !creditId) {
      throw new Error(`create_credit_note: ${creditErr?.message}`);
    }
    createdInvoiceIds.push(creditId as string);

    {
      const { data: both } = await serviceClient
        .from("invoices")
        .select("id, kind, total_cents, credit_of_invoice_id")
        .in("id", [origId as string, creditId as string]);
      const orig = (both ?? []).find((r) => r.id === origId);
      const credit = (both ?? []).find((r) => r.id === creditId);
      const netted =
        (orig?.total_cents as number) + (credit?.total_cents as number);
      results.push({
        name: "credit note is negative, references original, nets to 0",
        ok:
          credit?.kind === "credit_note" &&
          credit?.credit_of_invoice_id === origId &&
          (credit?.total_cents as number) ===
            -(orig?.total_cents as number) &&
          netted === 0,
        detail: `orig=${orig?.total_cents} credit=${credit?.total_cents} net=${netted}`,
      });
    }

    // --- 4: guards ----------------------------------------------------------
    {
      const { error } = await serviceClient.rpc("create_credit_note", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_invoice_id: origId as string,
        p_reason: "Dubbele creditering",
      });
      results.push({
        name: "create_credit_note rejects a second credit (single-credit guard)",
        ok: !!error && /already has a credit note/i.test(error.message),
        detail: error ? error.message : "no error returned",
      });
    }
    {
      const { error } = await serviceClient.rpc("create_credit_note", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_invoice_id: creditId as string,
        p_reason: "Credit op credit",
      });
      results.push({
        name: "create_credit_note refuses to credit a credit note",
        ok: !!error && /cannot credit a credit note/i.test(error.message),
        detail: error ? error.message : "no error returned",
      });
    }
    {
      // A fresh draft invoice cannot be credited (only open/paid).
      const { data: draftId } = await serviceClient.rpc("create_invoice", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: studentId,
        p_due_date: null,
        p_notes: null,
      });
      if (draftId) createdInvoiceIds.push(draftId as string);
      const { error } = await serviceClient.rpc("create_credit_note", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_invoice_id: draftId as string,
        p_reason: "Credit op concept",
      });
      results.push({
        name: "create_credit_note refuses a draft invoice",
        ok: !!error && /only open or paid/i.test(error.message),
        detail: error ? error.message : "no error returned",
      });
    }

    // --- 5: grant lockdown --------------------------------------------------
    {
      const { error } = await anonClient.rpc("create_installment_plan", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_student_id: studentId,
        p_total_cents: 300,
        p_installment_count: 3,
        p_first_due_date: null,
        p_interval_days: 30,
        p_description: "evil",
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
        p_notes: null,
      });
      results.push({
        name: "anon CANNOT call create_installment_plan (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("create_credit_note", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_invoice_id: origId as string,
        p_reason: "evil",
      });
      results.push({
        name: "anon CANNOT call create_credit_note (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

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
      const { error } = await iClient.rpc("create_installment_plan", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: studentId,
        p_total_cents: 300,
        p_installment_count: 3,
        p_first_due_date: null,
        p_interval_days: 30,
        p_description: "evil",
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
        p_notes: null,
      });
      results.push({
        name: "instructor CANNOT call create_installment_plan RPC",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }
    {
      const { error } = await iClient.rpc("create_credit_note", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_invoice_id: origId as string,
        p_reason: "evil",
      });
      results.push({
        name: "instructor CANNOT call create_credit_note RPC",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }
    await iClient.auth.signOut();
  } finally {
    // Cleanup. Order: lines → invoices → plans → students → users.
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
    for (const pid of createdPlanIds) {
      await serviceClient
        .from("installment_plans")
        .delete()
        .eq("id", pid)
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
  console.log("All invoice Module 6 tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
