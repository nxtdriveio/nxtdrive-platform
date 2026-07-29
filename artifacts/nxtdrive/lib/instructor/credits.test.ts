import assert from "node:assert/strict";
import test from "node:test";
import { parseInstructorCreditInput } from "./credits";

const studentId = "30000000-0000-4000-8000-000000000001";

test("instructor credit input converts positive quarter-hours to minutes", () => {
  assert.deepEqual(
    parseInstructorCreditInput({
      studentId,
      hours: "1,25",
      note: "Extra lestegoed",
    }),
    {
      ok: true,
      value: {
        studentId,
        deltaMinutes: 75,
        note: "Extra lestegoed",
      },
    },
  );
});

test("instructor credit input rejects deductions, oversized and unlabelled grants", () => {
  assert.deepEqual(
    parseInstructorCreditInput({
      studentId,
      hours: "-1",
      note: "Aftrek",
    }),
    {
      ok: false,
      error: "Voeg 0,25 tot maximaal 100 uur toe, in stappen van 0,25 uur.",
    },
  );
  assert.deepEqual(
    parseInstructorCreditInput({
      studentId,
      hours: "100.25",
      note: "Te veel",
    }),
    {
      ok: false,
      error: "Voeg 0,25 tot maximaal 100 uur toe, in stappen van 0,25 uur.",
    },
  );
  assert.deepEqual(
    parseInstructorCreditInput({
      studentId,
      hours: "0.251",
      note: "Geen kwartier",
    }),
    {
      ok: false,
      error: "Voeg 0,25 tot maximaal 100 uur toe, in stappen van 0,25 uur.",
    },
  );
  assert.deepEqual(
    parseInstructorCreditInput({ studentId, hours: "1", note: " " }),
    {
      ok: false,
      error: "Vul een reden voor de toevoeging in.",
    },
  );
});
