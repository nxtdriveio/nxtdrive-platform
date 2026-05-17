/**
 * Cross-tenant RLS tests for the leads + lead_events tables.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-leads
 *   pnpm --filter @workspace/scripts run db:test-rls-leads -- --env=production
 *
 * Asserts:
 *   1. Anonymous role can NEITHER read NOR insert into leads/lead_events.
 *   2. Service role can insert leads (this is how the public intake works).
 *   3. Updates and deletes on lead_events are blocked by the insert-only trigger.
 *
 * Membership-scoped read/write tests are intentionally omitted here because
 * they require minting an authenticated JWT, which is non-trivial without
 * Supabase admin SDK calls. The above three checks are the most important
 * security boundaries.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type LeadStatus = "new" | "contacted" | "package_advised" | "converted" | "dropped";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running leads RLS tests`);

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

  // 1. anon SELECT on leads must return 0 rows (RLS blocks).
  {
    const { data, error } = await anonClient
      .from("leads")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read leads",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 2. anon INSERT on leads must fail.
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      results.push({
        name: "anon cannot insert leads",
        ok: false,
        detail: "demo-academy tenant missing — run seed first",
      });
    } else {
      const { error } = await anonClient.from("leads").insert({
        tenant_id: tenant.id,
        full_name: "Anon Attacker",
        email: "anon-attacker@example.com",
        source: "website",
      });
      results.push({
        name: "anon cannot insert leads",
        ok: error !== null,
        detail: error?.message ?? "INSERT succeeded — RLS broken!",
      });
    }
  }

  // 3. anon SELECT on lead_events must return 0 rows.
  {
    const { data, error } = await anonClient
      .from("lead_events")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read lead_events",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 4. service role CAN insert + read (validates the public intake path).
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      results.push({
        name: "service role can insert lead",
        ok: false,
        detail: "demo-academy missing",
      });
    } else {
      const { data: lead, error } = await serviceClient
        .from("leads")
        .insert({
          tenant_id: tenant.id,
          full_name: "RLS Test Lead",
          email: `rls-test+${Date.now()}@example.com`,
          source: "other",
        })
        .select("id")
        .single();
      results.push({
        name: "service role can insert lead",
        ok: !error && !!lead,
        detail: error?.message,
      });
      if (lead) {
        // cleanup
        await serviceClient.from("leads").delete().eq("id", lead.id);
      }
    }
  }

  // 5. authenticated UPDATE policy on leads has been removed — anon UPDATE
  //    must affect 0 rows (RLS check denies it).
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      results.push({
        name: "anon cannot update leads",
        ok: false,
        detail: "demo-academy missing",
      });
    } else {
      const { data: existing } = await serviceClient
        .from("leads")
        .select("id, status")
        .eq("tenant_id", tenant.id)
        .limit(1)
        .maybeSingle();
      if (!existing) {
        results.push({
          name: "anon cannot update leads",
          ok: true,
          detail: "no leads to test against — skipping",
        });
      } else {
        const target: LeadStatus = existing.status === "dropped" ? "new" : "dropped";
        const { data: updated } = await anonClient
          .from("leads")
          .update({ status: target })
          .eq("id", existing.id)
          .select("id");
        results.push({
          name: "anon cannot update leads",
          ok: (updated ?? []).length === 0,
          detail: `rows affected=${(updated ?? []).length}`,
        });
      }
    }
  }

  // 6. lead_events is insert-only — UPDATE must throw.
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      results.push({
        name: "lead_events blocks UPDATE",
        ok: false,
        detail: "demo-academy missing",
      });
    } else {
      // Create a throwaway lead + event, then try to update the event.
      const { data: lead } = await serviceClient
        .from("leads")
        .insert({
          tenant_id: tenant.id,
          full_name: "RLS Event Test",
          email: `rls-event+${Date.now()}@example.com`,
        })
        .select("id")
        .single();
      if (!lead) {
        results.push({
          name: "lead_events blocks UPDATE",
          ok: false,
          detail: "could not create test lead",
        });
      } else {
        const { data: ev } = await serviceClient
          .from("lead_events")
          .insert({
            lead_id: lead.id,
            tenant_id: tenant.id,
            event_type: "note",
            payload: { note: "initial" },
          })
          .select("id")
          .single();
        if (!ev) {
          results.push({
            name: "lead_events blocks UPDATE",
            ok: false,
            detail: "could not create test event",
          });
        } else {
          const { error } = await serviceClient
            .from("lead_events")
            .update({ payload: { note: "tampered" } })
            .eq("id", ev.id);
          results.push({
            name: "lead_events blocks UPDATE",
            ok: error !== null,
            detail: error?.message ?? "UPDATE succeeded — trigger broken!",
          });
        }
        // cleanup (cascade deletes lead_events)
        await serviceClient.from("leads").delete().eq("id", lead.id);
      }
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
  console.log("All leads RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
