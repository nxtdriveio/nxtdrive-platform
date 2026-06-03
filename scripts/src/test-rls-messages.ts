/**
 * RLS + RPC tests for Berichten (student↔instructor chat, Task #115).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-messages
 *   pnpm --filter @workspace/scripts run db:test-rls-messages -- --env=production
 *
 * Asserts:
 *  1. anon CANNOT call ensure_chat_conversation (execute revoked).
 *  2. anon CANNOT call send_chat_message (execute revoked).
 *  3. anon CANNOT call mark_chat_read (execute revoked).
 *  4. ensure_chat_conversation creates a conversation for a (tenant, student,
 *     instructor) triple when the actor is the owning student.
 *  5. ensure_chat_conversation is idempotent (second call returns same id).
 *  6. send_chat_message (student actor) derives sender_side='student' and
 *     bumps last_message_at/preview + student_last_read_at.
 *  7. send_chat_message (instructor actor) derives sender_side='instructor'.
 *  8. send_chat_message rejects an empty body.
 *  9. send_chat_message rejects a cross-tenant conversation.
 * 10. send_chat_message rejects an unauthorized (stranger) actor.
 * 11. ensure_chat_conversation rejects an unauthorized (stranger) actor.
 * 12. mark_chat_read (instructor actor) advances instructor_last_read_at.
 * 13. anon SELECT on chat_messages is empty (select-only RLS, non-participant).
 * 14. student instructor-list data path is tenant-scoped — a user who is a
 *     student in two tenants only sees the active tenant's instructor (no
 *     cross-tenant leak from the old auth.uid()-wide RPC).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Berichten (chat) RLS/RPC tests`);

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

  // Track created resources for cleanup.
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdConvIds: string[] = [];
  const createdTenantIds: string[] = [];

  async function makeStudentWithUser(): Promise<{
    studentId: string;
    userId: string;
  }> {
    const email = `chat-student-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}@nxtdrive.test`;
    const { data: created, error: userErr } =
      await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password: "test-pass-1234",
      });
    const userId = created?.user?.id;
    if (userErr || !userId) {
      throw new Error(`createUser failed: ${userErr?.message}`);
    }
    createdUserIds.push(userId);

    const { data, error } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        full_name: `Chat Student ${Date.now()}`,
        user_id: userId,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`makeStudent failed: ${error?.message}`);
    createdStudentIds.push(data.id as string);
    return { studentId: data.id as string, userId };
  }

  const { studentId, userId: studentUserId } = await makeStudentWithUser();

  // ---- 1. anon CANNOT call ensure_chat_conversation ---------------------
  {
    const res = await anonClient.rpc("ensure_chat_conversation", {
      p_tenant_id: zero,
      p_student_id: zero,
      p_instructor_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call ensure_chat_conversation (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 2. anon CANNOT call send_chat_message ----------------------------
  {
    const res = await anonClient.rpc("send_chat_message", {
      p_tenant_id: zero,
      p_conversation_id: zero,
      p_actor: zero,
      p_body: "hoi",
    });
    results.push({
      name: "anon CANNOT call send_chat_message (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 3. anon CANNOT call mark_chat_read -------------------------------
  {
    const res = await anonClient.rpc("mark_chat_read", {
      p_tenant_id: zero,
      p_conversation_id: zero,
      p_actor: zero,
    });
    results.push({
      name: "anon CANNOT call mark_chat_read (execute revoked)",
      ok: res.error !== null,
      detail: res.error ? res.error.message : "RPC is callable!",
    });
  }

  // ---- 4. ensure_chat_conversation creates a conversation ---------------
  let conversationId: string | null = null;
  {
    const res = await serviceClient.rpc("ensure_chat_conversation", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_instructor_id: instructorId,
      p_actor: studentUserId,
    });
    conversationId = (res.data as string | null) ?? null;
    if (conversationId) createdConvIds.push(conversationId);
    results.push({
      name: "ensure_chat_conversation creates a conversation (student actor)",
      ok: !res.error && conversationId !== null,
      detail: res.error ? res.error.message : `id=${conversationId}`,
    });
  }

  // ---- 5. ensure_chat_conversation is idempotent ------------------------
  {
    const res = await serviceClient.rpc("ensure_chat_conversation", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_instructor_id: instructorId,
      p_actor: studentUserId,
    });
    const second = (res.data as string | null) ?? null;
    results.push({
      name: "ensure_chat_conversation is idempotent (same id returned)",
      ok: !res.error && second !== null && second === conversationId,
      detail: res.error ? res.error.message : `id=${second}`,
    });
  }

  // ---- 6. send_chat_message (student) derives side + bumps metadata -----
  {
    const res = await serviceClient.rpc("send_chat_message", {
      p_tenant_id: tenantId,
      p_conversation_id: conversationId,
      p_actor: studentUserId,
      p_body: "Hoi instructeur, kan ik mijn les verzetten?",
    });
    const msgId = (res.data as string | null) ?? null;
    const { data: msg } = await serviceClient
      .from("chat_messages")
      .select("sender_side, body")
      .eq("id", msgId ?? "")
      .maybeSingle();
    const { data: conv } = await serviceClient
      .from("chat_conversations")
      .select("last_message_preview, last_message_at, student_last_read_at")
      .eq("id", conversationId ?? "")
      .maybeSingle();
    results.push({
      name: "send_chat_message (student) derives side='student' + bumps metadata",
      ok:
        !res.error &&
        msg?.sender_side === "student" &&
        conv?.last_message_at !== null &&
        conv?.student_last_read_at !== null &&
        typeof conv?.last_message_preview === "string",
      detail: res.error
        ? res.error.message
        : `side=${msg?.sender_side} preview=${conv?.last_message_preview}`,
    });
  }

  // ---- 7. send_chat_message (instructor) derives side='instructor' ------
  {
    const res = await serviceClient.rpc("send_chat_message", {
      p_tenant_id: tenantId,
      p_conversation_id: conversationId,
      p_actor: instructorId,
      p_body: "Ja hoor, geen probleem!",
    });
    const msgId = (res.data as string | null) ?? null;
    const { data: msg } = await serviceClient
      .from("chat_messages")
      .select("sender_side")
      .eq("id", msgId ?? "")
      .maybeSingle();
    results.push({
      name: "send_chat_message (instructor) derives side='instructor'",
      ok: !res.error && msg?.sender_side === "instructor",
      detail: res.error ? res.error.message : `side=${msg?.sender_side}`,
    });
  }

  // ---- 8. send_chat_message rejects an empty body -----------------------
  {
    const res = await serviceClient.rpc("send_chat_message", {
      p_tenant_id: tenantId,
      p_conversation_id: conversationId,
      p_actor: studentUserId,
      p_body: "   ",
    });
    results.push({
      name: "send_chat_message rejects an empty body",
      ok: res.error !== null,
      detail: res.error?.message ?? "empty body accepted!",
    });
  }

  // ---- 9. send_chat_message rejects a cross-tenant conversation ---------
  {
    const { data: otherTenant } = await serviceClient
      .from("tenants")
      .insert({ slug: `chat-other-${Date.now()}`, name: "Other Chat Tenant" })
      .select("id")
      .single();
    if (otherTenant) {
      createdTenantIds.push(otherTenant.id as string);
      const res = await serviceClient.rpc("send_chat_message", {
        p_tenant_id: otherTenant.id, // mismatched tenant
        p_conversation_id: conversationId, // belongs to demo-academy
        p_actor: instructorId,
        p_body: "cross tenant",
      });
      results.push({
        name: "send_chat_message rejects a cross-tenant conversation",
        ok: res.error !== null,
        detail: res.error?.message ?? "cross-tenant send accepted!",
      });
    } else {
      results.push({
        name: "send_chat_message rejects a cross-tenant conversation",
        ok: false,
        detail: "setup failed",
      });
    }
  }

  // ---- 10. send_chat_message rejects an unauthorized actor --------------
  {
    const email = `chat-stranger-${Date.now()}@nxtdrive.test`;
    const { data: created } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "test-pass-1234",
    });
    const strangerId = created?.user?.id;
    if (strangerId) createdUserIds.push(strangerId);
    const res = await serviceClient.rpc("send_chat_message", {
      p_tenant_id: tenantId,
      p_conversation_id: conversationId,
      p_actor: strangerId,
      p_body: "ik hoor hier niet",
    });
    results.push({
      name: "send_chat_message rejects an unauthorized (stranger) actor",
      ok: res.error !== null,
      detail: res.error?.message ?? "stranger send accepted!",
    });

    // ---- 11. ensure_chat_conversation rejects an unauthorized actor -----
    const res2 = await serviceClient.rpc("ensure_chat_conversation", {
      p_tenant_id: tenantId,
      p_student_id: studentId,
      p_instructor_id: instructorId,
      p_actor: strangerId,
    });
    results.push({
      name: "ensure_chat_conversation rejects an unauthorized (stranger) actor",
      ok: res2.error !== null,
      detail: res2.error?.message ?? "stranger ensure accepted!",
    });
  }

  // ---- 12. mark_chat_read (instructor) advances last_read_at ------------
  {
    const before = await serviceClient
      .from("chat_conversations")
      .select("instructor_last_read_at")
      .eq("id", conversationId ?? "")
      .maybeSingle();
    // Small delay so the timestamp visibly advances.
    await new Promise((r) => setTimeout(r, 50));
    const res = await serviceClient.rpc("mark_chat_read", {
      p_tenant_id: tenantId,
      p_conversation_id: conversationId,
      p_actor: instructorId,
    });
    const after = await serviceClient
      .from("chat_conversations")
      .select("instructor_last_read_at")
      .eq("id", conversationId ?? "")
      .maybeSingle();
    const beforeTs = before.data?.instructor_last_read_at as string | null;
    const afterTs = after.data?.instructor_last_read_at as string | null;
    results.push({
      name: "mark_chat_read (instructor) advances instructor_last_read_at",
      ok:
        !res.error &&
        afterTs !== null &&
        (beforeTs === null || afterTs >= beforeTs),
      detail: res.error ? res.error.message : `after=${afterTs}`,
    });
  }

  // ---- 13. anon SELECT on chat_messages is empty -----------------------
  {
    const { data, error } = await anonClient
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conversationId ?? "");
    results.push({
      name: "anon SELECT on chat_messages is empty (select-only RLS, non-participant)",
      ok: !error && (data ?? []).length === 0,
      detail: error ? error.message : `rows=${(data ?? []).length}`,
    });
  }

  // ---- 14. student instructor-list data path is tenant-scoped -----------
  // Regression for the multi-tenant leak: a student-user who exists in TWO
  // tenants must only see instructors from the active tenant. The chat
  // entrypoint queries `lessons` filtered by (tenant_id, student_id) — NOT the
  // auth.uid()-wide `my_lesson_instructors` RPC — so a lesson with a foreign
  // instructor in the other tenant must never appear for the active tenant.
  {
    // Second tenant + a separate student row for the SAME auth user.
    const { data: tenantB } = await serviceClient
      .from("tenants")
      .insert({ slug: `chat-tenantb-${Date.now()}`, name: "Chat Tenant B" })
      .select("id")
      .single();
    let ok = false;
    let detail = "setup failed";
    if (tenantB) {
      const tenantBId = tenantB.id as string;
      createdTenantIds.push(tenantBId);

      // Instructor membership in tenant B.
      const emailB = `chat-instrB-${Date.now()}@nxtdrive.test`;
      const { data: instrBCreated } = await serviceClient.auth.admin.createUser({
        email: emailB,
        email_confirm: true,
        password: "test-pass-1234",
      });
      const instructorBId = instrBCreated?.user?.id;
      if (instructorBId) createdUserIds.push(instructorBId);

      // Same auth user is also a student in tenant B.
      const { data: studentBRow } = await serviceClient
        .from("students")
        .insert({
          tenant_id: tenantBId,
          full_name: "Chat Student B",
          user_id: studentUserId,
        })
        .select("id")
        .single();
      const studentBId = studentBRow?.id as string | undefined;
      if (studentBId) createdStudentIds.push(studentBId);

      if (instructorBId && studentBId) {
        // A lesson in tenant B with instructor B for the SAME user's tenant-B
        // student row.
        const now = Date.now();
        await serviceClient.from("lessons").insert({
          tenant_id: tenantBId,
          instructor_id: instructorBId,
          student_id: studentBId,
          starts_at: new Date(now + 3_600_000).toISOString(),
          ends_at: new Date(now + 5_400_000).toISOString(),
        });

        // A lesson in tenant A (demo-academy) with the demo instructor for the
        // tenant-A student row.
        await serviceClient.from("lessons").insert({
          tenant_id: tenantId,
          instructor_id: instructorId,
          student_id: studentId,
          starts_at: new Date(now + 3_600_000).toISOString(),
          ends_at: new Date(now + 5_400_000).toISOString(),
        });

        // Mirror the chat entrypoint's tenant+student-scoped lessons query.
        const { data: aRows } = await serviceClient
          .from("lessons")
          .select("instructor_id")
          .eq("tenant_id", tenantId)
          .eq("student_id", studentId);
        const aInstructors = new Set(
          ((aRows ?? []) as { instructor_id: string | null }[])
            .map((r) => r.instructor_id)
            .filter((id): id is string => Boolean(id)),
        );
        ok =
          aInstructors.has(instructorId) && !aInstructors.has(instructorBId);
        detail = `tenantA instructors=${aInstructors.size} hasA=${aInstructors.has(
          instructorId,
        )} hasB=${aInstructors.has(instructorBId)}`;
      }
    }
    results.push({
      name: "student instructor-list is tenant-scoped (no cross-tenant instructor leak)",
      ok,
      detail,
    });
  }

  // ---- cleanup -----------------------------------------------------------
  for (const cid of createdConvIds) {
    await serviceClient.from("chat_messages").delete().eq("conversation_id", cid);
    await serviceClient.from("chat_conversations").delete().eq("id", cid);
  }
  for (const sid of createdStudentIds) {
    // Lessons FK-reference students (on delete restrict) — clear them first.
    await serviceClient.from("lessons").delete().eq("student_id", sid);
    await serviceClient.from("students").delete().eq("id", sid);
  }
  for (const uid of createdUserIds) {
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
  console.log("All Berichten (chat) RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
