import { hoursToMinutes } from "@/lib/students/types";

export type InstructorCreditInput = {
  studentId: string;
  deltaMinutes: number;
  note: string;
};

export type InstructorCreditInputResult =
  | { ok: true; value: InstructorCreditInput }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_DELTA_MINUTES = 15;
const MAX_DELTA_MINUTES = 100 * 60;

export function parseInstructorCreditInput(
  input: Record<string, unknown>,
): InstructorCreditInputResult {
  const studentId = String(input.studentId ?? "").trim();
  const hours = Number(
    String(input.hours ?? "")
      .trim()
      .replace(",", "."),
  );
  const deltaMinutes = hoursToMinutes(hours);
  const note = String(input.note ?? "")
    .trim()
    .slice(0, 200);

  if (!UUID_RE.test(studentId)) {
    return { ok: false, error: "Leerling ontbreekt." };
  }
  if (
    !Number.isFinite(hours) ||
    hours < 0.25 ||
    hours > 100 ||
    !Number.isInteger(hours * 4) ||
    deltaMinutes < MIN_DELTA_MINUTES ||
    deltaMinutes > MAX_DELTA_MINUTES ||
    deltaMinutes % MIN_DELTA_MINUTES !== 0
  ) {
    return {
      ok: false,
      error: "Voeg 0,25 tot maximaal 100 uur toe, in stappen van 0,25 uur.",
    };
  }
  if (!note) {
    return { ok: false, error: "Vul een reden voor de toevoeging in." };
  }

  return {
    ok: true,
    value: {
      studentId,
      deltaMinutes,
      note,
    },
  };
}
