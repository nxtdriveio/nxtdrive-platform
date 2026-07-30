export type CanonicalStudentLocation = Readonly<{
  formattedAddress: string;
  city: string | null;
  postalCode: string | null;
}>;

export type StudentLocationDisplay = Readonly<{
  address: string | null;
  pickupLocation: string | null;
  city: string | null;
  postalCode: string | null;
  source: "CANONICAL" | "STRUCTURED" | "LEGACY_NOTES" | "MISSING";
}>;

export function resolveStudentLocationDisplay(input: {
  canonicalHome: CanonicalStudentLocation | null;
  canonicalPickup: CanonicalStudentLocation | null;
  student: {
    addressLine: string | null;
    pickupAddress: string | null;
    city: string | null;
    postalCode: string | null;
  };
  intake: {
    pickupLocation: string | null;
    city: string | null;
  } | null;
  legacyNotes: string | null;
}): StudentLocationDisplay {
  const canonicalPrimary = input.canonicalPickup ?? input.canonicalHome;
  const address =
    clean(input.canonicalHome?.formattedAddress) ??
    clean(input.student.addressLine) ??
    readLegacyNawNote(input.legacyNotes, "Adres");
  const pickupLocation =
    clean(input.canonicalPickup?.formattedAddress) ??
    clean(input.canonicalHome?.formattedAddress) ??
    clean(input.student.pickupAddress) ??
    clean(input.intake?.pickupLocation) ??
    readLegacyNawNote(input.legacyNotes, "Ophaaladres") ??
    address;
  const city =
    clean(canonicalPrimary?.city) ??
    clean(input.student.city) ??
    clean(input.intake?.city) ??
    readLegacyNawNote(input.legacyNotes, "Woonplaats");
  const postalCode =
    clean(canonicalPrimary?.postalCode) ?? clean(input.student.postalCode);
  const source =
    input.canonicalHome || input.canonicalPickup
      ? "CANONICAL"
      : input.student.addressLine ||
          input.student.pickupAddress ||
          input.student.city ||
          input.student.postalCode ||
          input.intake?.pickupLocation ||
          input.intake?.city
        ? "STRUCTURED"
        : address || pickupLocation || city
          ? "LEGACY_NOTES"
          : "MISSING";
  return Object.freeze({
    address,
    pickupLocation,
    city,
    postalCode,
    source,
  });
}

export function readLegacyNawNote(
  notes: string | null,
  label: string,
): string | null {
  const prefix = `${label.toLocaleLowerCase("nl-NL")}:`;
  const line = (notes ?? "")
    .split(/\r?\n/)
    .find((item) => item.trim().toLocaleLowerCase("nl-NL").startsWith(prefix));
  if (!line) return null;
  return clean(line.slice(line.indexOf(":") + 1));
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
