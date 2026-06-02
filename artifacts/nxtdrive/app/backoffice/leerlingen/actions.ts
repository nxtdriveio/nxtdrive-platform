"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hoursToMinutes } from "@/lib/students/types";
import {
  STUDENT_DOCUMENT_BUCKET,
  isDocumentCategory,
  sanitizeFileName,
  validateDocument,
} from "@/lib/students/document-types";

export async function grantPackageToStudent(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("grant_package", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_package_id: packageId,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}

export async function updateStudentNotes(formData: FormData) {
  // Internal notes may be edited by admins and instructors (RPC enforces this).
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const studentId = String(formData.get("student_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 4000);
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("update_student_notes", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_notes: notes,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(`/backoffice/leerlingen/${studentId}`);
}

export async function setStudentReviewConsent(formData: FormData) {
  // Privacy-sensitive: tenant admins only (RPC re-checks).
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  const consent = String(formData.get("consent") ?? "") === "true";
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_student_review_consent", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_consent: consent,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(`/backoffice/leerlingen/${studentId}`);
}

// Examenflow C — rond het traject af na een geslaagd examen (leerling op
// inactief). Admin-only; de geguarde RPC her-controleert en audit logt.
export async function finishStudentTraject(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("finish_student_traject", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}

export async function adjustCredits(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  // Admin enters a number of hours (may be decimal); tegoed is stored in minutes.
  const deltaHours = parseFloat(String(formData.get("delta") ?? "0"));
  const delta = hoursToMinutes(deltaHours);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!studentId || !Number.isFinite(delta) || delta === 0 || !note) {
    redirect(`/backoffice/leerlingen/${studentId || ""}`);
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("adjust_credits", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_delta: delta,
    p_note: note,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}

// Student documents ----------------------------------------------------------

export async function uploadStudentDocument(formData: FormData) {
  // Admin OR instructor may upload (RPC re-checks via _lesson_actor_authorized).
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) redirect("/backoffice/leerlingen");

  const base = `/backoffice/leerlingen/${studentId}`;
  const rawCategory = String(formData.get("category") ?? "other");
  const category = isDocumentCategory(rawCategory) ? rawCategory : "other";
  const file = formData.get("file");

  if (!(file instanceof File)) {
    redirect(`${base}?doc_error=empty`);
  }

  const validationError = validateDocument(file.size, file.type);
  if (validationError) {
    redirect(`${base}?doc_error=${validationError}`);
  }

  const service = createServiceRoleClient();

  // Confirm the student belongs to this tenant before writing anything.
  const { data: student } = await service
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!student) redirect("/backoffice/leerlingen");

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${tenant.id}/${studentId}/${randomUUID()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await service.storage
    .from(STUDENT_DOCUMENT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    redirect(`${base}?doc_error=upload_failed`);
  }

  const { error: recordError } = await service.rpc("record_student_document", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_storage_path: storagePath,
    p_file_name: safeName,
    p_category: category,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  if (recordError) {
    // Roll back the orphaned object so storage and metadata stay consistent.
    await service.storage.from(STUDENT_DOCUMENT_BUCKET).remove([storagePath]);
    redirect(`${base}?doc_error=upload_failed`);
  }

  revalidatePath(base);
  redirect(base);
}

export async function deleteStudentDocument(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const studentId = String(formData.get("student_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  const base = `/backoffice/leerlingen/${studentId}`;
  if (!studentId || !documentId) redirect(base);

  const service = createServiceRoleClient();
  const { data: path, error } = await service.rpc("delete_student_document", {
    p_document_id: documentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`${base}?doc_error=delete_failed`);

  // Best-effort: remove the underlying object now the metadata row is gone.
  if (typeof path === "string" && path.length > 0) {
    await service.storage.from(STUDENT_DOCUMENT_BUCKET).remove([path]);
  }

  revalidatePath(base);
  redirect(base);
}

// Guardian links (Ouderportaal, Task #96) ------------------------------------

export type GuardianActionResult = { ok: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Find an existing auth user id by email, paging through the admin list. */
async function findUserIdByEmail(
  service: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Link a parent to a student. The admin enters an e-mail + relation. We resolve
 * the parent's auth user (creating one with a random password if they are new —
 * they sign in later via password reset), ensure a `parent` membership in the
 * tenant, then call the audited link RPC. Creation of the auth user / profile /
 * membership uses the service role; the actual link is written by the guarded
 * link_student_guardian RPC (service-role only, admin re-checked, audited).
 */
export async function addGuardian(
  formData: FormData,
): Promise<GuardianActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const studentId = String(formData.get("student_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const relation = String(formData.get("relation") ?? "").trim().slice(0, 80);
  if (!studentId) return { ok: false, error: "Leerling ontbreekt." };
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }

  const service = createServiceRoleClient();

  // The student must belong to this tenant.
  const { data: student, error: studentErr } = await service
    .from("students")
    .select("id, full_name")
    .eq("id", studentId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (studentErr) return { ok: false, error: studentErr.message };
  if (!student) return { ok: false, error: "Leerling niet gevonden." };

  // Resolve or provision the parent auth user.
  let guardianUserId: string;
  try {
    const existing = await findUserIdByEmail(service, email);
    if (existing) {
      guardianUserId = existing;
    } else {
      const { data: created, error: createErr } =
        await service.auth.admin.createUser({
          email,
          password: randomUUID(),
          email_confirm: true,
        });
      if (createErr || !created.user) {
        return {
          ok: false,
          error: createErr?.message ?? "Ouderaccount aanmaken mislukt.",
        };
      }
      guardianUserId = created.user.id;
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Ouderaccount aanmaken mislukt.",
    };
  }

  // Ensure a profile row (RLS reads resolve the guardian's name/email from it).
  const { error: profileErr } = await service.from("profiles").upsert(
    { id: guardianUserId, email },
    { onConflict: "id" },
  );
  if (profileErr) return { ok: false, error: profileErr.message };

  // Ensure a parent membership in this tenant (idempotent).
  const { error: membershipErr } = await service.from("memberships").upsert(
    { user_id: guardianUserId, tenant_id: tenant.id, role: "parent" },
    { onConflict: "user_id,tenant_id,role" },
  );
  if (membershipErr) return { ok: false, error: membershipErr.message };

  // Write the (audited) guardian link.
  const { error: linkErr } = await service.rpc("link_student_guardian", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: studentId,
    p_user_id: guardianUserId,
    p_relation: relation || null,
  });
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  return { ok: true };
}

/** Remove a guardian link by its row id. Audited via the unlink RPC. */
export async function removeGuardian(
  formData: FormData,
): Promise<GuardianActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const guardianId = String(formData.get("guardian_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!guardianId) return { ok: false, error: "Koppeling ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("unlink_student_guardian", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_guardian_id: guardianId,
  });
  if (error) return { ok: false, error: error.message };

  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  return { ok: true };
}
