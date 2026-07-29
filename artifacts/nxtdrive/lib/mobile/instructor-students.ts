import "server-only";

import type { MobileInstructorContext } from "@/lib/mobile/auth";
import { MobileApiError } from "@/lib/mobile/auth";
import {
  parseStudentProfileInput,
  portalStatusForStudent,
} from "@/lib/students/create-profile";
import { isInstructorRis20Qualified } from "@/lib/instructor/qualifications";
import { generateTemporaryPassword } from "@/lib/auth/generate-password";
import { loadEmailBranding } from "@/lib/notifications/branding";
import { renderStudentWelcome } from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/provider";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type NativeStudentInput = {
  displayName?: unknown;
  email?: unknown;
  phone?: unknown;
  postcode?: unknown;
  birthDate?: unknown;
  addressLine?: unknown;
  city?: unknown;
  pickupAddress?: unknown;
  educationType?: unknown;
  startDate?: unknown;
  privacyConfirmed?: unknown;
};

export async function createNativeInstructorStudent(
  context: MobileInstructorContext,
  raw: NativeStudentInput,
) {
  const parsed = parseStudentProfileInput({
    displayName: String(raw.displayName ?? ""),
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    educationType: String(raw.educationType ?? "STANDARD") as
      | "STANDARD"
      | "RIS_2_0"
      | "RIS_1_0_LEGACY",
    startDate: String(raw.startDate ?? ""),
    privacyConfirmed: raw.privacyConfirmed === true,
  });
  if (!parsed.ok) {
    throw new MobileApiError(400, parsed.error, "invalid_student");
  }
  const postcode =
    String(raw.postcode ?? "")
      .trim()
      .slice(0, 10) || null;
  const birthDate =
    String(raw.birthDate ?? "")
      .trim()
      .slice(0, 10) || null;
  const addressLine =
    String(raw.addressLine ?? "")
      .trim()
      .slice(0, 240) || null;
  const city =
    String(raw.city ?? "")
      .trim()
      .slice(0, 160) || null;
  const pickupAddress =
    String(raw.pickupAddress ?? "")
      .trim()
      .slice(0, 240) || null;
  if (birthDate && !isIsoDate(birthDate)) {
    throw new MobileApiError(
      400,
      "Vul een geldige geboortedatum in.",
      "invalid_birth_date",
    );
  }

  const limit = await consumeRateLimit({
    purpose: "student_create",
    identifiers: [context.tenant.id, context.user.id],
  });
  if (!limit.allowed) {
    throw new MobileApiError(
      429,
      "Te veel leerlingen achter elkaar aangemaakt. Probeer het later opnieuw.",
      "rate_limited",
    );
  }
  if (
    parsed.value.educationType === "RIS_2_0" &&
    context.roles.includes("instructor") &&
    !(await isInstructorRis20Qualified(
      context.service,
      context.tenant.id,
      context.user.id,
    ))
  ) {
    throw new MobileApiError(
      403,
      "RIS 2.0 kan alleen worden gekozen door een gekwalificeerde instructeur.",
      "ris_qualification_required",
    );
  }

  const duplicateChecks = await Promise.all([
    parsed.value.email
      ? context.service
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", context.tenant.id)
          .ilike("email", parsed.value.email)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    parsed.value.phone
      ? context.service
          .from("students")
          .select("id, full_name")
          .eq("tenant_id", context.tenant.id)
          .eq("phone", parsed.value.phone)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const duplicate = duplicateChecks
    .flatMap((result) => result.data ?? [])
    .find((candidate) => candidate.id);
  if (duplicate) {
    throw new MobileApiError(
      409,
      `Mogelijke dubbele leerling gevonden: ${duplicate.full_name}.`,
      "duplicate_student",
    );
  }

  let authUserId: string | null = null;
  let temporaryPassword: string | null = null;
  if (parsed.value.email) {
    temporaryPassword = generateTemporaryPassword();
    const { data, error } = await context.service.auth.admin.createUser({
      email: parsed.value.email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        must_change_password: true,
        full_name: parsed.value.displayName,
      },
    });
    if (error || !data.user) {
      throw new MobileApiError(
        error?.message.toLowerCase().includes("already") ? 409 : 503,
        error?.message.toLowerCase().includes("already")
          ? "Dit e-mailadres is al in gebruik."
          : "Het leerlingaccount kon niet worden aangemaakt.",
        "student_account_failed",
      );
    }
    authUserId = data.user.id;

    const { error: profileError } = await context.service
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          email: parsed.value.email,
          full_name: parsed.value.displayName,
        },
        { onConflict: "id" },
      );
    const { error: membershipError } = profileError
      ? { error: profileError }
      : await context.service.from("memberships").upsert(
          {
            user_id: authUserId,
            tenant_id: context.tenant.id,
            role: "student",
          },
          { onConflict: "user_id,tenant_id,role" },
        );
    if (profileError || membershipError) {
      await context.service.auth.admin.deleteUser(authUserId).catch(() => {});
      throw new MobileApiError(
        503,
        "Het leerlingaccount kon niet aan de rijschool worden gekoppeld.",
        "student_account_link_failed",
      );
    }
  }

  const { data: studentRow, error: studentError } = await context.service
    .from("students")
    .insert({
      tenant_id: context.tenant.id,
      user_id: authUserId,
      lead_id: null,
      full_name: parsed.value.displayName,
      email: parsed.value.email,
      phone: parsed.value.phone,
      postcode,
      birth_date: birthDate,
      address_line: addressLine,
      city,
      pickup_address: pickupAddress || addressLine,
      notes: null,
    })
    .select("id")
    .single();
  if (studentError || !studentRow) {
    if (authUserId) {
      await context.service.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    throw new MobileApiError(
      503,
      "Het leerlingdossier kon niet worden aangemaakt.",
      "student_create_failed",
    );
  }
  const studentId = String(studentRow.id);
  const { data: enrollmentId, error: enrollmentError } =
    await context.service.rpc("create_training_enrollment", {
      p_tenant_id: context.tenant.id,
      p_student_id: studentId,
      p_training_method: parsed.value.educationType,
      p_curriculum_version_id: null,
      p_actor: context.user.id,
      p_started_at: parsed.value.startDate
        ? `${parsed.value.startDate}T00:00:00.000Z`
        : null,
    });
  if (enrollmentError || !enrollmentId) {
    await rollbackStudent(context, studentId, authUserId);
    throw new MobileApiError(
      503,
      "De gekozen opleiding kon niet worden gekoppeld.",
      "enrollment_create_failed",
    );
  }

  if (context.roles.includes("instructor")) {
    const { error: assignmentError } = await context.service
      .from("chat_conversations")
      .upsert(
        {
          tenant_id: context.tenant.id,
          student_id: studentId,
          instructor_id: context.user.id,
        },
        { onConflict: "tenant_id,student_id,instructor_id" },
      );
    if (assignmentError) {
      await context.service
        .from("training_enrollments")
        .delete()
        .eq("id", String(enrollmentId))
        .eq("tenant_id", context.tenant.id);
      await rollbackStudent(context, studentId, authUserId);
      throw new MobileApiError(
        503,
        "De leerling kon niet veilig aan de instructeur worden gekoppeld.",
        "student_assignment_failed",
      );
    }
  }

  const portalStatus = portalStatusForStudent({
    email: parsed.value.email,
    authUserId,
  });
  await context.service.from("audit_log").insert({
    actor_user_id: context.user.id,
    tenant_id: context.tenant.id,
    action: "student_created_native",
    target_type: "student",
    target_id: studentId,
    payload: {
      has_email: Boolean(parsed.value.email),
      education_type: parsed.value.educationType,
      portal_status: portalStatus,
    },
  });

  let emailWarning: string | null = null;
  if (parsed.value.email && temporaryPassword) {
    try {
      const [branding, platformConfig] = await Promise.all([
        loadEmailBranding(context.service, context.tenant.id),
        getPlatformEmailConfig(context.service).catch(() => null),
      ]);
      const appUrl =
        process.env["NEXT_PUBLIC_APP_URL"] ??
        process.env["NEXTAUTH_URL"] ??
        "https://nxtdrive.io";
      const content = renderStudentWelcome(branding, {
        studentName: parsed.value.displayName,
        email: parsed.value.email,
        temporaryPassword,
        loginUrl: `${appUrl}/login`,
      });
      const result = await sendEmail({
        to: parsed.value.email,
        fromName: branding.tenantName,
        email: content,
        platformConfig: platformConfig ?? undefined,
      });
      if (!result.ok) {
        emailWarning =
          "Leerling en account zijn aangemaakt, maar de welkomstmail kon niet worden verstuurd.";
      }
    } catch {
      emailWarning =
        "Leerling en account zijn aangemaakt, maar de welkomstmail kon niet worden verstuurd.";
    }
  }

  return { studentId, portalStatus, emailWarning };
}

async function rollbackStudent(
  context: MobileInstructorContext,
  studentId: string,
  authUserId: string | null,
) {
  await context.service
    .from("students")
    .delete()
    .eq("id", studentId)
    .eq("tenant_id", context.tenant.id);
  if (authUserId) {
    await context.service.auth.admin.deleteUser(authUserId).catch(() => {});
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}
