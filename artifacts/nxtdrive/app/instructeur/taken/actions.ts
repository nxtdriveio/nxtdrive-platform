"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  parseInstructorTaskInput,
  type InstructorTaskInput,
} from "@/lib/instructor/tasks";
import { createServiceRoleClient } from "@/lib/supabase/service";

export type InstructorTaskActionResult =
  | { ok: true; taskId?: string }
  | { ok: false; error: string };

type InstructorTaskContext = Awaited<
  ReturnType<typeof requireInstructorTaskContext>
>;

async function requireInstructorTaskContext() {
  const auth = await requireActiveTenant(["instructor", "tenant_admin"]);
  return { ...auth, service: createServiceRoleClient() };
}

function inputFromFormData(formData: FormData) {
  return parseInstructorTaskInput({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    dueDate: formData.get("due_date"),
    studentId: formData.get("student_id"),
  });
}

async function requireOwnedTask(
  context: InstructorTaskContext,
  taskId: string,
): Promise<
  | {
      ok: true;
      task: { id: string; department_id: string | null };
    }
  | { ok: false; error: string }
> {
  const { data, error } = await context.service
    .from("tasks")
    .select("id, department_id")
    .eq("id", taskId)
    .eq("tenant_id", context.tenant.id)
    .eq("assignee_user_id", context.user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return { ok: false, error: "Taak kon niet worden geladen." };
  if (!data) return { ok: false, error: "Taak niet gevonden." };
  return {
    ok: true,
    task: data as { id: string; department_id: string | null },
  };
}

async function canLinkStudent(
  context: InstructorTaskContext,
  studentId: string,
): Promise<boolean> {
  const { data: student } = await context.service
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("tenant_id", context.tenant.id)
    .maybeSingle();
  if (!student) return false;

  if (
    context.roles.includes("tenant_admin") ||
    context.user.profile?.is_platform_admin
  ) {
    return true;
  }

  const [lesson, appointment, conversation] = await Promise.all([
    context.service
      .from("lessons")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
    context.service
      .from("agenda_appointments")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
    context.service
      .from("chat_conversations")
      .select("id")
      .eq("tenant_id", context.tenant.id)
      .eq("instructor_id", context.user.id)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(lesson.data || appointment.data || conversation.data);
}

async function defaultTaskTarget(context: InstructorTaskContext): Promise<
  | {
      ok: true;
      boardId: string;
      columnId: string;
      departmentId: string | null;
    }
  | { ok: false; error: string }
> {
  const { error: setupError } = await context.service.rpc(
    "ensure_default_task_setup",
    {
      p_tenant_id: context.tenant.id,
      p_actor: context.user.id,
    },
  );
  if (setupError) {
    return { ok: false, error: "Taakbord kon niet worden voorbereid." };
  }

  const [{ data: departments }, { data: boards }, { data: columns }] =
    await Promise.all([
      context.service
        .from("task_departments")
        .select("id, key")
        .eq("tenant_id", context.tenant.id),
      context.service
        .from("task_boards")
        .select("id, department_id, branch_id, sort_order")
        .eq("tenant_id", context.tenant.id)
        .order("sort_order", { ascending: true }),
      context.service
        .from("task_columns")
        .select("id, board_id, name, sort_order")
        .eq("tenant_id", context.tenant.id)
        .order("sort_order", { ascending: true }),
    ]);

  const planningDepartmentId = (
    (departments ?? []) as { id: string; key: string }[]
  ).find((department) => department.key === "planning")?.id;
  const sortedBoards = [
    ...((boards ?? []) as {
      id: string;
      department_id: string | null;
      branch_id: string | null;
      sort_order: number;
    }[]),
  ].sort((a, b) => {
    const aScore =
      (a.branch_id === null ? 0 : 10) +
      (a.department_id === planningDepartmentId ? 0 : 1);
    const bScore =
      (b.branch_id === null ? 0 : 10) +
      (b.department_id === planningDepartmentId ? 0 : 1);
    return aScore - bScore || a.sort_order - b.sort_order;
  });
  const columnRows = (columns ?? []) as {
    id: string;
    board_id: string;
    name: string;
    sort_order: number;
  }[];

  for (const board of sortedBoards) {
    const column = columnRows.find(
      (candidate) =>
        candidate.board_id === board.id &&
        candidate.name.toLocaleLowerCase("nl-NL") !== "klaar",
    );
    if (column) {
      return {
        ok: true,
        boardId: board.id,
        columnId: column.id,
        departmentId: board.department_id,
      };
    }
  }

  return { ok: false, error: "Geen bruikbaar taakbord gevonden." };
}

async function addStudentLink(
  service: SupabaseClient,
  context: InstructorTaskContext,
  taskId: string,
  studentId: string,
): Promise<InstructorTaskActionResult> {
  const { error } = await service.rpc("link_task_entity", {
    p_task_id: taskId,
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
    p_entity_type: "student",
    p_entity_id: studentId,
  });
  return error
    ? { ok: false, error: "Leerling kon niet worden gekoppeld." }
    : { ok: true };
}

async function syncStudentLink(
  context: InstructorTaskContext,
  taskId: string,
  studentId: string | null,
): Promise<InstructorTaskActionResult> {
  const { data: links, error } = await context.service
    .from("task_links")
    .select("id, entity_id")
    .eq("tenant_id", context.tenant.id)
    .eq("task_id", taskId)
    .eq("entity_type", "student");
  if (error)
    return { ok: false, error: "Leerlingkoppeling kon niet worden geladen." };

  const currentLinks = (links ?? []) as { id: string; entity_id: string }[];
  if (studentId && !currentLinks.some((link) => link.entity_id === studentId)) {
    const added = await addStudentLink(
      context.service,
      context,
      taskId,
      studentId,
    );
    if (!added.ok) return added;
  }

  for (const link of currentLinks) {
    if (link.entity_id === studentId) continue;
    const { error: unlinkError } = await context.service.rpc(
      "unlink_task_entity",
      {
        p_link_id: link.id,
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
      },
    );
    if (unlinkError) {
      return {
        ok: false,
        error: "Oude leerlingkoppeling kon niet worden verwijderd.",
      };
    }
  }
  return { ok: true };
}

function revalidateTaskViews() {
  revalidatePath("/instructeur");
  revalidatePath("/instructeur/taken");
  revalidatePath("/backoffice/taken");
}

export async function createInstructorTask(
  formData: FormData,
): Promise<InstructorTaskActionResult> {
  const context = await requireInstructorTaskContext();
  const parsed = inputFromFormData(formData);
  if (!parsed.ok) return parsed;

  if (
    parsed.value.studentId &&
    !(await canLinkStudent(context, parsed.value.studentId))
  ) {
    return { ok: false, error: "Geen toegang tot deze leerling." };
  }

  const target = await defaultTaskTarget(context);
  if (!target.ok) return target;

  const { data: taskId, error } = await context.service.rpc("create_task", {
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
    p_board_id: target.boardId,
    p_column_id: target.columnId,
    p_title: parsed.value.title,
    p_description: parsed.value.description,
    p_priority: parsed.value.priority,
    p_due_date: parsed.value.dueDate,
    p_assignee_user_id: context.user.id,
    p_department_id: target.departmentId,
  });
  if (error || !taskId) {
    return { ok: false, error: "Taak kon niet worden aangemaakt." };
  }

  if (parsed.value.studentId) {
    const linked = await addStudentLink(
      context.service,
      context,
      String(taskId),
      parsed.value.studentId,
    );
    if (!linked.ok) {
      await context.service.rpc("archive_task", {
        p_task_id: String(taskId),
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
      });
      return linked;
    }
  }

  revalidateTaskViews();
  return { ok: true, taskId: String(taskId) };
}

export async function updateInstructorTask(
  formData: FormData,
): Promise<InstructorTaskActionResult> {
  const context = await requireInstructorTaskContext();
  const taskId = String(formData.get("task_id") ?? "");
  const owned = await requireOwnedTask(context, taskId);
  if (!owned.ok) return owned;

  const parsed = inputFromFormData(formData);
  if (!parsed.ok) return parsed;
  if (
    parsed.value.studentId &&
    !(await canLinkStudent(context, parsed.value.studentId))
  ) {
    return { ok: false, error: "Geen toegang tot deze leerling." };
  }

  const result = await updateTaskFields(
    context,
    taskId,
    parsed.value,
    owned.task.department_id,
  );
  if (!result.ok) return result;
  const linked = await syncStudentLink(context, taskId, parsed.value.studentId);
  if (!linked.ok) return linked;

  revalidateTaskViews();
  return { ok: true, taskId };
}

async function updateTaskFields(
  context: InstructorTaskContext,
  taskId: string,
  input: InstructorTaskInput,
  departmentId: string | null,
): Promise<InstructorTaskActionResult> {
  const { error } = await context.service.rpc("update_task", {
    p_task_id: taskId,
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_due_date: input.dueDate,
    p_department_id: departmentId,
  });
  return error
    ? { ok: false, error: "Taak kon niet worden bijgewerkt." }
    : { ok: true };
}

async function archiveOwnedTask(
  taskId: string,
): Promise<InstructorTaskActionResult> {
  const context = await requireInstructorTaskContext();
  const owned = await requireOwnedTask(context, taskId);
  if (!owned.ok) return owned;

  const { error } = await context.service.rpc("archive_task", {
    p_task_id: taskId,
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
  });
  if (error) return { ok: false, error: "Taak kon niet worden verwijderd." };

  revalidateTaskViews();
  return { ok: true, taskId };
}

export async function completeInstructorTask(
  taskId: string,
): Promise<InstructorTaskActionResult> {
  return archiveOwnedTask(taskId);
}

export async function deleteInstructorTask(
  taskId: string,
): Promise<InstructorTaskActionResult> {
  return archiveOwnedTask(taskId);
}
