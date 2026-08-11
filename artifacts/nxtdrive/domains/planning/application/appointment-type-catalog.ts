import type { InstructorDayCalendarType } from "../domain/instructor-day-calendar";

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

export const APPOINTMENT_TYPE_CATALOG: Readonly<
  Record<InstructorDayCalendarType, AppointmentTypePresentation>
> = Object.freeze({
  lesson: {
    type: "lesson",
    label: "Rijles",
    shortLabel: "Rijles",
    icon: "car",
    calendarTone: "BLUE",
    defaultDurationMinutes: 60,
    creationFlow: "LESSON",
  },
  trial: {
    type: "trial",
    label: "Proefles",
    shortLabel: "Proefles",
    icon: "graduation",
    calendarTone: "VIOLET",
    defaultDurationMinutes: 60,
    creationFlow: "EXISTING_ONLY",
  },
  exam: {
    type: "exam",
    label: "Examen",
    shortLabel: "Examen",
    icon: "flag",
    calendarTone: "ROSE",
    defaultDurationMinutes: 60,
    creationFlow: "EXAM",
  },
  interim_test: {
    type: "interim_test",
    label: "Tussentijdse toets",
    shortLabel: "TTT",
    icon: "clipboard",
    calendarTone: "AMBER",
    defaultDurationMinutes: 60,
    creationFlow: "EXAM",
  },
  theory_guidance: {
    type: "theory_guidance",
    label: "Theoriebegeleiding",
    shortLabel: "Theorie",
    icon: "book",
    calendarTone: "TEAL",
    defaultDurationMinutes: 60,
    creationFlow: "GENERIC",
  },
  free_block: {
    type: "free_block",
    label: "Vrij blok",
    shortLabel: "Vrij",
    icon: "calendar",
    calendarTone: "SAND",
    defaultDurationMinutes: 60,
    creationFlow: "GENERIC",
  },
  break: {
    type: "break",
    label: "Pauze",
    shortLabel: "Pauze",
    icon: "coffee",
    calendarTone: "NEUTRAL",
    defaultDurationMinutes: 30,
    creationFlow: "BREAK",
  },
  private_block: {
    type: "private_block",
    label: "Privé",
    shortLabel: "Privé",
    icon: "user",
    calendarTone: "GREEN",
    defaultDurationMinutes: 60,
    creationFlow: "PRIVATE",
  },
  maintenance: {
    type: "maintenance",
    label: "Onderhoud",
    shortLabel: "Onderhoud",
    icon: "tools",
    calendarTone: "AMBER",
    defaultDurationMinutes: 60,
    creationFlow: "GENERIC",
  },
  admin: {
    type: "admin",
    label: "Administratie",
    shortLabel: "Admin",
    icon: "clipboard",
    calendarTone: "TEAL",
    defaultDurationMinutes: 30,
    creationFlow: "GENERIC",
  },
  vacation: {
    type: "vacation",
    label: "Vakantie",
    shortLabel: "Vakantie",
    icon: "calendar",
    calendarTone: "SAND",
    defaultDurationMinutes: 60,
    creationFlow: "GENERIC",
  },
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
