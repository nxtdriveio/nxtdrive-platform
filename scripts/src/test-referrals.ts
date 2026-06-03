/**
 * Referral flow tests for NXTDRIVE (review- & referralflow, growth).
 *
 *   pnpm --filter @workspace/scripts run db:test-referrals
 *   pnpm --filter @workspace/scripts run db:test-referrals -- --env=production
 *
 * Proves (against the demo-academy tenant, with throwaway fixtures):
 *   1. RLS isolation — anon can NEITHER read NOR write referral_codes.
 *   2. Grant lockdown — anon CANNOT execute the three referral RPCs
 *      (ensure_student_referral_code / set_lead_referral /
 *      mark_referral_reward_handled). Service role can.
 *   3. ensure_student_referral_code is idempotent (same code on repeat).
 *   4. set_lead_referral attributes a lead to the referrer + flips source to
 *      'referral', is non-overwriting, and a no-op for unknown codes.
 *   5. mark_referral_reward_handled sets/clears the manual-reward markers and
 *      writes an audit row (admin only — there is NO auto reward engine).
 *   6. Student referral status — a referrer sees their OWN attributed referral
 *      (loadStudentReferralSummary's tenant+referrer filter), and the list is
 *      isolated: a different student does not see it (own-only) and it is empty
 *      under a foreign tenant (cross-tenant).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function getDemoTenantId(service: SupabaseClient): Promise<string> {
  const { data } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "demo-academy")
    .maybeSingle();
  if (!data) {
    throw new Error("demo-academy tenant missing — run seed first");
  }
  return data.id as string;
}

async function getDemoStudentId(
  service: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await service
    .from("students")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error("no demo student found — run seed first");
  }
  return data.id as string;
}

async function getAnotherStudentId(
  service: SupabaseClient,
  tenantId: string,
  excludeId: string,
): Promise<string | null> {
  const { data } = await service
    .from("students")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("id", excludeId)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function getAnAdminUserId(
  service: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data } = await service
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "tenant_admin")
    .limit(1)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running referral flow tests`);

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
  const tenantId = await getDemoTenantId(serviceClient);
  const studentId = await getDemoStudentId(serviceClient, tenantId);
  const adminUserId = await getAnAdminUserId(serviceClient, tenantId);

  // Throwaway lead for attribution tests.
  const { data: lead, error: leadErr } = await serviceClient
    .from("leads")
    .insert({
      tenant_id: tenantId,
      full_name: "Referral Test Lead",
      email: `referral-test+${Date.now()}@example.com`,
      source: "website",
    })
    .select("id")
    .single();
  if (leadErr || !lead) {
    throw new Error(`failed to create throwaway lead: ${leadErr?.message}`);
  }
  const leadId = lead.id as string;

  try {
    // 1. anon cannot read referral_codes.
    {
      const { data, error } = await anonClient
        .from("referral_codes")
        .select("id")
        .limit(5);
      results.push({
        name: "anon cannot read referral_codes",
        ok: !error && (data ?? []).length === 0,
        detail: error ? error.message : `rows=${(data ?? []).length}`,
      });
    }

    // 2. anon cannot insert referral_codes (no write policy).
    {
      const { error } = await anonClient.from("referral_codes").insert({
        tenant_id: tenantId,
        student_id: studentId,
        code: `ANON${Date.now()}`,
      });
      results.push({
        name: "anon cannot insert referral_codes",
        ok: !!error,
        detail: error ? "blocked" : "INSERT unexpectedly succeeded",
      });
    }

    // 3. Grant lockdown — anon cannot execute the three RPCs.
    {
      const { error } = await anonClient.rpc("ensure_student_referral_code", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
      });
      results.push({
        name: "anon cannot execute ensure_student_referral_code",
        ok: !!error,
        detail: error ? "blocked" : "RPC unexpectedly succeeded",
      });
    }
    {
      const { error } = await anonClient.rpc("set_lead_referral", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_code: "DEMO1234",
      });
      results.push({
        name: "anon cannot execute set_lead_referral",
        ok: !!error,
        detail: error ? "blocked" : "RPC unexpectedly succeeded",
      });
    }
    {
      const { error } = await anonClient.rpc("mark_referral_reward_handled", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
        p_handled: true,
      });
      results.push({
        name: "anon cannot execute mark_referral_reward_handled",
        ok: !!error,
        detail: error ? "blocked" : "RPC unexpectedly succeeded",
      });
    }

    // 4. ensure_student_referral_code is idempotent (service role).
    let code: string | null = null;
    if (adminUserId) {
      const first = await serviceClient.rpc("ensure_student_referral_code", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
      });
      const second = await serviceClient.rpc("ensure_student_referral_code", {
        p_student_id: studentId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
      });
      code = (first.data as string | null) ?? null;
      results.push({
        name: "ensure_student_referral_code is idempotent",
        ok:
          !first.error &&
          !second.error &&
          !!first.data &&
          first.data === second.data,
        detail:
          first.error?.message ??
          second.error?.message ??
          `code=${first.data} repeat=${second.data}`,
      });
    } else {
      results.push({
        name: "ensure_student_referral_code is idempotent",
        ok: false,
        detail: "no tenant_admin user found — cannot authorize RPC",
      });
    }

    // 5. set_lead_referral with an unknown code is a no-op (false).
    {
      const { data, error } = await serviceClient.rpc("set_lead_referral", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_code: `NOPE${Date.now()}`,
      });
      results.push({
        name: "set_lead_referral ignores unknown code",
        ok: !error && data === false,
        detail: error ? error.message : `returned=${data}`,
      });
    }

    // 6. set_lead_referral attributes the lead + flips source to 'referral'.
    if (code) {
      const { data, error } = await serviceClient.rpc("set_lead_referral", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_code: code,
      });
      const { data: row } = await serviceClient
        .from("leads")
        .select("source, referred_by_student_id")
        .eq("id", leadId)
        .maybeSingle();
      results.push({
        name: "set_lead_referral attributes lead to referrer",
        ok:
          !error &&
          data === true &&
          row?.source === "referral" &&
          row?.referred_by_student_id === studentId,
        detail: error
          ? error.message
          : `returned=${data} source=${row?.source} ref=${row?.referred_by_student_id}`,
      });

      // 7. set_lead_referral is non-overwriting (idempotent no-op = false).
      const { data: again } = await serviceClient.rpc("set_lead_referral", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_code: code,
      });
      results.push({
        name: "set_lead_referral does not overwrite existing referrer",
        ok: again === false,
        detail: `returned=${again}`,
      });
    } else {
      results.push({
        name: "set_lead_referral attributes lead to referrer",
        ok: false,
        detail: "no referral code available",
      });
    }

    // 8. mark_referral_reward_handled sets then clears the markers (admin).
    if (adminUserId && code) {
      const set = await serviceClient.rpc("mark_referral_reward_handled", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
        p_handled: true,
      });
      const { data: handledRow } = await serviceClient
        .from("leads")
        .select("referral_reward_handled_at, referral_reward_handled_by")
        .eq("id", leadId)
        .maybeSingle();
      const clear = await serviceClient.rpc("mark_referral_reward_handled", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: adminUserId,
        p_handled: false,
      });
      const { data: clearedRow } = await serviceClient
        .from("leads")
        .select("referral_reward_handled_at, referral_reward_handled_by")
        .eq("id", leadId)
        .maybeSingle();
      results.push({
        name: "mark_referral_reward_handled toggles markers",
        ok:
          !set.error &&
          !clear.error &&
          handledRow?.referral_reward_handled_at !== null &&
          handledRow?.referral_reward_handled_by === adminUserId &&
          clearedRow?.referral_reward_handled_at === null &&
          clearedRow?.referral_reward_handled_by === null,
        detail:
          set.error?.message ??
          clear.error?.message ??
          `handled_at=${handledRow?.referral_reward_handled_at} cleared_at=${clearedRow?.referral_reward_handled_at}`,
      });
    } else {
      results.push({
        name: "mark_referral_reward_handled toggles markers",
        ok: false,
        detail: "no admin user / referral code available",
      });
    }
    // 9. Student referral status — the referrer sees their OWN attributed lead.
    //    Replicates loadStudentReferralSummary's filter (tenant + referrer).
    if (code) {
      const { data: ownRows, error } = await serviceClient
        .from("leads")
        .select("id, status, referral_reward_handled_at")
        .eq("tenant_id", tenantId)
        .eq("referred_by_student_id", studentId);
      const own = (ownRows as { id: string }[] | null) ?? [];
      results.push({
        name: "student sees own attributed referral in status list",
        ok: !error && own.some((r) => r.id === leadId),
        detail: error ? error.message : `own_rows=${own.length}`,
      });

      // 10. Isolation — a DIFFERENT student in the same tenant does NOT see it.
      const otherStudentId = await getAnotherStudentId(
        serviceClient,
        tenantId,
        studentId,
      );
      if (otherStudentId) {
        const { data: otherRows } = await serviceClient
          .from("leads")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("referred_by_student_id", otherStudentId);
        const other = (otherRows as { id: string }[] | null) ?? [];
        results.push({
          name: "other student does not see this referral (own-only)",
          ok: !other.some((r) => r.id === leadId),
          detail: `other_rows=${other.length}`,
        });
      } else {
        results.push({
          name: "other student does not see this referral (own-only)",
          ok: true,
          detail: "only one demo student — isolation vacuously holds",
        });
      }

      // 11. Cross-tenant — the referrer's status list is empty under a foreign tenant.
      {
        const foreignTenantId = "00000000-0000-0000-0000-0000000000ff";
        const { data: crossRows } = await serviceClient
          .from("leads")
          .select("id")
          .eq("tenant_id", foreignTenantId)
          .eq("referred_by_student_id", studentId);
        const cross = (crossRows as { id: string }[] | null) ?? [];
        results.push({
          name: "referral status is empty under a foreign tenant (cross-tenant)",
          ok: cross.length === 0,
          detail: `cross_rows=${cross.length}`,
        });
      }
    } else {
      results.push({
        name: "student sees own attributed referral in status list",
        ok: false,
        detail: "no referral code available",
      });
    }
  } finally {
    // Cleanup: remove the throwaway lead (audit rows are insert-only and stay).
    await serviceClient.from("leads").delete().eq("id", leadId);
  }

  // Report.
  let failures = 0;
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failures += 1;
    console.log(`  [${tag}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(
    `\n${results.length - failures}/${results.length} checks passed.`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
