import "server-only";

import type { MobileInstructorContext } from "@/lib/mobile/auth";
import { MobileApiError } from "@/lib/mobile/auth";
import {
  instructorTaskStatus,
  parseInstructorTaskInput,
  type InstructorTaskInput,
} from "@/lib/instructor/tasks";
import { resolveTenantTimeZone, zonedYmd } from "@/lib/datetime";
import { requireMobileInstructorStudent } from "@/lib/mobile/student-access";

export async function createNativeInstructorTask(
  context: MobileInstructorContext,
  rawInput: Record<string, unknown>,
) {
  const input = parseInput(rawInput);
  await assertStudentLinkAllowed(context, input.studentId);
  const target = await defaultTaskTarget(context);
  const { data: taskId, error } = await context.service.rpc("create_task", {
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
    p_board_id: target.boardId,
    p_column_id: target.columnId,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_due_date: input.dueDate,
    p_assignee_user_id: context.user.id,
    p_department_id: target.departmentId,
  });
  if (error || !taskId) {
    throw new MobileApiError(
      503,
      "Taak kon niet worden aangemaakt.",
      "task_create_failed",
    );
  }
  if (input.studentId) {
    const { error: linkError } = await context.service.rpc("link_task_entity", {
      p_task_id: String(taskId),
      p_tenant_id: context.tenant.id,
      p_actor: context.user.id,
      p_entity_type: "student",
      p_entity_id: input.studentId,
    });
    if (linkError) {
      await context.service.rpc("archive_task", {
        p_task_id: String(taskId),
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
      });
      throw new MobileApiError(
        503,
        "Leerling kon niet aan de taak worden gekoppeld.",
        "task_link_failed",
      );
    }
  }
  return loadNativeTask(context, String(taskId));
}

export async function updateNativeInstructorTask(
  context: MobileInstructorContext,
  taskId: string,
  rawInput: Record<string, unknown>,
) {
  const owned = await requireOwnedTask(context, taskId);
  const input = parseInput(rawInput);
  await assertStudentLinkAllowed(context, input.studentId);
  const { error } = await context.service.rpc("update_task", {
    p_task_id: taskId,
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_due_date: input.dueDate,
    p_department_id: owned.department_id,
  });
  if (error) {
    throw new MobileApiError(
      503,
      "Taak kon niet worden bijgewerkt.",
      "task_update_failed",
    );
  }
  await syncStudentLink(context, taskId, input.studentId);
  return loadNativeTask(context, taskId);
}

export async function deleteNativeInstructorTask(
  context: MobileInstructorContext,
  taskId: string,
) {
  await requireOwnedTask(context, taskId);
  const { error } = await context.service.rpc("archive_task", {
    p_task_id: taskId,
    p_tenant_id: context.tenant.id,
    p_actor: context.user.id,
  });
  if (error) {
    throw new MobileApiError(
      503,
      "Taak kon niet worden verwijderd.",
      "task_delete_failed",
    );
  }
}

function parseInput(rawInput: Record<string, unknown>): InstructorTaskInput {
  const parsed = parseInstructorTaskInput(rawInput);
  if (!parsed.ok) {
    throw new MobileApiError(400, parsed.error, "invalid_task");
  }
  return parsed.value;
}

async function requireOwnedTask(
  context: MobileInstructorContext,
  taskId: string,
) {
  if (!isUuid(taskId)) {
    throw new MobileApiError(404, "Taak niet gevonden.", "task_not_found");
  }
  const { data, error } = await context.service
    .from("tasks")
    .select("id, department_id")
    .eq("id", taskId)
    .eq("tenant_id", context.tenant.id)
    .eq("assignee_user_id", context.user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) {
    throw new MobileApiError(
      503,
      "Taak kon niet worden gecontroleerd.",
      "task_check_failed",
    );
  }
  if (!data) {
    throw new MobileApiError(404, "Taak niet gevonden.", "task_not_found");
  }
  return data as { id: string; department_id: string | null };
}

async function assertStudentLinkAllowed(
  context: MobileInstructorContext,
  studentId: string | null,
) {
  if (!studentId) return;
  await requireMobileInstructorStudent(context, studentId);
}

async function defaultTaskTarget(context: MobileInstructorContext) {
  const { error: setupError } = await context.service.rpc(
    "ensure_default_task_setup",
    {
      p_tenant_id: context.tenant.id,
      p_actor: context.user.id,
    },
  );
  if (setupError) {
    throw new MobileApiError(
      503,
      "Taakbord kon niet worden voorbereid.",
      "task_setup_failed",
    );
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
    (departments ?? []) as Array<{ id: string; key: string }>
  ).find((department) => department.key === "planning")?.id;
  const sortedBoards = [
    ...((boards ?? []) as Array<{
      id: string;
      department_id: string | null;
      branch_id: string | null;
      sort_order: number;
    }>),
  ].sort((a, b) => {
    const aScore =
      (a.branch_id === null ? 0 : 10) +
      (a.department_id === planningDepartmentId ? 0 : 1);
    const bScore =
      (b.branch_id === null ? 0 : 10) +
      (b.department_id === planningDepartmentId ? 0 : 1);
    return aScore - bScore || a.sort_order - b.sort_order;
  });
  const columnRows = (columns ?? []) as Array<{
    id: string;
    board_id: string;
    name: string;
  }>;
  for (const board of sortedBoards) {
    const column = columnRows.find(
      (candidate) =>
        candidate.board_id === board.id &&
        candidate.name.toLocaleLowerCase("nl-NL") !== "klaar",
    );
    if (column) {
      return {
        boardId: board.id,
        columnId: column.id,
        departmentId: board.department_id,
      };
    }
  }
  throw new MobileApiError(
    409,
    "Geen bruikbaar taakbord gevonden.",
    "task_board_missing",
  );
}

async function syncStudentLink(
  context: MobileInstructorContext,
  taskId: string,
  studentId: string | null,
) {
  const { data, error } = await context.service
    .from("task_links")
    .select("id, entity_id")
    .eq("tenant_id", context.tenant.id)
    .eq("task_id", taskId)
    .eq("entity_type", "student");
  if (error) {
    throw new MobileApiError(
      503,
      "Leerlingkoppeling kon niet worden geladen.",
      "task_link_failed",
    );
  }
  const links = (data ?? []) as Array<{ id: string; entity_id: string }>;
  if (studentId && !links.some((link) => link.entity_id === studentId)) {
    const { error: addError } = await context.service.rpc("link_task_entity", {
      p_task_id: taskId,
      p_tenant_id: context.tenant.id,
      p_actor: context.user.id,
      p_entity_type: "student",
      p_entity_id: studentId,
    });
    if (addError) {
      throw new MobileApiError(
        503,
        "Leerling kon niet worden gekoppeld.",
        "task_link_failed",
      );
    }
  }
  for (const link of links) {
    if (link.entity_id === studentId) continue;
    const { error: removeError } = await context.service.rpc(
      "unlink_task_entity",
      {
        p_link_id: link.id,
        p_tenant_id: context.tenant.id,
        p_actor: context.user.id,
      },
    );
    if (removeError) {
      throw new MobileApiError(
        503,
        "Oude leerlingkoppeling kon niet worden verwijderd.",
        "task_unlink_failed",
      );
    }
  }
}

async function loadNativeTask(
  context: MobileInstructorContext,
  taskId: string,
) {
  const { data: task, error } = await context.service
    .from("tasks")
    .select("id, title, description, priority, due_date")
    .eq("id", taskId)
    .eq("tenant_id", context.tenant.id)
    .eq("assignee_user_id", context.user.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !task) {
    throw new MobileApiError(
      503,
      "Taak kon niet worden geladen.",
      "task_load_failed",
    );
  }
  const { data: link } = await context.service
    .from("task_links")
    .select("entity_id")
    .eq("tenant_id", context.tenant.id)
    .eq("task_id", taskId)
    .eq("entity_type", "student")
    .limit(1)
    .maybeSingle();
  const studentId = (link?.entity_id as string | undefined) ?? null;
  const { data: student } = studentId
    ? await context.service
        .from("students")
        .select("full_name")
        .eq("tenant_id", context.tenant.id)
        .eq("id", studentId)
        .maybeSingle()
    : { data: null };
  const row = task as {
    id: string;
    title: string;
    description: string | null;
    priority: string;
    due_date: string | null;
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.due_date,
    status: instructorTaskStatus(
      row.due_date,
      zonedYmd(new Date(), resolveTenantTimeZone(context.tenant)),
    ),
    studentId,
    studentName: studentId
      ? ((student?.full_name as string | null) ?? "Onbekende leerling")
      : null,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
