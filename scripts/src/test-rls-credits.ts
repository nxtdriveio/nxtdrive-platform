/**
 * Cross-tenant RLS + insert-only tests for credit_ledger + students.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-credits
 *   pnpm --filter @workspace/scripts run db:test-rls-credits -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read students, packages, or credit_ledger.
 *  2. Anonymous role cannot insert into students or credit_ledger.
 *  3. credit_ledger UPDATE and DELETE are blocked by the insert-only trigger.
 *  4. The grant_package RPC writes a ledger row + audit_log row atomically.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running credits RLS tests`);

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

  // 1. anon SELECT on protected tables must return 0 rows.
  for (const table of ["students", "packages", "credit_ledger"] as const) {
    const { data, error } = await anonClient.from(table).select("id").limit(5);
    results.push({
      name: `anon cannot read ${table}`,
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 1b. anon must not be able to read student_credit_balance (view).
  {
    const { data, error } = await anonClient
      .from("student_credit_balance")
      .select("student_id, balance")
      .limit(5);
    results.push({
      name: "anon cannot read student_credit_balance",
      ok: (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 2. anon INSERT on students must fail.
  {
    const { error } = await anonClient.from("students").insert({
      tenant_id: tenant.id,
      full_name: "Anon Student",
    });
    results.push({
      name: "anon cannot insert students",
      ok: error !== null,
      detail: error?.message ?? "INSERT succeeded — RLS broken!",
    });
  }

  // 3. anon INSERT on credit_ledger must fail.
  {
    const { data: student } = await serviceClient
      .from("students")
      .select("id")
      .eq("tenant_id", tenant.id)
      .limit(1)
      .maybeSingle();
    if (student) {
      const { error } = await anonClient.from("credit_ledger").insert({
        tenant_id: tenant.id,
        student_id: student.id,
        delta: 999,
        reason: "adjustment",
      });
      results.push({
        name: "anon cannot insert credit_ledger",
        ok: error !== null,
        detail: error?.message ?? "INSERT succeeded — RLS broken!",
      });
    }
  }

  // 4. credit_ledger blocks UPDATE and DELETE (insert-only trigger).
  {
    const { data: student } = await serviceClient
      .from("students")
      .select("id")
      .eq("tenant_id", tenant.id)
      .limit(1)
      .maybeSingle();
    if (!student) {
      results.push({
        name: "credit_ledger blocks UPDATE",
        ok: false,
        detail: "no demo student",
      });
    } else {
      const { data: row } = await serviceClient
        .from("credit_ledger")
        .insert({
          tenant_id: tenant.id,
          student_id: student.id,
          delta: 1,
          reason: "adjustment",
          note: "rls-test",
        })
        .select("id")
        .single();
      if (!row) {
        results.push({
          name: "credit_ledger blocks UPDATE",
          ok: false,
          detail: "could not insert test row",
        });
      } else {
        const upd = await serviceClient
          .from("credit_ledger")
          .update({ delta: 999 })
          .eq("id", row.id);
        results.push({
          name: "credit_ledger blocks UPDATE",
          ok: upd.error !== null,
          detail: upd.error?.message ?? "UPDATE succeeded — trigger broken!",
        });
        const del = await serviceClient
          .from("credit_ledger")
          .delete()
          .eq("id", row.id);
        results.push({
          name: "credit_ledger blocks DELETE",
          ok: del.error !== null,
          detail: del.error?.message ?? "DELETE succeeded — trigger broken!",
        });
      }
    }
  }

  // 5. grant_package RPC writes ledger + audit atomically.
  {
    // Set up a fresh student + package to avoid touching seed data.
    const { data: student } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenant.id,
        full_name: `RLS Test Student ${Date.now()}`,
      })
      .select("id")
      .single();
    const { data: pack } = await serviceClient
      .from("packages")
      .insert({
        tenant_id: tenant.id,
        name: `RLS Test Pack ${Date.now()}`,
        credits_total: 7,
        price_cents: 10000,
        active: true,
      })
      .select("id")
      .single();

    if (!student || !pack) {
      results.push({
        name: "grant_package RPC writes ledger + audit",
        ok: false,
        detail: "setup failed",
      });
    } else {
      const { error: rpcErr } = await serviceClient.rpc("grant_package", {
        p_student_id: student.id,
        p_tenant_id: tenant.id,
        p_actor: null,
        p_package_id: pack.id,
      });
      const { data: ledger } = await serviceClient
        .from("credit_ledger")
        .select("id, delta, reason")
        .eq("student_id", student.id);
      const { data: audit } = await serviceClient
        .from("audit_log")
        .select("id, action")
        .eq("target_id", student.id)
        .eq("action", "credits.granted");
      results.push({
        name: "grant_package RPC writes ledger + audit",
        ok:
          !rpcErr &&
          (ledger ?? []).length === 1 &&
          (ledger ?? [])[0]?.delta === 7 &&
          (audit ?? []).length === 1,
        detail: rpcErr
          ? rpcErr.message
          : `ledger_rows=${(ledger ?? []).length}, audit_rows=${(audit ?? []).length}`,
      });
      // cleanup
      await serviceClient.from("students").delete().eq("id", student.id);
      await serviceClient.from("packages").delete().eq("id", pack.id);
    }
  }

  // 6. convert_lead_to_student is idempotent — second call returns the same id.
  {
    const leadIns = await serviceClient
      .from("leads")
      .insert({
        tenant_id: tenant.id,
        full_name: `RLS Idem Lead ${Date.now()}`,
        email: `idem${Date.now()}@example.test`,
        status: "contacted",
      })
      .select("id")
      .single();
    const lead = leadIns.data;

    if (!lead) {
      results.push({
        name: "convert_lead_to_student is idempotent",
        ok: false,
        detail: leadIns.error?.message ?? "could not create test lead",
      });
    } else {
      const first = await serviceClient.rpc("convert_lead_to_student", {
        p_lead_id: lead.id,
        p_tenant_id: tenant.id,
        p_actor: null,
        p_package_id: null,
      });
      const second = await serviceClient.rpc("convert_lead_to_student", {
        p_lead_id: lead.id,
        p_tenant_id: tenant.id,
        p_actor: null,
        p_package_id: null,
      });
      results.push({
        name: "convert_lead_to_student is idempotent",
        ok:
          !first.error &&
          !second.error &&
          first.data !== null &&
          first.data === second.data,
        detail:
          first.error?.message ??
          second.error?.message ??
          `first=${first.data} second=${second.data}`,
      });
      // cleanup
      const studentId = (first.data ?? second.data) as string | null;
      if (studentId) {
        await serviceClient.from("students").delete().eq("id", studentId);
      }
      await serviceClient.from("leads").delete().eq("id", lead.id);
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
  console.log("All credits RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
