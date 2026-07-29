export type StudentContactProfileInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  birthDate: string | null;
  addressLine: string | null;
  city: string | null;
  pickupAddress: string | null;
};

export type StudentContactProfileInputResult =
  | { ok: true; value: StudentContactProfileInput }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown, maxLength: number): string | null {
  return (
    String(value ?? "")
      .trim()
      .slice(0, maxLength) || null
  );
}

export function parseStudentContactProfileInput(
  input: Record<string, unknown>,
): StudentContactProfileInputResult {
  const fullName = String(input.fullName ?? "")
    .trim()
    .slice(0, 200);
  const email =
    optionalText(input.email, 320)?.toLocaleLowerCase("nl-NL") ?? null;
  const phone = optionalText(input.phone, 30);
  const postcode = optionalText(input.postcode, 10)?.toUpperCase() ?? null;
  const birthDate = optionalText(input.birthDate, 10);
  const addressLine = optionalText(input.addressLine, 240);
  const city = optionalText(input.city, 160);
  const pickupAddress = optionalText(input.pickupAddress, 240);

  if (!fullName) return { ok: false, error: "Naam is verplicht." };
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }
  if (birthDate && !isValidIsoDate(birthDate)) {
    return { ok: false, error: "Vul een geldige geboortedatum in." };
  }

  return {
    ok: true,
    value: {
      fullName,
      email,
      phone,
      postcode,
      birthDate,
      addressLine,
      city,
      pickupAddress,
    },
  };
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
