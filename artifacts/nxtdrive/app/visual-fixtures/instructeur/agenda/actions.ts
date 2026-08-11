"use server";

import { redirect } from "next/navigation";

export async function createFixtureCalendarAppointment(formData: FormData) {
  if (process.env.VISUAL_FIXTURES_ENABLED !== "true") {
    throw new Error("Visual fixtures are disabled.");
  }
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const type = String(formData.get("type") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^\d{2}:\d{2}$/.test(time) ||
    type !== "lesson" ||
    !studentId
  ) {
    throw new Error("Invalid visual calendar fixture input.");
  }
  const params = new URLSearchParams({
    fixture: "empty",
    created: "lesson",
    date,
    time,
    student: studentId,
  });
  redirect(`/visual-fixtures/instructeur/agenda?${params.toString()}`);
}
