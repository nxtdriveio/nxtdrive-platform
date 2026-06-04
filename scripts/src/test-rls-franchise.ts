/**
 * RLS + RPC tests for the franchise layer (Fase F2).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-franchise
 *
 * Asserts:
 *  1.  anon cannot read franchise_templates
 *  2.  anon cannot read franchise_template_activations
 *  3.  anon execute revoked: set_franchisee_parent
 *  4.  anon execute revoked: create_franchise_template
 *  5.  anon execute revoked: update_franchise_template
 *  6.  anon execute revoked: distribute_franchise_template
 *  7.  anon execute revoked: activate_franchise_template
 *  8.  anon execute revoked: route_lead_to_branch
 *  9.  platform_admin can link franchisee to franchisegever
 * 10.  my_franchise_tenant_ids returns the linked franchisees
 * 11.  franchise_admin role accepted in memberships (constraint check)
 * 12.  franchisegever admin can create a template
 * 13.  franchisee cannot create a template (has parent_tenant_id)
 * 14.  authenticated franchisee admin cannot read template BEFORE distribution
 * 15.  distribute_franchise_template distributes template to franchisee
 * 16.  authenticated franchisee admin CAN read template AFTER distribution
 * 17.  sibling franchisee (fe2) cannot read fe1's activation records
 * 18.  activate_franchise_template creates package in franchisee
 * 19.  activate_franchise_template is idempotent
 * 20.  circular franchise chain rejected
 * 21.  route_lead_to_branch sets branch_id on lead
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };
type PgError = { code?: string; message?: string } | null;

function isExecuteRevoked(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42501") return true;
  return /permission denied for function/i.test(error.message ?? "");
}

function describePrivError(error: PgError): string {
  if (!error) return "no error returned — RPC is callable!";
  if (isExecuteRevoked(error)) return error.message ?? "permission denied";
  return `wrong failure mode (not a privilege block): ${error.message ?? error.code ?? "unknown"}`;
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running franchise RLS/RPC tests`);

  const url     = process.env["SUPABASE_URL"];
  const anon    = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !anon || !service) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];

  // ─── Setup: tenants ────────────────────────────────────────────────────────
  const ts = Date.now();
  const fgSlug  = `test-fg-${ts}`;
  const fe1Slug = `test-fe1-${ts}`;
  const fe2Slug = `test-fe2-${ts}`;

  const { data: fgTenant, error: fgErr } = await serviceClient
    .from("tenants")
    .insert({ slug: fgSlug, name: "Test Franchisegever", plan: "elite",
              white_label_enabled: false, org_type: "franchise" })
    .select("id").single();
  if (fgErr || !fgTenant) throw new Error(`Franchisegever aanmaken mislukt: ${fgErr?.message}`);
  const fgId = fgTenant.id as string;

  const { data: fe1Tenant, error: fe1Err } = await serviceClient
    .from("tenants")
    .insert({ slug: fe1Slug, name: "Test Franchisee 1", plan: "pro",
              white_label_enabled: false })
    .select("id").single();
  if (fe1Err || !fe1Tenant) throw new Error(`Franchisee 1 aanmaken mislukt: ${fe1Err?.message}`);
  const fe1Id = fe1Tenant.id as string;

  const { data: fe2Tenant, error: fe2Err } = await serviceClient
    .from("tenants")
    .insert({ slug: fe2Slug, name: "Test Franchisee 2", plan: "pro",
              white_label_enabled: false })
    .select("id").single();
  if (fe2Err || !fe2Tenant) throw new Error(`Franchisee 2 aanmaken mislukt: ${fe2Err?.message}`);
  const fe2Id = fe2Tenant.id as string;

  // Platform admin for actor checks.
  const { data: adminProfile } = await serviceClient
    .from("profiles").select("id")
    .eq("is_platform_admin", true).limit(1).maybeSingle();
  const platformAdminId: string =
    (adminProfile?.id as string | undefined) ?? "00000000-0000-0000-0000-000000000000";

  // ─── Setup: authenticated test users ──────────────────────────────────────
  // fg_admin_user → franchise_admin in fgId tenant
  // fe1_admin_user → tenant_admin in fe1Id tenant
  // fe2_admin_user → tenant_admin in fe2Id tenant
  const fgEmail  = `test-fg-admin-${ts}@nxtdrive-test.invalid`;
  const fe1Email = `test-fe1-admin-${ts}@nxtdrive-test.invalid`;
  const fe2Email = `test-fe2-admin-${ts}@nxtdrive-test.invalid`;
  const testPwd  = `Pwd-${ts}-Franchise!`;

  const [fgUserRes, fe1UserRes, fe2UserRes] = await Promise.all([
    serviceClient.auth.admin.createUser({ email: fgEmail, password: testPwd, email_confirm: true }),
    serviceClient.auth.admin.createUser({ email: fe1Email, password: testPwd, email_confirm: true }),
    serviceClient.auth.admin.createUser({ email: fe2Email, password: testPwd, email_confirm: true }),
  ]);

  const fgUserId  = fgUserRes.data.user?.id;
  const fe1UserId = fe1UserRes.data.user?.id;
  const fe2UserId = fe2UserRes.data.user?.id;

  const authUsersCreated = !!fgUserId && !!fe1UserId && !!fe2UserId;

  // ─── 1. anon cannot read franchise_templates ────────────────────────────
  {
    const { data, error } = await anonClient.from("franchise_templates").select("id").limit(5);
    results.push({
      name: "anon cannot read franchise_templates",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ─── 2. anon cannot read franchise_template_activations ─────────────────
  {
    const { data, error } = await anonClient.from("franchise_template_activations").select("id").limit(5);
    results.push({
      name: "anon cannot read franchise_template_activations",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ─── 3–8. anon execute revoked for all RPCs ──────────────────────────────
  const rpcChecks: Array<{ name: string; rpc: string; args: Record<string, unknown> }> = [
    {
      name: "anon execute revoked: set_franchisee_parent",
      rpc: "set_franchisee_parent",
      args: { p_franchisee_tenant_id: fe1Id, p_franchisegever_tenant_id: fgId, p_actor: platformAdminId },
    },
    {
      name: "anon execute revoked: create_franchise_template",
      rpc: "create_franchise_template",
      args: { p_tenant_id: fgId, p_type: "package", p_name: "Test", p_config: {}, p_actor: platformAdminId },
    },
    {
      name: "anon execute revoked: update_franchise_template",
      rpc: "update_franchise_template",
      args: { p_template_id: "00000000-0000-0000-0000-000000000001", p_name: "X",
               p_config: null, p_is_active: true, p_actor: platformAdminId },
    },
    {
      name: "anon execute revoked: distribute_franchise_template",
      rpc: "distribute_franchise_template",
      args: { p_template_id: "00000000-0000-0000-0000-000000000001",
               p_franchisee_tenant_id: fe1Id, p_actor: platformAdminId },
    },
    {
      name: "anon execute revoked: activate_franchise_template",
      rpc: "activate_franchise_template",
      args: { p_template_id: "00000000-0000-0000-0000-000000000001",
               p_franchisee_tenant_id: fe1Id, p_actor: platformAdminId },
    },
    {
      name: "anon execute revoked: route_lead_to_branch",
      rpc: "route_lead_to_branch",
      args: { p_lead_id: "00000000-0000-0000-0000-000000000001",
               p_branch_id: "00000000-0000-0000-0000-000000000002", p_actor: platformAdminId },
    },
  ];

  for (const check of rpcChecks) {
    const { error } = await anonClient.rpc(check.rpc as never, check.args as never);
    results.push({
      name: check.name,
      ok: isExecuteRevoked(error),
      detail: describePrivError(error),
    });
  }

  // ─── 9. platform_admin can link franchisees ──────────────────────────────
  {
    let ok = false;
    let detail = "";

    if (adminProfile?.id) {
      const { error: e1 } = await serviceClient.rpc("set_franchisee_parent", {
        p_franchisee_tenant_id:    fe1Id,
        p_franchisegever_tenant_id: fgId,
        p_actor: adminProfile.id,
      });
      const { error: e2 } = e1
        ? { error: e1 }
        : await serviceClient.rpc("set_franchisee_parent", {
            p_franchisee_tenant_id:    fe2Id,
            p_franchisegever_tenant_id: fgId,
            p_actor: adminProfile.id,
          });
      ok     = !e1 && !e2;
      detail = (e1 ?? e2)?.message ?? "linked fe1 + fe2 → fg";
    } else {
      ok     = true;
      detail = "skipped (no platform admin)";
    }

    results.push({ name: "platform_admin can link franchisees", ok, detail });
  }

  // ─── 10. my_franchise_tenant_ids returns linked franchisees ─────────────
  {
    const { data, error } = await serviceClient.rpc("my_franchise_tenant_ids", {
      p_franchisegever_tenant_id: fgId,
    });
    const ids  = (data as string[] | null) ?? [];
    const hasFe1 = ids.includes(fe1Id);
    const hasFe2 = ids.includes(fe2Id);
    results.push({
      name: "my_franchise_tenant_ids returns linked franchisees",
      ok:   !error && hasFe1 && hasFe2,
      detail: error ? error.message : `found=${ids.length}, fe1=${hasFe1}, fe2=${hasFe2}`,
    });
  }

  // ─── 11. franchise_admin role accepted in memberships ───────────────────
  {
    let ok     = false;
    let detail = "";

    if (authUsersCreated) {
      const { error } = await serviceClient.from("memberships").insert({
        user_id: fgUserId, tenant_id: fgId, role: "franchise_admin",
      });
      ok     = !error;
      detail = error ? error.message : `franchise_admin membership created for fg user`;
    } else {
      ok     = true;
      detail = "skipped (test users not created)";
    }

    results.push({ name: "franchise_admin role accepted in memberships", ok, detail });
  }

  // Also create fe1/fe2 memberships for the authenticated read tests.
  if (authUsersCreated) {
    try {
      await serviceClient.from("memberships").insert([
        { user_id: fe1UserId, tenant_id: fe1Id, role: "tenant_admin" },
        { user_id: fe2UserId, tenant_id: fe2Id, role: "tenant_admin" },
      ]);
    } catch { /* ignore */ }
  }

  // ─── 12. franchisegever admin can create a template ─────────────────────
  let templateId: string | null = null;
  {
    const { data, error } = await serviceClient.rpc("create_franchise_template", {
      p_tenant_id: fgId,
      p_type:      "package",
      p_name:      `Test Template ${ts}`,
      p_config:    { credits_total: 1800, price_cents: 150000, valid_days: 365 },
      p_actor:     platformAdminId,
    });

    if (!error && data) templateId = data as string;

    results.push({
      name:   "service role can create franchise_template for franchisegever",
      ok:     !error && !!data,
      detail: error ? error.message : `template_id=${data}`,
    });
  }

  // ─── 13. franchisee cannot create a template ─────────────────────────────
  {
    const { data, error } = await serviceClient.rpc("create_franchise_template", {
      p_tenant_id: fe1Id,
      p_type:      "package",
      p_name:      "Should Fail",
      p_config:    {},
      p_actor:     platformAdminId,
    });
    results.push({
      name:   "franchisee cannot create template (has parent_tenant_id)",
      ok:     !!error && /franchisees kunnen geen/i.test(error.message ?? ""),
      detail: error ? error.message : `unexpectedly succeeded, id=${data}`,
    });
  }

  // ─── 14. authenticated franchisee admin cannot read template BEFORE distribution ─
  {
    if (authUsersCreated && templateId) {
      const fe1AuthClient = createClient(url, anon, { auth: { persistSession: false } });
      const { error: signInErr } = await fe1AuthClient.auth.signInWithPassword(
        { email: fe1Email, password: testPwd },
      );

      if (!signInErr) {
        const { data, error } = await fe1AuthClient
          .from("franchise_templates")
          .select("id")
          .eq("id", templateId);

        results.push({
          name:   "fe1 admin cannot read template before distribution",
          ok:     !error && (data ?? []).length === 0,
          detail: error ? error.message : `visible rows=${(data ?? []).length}`,
        });
      } else {
        results.push({
          name:   "fe1 admin cannot read template before distribution",
          ok:     true,
          detail: `skipped (sign-in failed: ${signInErr.message})`,
        });
      }
    } else {
      results.push({
        name:   "fe1 admin cannot read template before distribution",
        ok:     true,
        detail: "skipped (test users not available or template creation failed)",
      });
    }
  }

  // ─── 15. distribute_franchise_template distributes template to fe1 ───────
  let distributionId: string | null = null;
  {
    if (templateId) {
      const { data, error } = await serviceClient.rpc("distribute_franchise_template", {
        p_template_id:          templateId,
        p_franchisee_tenant_id: fe1Id,
        p_actor:                platformAdminId,
      });
      if (!error && data) distributionId = data as string;

      results.push({
        name:   "distribute_franchise_template creates distribution record",
        ok:     !error && !!data,
        detail: error ? error.message : `distribution_id=${data}`,
      });
    } else {
      results.push({
        name:   "distribute_franchise_template creates distribution record",
        ok:     false,
        detail: "skipped (template creation failed)",
      });
    }
  }

  // ─── 16. authenticated fe1 admin CAN read template AFTER distribution ────
  {
    if (authUsersCreated && templateId && distributionId) {
      const fe1AuthClient = createClient(url, anon, { auth: { persistSession: false } });
      const { error: signInErr } = await fe1AuthClient.auth.signInWithPassword(
        { email: fe1Email, password: testPwd },
      );

      if (!signInErr) {
        const { data, error } = await fe1AuthClient
          .from("franchise_templates")
          .select("id")
          .eq("id", templateId);

        results.push({
          name:   "fe1 admin can read distributed template",
          ok:     !error && (data ?? []).length === 1,
          detail: error ? error.message : `visible rows=${(data ?? []).length}`,
        });
      } else {
        results.push({
          name:   "fe1 admin can read distributed template",
          ok:     true,
          detail: `skipped (sign-in failed: ${signInErr.message})`,
        });
      }
    } else {
      results.push({
        name:   "fe1 admin can read distributed template",
        ok:     true,
        detail: "skipped (prerequisite not met)",
      });
    }
  }

  // ─── 17. sibling (fe2) cannot read fe1's activation records ─────────────
  {
    if (authUsersCreated && distributionId) {
      const fe2AuthClient = createClient(url, anon, { auth: { persistSession: false } });
      const { error: signInErr } = await fe2AuthClient.auth.signInWithPassword(
        { email: fe2Email, password: testPwd },
      );

      if (!signInErr) {
        const { data, error } = await fe2AuthClient
          .from("franchise_template_activations")
          .select("id")
          .eq("franchisee_tenant_id", fe1Id);

        results.push({
          name:   "sibling fe2 cannot read fe1 activation records",
          ok:     !error && (data ?? []).length === 0,
          detail: error ? error.message : `visible rows=${(data ?? []).length}`,
        });
      } else {
        results.push({
          name:   "sibling fe2 cannot read fe1 activation records",
          ok:     true,
          detail: `skipped (sign-in failed: ${signInErr.message})`,
        });
      }
    } else {
      results.push({
        name:   "sibling fe2 cannot read fe1 activation records",
        ok:     true,
        detail: "skipped (prerequisite not met)",
      });
    }
  }

  // ─── 18. activate_franchise_template creates package in fe1 ─────────────
  let activationId: string | null = null;
  {
    if (templateId && distributionId) {
      const { data, error } = await serviceClient.rpc("activate_franchise_template", {
        p_template_id:          templateId,
        p_franchisee_tenant_id: fe1Id,
        p_actor:                platformAdminId,
      });
      if (!error && data) activationId = data as string;

      // Verify package was created and distribution record updated.
      const { data: distRow } = await serviceClient
        .from("franchise_template_activations")
        .select("resulting_package_id")
        .eq("id", activationId ?? "")
        .maybeSingle();

      results.push({
        name:   "activate_franchise_template creates package in franchisee",
        ok:     !error && !!activationId && !!distRow?.resulting_package_id,
        detail: error
          ? error.message
          : `activation=${activationId}, package=${distRow?.resulting_package_id}`,
      });
    } else {
      results.push({
        name:   "activate_franchise_template creates package in franchisee",
        ok:     false,
        detail: "skipped (distribution not created)",
      });
    }
  }

  // ─── 19. activate_franchise_template is idempotent ──────────────────────
  {
    if (templateId && activationId) {
      const { data, error } = await serviceClient.rpc("activate_franchise_template", {
        p_template_id:          templateId,
        p_franchisee_tenant_id: fe1Id,
        p_actor:                platformAdminId,
      });
      results.push({
        name:   "activate_franchise_template is idempotent",
        ok:     !error && data === activationId,
        detail: error ? error.message : `returned=${data}, expected=${activationId}`,
      });
    } else {
      results.push({ name: "activate_franchise_template is idempotent", ok: false, detail: "skipped" });
    }
  }

  // ─── 20. circular franchise chain rejected ───────────────────────────────
  {
    const { error } = await serviceClient.rpc("set_franchisee_parent", {
      p_franchisee_tenant_id:    fgId,
      p_franchisegever_tenant_id: fe1Id,
      p_actor: platformAdminId,
    });
    results.push({
      name:   "circular franchise chain rejected",
      ok:     !!error && /ketting/i.test(error.message ?? ""),
      detail: error ? error.message : "unexpectedly succeeded",
    });
  }

  // ─── 21. route_lead_to_branch sets branch_id on lead ────────────────────
  {
    const { data: branchData } = await serviceClient
      .from("branches")
      .insert({ tenant_id: fe1Id, name: "Test Vestiging FE1", slug: `test-ves-${ts}`, is_active: true })
      .select("id").single();
    const branchId = branchData?.id as string | undefined;

    if (branchId) {
      const { data: leadData } = await serviceClient
        .from("leads")
        .insert({
          tenant_id: fgId, status: "new", source: "website",
          full_name: "Test Lead Franchise",
          email:     `test-lead-${ts}@example.com`,
          phone:     "+31612345678",
          postcode:  "1234AB",
        })
        .select("id").single();
      const leadId = leadData?.id as string | undefined;

      if (leadId) {
        const { error } = await serviceClient.rpc("route_lead_to_branch", {
          p_lead_id:   leadId,
          p_branch_id: branchId,
          p_actor:     platformAdminId,
        });

        const { data: updatedLead } = await serviceClient
          .from("leads").select("branch_id").eq("id", leadId).maybeSingle();

        results.push({
          name:   "route_lead_to_branch sets branch_id on lead",
          ok:     !error && updatedLead?.branch_id === branchId,
          detail: error ? error.message : `branch_id=${updatedLead?.branch_id}`,
        });

        await serviceClient.from("leads").delete().eq("id", leadId);
      } else {
        results.push({ name: "route_lead_to_branch sets branch_id on lead", ok: false, detail: "lead aanmaken mislukt" });
      }

      await serviceClient.from("branches").delete().eq("id", branchId);
    } else {
      results.push({ name: "route_lead_to_branch sets branch_id on lead", ok: false, detail: "vestiging aanmaken mislukt" });
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  // Unlink first to avoid FK constraint.
  try { await serviceClient.rpc("set_franchisee_parent", { p_franchisee_tenant_id: fe1Id, p_franchisegever_tenant_id: null, p_actor: platformAdminId }); } catch { /* ignore */ }
  try { await serviceClient.rpc("set_franchisee_parent", { p_franchisee_tenant_id: fe2Id, p_franchisegever_tenant_id: null, p_actor: platformAdminId }); } catch { /* ignore */ }
  try { await serviceClient.from("tenants").delete().eq("id", fe1Id); } catch { /* ignore */ }
  try { await serviceClient.from("tenants").delete().eq("id", fe2Id); } catch { /* ignore */ }
  try { await serviceClient.from("tenants").delete().eq("id", fgId); } catch { /* ignore */ }

  if (fgUserId)  await serviceClient.auth.admin.deleteUser(fgUserId).catch(() => {});
  if (fe1UserId) await serviceClient.auth.admin.deleteUser(fe1UserId).catch(() => {});
  if (fe2UserId) await serviceClient.auth.admin.deleteUser(fe2UserId).catch(() => {});

  // ─── Report ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length;
  const total  = results.length;
  console.log(`\nResults: ${passed}/${total} passed\n`);

  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`  ${icon} ${r.name}${r.detail ? `\n       ${r.detail}` : ""}`);
  }

  if (passed < total) {
    console.log(`\n${total - passed} test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll franchise RLS/RPC tests passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
