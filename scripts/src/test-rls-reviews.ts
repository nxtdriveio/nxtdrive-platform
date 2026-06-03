/**
 * RLS + RPC tests for the INTERNAL review system (Task #116, migration 0080).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-reviews
 *   pnpm --filter @workspace/scripts run db:test-rls-reviews -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call upsert_student_review (execute revoked).
 *  2. anon SELECT on student_reviews is empty (select-only RLS, non-participant).
 *  3. upsert_student_review (student actor) creates a review.
 *  4. upsert is idempotent/editable: a second call updates the SAME row (rating
 *     changes, exactly one row remains for the student).
 *  5. upsert rejects a rating out of range (0 and 6).
 *  6. upsert rejects an unauthorized (stranger) actor.
 *  7. upsert rejects a cross-tenant student/tenant mismatch.
 *  8. a linked guardian actor CAN upsert for the child.
 *  9. the owning student (authenticated) sees ONLY their own review.
 * 10. a tenant_admin (authenticated) reads tenant-wide (sees the review).
 * 11. a member of ANOTHER tenant (authenticated) sees nothing (cross-tenant
 *     isolation).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Reviewsysteem RLS/RPC tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }
  const password = "test-pass-1234";

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const zero = "00000000-0000-0000-0000-000000000000";
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

  // Track created resources for cleanup.
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdTenantIds: string[] = [];

  async function makeUser(label: string): Promise<string> {
    const email = `review-${label}-${stamp}-${Math.random()
      .toString(36)
      .slice(2, 6)}@nxtdrive.test`;
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    const userId = data?.user?.id;
    if (error || !userId) throw new Error(`createUser ${label}: ${error?.message}`);
    createdUserIds.push(userId);
    await serviceClient
      .from("profiles")
      .upsert({ id: userId, email, full_name: `Review ${label}` });
    return userId;
  }

  async function makeStudent(
    tid: string,
    userId: string | null,
    name: string,
  ): Promise<string> {
    const { data, error } = await serviceClient
      .from("students")
      .insert({ tenant_id: tid, full_name: name, user_id: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeStudent failed: ${error?.message}`);
    createdStudentIds.push(data.id as string);
    return data.id as string;
  }

  async function signedInClient(email: string) {
    const client = createClient(url!, anon!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const res = await client.auth.signInWithPassword({ email, password });
    if (res.error || !res.data.session) {
      throw new Error(`signIn ${email}: ${res.error?.message}`);
    }
    return client;
  }

  // Owning student (auth user) + their student row.
  const studentEmail = `review-student-${stamp}@nxtdrive.test`;
  const { data: studentUser, error: suErr } =
    await serviceClient.auth.admin.createUser({
      email: studentEmail,
      email_confirm: true,
      password,
    });
  const studentUserId = studentUser?.user?.id;
  if (suErr || !studentUserId) throw new Error(`createUser student: ${suErr?.message}`);
  createdUserIds.push(studentUserId);
  await serviceClient
    .from("profiles")
    .upsert({ id: studentUserId, email: studentEmail, full_name: "Review Student" });
  const studentId = await makeStudent(tenantId, studentUserId, "Review Student");

  // ---- 1. anon CANNOT call upsert_student_review ------------------------
  {
    const res = await anonClient.rpc("upsert_student_review", {
      p_tenant_id: zero,
      p_student_id: zero,
      p_actor: zero,
      p_rating: 5,
      p_body: "hoi",
    });
    results.push({
      name: "anon CANNOT call upsert_student_review (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 2. anon SELECT on student_reviews is empty -----------------------
  {
    const { data, error } = await anonClient
      .from("student_reviews")
      .select("id")
      .eq("tenant_id", tenantId);
    results.push({
      name: "anon SELECT on student_reviews is empty (select-only RLS)",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 3. upsert (student actor) creates a review -----------------------
  {
    const res = await serviceClient.rpc("upsert_student_review", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_actor: studentUserId,
      p_rating: 4,
      p_body: "Prima rijschool, fijne instructeur.",
    });
    const id = (res.data as string | null) ?? null;
    results.push({
      name: "upsert_student_review (student actor) creates a review",
      ok: !res.error && id !== null,
      detail: res.error ? res.error.message : `id=${id}`,
    });
  }

  // ---- 4. upsert is idempotent/editable (same row, rating updated) ------
  {
    const res = await serviceClient.rpc("upsert_student_review", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_actor: studentUserId,
      p_rating: 5,
      p_body: "Toch nog beter dan gedacht!",
    });
    const { data: rows } = await serviceClient
      .from("student_reviews")
      .select("rating")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId);
    const count = (rows ?? []).length;
    const rating = (rows ?? [])[0]?.rating;
    results.push({
      name: "upsert is idempotent/editable (one row, rating updated to 5)",
      ok: !res.error && count === 1 && rating === 5,
      detail: res.error ? res.error.message : `count=${count} rating=${rating}`,
    });
  }

  // ---- 5. upsert rejects a rating out of range -------------------------
  {
    const low = await serviceClient.rpc("upsert_student_review", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_actor: studentUserId,
      p_rating: 0,
      p_body: null,
    });
    const high = await serviceClient.rpc("upsert_student_review", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_actor: studentUserId,
      p_rating: 6,
      p_body: null,
    });
    results.push({
      name: "upsert rejects a rating out of range (0 and 6)",
      ok: low.error !== null && high.error !== null,
      detail: `low=${low.error ? "blocked" : "ACCEPTED"} high=${
        high.error ? "blocked" : "ACCEPTED"
      }`,
    });
  }

  // ---- 6. upsert rejects an unauthorized (stranger) actor --------------
  {
    const strangerId = await makeUser("stranger");
    const res = await serviceClient.rpc("upsert_student_review", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_actor: strangerId,
      p_rating: 1,
      p_body: "ik hoor hier niet",
    });
    results.push({
      name: "upsert rejects an unauthorized (stranger) actor",
      ok: res.error !== null,
      detail: res.error?.message ?? "stranger upsert accepted!",
    });
  }

  // ---- 7. upsert rejects a cross-tenant student/tenant mismatch --------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `review-other-${stamp}`, name: "Review Other Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      createdTenantIds.push(otherTenant.id as string);
      const res = await serviceClient.rpc("upsert_student_review", {
        p_tenant_id: otherTenant.id, // mismatched tenant
        p_student_id: studentId, // belongs to demo-academy
        p_actor: studentUserId,
        p_rating: 3,
        p_body: "cross tenant",
      });
      results.push({
        name: "upsert rejects a cross-tenant student/tenant mismatch",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant upsert accepted!",
      });
    } else {
      results.push({
        name: "upsert rejects a cross-tenant student/tenant mismatch",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 8. a linked guardian actor CAN upsert for the child -------------
  {
    const guardianId = await makeUser("guardian");
    const childUserId = await makeUser("child");
    const childId = await makeStudent(tenantId, childUserId, "Review Child");
    const { error: gErr } = await serviceClient
      .from("student_guardians")
      .insert({ tenant_id: tenantId, student_id: childId, user_id: guardianId });
    let ok = false;
    let detail = `guardian-link error: ${gErr?.message}`;
    if (!gErr) {
      const res = await serviceClient.rpc("upsert_student_review", {
        p_tenant_id: tenantId,
        p_student_id: childId,
        p_actor: guardianId,
        p_rating: 5,
        p_body: "Namens mijn kind: top!",
      });
      ok = !res.error;
      detail = res.error?.message ?? "guardian upsert ok";
    }
    results.push({
      name: "a linked guardian actor CAN upsert for the child",
      ok,
      detail,
    });
  }

  // ---- 9. owning student (authenticated) sees ONLY their own review ----
  {
    const client = await signedInClient(studentEmail);
    const { data, error } = await client
      .from("student_reviews")
      .select("student_id")
      .eq("tenant_id", tenantId);
    const rows = (data ?? []) as { student_id: string }[];
    const onlyOwn =
      rows.length >= 1 && rows.every((r) => r.student_id === studentId);
    results.push({
      name: "owning student sees ONLY their own review",
      ok: !error && onlyOwn,
      detail: error ? error.message : `rows=${rows.length} onlyOwn=${onlyOwn}`,
    });
  }

  // ---- 10. tenant_admin (authenticated) reads tenant-wide --------------
  {
    const adminEmail = `review-admin-${stamp}@nxtdrive.test`;
    const adminId = await (async () => {
      const { data } = await serviceClient.auth.admin.createUser({
        email: adminEmail,
        email_confirm: true,
        password,
      });
      const id = data?.user?.id as string;
      createdUserIds.push(id);
      await serviceClient
        .from("profiles")
        .upsert({ id, email: adminEmail, full_name: "Review Admin" });
      await serviceClient
        .from("memberships")
        .insert({ user_id: id, tenant_id: tenantId, role: "tenant_admin" });
      return id;
    })();
    void adminId;
    const client = await signedInClient(adminEmail);
    const { data, error } = await client
      .from("student_reviews")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId);
    results.push({
      name: "tenant_admin reads tenant-wide (sees the student review)",
      ok: !error && (data ?? []).length === 1,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 11. member of ANOTHER tenant sees nothing ----------------------
  {
    const { data: tenantB } = await serviceClient
      .from("tenants")
      .insert({ slug: `review-tenantb-${stamp}`, name: "Review Tenant B" })
      .select("id")
      .single();
    let ok = false;
    let detail = "setup failed";
    if (tenantB) {
      createdTenantIds.push(tenantB.id as string);
      const bEmail = `review-tenantb-admin-${stamp}@nxtdrive.test`;
      const { data: bUser } = await serviceClient.auth.admin.createUser({
        email: bEmail,
        email_confirm: true,
        password,
      });
      const bId = bUser?.user?.id as string;
      createdUserIds.push(bId);
      await serviceClient
        .from("profiles")
        .upsert({ id: bId, email: bEmail, full_name: "Review Tenant B Admin" });
      await serviceClient
        .from("memberships")
        .insert({ user_id: bId, tenant_id: tenantB.id, role: "tenant_admin" });
      const client = await signedInClient(bEmail);
      // Try to read demo-academy's reviews — must be empty.
      const { data, error } = await client
        .from("student_reviews")
        .select("id")
        .eq("tenant_id", tenantId);
      ok = !error && (data ?? []).length === 0;
      detail = error ? error.message : `rows=${(data ?? []).length}`;
    }
    results.push({
      name: "member of ANOTHER tenant sees nothing (cross-tenant isolation)",
      ok,
      detail,
    });
  }

  // ---- cleanup ----------------------------------------------------------
  for (const sid of createdStudentIds) {
    await serviceClient.from("student_reviews").delete().eq("student_id", sid);
    await serviceClient.from("student_guardians").delete().eq("student_id", sid);
    await serviceClient.from("students").delete().eq("id", sid);
  }
  for (const uid of createdUserIds) {
    await serviceClient.from("memberships").delete().eq("user_id", uid);
    await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
  }
  for (const tid of createdTenantIds) {
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
  console.log("All Reviewsysteem RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
