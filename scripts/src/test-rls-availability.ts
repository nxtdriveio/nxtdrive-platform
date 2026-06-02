/**
 * RLS + RPC tests for instructor availability (Module 3 — Beschikbaarheid).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-availability
 *   pnpm --filter @workspace/scripts run db:test-rls-availability -- --env=production
 *
 * Asserts:
 *  1. Anonymous role cannot read instructor_availability.
 *  2. Anonymous role cannot read instructor_availability_exception.
 *  3. set_instructor_weekly_availability replaces the instructor's weekly blocks.
 *  4. Overlapping weekly blocks for the same weekday are rejected (gist exclusion).
 *  5. upsert_availability_exception stores a blocked whole-day exception.
 *  6. upsert_availability_exception stores an 'available' timed exception.
 *  7. delete_availability_exception removes a row.
 *  8. Unauthorized actor rejected by set_instructor_weekly_availability.
 *  9. Cross-tenant instructor rejected by set_instructor_weekly_availability.
 * 10. set_student_daypart_preference writes preferred_dayparts.
 * 11. anon CANNOT call any of the mutation RPCs (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running availability RLS/RPC tests`);

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

  // Clean any leftovers from a previous run for this instructor.
  await serviceClient
    .from("instructor_availability")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId);
  await serviceClient
    .from("instructor_availability_exception")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId);

  // A future date key (YYYY-MM-DD) for exception tests.
  function futureDateKey(daysAhead: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  }

  // ---- 1. anon cannot read instructor_availability -----------------------
  {
    const { data, error } = await anonClient
      .from("instructor_availability")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read instructor_availability",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 2. anon cannot read instructor_availability_exception -------------
  {
    const { data, error } = await anonClient
      .from("instructor_availability_exception")
      .select("id")
      .limit(5);
    results.push({
      name: "anon cannot read instructor_availability_exception",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 3. set_instructor_weekly_availability replaces blocks -------------
  {
    const res = await serviceClient.rpc("set_instructor_weekly_availability", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_blocks: [
        { weekday: 1, start_min: 540, end_min: 720 }, // Mon 09:00-12:00
        { weekday: 1, start_min: 780, end_min: 1020 }, // Mon 13:00-17:00
        { weekday: 3, start_min: 600, end_min: 900 }, // Wed 10:00-15:00
      ],
    });
    const { data: rows } = await serviceClient
      .from("instructor_availability")
      .select("weekday, start_min, end_min")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId);
    results.push({
      name: "set_instructor_weekly_availability stores blocks",
      ok: !res.error && (rows ?? []).length === 3,
      detail: res.error?.message ?? `rows=${(rows ?? []).length}`,
    });

    // Re-run with a smaller set → must REPLACE, not append.
    const res2 = await serviceClient.rpc(
      "set_instructor_weekly_availability",
      {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_instructor_id: instructorId,
        p_blocks: [{ weekday: 1, start_min: 540, end_min: 720 }],
      },
    );
    const { data: rows2 } = await serviceClient
      .from("instructor_availability")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId);
    results.push({
      name: "set_instructor_weekly_availability replaces (not appends)",
      ok: !res2.error && (rows2 ?? []).length === 1,
      detail: res2.error?.message ?? `rows=${(rows2 ?? []).length}`,
    });
  }

  // ---- 4. overlapping weekly blocks rejected ----------------------------
  {
    const res = await serviceClient.rpc("set_instructor_weekly_availability", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_blocks: [
        { weekday: 2, start_min: 540, end_min: 720 },
        { weekday: 2, start_min: 660, end_min: 900 }, // overlaps previous
      ],
    });
    results.push({
      name: "overlapping weekly blocks rejected (gist exclusion)",
      ok: res.error !== null,
      detail: res.error?.message ?? "overlap was accepted!",
    });
    // Restore a known-good single block for later isolation.
    await serviceClient.rpc("set_instructor_weekly_availability", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_blocks: [{ weekday: 1, start_min: 540, end_min: 720 }],
    });
  }

  // ---- 5. upsert blocked whole-day exception ----------------------------
  let blockedExcId: string | null = null;
  {
    const date = futureDateKey(10);
    const res = await serviceClient.rpc("upsert_availability_exception", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_id: null,
      p_exception_date: date,
      p_kind: "blocked",
      p_start_min: null,
      p_end_min: null,
      p_note: "vakantie",
    });
    blockedExcId = (res.data as string | null) ?? null;
    const { data: row } = await serviceClient
      .from("instructor_availability_exception")
      .select("kind, start_min, end_min")
      .eq("id", blockedExcId ?? "")
      .maybeSingle();
    results.push({
      name: "upsert blocked whole-day exception",
      ok:
        !res.error &&
        blockedExcId !== null &&
        row?.kind === "blocked" &&
        row?.start_min === null &&
        row?.end_min === null,
      detail: res.error?.message ?? `kind=${row?.kind}`,
    });
  }

  // ---- 6. upsert 'available' timed exception ----------------------------
  {
    const date = futureDateKey(11);
    const res = await serviceClient.rpc("upsert_availability_exception", {
      p_tenant_id: tenantId,
      p_actor: instructorId,
      p_instructor_id: instructorId,
      p_id: null,
      p_exception_date: date,
      p_kind: "available",
      p_start_min: 1080, // 18:00
      p_end_min: 1200, // 20:00
      p_note: "extra avond",
    });
    const { data: row } = await serviceClient
      .from("instructor_availability_exception")
      .select("kind, start_min, end_min")
      .eq("id", (res.data as string | null) ?? "")
      .maybeSingle();
    results.push({
      name: "upsert 'available' timed exception",
      ok:
        !res.error &&
        row?.kind === "available" &&
        row?.start_min === 1080 &&
        row?.end_min === 1200,
      detail: res.error?.message ?? `kind=${row?.kind} ${row?.start_min}-${row?.end_min}`,
    });
  }

  // ---- 7. delete_availability_exception ---------------------------------
  {
    if (!blockedExcId) {
      results.push({
        name: "delete_availability_exception removes a row",
        ok: false,
        detail: "no exception to delete",
      });
    } else {
      const res = await serviceClient.rpc("delete_availability_exception", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_id: blockedExcId,
      });
      const { data: row } = await serviceClient
        .from("instructor_availability_exception")
        .select("id")
        .eq("id", blockedExcId)
        .maybeSingle();
      results.push({
        name: "delete_availability_exception removes a row",
        ok: !res.error && row === null,
        detail: res.error?.message ?? (row ? "row still present" : "deleted"),
      });
    }
  }

  // ---- 8. unauthorized actor rejected -----------------------------------
  {
    const email = `avail-noaccess-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) {
      const res = await serviceClient.rpc(
        "set_instructor_weekly_availability",
        {
          p_tenant_id: tenantId,
          p_actor: strangerId,
          p_instructor_id: instructorId,
          p_blocks: [{ weekday: 5, start_min: 540, end_min: 600 }],
        },
      );
      results.push({
        name: "unauthorized actor rejected by set_instructor_weekly_availability",
        ok: res.error !== null,
        detail: res.error?.message ?? "unauthorized actor accepted!",
      });
      await serviceClient.auth.admin.deleteUser(strangerId);
    }
  }

  // ---- 9. cross-tenant instructor rejected ------------------------------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `avail-other-${Date.now()}`, name: "Other Avail Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      const res = await serviceClient.rpc(
        "set_instructor_weekly_availability",
        {
          p_tenant_id: otherTenant.id, // instructor is NOT a member here
          p_actor: instructorId,
          p_instructor_id: instructorId,
          p_blocks: [{ weekday: 5, start_min: 540, end_min: 600 }],
        },
      );
      results.push({
        name: "cross-tenant instructor rejected by set_instructor_weekly_availability",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant accepted!",
      });
      await serviceClient.from("tenants").delete().eq("id", otherTenant.id);
    }
  }

  // ---- 10. set_student_daypart_preference -------------------------------
  {
    const { data: student } = await serviceClient
      .from("students")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!student) {
      results.push({
        name: "set_student_daypart_preference writes preferred_dayparts",
        ok: false,
        detail: "no student in demo-academy",
      });
    } else {
      const res = await serviceClient.rpc("set_student_daypart_preference", {
        p_tenant_id: tenantId,
        p_actor: instructorId,
        p_student_id: student.id,
        p_dayparts: ["evening", "weekend"],
      });
      const { data: row } = await serviceClient
        .from("students")
        .select("preferred_dayparts")
        .eq("id", student.id)
        .maybeSingle();
      const prefs = (row?.preferred_dayparts as string[] | null) ?? [];
      results.push({
        name: "set_student_daypart_preference writes preferred_dayparts",
        ok:
          !res.error &&
          prefs.includes("evening") &&
          prefs.includes("weekend"),
        detail: res.error?.message ?? `prefs=${JSON.stringify(prefs)}`,
      });
    }
  }

  // ---- 11. anon CANNOT call the mutation RPCs (execute revoked) ----------
  {
    const zero = "00000000-0000-0000-0000-000000000000";
    const setWeekly = await anonClient.rpc(
      "set_instructor_weekly_availability",
      {
        p_tenant_id: zero,
        p_actor: zero,
        p_instructor_id: zero,
        p_blocks: [],
      },
    );
    results.push({
      name: "anon CANNOT call set_instructor_weekly_availability (execute revoked)",
      ok: setWeekly.error !== null,
      detail: setWeekly.error ? setWeekly.error.message : "RPC is callable!",
    });

    const upsert = await anonClient.rpc("upsert_availability_exception", {
      p_tenant_id: zero,
      p_actor: zero,
      p_instructor_id: zero,
      p_id: null,
      p_exception_date: futureDateKey(5),
      p_kind: "blocked",
      p_start_min: null,
      p_end_min: null,
      p_note: null,
    });
    results.push({
      name: "anon CANNOT call upsert_availability_exception (execute revoked)",
      ok: upsert.error !== null,
      detail: upsert.error ? upsert.error.message : "RPC is callable!",
    });

    const del = await anonClient.rpc("delete_availability_exception", {
      p_tenant_id: zero,
      p_actor: zero,
      p_id: zero,
    });
    results.push({
      name: "anon CANNOT call delete_availability_exception (execute revoked)",
      ok: del.error !== null,
      detail: del.error ? del.error.message : "RPC is callable!",
    });

    const pref = await anonClient.rpc("set_student_daypart_preference", {
      p_tenant_id: zero,
      p_actor: zero,
      p_student_id: zero,
      p_dayparts: [],
    });
    results.push({
      name: "anon CANNOT call set_student_daypart_preference (execute revoked)",
      ok: pref.error !== null,
      detail: pref.error ? pref.error.message : "RPC is callable!",
    });
  }

  // ---- cleanup -----------------------------------------------------------
  await serviceClient
    .from("instructor_availability")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId);
  await serviceClient
    .from("instructor_availability_exception")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId);

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
  console.log("All availability RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
