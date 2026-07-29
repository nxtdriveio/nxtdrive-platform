import assert from "node:assert/strict";
import test from "node:test";
import { instructorTaskStatus, parseInstructorTaskInput } from "./tasks";

test("instructor task input normalizes a linked task", () => {
  assert.deepEqual(
    parseInstructorTaskInput({
      title: "  Bel leerling ",
      description: "  Bespreek volgende les ",
      priority: "high",
      dueDate: "2026-07-30",
      studentId: "30000000-0000-4000-8000-000000000001",
    }),
    {
      ok: true,
      value: {
        title: "Bel leerling",
        description: "Bespreek volgende les",
        priority: "high",
        dueDate: "2026-07-30",
        studentId: "30000000-0000-4000-8000-000000000001",
      },
    },
  );
});

test("instructor task input rejects invalid fields", () => {
  assert.deepEqual(parseInstructorTaskInput({ title: " " }), {
    ok: false,
    error: "Titel is verplicht.",
  });
  assert.deepEqual(
    parseInstructorTaskInput({ title: "Taak", priority: "critical" }),
    { ok: false, error: "Kies een geldige prioriteit." },
  );
  assert.deepEqual(
    parseInstructorTaskInput({ title: "Taak", studentId: "niet-een-uuid" }),
    { ok: false, error: "Kies een geldige leerling." },
  );
  assert.deepEqual(
    parseInstructorTaskInput({ title: "Taak", dueDate: "2026-02-31" }),
    { ok: false, error: "Kies een geldige einddatum." },
  );
});

test("instructor task due status is deterministic", () => {
  assert.equal(instructorTaskStatus(null, "2026-07-29"), "open");
  assert.equal(instructorTaskStatus("2026-07-28", "2026-07-29"), "late");
  assert.equal(instructorTaskStatus("2026-07-29", "2026-07-29"), "today");
  assert.equal(instructorTaskStatus("2026-07-30", "2026-07-29"), "open");
});
