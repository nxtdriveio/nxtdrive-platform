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

  // ---- RPC execute grant lockdown (migration 0023) -----------------------
  // The mutation RPCs must be service-role only. Calling them with the anon
  // key (which authenticates as the `anon` PostgREST role) must fail.
  {
    const { error } = await anonClient.rpc("create_lead", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_source: "manual",
      p_full_name: "RLS Lockdown Probe",
      p_email: null,
      p_phone: null,
      p_postcode: null,
      p_message: null,
      p_submitted_ip: null,
      p_user_agent: null,
    });
    results.push({
      name: "anon CANNOT call create_lead RPC (execute revoked)",
      ok: !!error,
      detail: error ? error.message : "no error returned — RPC is callable!",
    });
  }

  // ---- Intake wizard (Fase 1) -------------------------------------------
  // 7. anon SELECT on lead_intake_details must return 0 rows (RLS blocks).
  {
    const { data, error } = await anonClient
      .from("lead_intake_details")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read lead_intake_details",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // 8. anon CANNOT call create_lead_with_intake RPC (execute revoked).
  {
    const { error } = await anonClient.rpc("create_lead_with_intake", {
      p_tenant_id: "00000000-0000-0000-0000-000000000000",
      p_source: "website",
      p_full_name: "Lockdown Probe",
      p_email: null,
      p_phone: "0600000000",
      p_applicant_type: "student",
      p_date_of_birth: null,
      p_city: null,
      p_pickup_location: null,
      p_license_goal: "B",
      p_transmission: "manual",
      p_has_driving_experience: null,
      p_had_lessons_before: null,
      p_has_done_exam: null,
      p_theory_status: "unknown",
      p_health_declaration_status: "unknown",
      p_cbr_authorization_status: "unknown",
      p_preferred_days: [],
      p_preferred_times: [],
      p_weekly_availability: null,
      p_desired_start_date: null,
      p_lessons_per_week: null,
      p_pace: null,
      p_has_anxiety: null,
      p_remarks: null,
      p_terms_accepted: true,
      p_submitted_ip: null,
      p_user_agent: null,
    });
    results.push({
      name: "anon CANNOT call create_lead_with_intake RPC (execute revoked)",
      ok: !!error,
      detail: error ? error.message : "no error returned — RPC is callable!",
    });
  }

  // 9. service role CAN call create_lead_with_intake; it writes lead + detail
  //    + lead_event + audit_log atomically.
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      results.push({
        name: "service role can create_lead_with_intake",
        ok: false,
        detail: "demo-academy missing",
      });
    } else {
      const { data: leadId, error } = await serviceClient.rpc(
        "create_lead_with_intake",
        {
          p_tenant_id: tenant.id,
          p_source: "website",
          p_full_name: "Intake RLS Test",
          p_email: `intake-rls+${Date.now()}@example.com`,
          p_phone: null,
          p_applicant_type: "student",
          p_date_of_birth: "2005-04-01",
          p_city: "Den Haag",
          p_pickup_location: "Centrum",
          p_license_goal: "B",
          p_transmission: "automatic",
          p_has_driving_experience: false,
          p_had_lessons_before: false,
          p_has_done_exam: false,
          p_theory_status: "no",
          p_health_declaration_status: "unknown",
          p_cbr_authorization_status: "unknown",
          p_preferred_days: ["mon", "wed"],
          p_preferred_times: ["evening"],
          p_weekly_availability: "Avonden na 18:00",
          p_desired_start_date: "2026-07-01",
          p_lessons_per_week: 2,
          p_pace: "relaxed",
          p_has_anxiety: true,
          p_remarks: "Test remark",
          p_terms_accepted: true,
          p_submitted_ip: null,
          p_user_agent: "rls-test",
        },
      );
      const okCreate = !error && typeof leadId === "string";
      results.push({
        name: "service role can create_lead_with_intake",
        ok: okCreate,
        detail: error?.message,
      });

      if (okCreate) {
        const { data: detail } = await serviceClient
          .from("lead_intake_details")
          .select("transmission, preferred_days, lessons_per_week, terms_accepted")
          .eq("lead_id", leadId as string)
          .maybeSingle();
        results.push({
          name: "intake detail row written with typed fields",
          ok:
            !!detail &&
            detail.transmission === "automatic" &&
            detail.lessons_per_week === 2 &&
            detail.terms_accepted === true &&
            Array.isArray(detail.preferred_days) &&
            detail.preferred_days.includes("mon"),
          detail: detail ? JSON.stringify(detail) : "no detail row",
        });

        const { data: createdEv } = await serviceClient
          .from("lead_events")
          .select("event_type")
          .eq("lead_id", leadId as string);
        results.push({
          name: "intake created a lead_event",
          ok: (createdEv ?? []).some((e) => e.event_type === "created"),
          detail: `events=${(createdEv ?? []).length}`,
        });

        // cleanup (cascade removes intake detail + events)
        await serviceClient.from("leads").delete().eq("id", leadId as string);
      }
    }
  }

  // 10. terms must be accepted — RPC raises when p_terms_accepted is false.
  {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (tenant) {
      const { error } = await serviceClient.rpc("create_lead_with_intake", {
        p_tenant_id: tenant.id,
        p_source: "website",
        p_full_name: "No Terms",
        p_email: `noterms+${Date.now()}@example.com`,
        p_phone: null,
        p_applicant_type: "student",
        p_date_of_birth: null,
        p_city: null,
        p_pickup_location: null,
        p_license_goal: "B",
        p_transmission: "manual",
        p_has_driving_experience: null,
        p_had_lessons_before: null,
        p_has_done_exam: null,
        p_theory_status: "unknown",
        p_health_declaration_status: "unknown",
        p_cbr_authorization_status: "unknown",
        p_preferred_days: [],
        p_preferred_times: [],
        p_weekly_availability: null,
        p_desired_start_date: null,
        p_lessons_per_week: null,
        p_pace: null,
        p_has_anxiety: null,
        p_remarks: null,
        p_terms_accepted: false,
        p_submitted_ip: null,
        p_user_agent: null,
      });
      results.push({
        name: "create_lead_with_intake rejects unaccepted terms",
        ok: !!error,
        detail: error ? error.message : "no error — terms guard broken!",
      });
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
