export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Task #54 - typed tasks. `manual` covers everything the Kanban created before;
// the rest are the lead-automation auto-task kinds (idempotent via dedupe_key).
export const TASK_TYPES = [
  "manual",
  "new_lead_contact",
  "intake_review",
  "trial_plan",
  "trial_confirm",
  "trial_complete",
  "assessment",
  "package_advice",
  "payment_followup",
  "reengage",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  manual: "Handmatig",
  new_lead_contact: "Nieuwe lead bellen",
  intake_review: "Intake beoordelen",
  trial_plan: "Proefles plannen",
  trial_confirm: "Proefles bevestigen",
  trial_complete: "Proefles afronden",
  assessment: "Beoordeling maken",
  package_advice: "Pakketadvies sturen",
  payment_followup: "Betaling opvolgen",
  reengage: "Lead heractiveren",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

export const TASK_PRIORITY_VARIANT: Record<
  TaskPriority,
  "info" | "default" | "warning" | "danger"
> = {
  low: "info",
  normal: "default",
  high: "warning",
  urgent: "danger",
};

export type TaskDepartment = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  sort_order: number;
};

export type TaskBoard = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  department_id: string | null;
  name: string;
  sort_order: number;
};

export type TaskColumn = {
  id: string;
  tenant_id: string;
  board_id: string;
  name: string;
  sort_order: number;
  wip_limit: number | null;
};

export type Task = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  board_id: string;
  column_id: string;
  department_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  assignee_user_id: string | null;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantMember = {
  id: string;
  full_name: string | null;
};

export const TASK_LINK_TYPES = [
  "student",
  "invoice",
  "exam",
  "lesson",
  "lead",
  "instructor",
] as const;
export type TaskLinkType = (typeof TASK_LINK_TYPES)[number];

export const TASK_LINK_TYPE_LABEL: Record<TaskLinkType, string> = {
  student: "Leerling",
  invoice: "Factuur",
  exam: "Examen",
  lesson: "Les",
  lead: "Lead",
  instructor: "Instructeur",
};

export type TaskLinkRow = {
  id: string;
  tenant_id: string;
  task_id: string;
  entity_type: TaskLinkType;
  entity_id: string;
  created_at: string;
};

/** A task link enriched with a display label and (optional) deep-link href. */
export type ResolvedTaskLink = {
  id: string;
  task_id: string;
  entity_type: TaskLinkType;
  entity_id: string;
  label: string;
  href: string | null;
};

export type EntitySearchResult = { id: string; label: string };
