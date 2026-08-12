import type { InstructorDayCalendarType } from "../domain/instructor-day-calendar";
import { PLATFORM_APPOINTMENT_TYPE_POLICIES } from "../domain/appointment-policy";
import type { InstructorPlanningType } from "@/lib/agenda/types";

export type AppointmentCalendarTone =
  | "BLUE"
  | "VIOLET"
  | "ROSE"
  | "AMBER"
  | "GREEN"
  | "TEAL"
  | "NEUTRAL"
  | "SAND";

export type AppointmentCreationFlow =
  | "LESSON"
  | "EXAM"
  | "BREAK"
  | "PRIVATE"
  | "GENERIC"
  | "EXISTING_ONLY";

export type AppointmentTypePresentation = Readonly<{
  type: InstructorDayCalendarType;
  label: string;
  shortLabel: string;
  icon:
    | "car"
    | "graduation"
    | "flag"
    | "clipboard"
    | "coffee"
    | "user"
    | "calendar"
    | "tools"
    | "book";
  calendarTone: AppointmentCalendarTone;
  defaultDurationMinutes?: number;
  creationFlow: AppointmentCreationFlow;
}>;

function configured(
  type: InstructorPlanningType,
  creationFlow: AppointmentCreationFlow,
): AppointmentTypePresentation {
  const policy = PLATFORM_APPOINTMENT_TYPE_POLICIES[type];
  return Object.freeze({
    type,
    label: policy.label,
    shortLabel: policy.shortLabel,
    icon: policy.iconKey as AppointmentTypePresentation["icon"],
    calendarTone: policy.calendarTone,
    defaultDurationMinutes: policy.defaultDurationMinutes,
    creationFlow,
  });
}

export const APPOINTMENT_TYPE_CATALOG: Readonly<
  Record<InstructorDayCalendarType, AppointmentTypePresentation>
> = Object.freeze({
  lesson: configured("lesson", "LESSON"),
  trial: {
    type: "trial",
    label: "Proefles",
    shortLabel: "Proefles",
    icon: "graduation",
    calendarTone: "VIOLET",
    defaultDurationMinutes: 60,
    creationFlow: "EXISTING_ONLY",
  },
  exam: configured("exam", "EXAM"),
  interim_test: configured("interim_test", "EXAM"),
  theory_guidance: configured("theory_guidance", "GENERIC"),
  free_block: configured("free_block", "GENERIC"),
  break: configured("break", "BREAK"),
  private_block: configured("private_block", "PRIVATE"),
  maintenance: configured("maintenance", "GENERIC"),
  admin: configured("admin", "GENERIC"),
  vacation: configured("vacation", "GENERIC"),
});

export const QUICK_ADD_APPOINTMENT_TYPES = Object.freeze(
  (
    [
      "lesson",
      "exam",
      "interim_test",
      "theory_guidance",
      "break",
      "private_block",
      "free_block",
      "admin",
      "maintenance",
      "vacation",
    ] as const
  ).map((type) => APPOINTMENT_TYPE_CATALOG[type]),
);

export function appointmentTypePresentation(
  type: InstructorDayCalendarType,
): AppointmentTypePresentation {
  return APPOINTMENT_TYPE_CATALOG[type];
}
