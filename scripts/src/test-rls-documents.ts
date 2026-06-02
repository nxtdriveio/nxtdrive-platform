/**
 * RLS + storage tests for student documents (Module 2 — Leerlingdocumenten).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-documents
 *   pnpm --filter @workspace/scripts run db:test-rls-documents -- --env=production
 *
 * Asserts:
 *   1. record_student_document RPC inserts metadata + audit (service role).
 *   2. Tenant-A staff (instructor) can read tenant-A document metadata.
 *   3. Tenant-A staff CANNOT read tenant-B document metadata (cross-tenant).
 *   4. A student in tenant A CANNOT read student_documents (staff-only policy).
 *   5. Anonymous role cannot read student_documents.
 *   6. Anon CANNOT call record_student_document RPC (execute revoked).
 *   7. Anon CANNOT call delete_student_document RPC (execute revoked).
 *   8. Storage round-trip: upload to the private bucket, create a signed URL,
 *      and remove the object (service role).
 *   9. delete_student_document RPC removes the metadata row + audits.
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

const BUCKET = "student-documents";

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running student document RLS tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const password = `doc-pass-${stamp}`;
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdPaths: string[] = [];
  let docAId: string | null = null;

  async function makeUser(label: string, tenantId: string, role: string) {
    const email = `doc-${label}-${stamp}@nxtdrive.test`;
    const { data: u, error } = await serviceClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (error || !u?.user) throw new Error(`createUser: ${error?.message}`);
    const userId = u.user.id;
    createdUserIds.push(userId);
    await serviceClient
      .from("profiles")
      .upsert({ id: userId, email, full_name: `Doc ${label}` });
    await serviceClient
      .from("memberships")
      .insert({ user_id: userId, tenant_id: tenantId, role });
    return { userId, email };
  }

  async function makeStudent(tenantId: string, label: string, userId?: string) {
    const { data: s, error } = await serviceClient
      .from("students")
      .insert({
        tenant_id: tenantId,
        user_id: userId ?? null,
        full_name: `Doc Student ${label} ${stamp}`,
        email: `doc-student-${label}-${stamp}@nxtdrive.test`,
      })
      .select("id")
      .single();
    if (error || !s) throw new Error(`student: ${error?.message}`);
    createdStudentIds.push(s.id);
    return s.id as string;
  }

  try {
    // --- tenant A = demo-academy; create tenant B ------------------------
    const { data: tenantA } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenantA) {
      console.error("demo-academy tenant missing — run db:seed first");
      process.exit(1);
    }
    const tenantAId: string = tenantA.id;

    const { data: tenantB } = await serviceClient
      .from("tenants")
      .insert({
        slug: `doc-other-${stamp}`,
        name: `Doc Other Tenant ${stamp}`,
        plan: "start",
        white_label_enabled: false,
      })
      .select("id")
      .single();
    if (!tenantB) throw new Error("could not create tenant B");
    createdTenantIds.push(tenantB.id);
    const tenantBId: string = tenantB.id;

    const instrA = await makeUser("instr-a", tenantAId, "instructor");
    const adminB = await makeUser("admin-b", tenantBId, "tenant_admin");
    const studentUserA = await makeUser("student-a", tenantAId, "student");

    const studentA = await makeStudent(tenantAId, "a", studentUserA.userId);
    const studentB = await makeStudent(tenantBId, "b");

    // 1. record_student_document inserts metadata (service role) -----------
    {
      const pathA = `${tenantAId}/${studentA}/${stamp}-a.pdf`;
      const { data, error } = await serviceClient.rpc("record_student_document", {
        p_student_id: studentA,
        p_tenant_id: tenantAId,
        p_actor: instrA.userId,
        p_storage_path: pathA,
        p_file_name: "a.pdf",
        p_category: "id_copy",
        p_mime_type: "application/pdf",
        p_size_bytes: 1234,
      });
      docAId = (data as string | null) ?? null;
      results.push({
        name: "record_student_document inserts metadata (service role)",
        ok: !error && !!docAId,
        detail: error ? error.message : `id=${docAId}`,
      });
    }

    // document for tenant B
    let docBId: string | null = null;
    {
      const pathB = `${tenantBId}/${studentB}/${stamp}-b.pdf`;
      const { data, error } = await serviceClient.rpc("record_student_document", {
        p_student_id: studentB,
        p_tenant_id: tenantBId,
        p_actor: adminB.userId,
        p_storage_path: pathB,
        p_file_name: "b.pdf",
        p_category: "other",
        p_mime_type: "application/pdf",
        p_size_bytes: 999,
      });
      docBId = (data as string | null) ?? null;
      if (error || !docBId) throw new Error(`record B: ${error?.message}`);
    }

    // 2 + 3. tenant-A instructor reads own, not tenant-B's ----------------
    const instrClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const instrSignIn = await instrClient.auth.signInWithPassword({
      email: instrA.email,
      password,
    });
    if (instrSignIn.error || !instrSignIn.data.session) {
      throw new Error(`instructor signIn: ${instrSignIn.error?.message}`);
    }
    {
      const { data } = await instrClient
        .from("student_documents")
        .select("id, tenant_id")
        .in("id", [docAId, docBId]);
      const ids = (data ?? []).map((r) => r.id);
      results.push({
        name: "tenant-A staff reads own document metadata",
        ok: ids.includes(docAId),
        detail: `visible=${ids.join(",")}`,
      });
      results.push({
        name: "tenant-A staff CANNOT read tenant-B document metadata",
        ok: !ids.includes(docBId),
        detail: `visible=${ids.join(",")}`,
      });
    }
    await instrClient.auth.signOut();

    // 4. student in tenant A cannot read documents (staff-only) -----------
    const studentClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const stSignIn = await studentClient.auth.signInWithPassword({
      email: studentUserA.email,
      password,
    });
    if (stSignIn.error || !stSignIn.data.session) {
      throw new Error(`student signIn: ${stSignIn.error?.message}`);
    }
    {
      const { data } = await studentClient
        .from("student_documents")
        .select("id");
      results.push({
        name: "student in tenant A CANNOT read student_documents",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    await studentClient.auth.signOut();

    // 5. anon cannot read --------------------------------------------------
    {
      const { data } = await anonClient
        .from("student_documents")
        .select("id")
        .limit(5);
      results.push({
        name: "anon cannot read student_documents",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // 6 + 7. anon cannot call the RPCs ------------------------------------
    {
      const { error } = await anonClient.rpc("record_student_document", {
        p_student_id: studentA,
        p_tenant_id: tenantAId,
        p_actor: instrA.userId,
        p_storage_path: `${tenantAId}/${studentA}/hack.pdf`,
        p_file_name: "hack.pdf",
        p_category: "other",
        p_mime_type: "application/pdf",
        p_size_bytes: 1,
      });
      results.push({
        name: "anon CANNOT call record_student_document (execute revoked)",
        ok: error !== null,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("delete_student_document", {
        p_document_id: docAId,
        p_tenant_id: tenantAId,
        p_actor: instrA.userId,
      });
      results.push({
        name: "anon CANNOT call delete_student_document (execute revoked)",
        ok: error !== null,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    // 8. storage round-trip (service role) --------------------------------
    {
      const path = `${tenantAId}/${studentA}/${stamp}-roundtrip.txt`;
      const body = Buffer.from("hello nxtdrive document storage");
      const up = await serviceClient.storage
        .from(BUCKET)
        .upload(path, body, { contentType: "text/plain", upsert: false });
      let signedOk = false;
      if (!up.error) {
        createdPaths.push(path);
        const signed = await serviceClient.storage
          .from(BUCKET)
          .createSignedUrl(path, 60);
        signedOk = !signed.error && !!signed.data?.signedUrl;
      }
      results.push({
        name: "storage upload + signed URL round-trip (private bucket)",
        ok: !up.error && signedOk,
        detail: up.error ? up.error.message : `signed=${signedOk}`,
      });
    }

    // 9. delete_student_document removes the row --------------------------
    {
      const { data: path, error } = await serviceClient.rpc(
        "delete_student_document",
        {
          p_document_id: docAId,
          p_tenant_id: tenantAId,
          p_actor: instrA.userId,
        },
      );
      const { data: after } = await serviceClient
        .from("student_documents")
        .select("id")
        .eq("id", docAId);
      results.push({
        name: "delete_student_document removes metadata row (service role)",
        ok: !error && typeof path === "string" && (after ?? []).length === 0,
        detail: error ? error.message : `path=${path}`,
      });
      docAId = null;
    }
  } finally {
    // cleanup -------------------------------------------------------------
    if (createdPaths.length > 0) {
      await serviceClient.storage
        .from(BUCKET)
        .remove(createdPaths)
        .catch(() => undefined);
    }
    await serviceClient
      .from("student_documents")
      .delete()
      .in(
        "student_id",
        createdStudentIds.length ? createdStudentIds : ["00000000-0000-0000-0000-000000000000"],
      )
      .then(() => undefined, () => undefined);
    await serviceClient
      .from("students")
      .delete()
      .in(
        "id",
        createdStudentIds.length ? createdStudentIds : ["00000000-0000-0000-0000-000000000000"],
      )
      .then(() => undefined, () => undefined);
    for (const uid of createdUserIds) {
      await serviceClient.from("memberships").delete().eq("user_id", uid);
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    for (const tid of createdTenantIds) {
      await serviceClient
        .from("tenants")
        .delete()
        .eq("id", tid)
        .then(() => undefined, () => undefined);
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
  console.log("All student document RLS tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
