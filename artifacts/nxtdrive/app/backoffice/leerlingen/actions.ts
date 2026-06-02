"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
