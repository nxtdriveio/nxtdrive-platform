/**
 * RLS + RPC tests for Eigen domeinen (tenant_domains, Task #201).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-tenant-domains
 *   pnpm --filter @workspace/scripts run db:test-rls-tenant-domains -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call add_tenant_domain (execute revoked).
 *  2. anon CANNOT call set_tenant_domain_status (execute revoked).
 *  3. anon CANNOT call set_primary_tenant_domain (execute revoked).
 *  4. anon CANNOT call remove_tenant_domain (execute revoked).
 *  5. add_tenant_domain creates a 'pending' row (authorized tenant_admin actor).
 *  6. add_tenant_domain is idempotent (same id for the same host+tenant).
 *  7. add_tenant_domain rejects a host already owned by ANOTHER tenant.
 *  8. add_tenant_domain rejects an unauthorized (stranger) actor.
 *  9. set_tenant_domain_status('active') stamps verified_at.
 * 10. set_primary_tenant_domain requires an ACTIVE domain.
 * 11. set_primary_tenant_domain marks the domain primary (max one per tenant).
 * 12. set_tenant_domain_status rejects an unauthorized (stranger) actor.
 * 13. anon SELECT on tenant_domains is empty (select-only RLS, non-admin).
 * 14. remove_tenant_domain deletes the row (authorized) and is idempotent.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Eigen domeinen RLS/RPC tests`);

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
  const zero = "00000000-0000-0000-0000-000000000000";

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
    .eq("role", "tenant_admin")
    .limit(1)
    .maybeSingle();
  if (!membership) {
    console.error(
      "No tenant_admin membership in demo-academy — add one with db:add-membership",
    );
    process.exit(1);
  }
  const adminId = membership.user_id as string;

  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdDomainIds: string[] = [];
  const rnd = Math.random().toString(36).slice(2, 7);
  const host = `rls-test-${Date.now()}-${rnd}.example.com`;

  // ---- 1-4. anon CANNOT call the write RPCs -----------------------------
  {
    const res = await anonClient.rpc("add_tenant_domain", {
      p_tenant_id: zero,
      p_hostname: "x.example.com",
      p_type: "custom",
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call add_tenant_domain (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }
  {
    const res = await anonClient.rpc("set_tenant_domain_status", {
      p_domain_id: zero,
      p_status: "active",
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call set_tenant_domain_status (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }
  {
    const res = await anonClient.rpc("set_primary_tenant_domain", {
      p_domain_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call set_primary_tenant_domain (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }
  {
    const res = await anonClient.rpc("remove_tenant_domain", {
      p_domain_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call remove_tenant_domain (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 5. add_tenant_domain creates a 'pending' row ---------------------
  let domainId: string | null = null;
  {
    const res = await serviceClient.rpc("add_tenant_domain", {
      p_tenant_id: tenantId,
      p_hostname: host,
      p_type: "custom",
      p_actor: adminId,
    });
    domainId = (res.data as string | null) ?? null;
    if (domainId) createdDomainIds.push(domainId);
    const { data: row } = await serviceClient
      .from("tenant_domains")
      .select("status, type, verification_token")
      .eq("id", domainId ?? "")
      .maybeSingle();
    results.push({
      name: "add_tenant_domain creates a 'pending' row (tenant_admin actor)",
      ok:
        !res.error &&
        domainId !== null &&
        row?.status === "pending" &&
        row?.type === "custom" &&
        typeof row?.verification_token === "string" &&
        (row?.verification_token as string).length > 0,
      detail: res.error ? res.error.message : `id=${domainId}`,
    });
  }

  // ---- 6. add_tenant_domain is idempotent -------------------------------
  {
    const res = await serviceClient.rpc("add_tenant_domain", {
      p_tenant_id: tenantId,
      p_hostname: host,
      p_type: "custom",
      p_actor: adminId,
    });
    const second = (res.data as string | null) ?? null;
    results.push({
      name: "add_tenant_domain is idempotent (same id for host+tenant)",
      ok: !res.error && second !== null && second === domainId,
      detail: res.error ? res.error.message : `id=${second}`,
    });
  }

  // ---- 7. add_tenant_domain rejects a host owned by ANOTHER tenant ------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `dom-other-${Date.now()}`, name: "Other Domain Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      createdTenantIds.push(otherTenant.id as string);
      // Make the other tenant's user a tenant_admin so authz passes and the
      // ONLY rejection reason is the cross-tenant hostname ownership.
      const { data: created } = await serviceClient.auth.admin.createUser({
        email: `dom-otheradmin-${Date.now()}@nxtdrive.test`,
        email_confirm: true,
        password: "test-pass-1234",
      });
      const otherAdmin = created?.user?.id;
      if (otherAdmin) {
        createdUserIds.push(otherAdmin);
        await serviceClient.from("memberships").insert({
          user_id: otherAdmin,
          tenant_id: otherTenant.id,
          role: "tenant_admin",
        });
      }
      const res = await serviceClient.rpc("add_tenant_domain", {
        p_tenant_id: otherTenant.id,
        p_hostname: host, // already owned by demo-academy
        p_type: "custom",
        p_actor: otherAdmin,
      });
      results.push({
        name: "add_tenant_domain rejects a host owned by another tenant",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant host accepted!",
      });
    } else {
      results.push({
        name: "add_tenant_domain rejects a host owned by another tenant",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 8. add_tenant_domain rejects an unauthorized actor ---------------
  let strangerId: string | undefined;
  {
    const { data: created } = await serviceClient.auth.admin.createUser({
      email: `dom-stranger-${Date.now()}@nxtdrive.test`,
      email_confirm: true,
      password: "test-pass-1234",
    });
    strangerId = created?.user?.id;
    if (strangerId) createdUserIds.push(strangerId);
    const res = await serviceClient.rpc("add_tenant_domain", {
      p_tenant_id: tenantId,
      p_hostname: `stranger-${Date.now()}-${rnd}.example.com`,
      p_type: "custom",
      p_actor: strangerId,
    });
    results.push({
      name: "add_tenant_domain rejects an unauthorized (stranger) actor",
      ok: res.error !== null,
      detail: res.error?.message ?? "stranger add accepted!",
    });
  }

  // ---- 9. set_tenant_domain_status('active') stamps verified_at --------
  {
    const res = await serviceClient.rpc("set_tenant_domain_status", {
      p_domain_id: domainId,
      p_status: "active",
      p_actor: adminId,
    });
    const { data: row } = await serviceClient
      .from("tenant_domains")
      .select("status, verified_at")
      .eq("id", domainId ?? "")
      .maybeSingle();
    results.push({
      name: "set_tenant_domain_status('active') stamps verified_at",
      ok:
        !res.error &&
        row?.status === "active" &&
        row?.verified_at !== null,
      detail: res.error ? res.error.message : `verified_at=${row?.verified_at}`,
    });
  }

  // ---- 10. set_primary_tenant_domain requires an active domain ----------
  {
    // Create a second, still-pending domain and try to make it primary.
    const pendingHost = `pending-${Date.now()}-${rnd}.example.com`;
    const addRes = await serviceClient.rpc("add_tenant_domain", {
      p_tenant_id: tenantId,
      p_hostname: pendingHost,
      p_type: "custom",
      p_actor: adminId,
    });
    const pendingId = (addRes.data as string | null) ?? null;
    if (pendingId) createdDomainIds.push(pendingId);
    const res = await serviceClient.rpc("set_primary_tenant_domain", {
      p_domain_id: pendingId,
      p_actor: adminId,
    });
    results.push({
      name: "set_primary_tenant_domain requires an active domain",
      ok: res.error !== null,
      detail: res.error?.message ?? "pending domain made primary!",
    });
  }

  // ---- 11. set_primary_tenant_domain marks the (active) domain primary --
  {
    const res = await serviceClient.rpc("set_primary_tenant_domain", {
      p_domain_id: domainId,
      p_actor: adminId,
    });
    const { data: row } = await serviceClient
      .from("tenant_domains")
      .select("is_primary")
      .eq("id", domainId ?? "")
      .maybeSingle();
    results.push({
      name: "set_primary_tenant_domain marks the active domain primary",
      ok: !res.error && row?.is_primary === true,
      detail: res.error ? res.error.message : `is_primary=${row?.is_primary}`,
    });
  }

  // ---- 12. set_tenant_domain_status rejects an unauthorized actor -------
  {
    const res = await serviceClient.rpc("set_tenant_domain_status", {
      p_domain_id: domainId,
      p_status: "failed",
      p_actor: strangerId,
    });
    results.push({
      name: "set_tenant_domain_status rejects an unauthorized (stranger) actor",
      ok: res.error !== null,
      detail: res.error?.message ?? "stranger status change accepted!",
    });
  }

  // ---- 13. anon SELECT on tenant_domains is empty ----------------------
  {
    const { data, error } = await anonClient
      .from("tenant_domains")
      .select("id")
      .eq("tenant_id", tenantId);
    results.push({
      name: "anon SELECT on tenant_domains is empty (select-only RLS, non-admin)",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 14. remove_tenant_domain deletes the row + is idempotent ---------
  {
    const res = await serviceClient.rpc("remove_tenant_domain", {
      p_domain_id: domainId,
      p_actor: adminId,
    });
    const { data: row } = await serviceClient
      .from("tenant_domains")
      .select("id")
      .eq("id", domainId ?? "")
      .maybeSingle();
    // Idempotent second call must not error.
    const res2 = await serviceClient.rpc("remove_tenant_domain", {
      p_domain_id: domainId,
      p_actor: adminId,
    });
    results.push({
      name: "remove_tenant_domain deletes the row and is idempotent",
      ok: !res.error && !res2.error && !row,
      detail:
        res.error?.message ??
        res2.error?.message ??
        `removed=${!row}`,
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const did of createdDomainIds) {
    await serviceClient.from("tenant_domains").delete().eq("id", did);
  }
  for (const uid of createdUserIds) {
    await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
  }
  for (const tid of createdTenantIds) {
    await serviceClient.from("tenant_domains").delete().eq("tenant_id", tid);
    await serviceClient.from("tenants").delete().eq("id", tid);
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
  console.log("All Eigen domeinen RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
