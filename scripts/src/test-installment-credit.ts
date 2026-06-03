/**
 * Task #112 tests — Termijn-tegoed: gefaseerde tegoed-vrijgave per termijn.
 *
 *   pnpm --filter @workspace/scripts run db:test-installment-credit
 *   pnpm --filter @workspace/scripts run db:test-installment-credit -- --env=production
 *
 * Asserts:
 *   1. per_installment plan releases NOTHING at creation (tegoed never runs
 *      ahead of payment); the status view reports pending == package total.
 *   2. Paying a termijn (set_invoice_status → paid) releases that termijn's
 *      proportional share via a credit_ledger row + a release-tracking row.
 *   3. Paying ALL termijnen releases EXACTLY the package total (deterministic
 *      telescoping split — no rounding leak, last termijn settles remainder).
 *   4. Tiny-package edge: a zero-share termijn still records a release row
 *      (minutes 0, no ledger row — credit_ledger forbids delta 0).
 *   5. immediate policy releases the FULL tegoed at plan creation (one ledger
 *      row + one release row, invoice_id null), independent of payment.
 *   6. A money-only termijn schema (no linked package) releases no tegoed.
 *   7. release_installment_credit is idempotent (re-call returns same row, no
 *      second ledger entry).
 *   8. Grant lockdown: neither anon nor an authenticated instructor can call
 *      release_installment_credit (service_role only).
 *   9. RLS read: the student sees their own plan credit status; an unrelated
 *      authenticated user does not.
 *
 * Saves and restores the tenant's installment_credit_release setting so the run
 * never leaves the policy changed.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const POLICY_KEY = "installment_credit_release";

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Termijn-tegoed (Task #112) tests`);

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
  const createdPlanIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  // Policy save/restore.
  let tenantId = "";
  let hadPolicyRow = false;
  let priorPolicyValue: unknown = null;

  async function setTenantPolicy(mode: "immediate" | "per_installment") {
    await serviceClient.from("tenant_settings").upsert(
      { tenant_id: tenantId, key: POLICY_KEY, value: { mode } },
      { onConflict: "tenant_id,key" },
    );
  }

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
    tenantId = tenant.id as string;

    // Remember the tenant's current policy so we can restore it in cleanup.
    const { data: priorRow } = await serviceClient
      .from("tenant_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", POLICY_KEY)
      .maybeSingle();
    hadPolicyRow = !!priorRow;
    priorPolicyValue = priorRow?.value ?? null;

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

    const studentPassword = `tc-pass-${stamp}`;
    const instructorPassword = `tc-inst-${stamp}`;
    const outsiderPassword = `tc-out-${stamp}`;

    // Instructor (staff) for grant-lockdown checks.
    const instEmail = `instructor-tc-${stamp}@nxtdrive.test`;
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
      full_name: "Instructor TC",
    });
    await serviceClient.from("memberships").insert({
      user_id: instructorId,
      tenant_id: tenantId,
      role: "instructor",
    });

    // Student to bill, with a sign-in account for RLS read checks.
    const studentEmail = `student-tc-${stamp}@nxtdrive.test`;
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
    await serviceClient.from("profiles").upsert({
      id: studentUserId,
      email: studentEmail,
      full_name: "Student TC",
    });
    const { data: studentRow } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: studentUserId,
        full_name: `Student TC ${stamp}`,
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

    // Unrelated authenticated user (no membership) for the RLS negative check.
    const outEmail = `outsider-tc-${stamp}@nxtdrive.test`;
    const outCreate = await serviceClient.auth.admin.createUser({
      email: outEmail,
      email_confirm: true,
      password: outsiderPassword,
    });
    if (outCreate.error || !outCreate.data.user) {
      throw new Error(`createUser outsider: ${outCreate.error?.message}`);
    }
    const outsiderId = outCreate.data.user.id;
    createdUserIds.push(outsiderId);
    await serviceClient.from("profiles").upsert({
      id: outsiderId,
      email: outEmail,
      full_name: "Outsider TC",
    });

    // Packages (credits_total is the tegoed in MINUTES).
    const { data: pkgRow } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: `Tegoedpakket TC ${stamp}`,
        credits_total: 1000,
        price_cents: 100000,
      })
      .select("id")
      .single();
    if (!pkgRow) throw new Error("could not create package");
    const packageId = pkgRow.id as string;
    createdPackageIds.push(packageId);

    const { data: tinyPkgRow } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenantId,
        name: `Mini-tegoed TC ${stamp}`,
        credits_total: 2,
        price_cents: 200,
      })
      .select("id")
      .single();
    if (!tinyPkgRow) throw new Error("could not create tiny package");
    const tinyPackageId = tinyPkgRow.id as string;
    createdPackageIds.push(tinyPackageId);

    // Helper: create an installment plan and return its open invoices ordered.
    async function makePlan(opts: {
      packageId: string | null;
      count: number;
      totalCents: number;
    }) {
      const { data: planId, error } = await serviceClient.rpc(
        "create_installment_plan",
        {
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_student_id: studentId,
          p_total_cents: opts.totalCents,
          p_installment_count: opts.count,
          p_first_due_date: null,
          p_interval_days: 30,
          p_description: `TC plan ${stamp}-${Math.random().toString(36).slice(2, 7)}`,
          p_tax_rate_bp: 2100,
          p_related_package_id: opts.packageId,
          p_notes: null,
        },
      );
      if (error || !planId) {
        throw new Error(`create_installment_plan: ${error?.message}`);
      }
      createdPlanIds.push(planId as string);
      const { data: invs } = await serviceClient
        .from("invoices")
        .select("id, installment_no")
        .eq("installment_plan_id", planId as string)
        .order("installment_no", { ascending: true });
      for (const r of invs ?? []) createdInvoiceIds.push(r.id as string);
      return { planId: planId as string, invoices: invs ?? [] };
    }

    async function planStatus(planId: string) {
      const { data } = await serviceClient
        .from("installment_plan_credit_status")
        .select("package_credit_minutes, released_minutes, pending_minutes")
        .eq("plan_id", planId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return data as {
        package_credit_minutes: number | null;
        released_minutes: number;
        pending_minutes: number;
      } | null;
    }

    async function payInvoice(invoiceId: string) {
      const { error } = await serviceClient.rpc("set_invoice_status", {
        p_invoice_id: invoiceId,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_status: "paid",
      });
      if (error) throw new Error(`set_invoice_status paid: ${error.message}`);
    }

    // --- 1 & 2 & 3: per_installment release on payment, exact total ----------
    await setTenantPolicy("per_installment");
    {
      const { planId, invoices } = await makePlan({
        packageId,
        count: 3,
        totalCents: 90000,
      });

      const atCreation = await planStatus(planId);
      results.push({
        name: "per_installment releases nothing at plan creation",
        ok:
          atCreation?.package_credit_minutes === 1000 &&
          atCreation?.released_minutes === 0 &&
          atCreation?.pending_minutes === 1000,
        detail: `pkg=${atCreation?.package_credit_minutes} released=${atCreation?.released_minutes} pending=${atCreation?.pending_minutes}`,
      });

      // Pay termijn 1 → share = round(1000*1/3) - 0 = 333.
      await payInvoice(invoices[0]?.id as string);
      const after1 = await planStatus(planId);
      const { data: rel1 } = await serviceClient
        .from("installment_credit_releases")
        .select("minutes, credit_ledger_id")
        .eq("invoice_id", invoices[0]?.id as string)
        .maybeSingle();
      const { data: led1 } = await serviceClient
        .from("credit_ledger")
        .select("delta, reason")
        .eq("id", (rel1?.credit_ledger_id as string) ?? "")
        .maybeSingle();
      results.push({
        name: "paying termijn 1 releases its share via ledger + release row",
        ok:
          rel1?.minutes === 333 &&
          after1?.released_minutes === 333 &&
          after1?.pending_minutes === 667 &&
          led1?.delta === 333 &&
          led1?.reason === "package_purchase",
        detail: `share=${rel1?.minutes} released=${after1?.released_minutes} ledgerDelta=${led1?.delta}`,
      });

      // Pay the rest → total released == package total exactly.
      await payInvoice(invoices[1]?.id as string);
      await payInvoice(invoices[2]?.id as string);
      const afterAll = await planStatus(planId);
      const { data: allRels } = await serviceClient
        .from("installment_credit_releases")
        .select("minutes")
        .eq("plan_id", planId);
      const relSum = (allRels ?? []).reduce(
        (acc, r) => acc + (r.minutes as number),
        0,
      );
      results.push({
        name: "paying all termijnen releases EXACTLY the package total",
        ok:
          afterAll?.released_minutes === 1000 &&
          afterAll?.pending_minutes === 0 &&
          relSum === 1000,
        detail: `released=${afterAll?.released_minutes} pending=${afterAll?.pending_minutes} relSum=${relSum}`,
      });

      // 7: idempotent re-call of the release RPC for an already-paid termijn.
      const { data: relIdFirst } = await serviceClient
        .from("installment_credit_releases")
        .select("id")
        .eq("invoice_id", invoices[0]?.id as string)
        .maybeSingle();
      const { data: reReleaseId } = await serviceClient.rpc(
        "release_installment_credit",
        {
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_invoice_id: invoices[0]?.id as string,
        },
      );
      const { count: ledgerCount } = await serviceClient
        .from("credit_ledger")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("related_id", packageId);
      results.push({
        name: "release_installment_credit is idempotent (no double release)",
        ok:
          reReleaseId === relIdFirst?.id &&
          ledgerCount === 3, // one ledger row per paid termijn, no extras
        detail: `reId=${reReleaseId} firstId=${relIdFirst?.id} ledgerRows=${ledgerCount}`,
      });
    }

    // --- 4: tiny package — zero-share termijn still records a release row ----
    {
      const { planId, invoices } = await makePlan({
        packageId: tinyPackageId,
        count: 3,
        totalCents: 300,
      });
      // shares for total=2, N=3: t1=round(2/3)=1, t2=round(4/3)-1=0, t3=2-1=1.
      for (const inv of invoices) await payInvoice(inv.id as string);
      const { data: rels } = await serviceClient
        .from("installment_credit_releases")
        .select("installment_no, minutes, credit_ledger_id")
        .eq("plan_id", planId)
        .order("installment_no", { ascending: true });
      const r2 = (rels ?? []).find((r) => r.installment_no === 2);
      const status = await planStatus(planId);
      const sum = (rels ?? []).reduce(
        (acc, r) => acc + (r.minutes as number),
        0,
      );
      results.push({
        name: "tiny package: zero-share termijn records a release row (no ledger)",
        ok:
          (rels ?? []).length === 3 &&
          r2?.minutes === 0 &&
          r2?.credit_ledger_id === null &&
          sum === 2 &&
          status?.released_minutes === 2,
        detail: `n=${(rels ?? []).length} t2=${r2?.minutes} t2ledger=${r2?.credit_ledger_id} sum=${sum}`,
      });
    }

    // --- 5: immediate policy releases the full tegoed at creation -----------
    await setTenantPolicy("immediate");
    {
      const { planId } = await makePlan({
        packageId,
        count: 4,
        totalCents: 120000,
      });
      const status = await planStatus(planId);
      const { data: rels } = await serviceClient
        .from("installment_credit_releases")
        .select("invoice_id, installment_no, minutes, credit_ledger_id")
        .eq("plan_id", planId);
      const immediate = (rels ?? [])[0];
      const { data: led } = await serviceClient
        .from("credit_ledger")
        .select("delta")
        .eq("id", (immediate?.credit_ledger_id as string) ?? "")
        .maybeSingle();
      results.push({
        name: "immediate policy releases full tegoed at creation",
        ok:
          (rels ?? []).length === 1 &&
          immediate?.invoice_id === null &&
          immediate?.installment_no === null &&
          immediate?.minutes === 1000 &&
          led?.delta === 1000 &&
          status?.released_minutes === 1000 &&
          status?.pending_minutes === 0,
        detail: `rels=${(rels ?? []).length} minutes=${immediate?.minutes} ledgerDelta=${led?.delta}`,
      });
    }
    await setTenantPolicy("per_installment");

    // --- 6: money-only schema (no package) releases no tegoed ---------------
    {
      const { planId, invoices } = await makePlan({
        packageId: null,
        count: 2,
        totalCents: 50000,
      });
      const { data: released } = await serviceClient.rpc(
        "release_installment_credit",
        {
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_invoice_id: invoices[0]?.id as string,
        },
      );
      await payInvoice(invoices[0]?.id as string);
      const { count: relCount } = await serviceClient
        .from("installment_credit_releases")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", planId);
      results.push({
        name: "money-only termijn schema (no package) releases no tegoed",
        ok: released === null && relCount === 0,
        detail: `rpc=${released} releaseRows=${relCount}`,
      });
    }

    // --- 8: grant lockdown on release_installment_credit --------------------
    // Use a fresh paid installment so a successful call WOULD have side effects.
    {
      const { invoices } = await makePlan({
        packageId,
        count: 2,
        totalCents: 40000,
      });
      await payInvoice(invoices[0]?.id as string);
      // Remove the release the payment just made so the RPC could re-create it.
      await serviceClient
        .from("installment_credit_releases")
        .delete()
        .eq("invoice_id", invoices[0]?.id as string);

      {
        const { error } = await anonClient.rpc("release_installment_credit", {
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_invoice_id: invoices[0]?.id as string,
        });
        results.push({
          name: "anon CANNOT call release_installment_credit (execute revoked)",
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
        const { error } = await iClient.rpc("release_installment_credit", {
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_invoice_id: invoices[0]?.id as string,
        });
        results.push({
          name: "instructor CANNOT call release_installment_credit RPC",
          ok: !!error,
          detail: error ? error.message : "no error returned",
        });
      }
      await iClient.auth.signOut();
    }

    // --- 9: RLS read on the status view ------------------------------------
    {
      const sClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const sSign = await sClient.auth.signInWithPassword({
        email: studentEmail,
        password: studentPassword,
      });
      if (sSign.error || !sSign.data.session) {
        throw new Error(`student signIn: ${sSign.error?.message}`);
      }
      const { data: ownRows } = await sClient
        .from("installment_plan_credit_status")
        .select("plan_id")
        .eq("student_id", studentId);
      results.push({
        name: "student can read OWN installment plan credit status (RLS)",
        ok: (ownRows ?? []).length > 0,
        detail: `rows=${(ownRows ?? []).length}`,
      });
      await sClient.auth.signOut();

      const oClient = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const oSign = await oClient.auth.signInWithPassword({
        email: outEmail,
        password: outsiderPassword,
      });
      if (oSign.error || !oSign.data.session) {
        throw new Error(`outsider signIn: ${oSign.error?.message}`);
      }
      const { data: outRows } = await oClient
        .from("installment_plan_credit_status")
        .select("plan_id")
        .eq("student_id", studentId);
      results.push({
        name: "unrelated user CANNOT read another student's credit status (RLS)",
        ok: (outRows ?? []).length === 0,
        detail: `rows=${(outRows ?? []).length}`,
      });
      await oClient.auth.signOut();
    }
  } finally {
    // Restore the tenant's policy exactly as we found it.
    if (tenantId) {
      if (hadPolicyRow) {
        await serviceClient
          .from("tenant_settings")
          .update({ value: priorPolicyValue })
          .eq("tenant_id", tenantId)
          .eq("key", POLICY_KEY)
          .then(() => undefined, () => undefined);
      } else {
        await serviceClient
          .from("tenant_settings")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("key", POLICY_KEY)
          .then(() => undefined, () => undefined);
      }
    }

    // Cleanup. Plans cascade releases; students cascade credit_ledger.
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
    for (const pkg of createdPackageIds) {
      await serviceClient
        .from("packages")
        .delete()
        .eq("id", pkg)
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
  console.log("All Termijn-tegoed (Task #112) tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
