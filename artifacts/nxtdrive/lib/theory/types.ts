export const THEORY_HOMEWORK_STATUSES = ["open", "done", "cancelled"] as const;
export type TheoryHomeworkStatus = (typeof THEORY_HOMEWORK_STATUSES)[number];

export const THEORY_HOMEWORK_STATUS_LABEL: Record<TheoryHomeworkStatus, string> = {
  open: "Openstaand",
  done: "Afgerond",
  cancelled: "Geannuleerd",
};

export const THEORY_HOMEWORK_STATUS_VARIANT: Record<
  TheoryHomeworkStatus,
  "success" | "warning" | "danger" | "info" | "default"
> = {
  open: "warning",
  done: "success",
  cancelled: "default",
};

export type TheoryModule = {
  id: string;
  tenant_id: string;
  code: string | null;
  title: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** A theory module with the skill ids it is coupled to (for management UI). */
export type TheoryModuleWithSkills = TheoryModule & {
  skillIds: string[];
};

export type TheoryHomework = {
  id: string;
  tenant_id: string;
  student_id: string;
  theory_module_id: string;
  lesson_id: string | null;
  status: TheoryHomeworkStatus;
  deadline: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Homework joined with its module title for display. */
export type TheoryHomeworkWithModule = TheoryHomework & {
  moduleTitle: string;
};
