import {
  APPOINTMENT_TYPE_SHORT,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import type { PlanningBoardEvent } from "./types";

export type PlanningBoardEventTone =
  | "lesson"
  | "trial_lesson"
  | "interim_test"
  | "exam"
  | "admin"
  | "theory"
  | "block";

export type PlanningBoardLayoutMode =
  | "resource_timeline"
  | "instructor_timeline";

export function planningBoardLayoutMode(detailMode: boolean): PlanningBoardLayoutMode {
  return detailMode ? "instructor_timeline" : "resource_timeline";
}

export function planningBoardEventTone(
  event: Pick<PlanningBoardEvent, "entityType" | "appointmentType">,
): PlanningBoardEventTone {
  if (event.entityType === "lesson") return "lesson";
  if (event.entityType === "trial_lesson") return "trial_lesson";
  if (event.appointmentType === "exam") return "exam";
  if (event.appointmentType === "interim_test") return "interim_test";
  if (event.appointmentType === "admin") return "admin";
  if (event.appointmentType === "theory_guidance") return "theory";
  return "block";
}

export function planningBoardEventLabel(
  event: Pick<
    PlanningBoardEvent,
    "entityType" | "appointmentType" | "subtitle"
  >,
): string {
  if (event.entityType === "lesson") return "Rijles";
  if (event.entityType === "trial_lesson") return "Proefles";
  const type = event.appointmentType as AgendaAppointmentType | null;
  return type && type in APPOINTMENT_TYPE_SHORT
    ? APPOINTMENT_TYPE_SHORT[type]
    : event.subtitle;
}
