/**
 * End-to-end Mollie payment flow test — service role only, no real network.
 *
 *   pnpm --filter @workspace/scripts run db:test-mollie-flow
 *
 * Exercises the SQL surface added in migration 0024:
 *   - set_tenant_secret: round-tripping an encrypted-looking blob.
 *   - attach_mollie_payment_to_invoice: setting checkout url + payment id.
 *   - confirm_mollie_payment: idempotency + status transition + audit log.
 *
 * Notes:
 *   - The actual encryption happens in the Next.js server actions; here we
 *     just store opaque base64 strings to verify the RPC + table contract.
 *   - We DO NOT call api.mollie.com. The "webhook" is simulated by calling
 *     confirm_mollie_payment directly with a hand-built payload.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Mollie flow tests`);

  const url = process.env["SUPABASE_URL"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !service) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  const svc = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdInvoiceIds: string[] = [];

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

    // --- Build a throwaway student + open invoice -------------------------
    const studentEmail = `mollie-student-${stamp}@nxtdrive.test`;
    const stCreate = await svc.auth.admin.createUser({
      email: studentEmail,
      email_confirm: true,
      password: `m-${stamp}`,
    });
    if (stCreate.error || !stCreate.data.user) {
      throw new Error(`createUser: ${stCreate.error?.message}`);
    }
    const studentUserId = stCreate.data.user.id;
    createdUserIds.push(studentUserId);
    await svc
      .from("profiles")
      .upsert({ id: studentUserId, email: studentEmail, full_name: "Mollie Student" });
    const { data: studentRow } = await svc
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: studentUserId,
        full_name: `Mollie Student ${stamp}`,
        email: studentEmail,
      })
      .select("id")
      .single();
    if (!studentRow) throw new Error("could not create student");
    const studentId = studentRow.id as string;
    createdStudentIds.push(studentId);

    const { data: invoiceId } = await svc.rpc("create_invoice", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_student_id: studentId,
      p_due_date: null,
      p_notes: null,
    });
    if (!invoiceId) throw new Error("create_invoice returned null");
    createdInvoiceIds.push(invoiceId as string);
    await svc.rpc("add_invoice_line", {
      p_invoice_id: invoiceId as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_description: `Mollie test line ${stamp}`,
      p_quantity: 1,
      p_unit_price_cents: 4995,
      p_tax_rate_bp: 0,
      p_related_package_id: null,
    });
    await svc.rpc("set_invoice_status", {
      p_invoice_id: invoiceId as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_status: "open",
    });

    // --- set_tenant_secret round-trip -------------------------------------
    // Use a unique key name per test run to avoid colliding with a real
    // mollie_api_key the operator may have configured in this tenant.
    const secretKey = `test_mollie_key_${stamp}`;
    {
      const { error } = await svc.rpc("set_tenant_secret", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_key: secretKey,
        p_ciphertext: Buffer.from(`fake-ct-${stamp}`).toString("base64"),
        p_iv: Buffer.from("123456789012").toString("base64"),
        p_auth_tag: Buffer.from("1234567890123456").toString("base64"),
      });
      results.push({
        name: "set_tenant_secret writes encrypted blob",
        ok: !error,
        detail: error ? error.message : "ok",
      });
    }
    // Update (rotation) path
    {
      const { error } = await svc.rpc("set_tenant_secret", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_key: secretKey,
        p_ciphertext: Buffer.from(`fake-ct-rotated-${stamp}`).toString("base64"),
        p_iv: Buffer.from("abcdefabcdef").toString("base64"),
        p_auth_tag: Buffer.from("abcdefabcdefabcd").toString("base64"),
      });
      results.push({
        name: "set_tenant_secret rotates existing blob",
        ok: !error,
        detail: error ? error.message : "ok",
      });
    }
    // Audit trail: created + rotated entries for this tenant.
    {
      const { data: audits } = await svc
        .from("audit_log")
        .select("action, target_id")
        .eq("tenant_id", tenantId)
        .in("action", ["tenant_secret.created", "tenant_secret.rotated"])
        .eq("target_id", secretKey)
        .order("created_at", { ascending: false })
        .limit(5);
      const hasCreated = (audits ?? []).some(
        (a) => a.action === "tenant_secret.created",
      );
      const hasRotated = (audits ?? []).some(
        (a) => a.action === "tenant_secret.rotated",
      );
      results.push({
        name: "set_tenant_secret audits create + rotate",
        ok: hasCreated && hasRotated,
        detail: `created=${hasCreated} rotated=${hasRotated}`,
      });
    }

    // --- attach_mollie_payment_to_invoice ---------------------------------
    const fakeMollieId = `tr_test_${stamp}`;
    const checkoutUrl = `https://www.mollie.com/checkout/${fakeMollieId}`;
    {
      const { error } = await svc.rpc("attach_mollie_payment_to_invoice", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_mollie_payment_id: fakeMollieId,
        p_checkout_url: checkoutUrl,
        p_status: "open",
      });
      results.push({
        name: "attach_mollie_payment_to_invoice stores ids on open invoice",
        ok: !error,
        detail: error ? error.message : "ok",
      });
    }
    {
      const { data: inv } = await svc
        .from("invoices")
        .select("mollie_payment_id, mollie_checkout_url, mollie_status")
        .eq("id", invoiceId as string)
        .maybeSingle();
      results.push({
        name: "invoice row has mollie_payment_id + checkout url",
        ok:
          inv?.mollie_payment_id === fakeMollieId &&
          inv?.mollie_checkout_url === checkoutUrl &&
          inv?.mollie_status === "open",
        detail: `got=${JSON.stringify(inv)}`,
      });
    }

    // --- confirm_mollie_payment: status=open (no transition yet) ----------
    {
      const { error } = await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: invoiceId as string,
        p_mollie_payment_id: fakeMollieId,
        p_status: "open",
        p_amount_cents: 4995,
        p_currency: "EUR",
        p_method: null,
        p_paid_at: null,
        p_raw_payload: { id: fakeMollieId, status: "open" },
      });
      results.push({
        name: "confirm_mollie_payment(open) upserts without paying",
        ok: !error,
        detail: error ? error.message : "ok",
      });
      const { data: inv } = await svc
        .from("invoices")
        .select("status, paid_at")
        .eq("id", invoiceId as string)
        .maybeSingle();
      results.push({
        name: "invoice still 'open' after webhook(status=open)",
        ok: inv?.status === "open" && !inv?.paid_at,
        detail: `status=${inv?.status} paid_at=${inv?.paid_at}`,
      });
    }

    // --- confirm_mollie_payment: status=paid → invoice flips to paid ------
    const paidAt = new Date().toISOString();
    {
      const { error } = await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: invoiceId as string,
        p_mollie_payment_id: fakeMollieId,
        p_status: "paid",
        p_amount_cents: 4995,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: paidAt,
        p_raw_payload: { id: fakeMollieId, status: "paid", method: "ideal" },
      });
      results.push({
        name: "confirm_mollie_payment(paid) succeeds",
        ok: !error,
        detail: error ? error.message : "ok",
      });
    }
    {
      const { data: inv } = await svc
        .from("invoices")
        .select(
          "status, paid_at, payment_record_id, payment_record_tenant_id, mollie_status",
        )
        .eq("id", invoiceId as string)
        .maybeSingle();
      results.push({
        name: "invoice transitioned to 'paid' with payment_record linked",
        ok:
          inv?.status === "paid" &&
          !!inv?.paid_at &&
          !!inv?.payment_record_id &&
          inv?.payment_record_tenant_id === tenantId &&
          inv?.mollie_status === "paid",
        detail: JSON.stringify(inv),
      });
    }
    {
      const { data: prRows } = await svc
        .from("payment_records")
        .select("id, provider, provider_payment_id, mollie_status, method, amount_cents")
        .eq("tenant_id", tenantId)
        .eq("provider_payment_id", fakeMollieId);
      const pr = prRows?.[0];
      results.push({
        name: "payment_records row written with mollie payment id",
        ok:
          (prRows ?? []).length === 1 &&
          pr?.provider === "mollie" &&
          pr?.mollie_status === "paid" &&
          pr?.method === "ideal" &&
          pr?.amount_cents === 4995,
        detail: JSON.stringify(pr),
      });
    }
    {
      const { data: audits } = await svc
        .from("audit_log")
        .select("action")
        .eq("tenant_id", tenantId)
        .eq("target_id", invoiceId as string)
        .in("action", [
          "invoice.mollie_payment_attached",
          "invoice.mollie_webhook_received",
          "invoice.paid_via_mollie",
        ]);
      const actions = (audits ?? []).map((a) => a.action);
      results.push({
        name: "audit_log records attach + webhook + paid_via_mollie",
        ok:
          actions.includes("invoice.mollie_payment_attached") &&
          actions.includes("invoice.mollie_webhook_received") &&
          actions.includes("invoice.paid_via_mollie"),
        detail: actions.join(","),
      });
    }

    // --- Idempotency: replay the same paid webhook ------------------------
    {
      const { error } = await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: invoiceId as string,
        p_mollie_payment_id: fakeMollieId,
        p_status: "paid",
        p_amount_cents: 4995,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: paidAt,
        p_raw_payload: { id: fakeMollieId, status: "paid", replay: true },
      });
      results.push({
        name: "confirm_mollie_payment is idempotent on replay",
        ok: !error,
        detail: error ? error.message : "ok",
      });
      const { data: prRows } = await svc
        .from("payment_records")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider_payment_id", fakeMollieId);
      results.push({
        name: "replay does not create duplicate payment_records",
        ok: (prRows ?? []).length === 1,
        detail: `rows=${(prRows ?? []).length}`,
      });
      const { data: paidAudits } = await svc
        .from("audit_log")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("target_id", invoiceId as string)
        .eq("action", "invoice.paid_via_mollie");
      results.push({
        name: "replay does not re-fire 'paid_via_mollie' audit",
        ok: (paidAudits ?? []).length === 1,
        detail: `rows=${(paidAudits ?? []).length}`,
      });
    }

    // --- Binding + amount + currency guards (migration 0025) --------------
    // Build a second open invoice + attach a payment id; then send webhooks
    // that violate each guard in turn.
    const { data: inv2Id } = await svc.rpc("create_invoice", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_student_id: studentId,
      p_due_date: null,
      p_notes: null,
    });
    if (!inv2Id) throw new Error("create_invoice #2 returned null");
    createdInvoiceIds.push(inv2Id as string);
    await svc.rpc("add_invoice_line", {
      p_invoice_id: inv2Id as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_description: `Mollie test line #2 ${stamp}`,
      p_quantity: 1,
      p_unit_price_cents: 10000,
      p_tax_rate_bp: 2100,
      p_related_package_id: null,
    });
    await svc.rpc("set_invoice_status", {
      p_invoice_id: inv2Id as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_status: "open",
    });
    const realMollieId = `tr_real_${stamp}`;
    await svc.rpc("attach_mollie_payment_to_invoice", {
      p_invoice_id: inv2Id as string,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_mollie_payment_id: realMollieId,
      p_checkout_url: `https://www.mollie.com/checkout/${realMollieId}`,
      p_status: "open",
    });

    // Guard 1: binding mismatch — payment id not attached to invoice.
    {
      await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: inv2Id as string,
        p_mollie_payment_id: `tr_evil_${stamp}`,
        p_status: "paid",
        p_amount_cents: 12100,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: { id: `tr_evil_${stamp}`, status: "paid" },
      });
      const { data: inv } = await svc
        .from("invoices")
        .select("status")
        .eq("id", inv2Id as string)
        .maybeSingle();
      const { data: au } = await svc
        .from("audit_log")
        .select("action")
        .eq("tenant_id", tenantId)
        .eq("target_id", inv2Id as string)
        .eq("action", "invoice.mollie_payment_mismatch");
      results.push({
        name: "binding mismatch keeps invoice open + logs mismatch audit",
        ok: inv?.status === "open" && (au ?? []).length === 1,
        detail: `status=${inv?.status} mismatch_audits=${(au ?? []).length}`,
      });
    }

    // Guard 2: amount too low — same payment id, but underpayment.
    {
      await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: inv2Id as string,
        p_mollie_payment_id: realMollieId,
        p_status: "paid",
        p_amount_cents: 100, // way under total of 12100 (10000 + 21% VAT)
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: { id: realMollieId, status: "paid" },
      });
      const { data: inv } = await svc
        .from("invoices")
        .select("status")
        .eq("id", inv2Id as string)
        .maybeSingle();
      results.push({
        name: "underpayment keeps invoice open",
        ok: inv?.status === "open",
        detail: `status=${inv?.status}`,
      });
    }

    // Guard 3: wrong currency.
    {
      await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: inv2Id as string,
        p_mollie_payment_id: realMollieId,
        p_status: "paid",
        p_amount_cents: 99999,
        p_currency: "USD",
        p_method: "creditcard",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: { id: realMollieId, status: "paid" },
      });
      const { data: inv } = await svc
        .from("invoices")
        .select("status")
        .eq("id", inv2Id as string)
        .maybeSingle();
      results.push({
        name: "non-EUR currency keeps invoice open",
        ok: inv?.status === "open",
        detail: `status=${inv?.status}`,
      });
    }

    // Happy path: correct binding + amount + currency flips invoice to paid.
    {
      const { data: inv } = await svc
        .from("invoices")
        .select("total_cents")
        .eq("id", inv2Id as string)
        .maybeSingle();
      const total = (inv?.total_cents as number | undefined) ?? 0;
      await svc.rpc("confirm_mollie_payment", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_invoice_id: inv2Id as string,
        p_mollie_payment_id: realMollieId,
        p_status: "paid",
        p_amount_cents: total,
        p_currency: "EUR",
        p_method: "ideal",
        p_paid_at: new Date().toISOString(),
        p_raw_payload: { id: realMollieId, status: "paid" },
      });
      const { data: inv2 } = await svc
        .from("invoices")
        .select("status, payment_record_id")
        .eq("id", inv2Id as string)
        .maybeSingle();
      results.push({
        name: "valid binding + matching amount flips invoice to paid",
        ok: inv2?.status === "paid" && !!inv2?.payment_record_id,
        detail: JSON.stringify(inv2),
      });
    }

    // --- attach must reject non-open invoice ------------------------------
    {
      const { error } = await svc.rpc("attach_mollie_payment_to_invoice", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_mollie_payment_id: `tr_test_paid_${stamp}`,
        p_checkout_url: "https://example.test/x",
        p_status: "open",
      });
      results.push({
        name: "attach_mollie_payment_to_invoice rejects already-paid invoice",
        ok: !!error,
        detail: error ? error.message : "no error returned",
      });
    }
  } finally {
    for (const iid of createdInvoiceIds) {
      await svc.from("invoice_lines").delete().eq("invoice_id", iid)
        .then(() => undefined, () => undefined);
      await svc.from("payment_records").delete().eq("invoice_id", iid)
        .then(() => undefined, () => undefined);
    }
    if (createdInvoiceIds.length) {
      await svc.from("invoices").delete().in("id", createdInvoiceIds)
        .then(() => undefined, () => undefined);
    }
    // Clean up our throwaway tenant_secret (uses unique per-run key name).
    await svc
      .from("tenant_secrets")
      .delete()
      .like("key", "test_mollie_key_%")
      .then(() => undefined, () => undefined);
    if (createdStudentIds.length) {
      await svc.from("students").delete().in("id", createdStudentIds)
        .then(() => undefined, () => undefined);
    }
    for (const uid of createdUserIds) {
      await svc.auth.admin.deleteUser(uid)
        .then(() => undefined, () => undefined);
    }
  }

  let pass = 0;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`${icon} ${r.name}  ${r.detail ? `— ${r.detail}` : ""}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} assertions passed`);
  if (pass !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
