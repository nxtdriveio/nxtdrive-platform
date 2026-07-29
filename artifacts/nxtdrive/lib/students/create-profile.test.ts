import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStudentProfileInput,
  portalStatusForStudent,
} from "./create-profile";

test("a student profile can be created without an email or auth account", () => {
  const result = parseStudentProfileInput({
    displayName: "  Noor  ",
    email: " ",
    phone: " 06 12345678 ",
    educationType: "STANDARD",
    privacyConfirmed: true,
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      displayName: "Noor",
      email: null,
      phone: "06 12345678",
      educationType: "STANDARD",
      startDate: null,
      privacyConfirmed: true,
    },
  });
  assert.equal(portalStatusForStudent({ email: null, authUserId: null }), "NO_ACCOUNT");
});

test("student input validates an optional email only when supplied", () => {
  assert.deepEqual(
    parseStudentProfileInput({
      displayName: "Noor",
      email: "geen-email",
      educationType: "RIS_2_0",
      privacyConfirmed: true,
    }),
    { ok: false, error: "Vul een geldig e-mailadres in of laat het veld leeg." },
  );
});

test("student input requires a name and privacy confirmation", () => {
  assert.deepEqual(
    parseStudentProfileInput({
      displayName: "",
      educationType: "STANDARD",
      privacyConfirmed: true,
    }),
    { ok: false, error: "Naam is verplicht." },
  );
  assert.deepEqual(
    parseStudentProfileInput({
      displayName: "Noor",
      educationType: "STANDARD",
      privacyConfirmed: false,
    }),
    { ok: false, error: "Bevestig dat de leerlinggegevens volgens het privacyproces zijn ontvangen." },
  );
});

test("new active students cannot be enrolled into immutable RIS 1.0", () => {
  assert.deepEqual(
    parseStudentProfileInput({
      displayName: "Noor",
      educationType: "RIS_1_0_LEGACY",
      privacyConfirmed: true,
    }),
    {
      ok: false,
      error:
        "RIS 1.0 is alleen beschikbaar voor historische, read-only dossiers.",
    },
  );
});
