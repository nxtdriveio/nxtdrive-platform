import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudentLocationDisplay } from "./location-display";

const canonical = {
  formattedAddress: "Vondellaan 18, Utrecht",
  city: "Utrecht",
  postalCode: "3521 AB",
};

test("canonical location wins over structured and legacy values", () => {
  const result = resolveStudentLocationDisplay({
    canonicalHome: canonical,
    canonicalPickup: canonical,
    student: {
      addressLine: "Verouderd direct adres",
      pickupAddress: "Verouderd ophaaladres",
      city: "Gouda",
      postalCode: "0000 AA",
    },
    intake: { pickupLocation: "Intakeadres", city: "Rotterdam" },
    legacyNotes: "Adres: Notitieadres\nWoonplaats: Amsterdam",
  });
  assert.deepEqual(result, {
    address: canonical.formattedAddress,
    pickupLocation: canonical.formattedAddress,
    city: canonical.city,
    postalCode: canonical.postalCode,
    source: "CANONICAL",
  });
});

test("direct and converted students show the same canonical location", () => {
  const direct = resolveStudentLocationDisplay({
    canonicalHome: null,
    canonicalPickup: canonical,
    student: {
      addressLine: null,
      pickupAddress: canonical.formattedAddress,
      city: canonical.city,
      postalCode: canonical.postalCode,
    },
    intake: null,
    legacyNotes: null,
  });
  const converted = resolveStudentLocationDisplay({
    canonicalHome: null,
    canonicalPickup: canonical,
    student: {
      addressLine: null,
      pickupAddress: null,
      city: null,
      postalCode: null,
    },
    intake: {
      pickupLocation: "Oorspronkelijke intakeweergave",
      city: "Utrecht",
    },
    legacyNotes: "Ophaaladres: Legacyweergave",
  });
  assert.deepEqual(converted, direct);
});

test("structured fields precede temporary legacy notes", () => {
  const result = resolveStudentLocationDisplay({
    canonicalHome: null,
    canonicalPickup: null,
    student: {
      addressLine: "Structuurstraat 1",
      pickupAddress: "Ophaalstraat 2",
      city: "Utrecht",
      postalCode: "3521 AB",
    },
    intake: { pickupLocation: "Intakeadres", city: "Gouda" },
    legacyNotes: "Adres: Legacy 1\nOphaaladres: Legacy 2\nWoonplaats: Legacy",
  });
  assert.equal(result.address, "Structuurstraat 1");
  assert.equal(result.pickupLocation, "Ophaalstraat 2");
  assert.equal(result.city, "Utrecht");
  assert.equal(result.source, "STRUCTURED");
});

test("legacy notes remain an explicit last-resort migration fallback", () => {
  const result = resolveStudentLocationDisplay({
    canonicalHome: null,
    canonicalPickup: null,
    student: {
      addressLine: null,
      pickupAddress: null,
      city: null,
      postalCode: null,
    },
    intake: null,
    legacyNotes:
      "Adres: Tijdelijke straat 1\nOphaaladres: Tijdelijk ophaalpunt\nWoonplaats: Utrecht",
  });
  assert.equal(result.address, "Tijdelijke straat 1");
  assert.equal(result.pickupLocation, "Tijdelijk ophaalpunt");
  assert.equal(result.city, "Utrecht");
  assert.equal(result.source, "LEGACY_NOTES");
});

