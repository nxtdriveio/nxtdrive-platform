import type {
  InstructorAppointment,
  InstructorExperience,
  InstructorTask,
} from "./redesign-data";

export type InstructorNextActionReason =
  | "OVERDUE_TASK"
  | "CRITICAL_ATTENTION"
  | "NEXT_LESSON"
  | "OPEN_TASK"
  | "PLAN_DAY";

export type InstructorNextAction = {
  reasonCode: InstructorNextActionReason;
  title: string;
  reason: string;
  urgency: string;
  subject?: string;
  time?: string;
  href: string;
};

export function deriveNextInstructorAction(input: {
  appointments: InstructorAppointment[];
  tasks: InstructorTask[];
  radar: InstructorExperience["radar"];
}): InstructorNextAction {
  const overdue = input.tasks.find((task) => task.status === "late");
  if (overdue) {
    return {
      reasonCode: "OVERDUE_TASK",
      title: overdue.title,
      reason: "Deze taak is te laat en blokkeert een complete lesdag.",
      urgency: "Nu",
      subject: overdue.subject,
      time: overdue.due,
      href: "/instructeur/taken",
    };
  }

  const critical = input.radar.find((item) => item.priority === "high");
  if (critical) {
    return {
      reasonCode: "CRITICAL_ATTENTION",
      title: "Kritiek aandachtspunt beoordelen",
      reason: critical.reason,
      urgency: "Vandaag",
      subject: critical.student,
      href: "/instructeur/leerlingen",
    };
  }

  const lesson =
    input.appointments.find((appointment) => appointment.type === "lesson") ??
    input.appointments[0];
  if (lesson) {
    return {
      reasonCode: "NEXT_LESSON",
      title: `${lesson.title} voorbereiden`,
      reason: "Dit is je eerstvolgende geplande afspraak.",
      urgency: "Volgende",
      subject: lesson.studentName,
      time: `${lesson.startsAt} - ${lesson.endsAt}`,
      href: lesson.href,
    };
  }

  const task = input.tasks[0];
  if (task) {
    return {
      reasonCode: "OPEN_TASK",
      title: task.title,
      reason: "Dit is de eerstvolgende openstaande taak.",
      urgency: task.priority === "high" ? "Vandaag" : "Binnenkort",
      subject: task.subject,
      time: task.due,
      href: "/instructeur/taken",
    };
  }

  return {
    reasonCode: "PLAN_DAY",
    title: "Plan je volgende les",
    reason: "Er staan geen afspraken of blokkades klaar.",
    urgency: "Wanneer het uitkomt",
    href: "/instructeur/agenda/nieuw",
  };
}
