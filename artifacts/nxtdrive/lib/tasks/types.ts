export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

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
