export const EDUCATION_TYPES = [
  "STANDARD",
  "RIS_2_0",
  "RIS_1_0_LEGACY",
] as const;

export type EducationType = (typeof EDUCATION_TYPES)[number];
export type StudentPortalStatus =
  | "NO_ACCOUNT"
  | "INVITATION_AVAILABLE"
  | "INVITED"
  | "ACTIVE"
  | "SUSPENDED";

export type StudentProfileInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  educationType: EducationType;
  startDate?: string | null;
  privacyConfirmed: boolean;
};

export type ParsedStudentProfileInput = {
  displayName: string;
  email: string | null;
  phone: string | null;
  educationType: EducationType;
  startDate: string | null;
  privacyConfirmed: true;
};

export type StudentProfileParseResult =
  | { ok: true; value: ParsedStudentProfileInput }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultEducationTypeForInstructor(
  ris20Qualified: boolean,
): Exclude<EducationType, "RIS_1_0_LEGACY"> {
  return ris20Qualified ? "RIS_2_0" : "STANDARD";
}

export function parseStudentProfileInput(
  input: StudentProfileInput,
): StudentProfileParseResult {
  const displayName = input.displayName.trim().slice(0, 200);
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim().slice(0, 30) || null;
  const startDate = input.startDate?.trim().slice(0, 10) || null;

  if (!displayName) return { ok: false, error: "Naam is verplicht." };
  if (input.educationType === "RIS_1_0_LEGACY") {
    return {
      ok: false,
      error:
        "RIS 1.0 is alleen beschikbaar voor historische, read-only dossiers.",
    };
  }
  if (!["STANDARD", "RIS_2_0"].includes(input.educationType)) {
    return { ok: false, error: "Kies een geldig opleidingstype." };
  }
  if (email && !EMAIL_RE.test(email)) {
    return {
      ok: false,
      error: "Vul een geldig e-mailadres in of laat het veld leeg.",
    };
  }
  if (startDate && !ISO_DATE_RE.test(startDate)) {
    return { ok: false, error: "Vul een geldige startdatum in." };
  }
  if (!input.privacyConfirmed) {
    return {
      ok: false,
      error:
        "Bevestig dat de leerlinggegevens volgens het privacyproces zijn ontvangen.",
    };
  }

  return {
    ok: true,
    value: {
      displayName,
      email,
      phone,
      educationType: input.educationType,
      startDate,
      privacyConfirmed: true,
    },
  };
}

export function portalStatusForStudent(input: {
  email: string | null;
  authUserId: string | null;
}): StudentPortalStatus {
  if (input.authUserId) return "ACTIVE";
  if (input.email) return "INVITATION_AVAILABLE";
  return "NO_ACCOUNT";
}
