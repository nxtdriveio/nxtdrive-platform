import type { TaskPriority } from "@/lib/tasks/types";

export type InstructorTaskStatus = "open" | "today" | "late";

export type InstructorTaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  status: InstructorTaskStatus;
  studentId: string | null;
  studentName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InstructorTaskStudent = {
  id: string;
  name: string;
};

export type InstructorTaskWorkspace = {
  tasks: InstructorTaskItem[];
  students: InstructorTaskStudent[];
};

export type InstructorTaskInput = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  studentId: string | null;
};

export type InstructorTaskInputResult =
  | { ok: true; value: InstructorTaskInput }
  | { ok: false; error: string };

const TASK_PRIORITIES = new Set<TaskPriority>([
  "low",
  "normal",
  "high",
  "urgent",
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIsoDate(value: string) {
  if (!ISO_DATE_RE.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function parseInstructorTaskInput(
  input: Record<string, unknown>,
): InstructorTaskInputResult {
  const title = String(input.title ?? "")
    .trim()
    .slice(0, 200);
  const description =
    String(input.description ?? "")
      .trim()
      .slice(0, 4000) || null;
  const rawPriority = String(input.priority ?? "normal") as TaskPriority;
  const dueDate =
    String(input.dueDate ?? "")
      .trim()
      .slice(0, 10) || null;
  const studentId = String(input.studentId ?? "").trim() || null;

  if (!title) return { ok: false, error: "Titel is verplicht." };
  if (!TASK_PRIORITIES.has(rawPriority)) {
    return { ok: false, error: "Kies een geldige prioriteit." };
  }
  if (dueDate && !isValidIsoDate(dueDate)) {
    return { ok: false, error: "Kies een geldige einddatum." };
  }
  if (studentId && !UUID_RE.test(studentId)) {
    return { ok: false, error: "Kies een geldige leerling." };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      priority: rawPriority,
      dueDate,
      studentId,
    },
  };
}

export function instructorTaskStatus(
  dueDate: string | null,
  todayYmd: string,
): InstructorTaskStatus {
  if (!dueDate) return "open";
  if (dueDate < todayYmd) return "late";
  if (dueDate === todayYmd) return "today";
  return "open";
}
