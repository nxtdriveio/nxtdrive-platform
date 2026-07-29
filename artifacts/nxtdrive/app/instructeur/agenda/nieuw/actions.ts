"use server";

import { scheduleLesson } from "@/app/backoffice/agenda/actions";
import { createAppointment } from "@/lib/agenda/actions";

export async function createInstructorAgendaItem(formData: FormData) {
  if (String(formData.get("type") ?? "") === "lesson") {
    formData.set("detail_base", "/instructeur/lessen");
    return scheduleLesson(formData);
  }

  return createAppointment(formData);
}
