/**
 * Click-to-chat WhatsApp deeplink helpers ("knop"-variant).
 *
 * Pure, client-safe utilities: they normalise a phone number to international
 * format and build a wa.me link with a pre-filled message. There is NO server
 * dependency and NO external API key — opening the link hands off to WhatsApp
 * on the staff member's device. The WhatsApp Business API / automatic sending
 * is intentionally out of scope (later).
 */

const MIN_INTL_DIGITS = 8;
const MAX_INTL_DIGITS = 15;

/**
 * Normalise a raw phone number to international digits (no leading '+'), which
 * is the format wa.me expects (e.g. "31612345678"). Numbers without a country
 * code are assumed to be national for `defaultCountryCode` (NL by default):
 * the trunk '0' is dropped and the country code is prepended.
 *
 * Returns null when the input is missing or cannot yield a usable number, so
 * callers can hide the button when there is no reachable number.
 */
export function normalizePhoneForWhatsApp(
  raw: string | null | undefined,
  defaultCountryCode = "31",
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isInternational = trimmed.startsWith("+") || trimmed.startsWith("00");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (isInternational) {
    // "00" international prefix → strip it; "+" already removed by \D filter.
    digits = digits.replace(/^00/, "");
  } else {
    // National format → drop trunk zero(s) and prepend the country code.
    digits = digits.replace(/^0+/, "");
    if (!digits) return null;
    digits = `${defaultCountryCode}${digits}`;
  }

  if (digits.length < MIN_INTL_DIGITS || digits.length > MAX_INTL_DIGITS) {
    return null;
  }
  return digits;
}

/**
 * Build a wa.me click-to-chat link with a pre-filled message. Returns null when
 * the number cannot be normalised, so the caller can omit the button entirely.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
  defaultCountryCode = "31",
): string | null {
  const normalized = normalizePhoneForWhatsApp(phone, defaultCountryCode);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fullName.trim();
}

/**
 * Contextual NL message for first contact with a lead. `senderName` is the
 * white-label-aware sender name (the tenant's own school name), so the message
 * never leaks platform branding.
 */
export function leadWhatsAppMessage(
  leadName: string,
  senderName: string,
): string {
  return (
    `Hoi ${firstName(leadName)}, je spreekt met ${senderName}. ` +
    `Bedankt voor je interesse in rijlessen! Ik help je graag verder — ` +
    `heb je een momentje om je aanvraag even door te nemen?`
  );
}

/**
 * Contextual NL message for contacting an existing student. `senderName` is the
 * white-label-aware sender name (the tenant's own school name).
 */
export function studentWhatsAppMessage(
  studentName: string,
  senderName: string,
): string {
  return (
    `Hoi ${firstName(studentName)}, je spreekt met ${senderName}. ` +
    `Ik neem even contact met je op over je rijlessen.`
  );
}
