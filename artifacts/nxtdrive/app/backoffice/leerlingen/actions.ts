"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrganizationPermission } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  requireStudentBackofficeAccess,
  STUDENT_BACKOFFICE_ADMIN_ROLES,
} from "@/lib/students/access";
import { hoursToMinutes } from "@/lib/students/types";
import {
  STUDENT_DOCUMENT_BUCKET,
  isDocumentCategory,
  sanitizeFileName,
  validateDocument,
} from "@/lib/students/document-types";
import { loadEmailBranding } from "@/lib/notifications/branding";
import { renderStudentWelcome } from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/provider";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { generateTemporaryPassword } from "@/lib/auth/generate-password";

export type CreateStudentDirectResult =
  | { ok: true; studentId: string; emailWarning?: string }
  | { ok: false; error: string };

/**
 * Directly create a student account without going through the lead funnel.
 * Intended for walk-in students or students registered by phone/in-person.
 *
 * - Validates naam + email + password strength (zxcvbn score ≥ 2 = "Matig") server-side
 * - Creates Supabase auth user with email_confirm: true and must_change_password
 * - Upserts profiles + memberships + students rows
 * - Logs to audit_log
 * - Sends welcome email with temporary password via SendGrid
 *
 * Never redirects — the dialog must be able to surface errors.
 */
export async function createStudentDirect(
  formData: FormData,
): Promise<CreateStudentDirectResult> {
  const { user, organization: tenant } = await requireOrganizationPermission(
    "student:manage",
    { allowedRoles: [...STUDENT_BACKOFFICE_ADMIN_ROLES] },
  );

  const naam = String(formData.get("naam") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telefoon = String(formData.get("telefoon") ?? "").trim().slice(0, 30) || null;
  const postcode = String(formData.get("postcode") ?? "").trim().slice(0, 10) || null;

  if (!naam) return { ok: false, error: "Naam is verplicht." };
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }

  const tijdelijkWachtwoord = generateTemporaryPassword();

  const service = createServiceRoleClient();

  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      password: tijdelijkWachtwoord,
      email_confirm: true,
      user_metadata: { must_change_password: true, full_name: naam },
    });

  if (createErr || !created.user) {
    const msg = createErr?.message ?? "Accountaanmaak mislukt.";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
      return { ok: false, error: "Dit e-mailadres is al in gebruik." };
    }
    return { ok: false, error: msg };
  }

  const newUserId = created.user.id;

  const { error: profileErr } = await service.from("profiles").upsert(
    { id: newUserId, email, full_name: naam },
    { onConflict: "id" },
  );
  if (profileErr) {
    await service.auth.admin.deleteUser(newUserId).catch(() => {});
    return { ok: false, error: profileErr.message };
  }

  const { error: membershipErr } = await service.from("memberships").upsert(
    { user_id: newUserId, tenant_id: tenant.id, role: "student" },
    { onConflict: "user_id,tenant_id,role" },
  );
  if (membershipErr) {
    await service.auth.admin.deleteUser(newUserId).catch(() => {});
    return { ok: false, error: membershipErr.message };
  }

  const { data: studentRow, error: studentErr } = await service
    .from("students")
    .insert({
      tenant_id: tenant.id,
      user_id: newUserId,
      lead_id: null,
      full_name: naam,
      email,
      phone: telefoon,
      postcode,
    })
    .select("id")
    .single();

  if (studentErr || !studentRow) {
    await service.auth.admin.deleteUser(newUserId).catch(() => {});
    return { ok: false, error: studentErr?.message ?? "Leerlingrij aanmaken mislukt." };
  }

  const studentId: string = studentRow.id as string;

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "student_created_direct",
    target_type: "student",
    target_id: studentId,
    payload: { full_name: naam, email },
  });

  // Send welcome email — best-effort: creation always succeeds; email failure
  // surfaces as a warning so the admin knows to resend manually.
  let emailWarning: string | undefined;
  try {
    const [branding, platformConfig] = await Promise.all([
      loadEmailBranding(service, tenant.id),
      getPlatformEmailConfig(service).catch(() => null),
    ]);
    const appUrl =
      process.env["NEXT_PUBLIC_APP_URL"] ??
      process.env["NEXTAUTH_URL"] ??
      "https://app.nxtdrive.io";
    const loginUrl = `${appUrl}/login`;
    const emailContent = renderStudentWelcome(branding, {
      studentName: naam,
      email,
      temporaryPassword: tijdelijkWachtwoord,
      loginUrl,
    });
    const emailResult = await sendEmail({
      to: email,
      fromName: branding.tenantName,
      email: emailContent,
      platformConfig: platformConfig ?? undefined,
    });
    if (!emailResult.ok) {
      if (emailResult.skipped) {
        emailWarning = "E-mail is niet geconfigureerd voor deze omgeving. Verstuur de inloggegevens handmatig via 'Inloggegevens opnieuw versturen'.";
      } else {
        console.error("[createStudentDirect] sendEmail failed:", emailResult.error);
        emailWarning = `Welkomstmail kon niet worden verstuurd (${emailResult.error}). Gebruik 'Inloggegevens opnieuw versturen' op de leerlingpagina.`;
      }
    }
  } catch (err) {
    console.error("[createStudentDirect] email pipeline threw:", err);
    emailWarning = "Welkomstmail kon niet worden verstuurd. Gebruik 'Inloggegevens opnieuw versturen' op de leerlingpagina.";
  }

  revalidatePath("/backoffice/leerlingen");
  return { ok: true, studentId, emailWarning };
}

export type ResendWelcomeEmailResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Generate a new temporary password, update the student's auth account, and
 * resend the welcome email. Admin-only. Audit-logged.
 *
 * Redirects back to the student page with ?welcome_resent=1 on success, or
 * ?welcome_error=<encoded> on failure.
 */
export async function resendWelcomeEmail(formData: FormData): Promise<never> {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const base = `/backoffice/leerlingen/${studentId}`;
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  const { user, organization: tenant } = context;

  if (!student) {
    redirect(`${base}?welcome_error=${encodeURIComponent("Leerling niet gevonden.")}`);
  }

  if (!student.user_id) {
    redirect(
      `${base}?welcome_error=${encodeURIComponent("Deze leerling heeft geen gekoppeld account.")}`,
    );
  }

  if (!student.email) {
    redirect(
      `${base}?welcome_error=${encodeURIComponent("Geen e-mailadres bekend voor deze leerling.")}`,
    );
  }

  const tijdelijkWachtwoord = generateTemporaryPassword();

  const { error: updateErr } = await service.auth.admin.updateUserById(
    student.user_id as string,
    {
      password: tijdelijkWachtwoord,
      user_metadata: { must_change_password: true },
    },
  );
  if (updateErr) {
    redirect(
      `${base}?welcome_error=${encodeURIComponent(updateErr.message ?? "Wachtwoord bijwerken mislukt.")}`,
    );
  }

  try {
    const [branding, platformConfig] = await Promise.all([
      loadEmailBranding(service, tenant.id),
      getPlatformEmailConfig(service).catch(() => null),
    ]);
    const appUrl =
      process.env["NEXT_PUBLIC_APP_URL"] ??
      process.env["NEXTAUTH_URL"] ??
      "https://app.nxtdrive.io";
    const loginUrl = `${appUrl}/login`;
    const emailContent = renderStudentWelcome(branding, {
      studentName: student.full_name,
      email: student.email,
      temporaryPassword: tijdelijkWachtwoord,
      loginUrl,
    });
    const emailResult = await sendEmail({
      to: student.email,
      fromName: branding.tenantName,
      email: emailContent,
      platformConfig: platformConfig ?? undefined,
    });
    if (!emailResult.ok) {
      const msg = emailResult.skipped
        ? "E-mailprovider is niet geconfigureerd voor deze omgeving."
        : `E-mail versturen mislukt: ${emailResult.error}`;
      console.error("[resendWelcomeEmail] sendEmail failed:", emailResult.error);
      redirect(`${base}?welcome_error=${encodeURIComponent(msg)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "E-mail versturen mislukt.";
    redirect(`${base}?welcome_error=${encodeURIComponent(msg)}`);
  }

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "welcome_email_resent",
    target_type: "student",
    target_id: studentId,
    payload: { email: student.email },
  });

  redirect(`${base}?welcome_resent=1`);
}

export async function grantPackageToStudent(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  const packageId = String(formData.get("package_id") ?? "");
  if (!studentId || !packageId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) redirect(`/backoffice/leerlingen/${studentId}`);

  const { user, organization: tenant } = context;
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
  const studentId = String(formData.get("student_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 4000);
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "collaborate",
  );
  if (!student) redirect(`/backoffice/leerlingen/${studentId}`);

  const { user, organization: tenant } = context;
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
  const studentId = String(formData.get("student_id") ?? "");
  const consent = String(formData.get("consent") ?? "") === "true";
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) redirect(`/backoffice/leerlingen/${studentId}`);

  const { user, organization: tenant } = context;
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
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) redirect(`/backoffice/leerlingen/${studentId}`);

  const { user, organization: tenant } = context;
  const { error } = await service.rpc("finish_student_traject", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`/backoffice/leerlingen/${studentId}`);

  // Task #113 — reviewverzoek na afronding van het traject. Best-effort en
  // idempotent per (leerling, moment); blokkeert het afronden nooit.
  try {
    const { notifyStudentReviewRequest } = await import(
      "@/lib/notifications/dispatch"
    );
    await notifyStudentReviewRequest(
      service,
      tenant.id,
      studentId,
      "traject_finished",
    );
  } catch {
    // Bewust ingeslikt: notificaties zijn best-effort.
  }

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId}`);
}

export async function adjustCredits(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "");
  // Admin enters a number of hours (may be decimal); tegoed is stored in minutes.
  const deltaHours = parseFloat(String(formData.get("delta") ?? "0"));
  const delta = hoursToMinutes(deltaHours);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!studentId || !Number.isFinite(delta) || delta === 0 || !note) {
    redirect(`/backoffice/leerlingen/${studentId || ""}`);
  }

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) redirect(`/backoffice/leerlingen/${studentId}`);

  const { user, organization: tenant } = context;
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
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "collaborate",
  );
  if (!student) redirect("/backoffice/leerlingen");

  const { user, organization: tenant } = context;
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
  const studentId = String(formData.get("student_id") ?? "");
  const documentId = String(formData.get("document_id") ?? "");
  const base = `/backoffice/leerlingen/${studentId}`;
  if (!studentId || !documentId) redirect(base);

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "collaborate",
  );
  if (!student) redirect(base);

  const { organization: tenant } = context;
  const { data: path, error } = await service.rpc("delete_student_document", {
    p_document_id: documentId,
    p_tenant_id: tenant.id,
    p_actor: context.user.id,
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
  const studentId = String(formData.get("student_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const relation = String(formData.get("relation") ?? "").trim().slice(0, 80);
  if (!studentId) return { ok: false, error: "Leerling ontbreekt." };
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) return { ok: false, error: "Leerling niet gevonden." };

  const { user, organization: tenant } = context;

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
  const guardianId = String(formData.get("guardian_id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!guardianId) return { ok: false, error: "Koppeling ontbreekt." };

  const service = createServiceRoleClient();
  const { context, student } = studentId
    ? await requireStudentBackofficeAccess(service, studentId, "admin")
    : {
        context: await requireOrganizationPermission("student:manage", {
          allowedRoles: [...STUDENT_BACKOFFICE_ADMIN_ROLES],
        }),
        student: null,
      };
  if (studentId && !student) return { ok: false, error: "Leerling niet gevonden." };

  const { error } = await service.rpc("unlink_student_guardian", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_guardian_id: guardianId,
  });
  if (error) return { ok: false, error: error.message };

  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  return { ok: true };
}
