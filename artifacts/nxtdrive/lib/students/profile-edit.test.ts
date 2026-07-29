import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentContactProfileInput } from "./profile-edit";

test("student contact profile normalizes editable admin fields", () => {
  assert.deepEqual(
    parseStudentContactProfileInput({
      fullName: "  Mila Bakker ",
      email: " MILA@EXAMPLE.NL ",
      phone: " 06 12345678 ",
      postcode: " 1234 ab ",
      birthDate: "2002-04-12",
      addressLine: " Stationsplein 1 ",
      city: " Utrecht ",
      pickupAddress: " Schoolstraat 2 ",
    }),
    {
      ok: true,
      value: {
        fullName: "Mila Bakker",
        email: "mila@example.nl",
        phone: "06 12345678",
        postcode: "1234 AB",
        birthDate: "2002-04-12",
        addressLine: "Stationsplein 1",
        city: "Utrecht",
        pickupAddress: "Schoolstraat 2",
      },
    },
  );
});

test("student contact profile rejects invalid email and birth date", () => {
  assert.deepEqual(
    parseStudentContactProfileInput({
      fullName: "Mila",
      email: "geen-email",
    }),
    { ok: false, error: "Vul een geldig e-mailadres in." },
  );
  assert.deepEqual(
    parseStudentContactProfileInput({
      fullName: "Mila",
      birthDate: "2026-02-31",
    }),
    { ok: false, error: "Vul een geldige geboortedatum in." },
  );
});
