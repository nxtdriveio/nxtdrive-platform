/**
 * RLS + RPC tests for trial lessons (Fase 2 — Slimme Proeflesplanner).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-trial-lessons
 *   pnpm --filter @workspace/scripts run db:test-rls-trial-lessons -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read trial_lessons.
 *  2. book_trial_lesson stores a `provisional` row and NEVER touches credit_ledger.
 *  3. A second overlapping provisional booking is blocked by the exclusion constraint.
 *  4. confirm_trial_lesson moves provisional → confirmed.
 *  5. reschedule_trial_lesson moves the slot.
 *  6. reject_trial_lesson moves a row → rejected.
 *  7. Cross-tenant lead rejected by book_trial_lesson.
 *  8. Unauthorized actor rejected by confirm_trial_lesson.
 *  9. anon CANNOT call the mutation RPCs (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running trial-lesson RLS/RPC tests`);

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
  const tenantId: string = tenant.id;

  const { data: membership } = await serviceClient
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["tenant_admin", "instructor"])
    .limit(1)
    .maybeSingle();
  if (!membership) {
    console.error(
      "No tenant_admin/instructor membership in demo-academy — add one with db:add-membership",
    );
    process.exit(1);
  }
  const instructorId = membership.user_id as string;

  // Helper: create a fresh lead in a tenant.
  async function makeLead(tid: string): Promise<string> {
    const { data, error } = await serviceClient
      .from("leads")
      .insert({
        tenant_id: tid,
        status: "new",
        source: "website",
        full_name: `Trial Lead ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        email: `trial-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@nxtdrive.test`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeLead failed: ${error?.message}`);
    return data.id as string;
  }

  // Base time well into the future, on a clean hour, to avoid overlaps.
  function future(daysAhead: number, hourUtc = 10): string {
    const d = new Date();
    d.setUTCHours(hourUtc, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString();
  }

  const leadId = await makeLead(tenantId);
  const createdLeadIds: string[] = [leadId];

  // ---- 1. anon cannot read trial_lessons ---------------------------------
  {
    const { data, error } = await anonClient
      .from("trial_lessons")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read trial_lessons",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. book_trial_lesson → provisional, no credit_ledger --------------
  let trialId: string | null = null;
  {
    const { count: ledgerBefore } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    const booked = await serviceClient.rpc("book_trial_lesson", {
      p_lead_id: leadId,
      p_tenant_id: tenantId,
      p_instructor_id: instructorId,
      p_starts_at: future(7),
      p_duration_min: 60,
      p_pickup_location: "Teststraat 1",
      p_score: 55,
      p_reason: "voorkeursdag + voorkeurstijd",
    });
    trialId = (booked.data as string | null) ?? null;

    const { data: row } = await serviceClient
      .from("trial_lessons")
      .select("status, lead_id, score")
      .eq("id", trialId ?? "")
      .maybeSingle();
    const { count: ledgerAfter } = await serviceClient
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    results.push({
      name: "book_trial_lesson stores provisional + no credit_ledger write",
      ok:
        !booked.error &&
        trialId !== null &&
        row?.status === "provisional" &&
        (ledgerBefore ?? 0) === (ledgerAfter ?? -1),
      detail: booked.error
        ? booked.error.message
        : `status=${row?.status} ledger ${ledgerBefore}→${ledgerAfter}`,
    });
  }

  // ---- 3. overlapping provisional booking blocked ------------------------
  {
    const lead2 = await makeLead(tenantId);
    createdLeadIds.push(lead2);
    // Overlaps the 7-day 10:00 booking by starting 30 min in.
    const overlap = new Date(Date.parse(future(7)) + 30 * 60 * 1000).toISOString();
    const dup = await serviceClient.rpc("book_trial_lesson", {
      p_lead_id: lead2,
      p_tenant_id: tenantId,
      p_instructor_id: instructorId,
      p_starts_at: overlap,
      p_duration_min: 60,
      p_pickup_location: null,
      p_score: 0,
      p_reason: null,
    });
    results.push({
      name: "overlapping provisional trial blocked",
      ok: dup.error !== null,
      detail: dup.error?.message ?? "overlap was accepted!",
    });
  }

  // ---- 4. confirm_trial_lesson: provisional → confirmed ------------------
  {
    if (!trialId) {
      results.push({
        name: "confirm_trial_lesson provisional → confirmed",
        ok: false,
        detail: "no trial to confirm",
      });
    } else {
      const res = await serviceClient.rpc("confirm_trial_lesson", {
        p_trial_id: trialId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
      });
      const { data: row } = await serviceClient
        .from("trial_lessons")
        .select("status")
        .eq("id", trialId)
        .maybeSingle();
      results.push({
        name: "confirm_trial_lesson provisional → confirmed",
        ok: !res.error && row?.status === "confirmed",
        detail: res.error?.message ?? `status=${row?.status}`,
      });
    }
  }

  // ---- 5. reschedule_trial_lesson moves the slot -------------------------
  {
    if (!trialId) {
      results.push({
        name: "reschedule_trial_lesson moves the slot",
        ok: false,
        detail: "no trial to reschedule",
      });
    } else {
      const newStart = future(9, 14);
      const res = await serviceClient.rpc("reschedule_trial_lesson", {
        p_trial_id: trialId,
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_starts_at: newStart,
        p_duration_min: 90,
        p_pickup_location: "Nieuw adres 2",
      });
      const { data: row } = await serviceClient
        .from("trial_lessons")
        .select("starts_at, duration_min, pickup_location")
        .eq("id", trialId)
        .maybeSingle();
      results.push({
        name: "reschedule_trial_lesson moves the slot",
        ok:
          !res.error &&
          row != null &&
          Date.parse(row.starts_at) === Date.parse(newStart) &&
          row.duration_min === 90,
        detail: res.error
          ? res.error.message
          : `starts_at=${row?.starts_at} dur=${row?.duration_min}`,
      });
    }
  }

  // ---- 6. reject_trial_lesson → rejected ---------------------------------
  {
    const lead3 = await makeLead(tenantId);
    createdLeadIds.push(lead3);
    const booked = await serviceClient.rpc("book_trial_lesson", {
      p_lead_id: lead3,
      p_tenant_id: tenantId,
      p_instructor_id: instructorId,
      p_starts_at: future(12, 11),
      p_duration_min: 60,
      p_pickup_location: null,
      p_score: 10,
      p_reason: null,
    });
    const rid = (booked.data as string | null) ?? null;
    const res = rid
      ? await serviceClient.rpc("reject_trial_lesson", {
          p_trial_id: rid,
          p_tenant_id: tenantId,
          p_actor: instructorId,
          p_reason: "leerling komt niet opdagen",
        })
      : { error: new Error("no trial booked") };
    const { data: row } = rid
      ? await serviceClient
          .from("trial_lessons")
          .select("status")
          .eq("id", rid)
          .maybeSingle()
      : { data: null };
    results.push({
      name: "reject_trial_lesson → rejected",
      ok: !res.error && row?.status === "rejected",
      detail: res.error?.message ?? `status=${row?.status}`,
    });
  }

  // ---- 6b. confirmed trial blocks a new booking --------------------------
  {
    // A lead with a CONFIRMED trial may not get a second booking — it must be
    // cancelled/rejected first (guard added in migration 0038).
    const lead4 = await makeLead(tenantId);
    createdLeadIds.push(lead4);
    const booked = await serviceClient.rpc("book_trial_lesson", {
      p_lead_id: lead4,
      p_tenant_id: tenantId,
      p_instructor_id: instructorId,
      p_starts_at: future(18, 11),
      p_duration_min: 60,
      p_pickup_location: null,
      p_score: 5,
      p_reason: null,
    });
    const bid = (booked.data as string | null) ?? null;
    const confirmed = bid
      ? await serviceClient.rpc("confirm_trial_lesson", {
          p_trial_id: bid,
          p_tenant_id: tenantId,
          p_actor: instructorId,
        })
      : { error: new Error("no trial booked") };
    if (confirmed.error) {
      results.push({
        name: "confirmed trial blocks new booking",
        ok: false,
        detail: `setup failed: ${confirmed.error.message}`,
      });
    } else {
      const res = await serviceClient.rpc("book_trial_lesson", {
        p_lead_id: lead4,
        p_tenant_id: tenantId,
        p_instructor_id: instructorId,
        p_starts_at: future(20, 16),
        p_duration_min: 60,
        p_pickup_location: null,
        p_score: 0,
        p_reason: null,
      });
      results.push({
        name: "confirmed trial blocks new booking",
        ok: res.error !== null,
        detail: res.error?.message ?? "second booking accepted!",
      });
    }
  }

  // ---- 7. cross-tenant lead rejected -------------------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `trial-other-${Date.now()}`, name: "Other Trial Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      const foreignLead = await makeLead(otherTenant.id);
      const cross = await serviceClient.rpc("book_trial_lesson", {
        p_lead_id: foreignLead,
        p_tenant_id: tenantId, // mismatch — lead is in otherTenant
        p_instructor_id: instructorId,
        p_starts_at: future(15),
        p_duration_min: 60,
        p_pickup_location: null,
        p_score: 0,
        p_reason: null,
      });
      results.push({
        name: "cross-tenant lead rejected by book_trial_lesson",
        ok: cross.error !== null,
        detail: cross.error?.message ?? "cross-tenant accepted!",
      });
      await serviceClient.from("leads").delete().eq("id", foreignLead);
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    }
  }

  // ---- 8. unauthorized actor rejected by confirm -------------------------
  {
    const email = `trial-noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    // Need a fresh provisional trial to attempt confirming.
    const lead4 = await makeLead(tenantId);
    createdLeadIds.push(lead4);
    const booked = await serviceClient.rpc("book_trial_lesson", {
      p_lead_id: lead4,
      p_tenant_id: tenantId,
      p_instructor_id: instructorId,
      p_starts_at: future(18, 9),
      p_duration_min: 60,
      p_pickup_location: null,
      p_score: 0,
      p_reason: null,
    });
    const rid = (booked.data as string | null) ?? null;
    if (strangerId && rid) {
      const res = await serviceClient.rpc("confirm_trial_lesson", {
        p_trial_id: rid,
        p_tenant_id: tenantId,
        p_actor: strangerId,
      });
      results.push({
        name: "unauthorized actor rejected by confirm_trial_lesson",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 9. anon CANNOT call the mutation RPCs (execute revoked) -----------
  {
    const zero = "00000000-0000-0000-0000-000000000000";
    const book = await anonClient.rpc("book_trial_lesson", {
      p_lead_id: zero,
      p_tenant_id: zero,
      p_instructor_id: zero,
      p_starts_at: new Date().toISOString(),
      p_duration_min: 60,
      p_pickup_location: null,
      p_score: 0,
      p_reason: null,
    });
    results.push({
      name: "anon CANNOT call book_trial_lesson RPC (execute revoked)",
      ok: book.error !== null,
      detail: book.error ? book.error.message : "RPC is callable!",
    });

    const confirm = await anonClient.rpc("confirm_trial_lesson", {
      p_trial_id: zero,
      p_tenant_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call confirm_trial_lesson RPC (execute revoked)",
      ok: confirm.error !== null,
      detail: confirm.error ? confirm.error.message : "RPC is callable!",
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const lid of createdLeadIds) {
    await serviceClient.from("trial_lessons").delete().eq("lead_id", lid);
    await serviceClient.from("leads").delete().eq("id", lid);
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
  console.log("All trial-lesson RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
