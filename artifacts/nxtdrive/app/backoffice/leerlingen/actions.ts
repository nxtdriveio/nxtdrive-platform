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
import {
  consumeRateLimit,
  type RateLimitDecision,
} from "@/lib/security/rate-limit";
import {
  hasExpectedDocumentSignature,
  scanDocumentForMalware,
} from "@/lib/security/uploads";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  parseStudentProfileInput,
  portalStatusForStudent,
  type StudentPortalStatus,
} from "@/lib/students/create-profile";
import { isInstructorRis20Qualified } from "@/lib/instructor/qualifications";
import { parseStudentContactProfileInput } from "@/lib/students/profile-edit";

export type CreateStudentDirectResult =
  | {
      ok: true;
      studentId: string;
      portalStatus: StudentPortalStatus;
      emailWarning?: string;
    }
  | { ok: false; error: string };

/**
 * Create a student profile without going through the lead funnel.
 * The profile and portal account are deliberately separate: email is optional
 * and an auth user is only provisioned when a real email address is supplied.
 *
 * - Validates the short intake server-side
 * - Creates profiles + memberships only when portal activation is possible
 * - Creates a nullable-email student row without placeholder credentials
 * - Materializes the current instructor relationship in chat_conversations
 * - Logs to audit_log
 * - Sends a welcome email only when an auth account was created
 *
 * Never redirects — the dialog must be able to surface errors.
 */
export async function createStudentDirect(
  formData: FormData,
): Promise<CreateStudentDirectResult> {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);

  const naam = String(formData.get("naam") ?? "")
    .trim()
    .slice(0, 200);
  const emailRaw = String(formData.get("email") ?? "");
  const telefoon =
    String(formData.get("telefoon") ?? "")
      .trim()
      .slice(0, 30) || null;
  const educationType = String(formData.get("opleidingstype") ?? "STANDARD") as
    | "STANDARD"
    | "RIS_2_0"
    | "RIS_1_0_LEGACY";
  const startDate =
    String(formData.get("startdatum") ?? "")
      .trim()
      .slice(0, 10) || null;
  const privacyConfirmed =
    String(formData.get("privacy_confirmed") ?? "") === "true";
  const postcode =
    String(formData.get("postcode") ?? "")
      .trim()
      .slice(0, 10) || null;
  const geboortedatum =
    String(formData.get("geboortedatum") ?? "")
      .trim()
      .slice(0, 10) || null;
  const adres =
    String(formData.get("adres") ?? "")
      .trim()
      .slice(0, 240) || null;
  const woonplaats =
    String(formData.get("woonplaats") ?? "")
      .trim()
      .slice(0, 160) || null;
  const ophaaladres =
    String(formData.get("ophaaladres") ?? "")
      .trim()
      .slice(0, 240) || null;

  const parsed = parseStudentProfileInput({
    displayName: naam,
    email: emailRaw,
    phone: telefoon,
    educationType,
    startDate,
    privacyConfirmed,
  });
  if (!parsed.ok) return parsed;
  if (geboortedatum && !isIsoDate(geboortedatum)) {
    return { ok: false, error: "Vul een geldige geboortedatum in." };
  }
  const { displayName, email } = parsed.value;

  const service = createServiceRoleClient();
  if (
    parsed.value.educationType === "RIS_2_0" &&
    roles.includes("instructor") &&
    !(await isInstructorRis20Qualified(service, tenant.id, user.id))
  ) {
    return {
      ok: false,
      error:
        "RIS 2.0 kan alleen worden gekozen door een gekwalificeerde instructeur.",
    };
  }

  const nawNotes = buildDirectStudentNawNotes({
    geboortedatum,
    adres,
    postcode,
    woonplaats,
    ophaaladres,
  });

  const duplicateChecks = await Promise.all([
    email
      ? service
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", tenant.id)
          .ilike("email", email)
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
    telefoon
      ? service
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", tenant.id)
          .eq("phone", telefoon)
          .limit(3)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const duplicate = duplicateChecks
    .flatMap((result) => result.data ?? [])
    .find((candidate) => candidate.id);
  if (duplicate) {
    return {
      ok: false,
      error: `Mogelijke dubbele leerling gevonden: ${duplicate.full_name}. Open het bestaande dossier of controleer de contactgegevens.`,
    };
  }

  let newUserId: string | null = null;
  let tijdelijkWachtwoord: string | null = null;
  if (email) {
    tijdelijkWachtwoord = generateTemporaryPassword();
    const { data: created, error: createErr } =
      await service.auth.admin.createUser({
        email,
        password: tijdelijkWachtwoord,
        email_confirm: true,
        user_metadata: {
          must_change_password: true,
          full_name: displayName,
        },
      });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Accountaanmaak mislukt.";
      if (
        msg.toLowerCase().includes("already registered") ||
        msg.toLowerCase().includes("already been registered")
      ) {
        return { ok: false, error: "Dit e-mailadres is al in gebruik." };
      }
      return { ok: false, error: msg };
    }
    newUserId = created.user.id;
  }

  if (newUserId) {
    const { error: profileErr } = await service
      .from("profiles")
      .upsert(
        { id: newUserId, email, full_name: displayName },
        { onConflict: "id" },
      );
    if (profileErr) {
      await service.auth.admin.deleteUser(newUserId).catch(() => {});
      return { ok: false, error: profileErr.message };
    }

    const { error: membershipErr } = await service
      .from("memberships")
      .upsert(
        { user_id: newUserId, tenant_id: tenant.id, role: "student" },
        { onConflict: "user_id,tenant_id,role" },
      );
    if (membershipErr) {
      await service.auth.admin.deleteUser(newUserId).catch(() => {});
      return { ok: false, error: membershipErr.message };
    }
  }

  const { data: studentRow, error: studentErr } = await service
    .from("students")
    .insert({
      tenant_id: tenant.id,
      user_id: newUserId,
      lead_id: null,
      full_name: displayName,
      email,
      phone: telefoon,
      postcode,
      birth_date: geboortedatum,
      address_line: adres,
      city: woonplaats,
      pickup_address: ophaaladres || adres,
      notes: null,
    })
    .select("id")
    .single();

  if (studentErr || !studentRow) {
    if (newUserId) {
      await service.auth.admin.deleteUser(newUserId).catch(() => {});
    }
    return {
      ok: false,
      error: studentErr?.message ?? "Leerlingrij aanmaken mislukt.",
    };
  }

  const studentId: string = studentRow.id as string;
  const { data: enrollmentId, error: enrollmentError } = await service.rpc(
    "create_training_enrollment",
    {
      p_tenant_id: tenant.id,
      p_student_id: studentId,
      p_training_method: parsed.value.educationType,
      p_curriculum_version_id: null,
      p_actor: user.id,
      p_started_at: parsed.value.startDate
        ? `${parsed.value.startDate}T00:00:00.000Z`
        : null,
    },
  );
  if (enrollmentError || !enrollmentId) {
    if (enrollmentError) {
      console.error(
        "[createStudentDirect] training enrollment failed:",
        enrollmentError.message,
      );
    }
    await service
      .from("students")
      .delete()
      .eq("id", studentId)
      .eq("tenant_id", tenant.id);
    if (newUserId) {
      await service.auth.admin.deleteUser(newUserId).catch(() => {});
    }
    return {
      ok: false,
      error: "De gekozen opleiding kon niet aan de leerling worden gekoppeld.",
    };
  }

  if (roles.includes("instructor")) {
    const { error: assignmentError } = await service
      .from("chat_conversations")
      .upsert(
        {
          tenant_id: tenant.id,
          student_id: studentId,
          instructor_id: user.id,
        },
        { onConflict: "tenant_id,student_id,instructor_id" },
      );
    if (assignmentError) {
      await service
        .from("training_enrollments")
        .delete()
        .eq("id", String(enrollmentId))
        .eq("tenant_id", tenant.id);
      await service
        .from("students")
        .delete()
        .eq("id", studentId)
        .eq("tenant_id", tenant.id);
      if (newUserId) {
        await service.auth.admin.deleteUser(newUserId).catch(() => {});
      }
      return {
        ok: false,
        error: "Leerling kon niet veilig aan de instructeur worden gekoppeld.",
      };
    }
  }

  const portalStatus = portalStatusForStudent({
    email,
    authUserId: newUserId,
  });
  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "student_created_direct",
    target_type: "student",
    target_id: studentId,
    payload: {
      full_name: displayName,
      has_email: Boolean(email),
      has_naw_details: Boolean(nawNotes),
      education_type: parsed.value.educationType,
      requested_start_date: parsed.value.startDate,
      portal_status: portalStatus,
      assigned_instructor_id: roles.includes("instructor") ? user.id : null,
    },
  });

  // Send welcome email — best-effort: creation always succeeds; email failure
  // surfaces as a warning so the admin knows to resend manually.
  let emailWarning: string | undefined;
  if (email && tijdelijkWachtwoord)
    try {
      const [branding, platformConfig] = await Promise.all([
        loadEmailBranding(service, tenant.id),
        getPlatformEmailConfig(service).catch(() => null),
      ]);
      const appUrl =
        process.env["NEXT_PUBLIC_APP_URL"] ??
        process.env["NEXTAUTH_URL"] ??
        "https://nxtdrive.io";
      const loginUrl = `${appUrl}/login`;
      const emailContent = renderStudentWelcome(branding, {
        studentName: displayName,
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
          emailWarning =
            "E-mail is niet geconfigureerd voor deze omgeving. Verstuur de inloggegevens handmatig via 'Inloggegevens opnieuw versturen'.";
        } else {
          console.error(
            "[createStudentDirect] sendEmail failed:",
            emailResult.error,
          );
          emailWarning = `Welkomstmail kon niet worden verstuurd (${emailResult.error}). Gebruik 'Inloggegevens opnieuw versturen' op de leerlingpagina.`;
        }
      }
    } catch (err) {
      console.error("[createStudentDirect] email pipeline threw:", err);
      emailWarning =
        "Welkomstmail kon niet worden verstuurd. Gebruik 'Inloggegevens opnieuw versturen' op de leerlingpagina.";
    }

  revalidatePath("/backoffice/leerlingen");
  revalidatePath("/instructeur/leerlingen");
  return { ok: true, studentId, portalStatus, emailWarning };
}

export type UpdateStudentContactProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateStudentContactProfile(
  formData: FormData,
): Promise<UpdateStudentContactProfileResult> {
  const studentId = String(formData.get("student_id") ?? "").trim();
  if (!studentId) return { ok: false, error: "Leerling ontbreekt." };

  const parsed = parseStudentContactProfileInput({
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    postcode: formData.get("postcode"),
    birthDate: formData.get("birth_date"),
    addressLine: formData.get("address_line"),
    city: formData.get("city"),
    pickupAddress: formData.get("pickup_address"),
  });
  if (!parsed.ok) return parsed;

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) return { ok: false, error: "Leerling niet gevonden." };
  if (student.user_id && !parsed.value.email) {
    return {
      ok: false,
      error: "Een leerling met een portaalaccount moet een e-mailadres houden.",
    };
  }

  const duplicate = parsed.value.email
    ? await service
        .from("students")
        .select("id")
        .eq("tenant_id", context.organization.id)
        .neq("id", studentId)
        .ilike("email", parsed.value.email)
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  if (duplicate.error) {
    return { ok: false, error: "E-mailadres kon niet worden gecontroleerd." };
  }
  if (duplicate.data) {
    return {
      ok: false,
      error: "Dit e-mailadres hoort al bij een andere leerling.",
    };
  }

  const emailChanged = parsed.value.email !== student.email;
  let previousAuthEmail: string | null = null;

  if (student.user_id && emailChanged && parsed.value.email) {
    const { data: authUser, error: authLoadError } =
      await service.auth.admin.getUserById(student.user_id);
    if (authLoadError || !authUser.user) {
      return {
        ok: false,
        error:
          authLoadError?.message ??
          "Het gekoppelde portalaccount kon niet worden geladen.",
      };
    }

    previousAuthEmail = authUser.user.email ?? null;

    const { error: authError } = await service.auth.admin.updateUserById(
      student.user_id,
      {
        email: parsed.value.email,
        email_confirm: true,
      },
    );
    if (authError) {
      return {
        ok: false,
        error: authError.message.toLowerCase().includes("already")
          ? "Dit e-mailadres is al gekoppeld aan een ander account."
          : "Het e-mailadres van het portaalaccount kon niet worden gewijzigd.",
      };
    }
  }

  const { error } = await service.rpc("update_student_contact_profile", {
    p_student_id: studentId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_full_name: parsed.value.fullName,
    p_email: parsed.value.email,
    p_phone: parsed.value.phone,
    p_postcode: parsed.value.postcode,
    p_birth_date: parsed.value.birthDate,
    p_address_line: parsed.value.addressLine,
    p_city: parsed.value.city,
    p_pickup_address: parsed.value.pickupAddress,
  });
  if (error) {
    if (student.user_id && emailChanged && previousAuthEmail) {
      await service.auth.admin
        .updateUserById(student.user_id, {
          email: previousAuthEmail,
          email_confirm: true,
        })
        .catch(() => {});
    }
    return {
      ok: false,
      error: error.message.includes("already belongs")
        ? "Dit e-mailadres hoort al bij een andere leerling."
        : "Leerlinggegevens konden niet worden opgeslagen.",
    };
  }

  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  revalidatePath("/backoffice/leerlingen");
  revalidatePath(`/instructeur/leerlingen/${studentId}`);
  revalidatePath("/instructeur/leerlingen");
  return { ok: true };
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
    redirect(
      `${base}?welcome_error=${encodeURIComponent("Leerling niet gevonden.")}`,
    );
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
      "https://nxtdrive.io";
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
      console.error(
        "[resendWelcomeEmail] sendEmail failed:",
        emailResult.error,
      );
      redirect(`${base}?welcome_error=${encodeURIComponent(msg)}`);
    }
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "E-mail versturen mislukt.";
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
    const { notifyStudentReviewRequest } =
      await import("@/lib/notifications/dispatch");
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
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
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
  let uploadLimit: RateLimitDecision;
  try {
    uploadLimit = await consumeRateLimit({
      purpose: "upload",
      identifiers: [tenant.id, user.id],
    });
  } catch {
    redirect(`${base}?doc_error=scan_unavailable`);
  }
  if (!uploadLimit.allowed) {
    redirect(`${base}?doc_error=rate_limited`);
  }
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${tenant.id}/${studentId}/${randomUUID()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasExpectedDocumentSignature(buffer, file.type)) {
    redirect(`${base}?doc_error=bad_signature`);
  }
  const malwareScan = await scanDocumentForMalware(buffer);
  if (malwareScan === "INFECTED") {
    redirect(`${base}?doc_error=malware`);
  }
  if (malwareScan === "UNAVAILABLE") {
    redirect(`${base}?doc_error=scan_unavailable`);
  }
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

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function buildDirectStudentNawNotes(input: {
  geboortedatum: string | null;
  adres: string | null;
  postcode: string | null;
  woonplaats: string | null;
  ophaaladres: string | null;
}): string | null {
  const rows = [
    ["Geboortedatum", input.geboortedatum],
    ["Adres", input.adres],
    ["Postcode", input.postcode],
    ["Woonplaats", input.woonplaats],
    ["Ophaaladres", input.ophaaladres ?? input.adres],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  if (rows.length === 0) return null;
  return [
    "NAW gegevens",
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
}

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
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const relation = String(formData.get("relation") ?? "")
    .trim()
    .slice(0, 80);
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
      error:
        err instanceof Error ? err.message : "Ouderaccount aanmaken mislukt.",
    };
  }

  // Ensure a profile row (RLS reads resolve the guardian's name/email from it).
  const { error: profileErr } = await service
    .from("profiles")
    .upsert({ id: guardianUserId, email }, { onConflict: "id" });
  if (profileErr) return { ok: false, error: profileErr.message };

  // Ensure a parent membership in this tenant (idempotent).
  const { error: membershipErr } = await service
    .from("memberships")
    .upsert(
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
  if (studentId && !student)
    return { ok: false, error: "Leerling niet gevonden." };

  const { error } = await service.rpc("unlink_student_guardian", {
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_guardian_id: guardianId,
  });
  if (error) return { ok: false, error: error.message };

  if (studentId) revalidatePath(`/backoffice/leerlingen/${studentId}`);
  return { ok: true };
}
