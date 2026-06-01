"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { TASK_PRIORITIES, type TaskPriority } from "@/lib/tasks/types";

const ROLES = ["tenant_admin", "instructor"] as const;

function priorityOf(v: unknown): TaskPriority {
  return typeof v === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(v)
    ? (v as TaskPriority)
    : "normal";
}

function cleanStr(v: FormDataEntryValue | null, max: number): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
}

export type ActionResult = { ok: boolean; error?: string };

export async function createTask(formData: FormData): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);

  const boardId = String(formData.get("board_id") ?? "");
  const columnId = String(formData.get("column_id") ?? "");
  const title = cleanStr(formData.get("title"), 200);
  if (!boardId || !columnId) return { ok: false, error: "Bord of kolom ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };

  const assignee = cleanStr(formData.get("assignee_user_id"), 100);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("create_task", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_board_id: boardId,
    p_column_id: columnId,
    p_title: title,
    p_description: cleanStr(formData.get("description"), 4000),
    p_priority: priorityOf(formData.get("priority")),
    p_due_date: cleanStr(formData.get("due_date"), 10),
    p_assignee_user_id: assignee,
    p_department_id: null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function updateTask(formData: FormData): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);

  const taskId = String(formData.get("task_id") ?? "");
  const title = cleanStr(formData.get("title"), 200);
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("update_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_title: title,
    p_description: cleanStr(formData.get("description"), 4000),
    p_priority: priorityOf(formData.get("priority")),
    p_due_date: cleanStr(formData.get("due_date"), 10),
    p_department_id: null,
  });
  if (error) return { ok: false, error: error.message };

  // Assignment is a separate RPC; always sync it (null clears the assignee).
  const assignee = cleanStr(formData.get("assignee_user_id"), 100);
  const { error: assignErr } = await service.rpc("assign_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_assignee_user_id: assignee,
  });
  if (assignErr) return { ok: false, error: assignErr.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function moveTask(input: {
  taskId: string;
  columnId: string;
  position: number;
}): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  if (!input.taskId || !input.columnId) {
    return { ok: false, error: "Ongeldige verplaatsing." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("move_task", {
    p_task_id: input.taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_column_id: input.columnId,
    p_position: Math.max(0, Math.trunc(input.position)),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function archiveTask(formData: FormData): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("archive_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}
