import "server-only";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { resolveTenantTimeZone, zonedYmd } from "@/lib/datetime";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Task, TaskLinkRow } from "@/lib/tasks/types";
import {
  instructorTaskStatus,
  type InstructorTaskWorkspace,
} from "@/lib/instructor/tasks";

type InstructorTaskRow = Pick<
  Task,
  | "id"
  | "title"
  | "description"
  | "priority"
  | "due_date"
  | "created_at"
  | "updated_at"
>;

export async function loadInstructorTaskWorkspace(): Promise<InstructorTaskWorkspace> {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const service = createServiceRoleClient();

  const { data: taskRows, error: taskError } = await service
    .from("tasks")
    .select(
      "id, title, description, priority, due_date, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .eq("assignee_user_id", user.id)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (taskError) throw taskError;

  const taskIds = ((taskRows ?? []) as InstructorTaskRow[]).map(
    (task) => task.id,
  );
  const { data: linkRows, error: linkError } = taskIds.length
    ? await service
        .from("task_links")
        .select("id, tenant_id, task_id, entity_type, entity_id, created_at")
        .eq("tenant_id", tenant.id)
        .eq("entity_type", "student")
        .in("task_id", taskIds)
    : { data: [], error: null };
  if (linkError) throw linkError;

  const studentLinkByTask = new Map<string, string>();
  for (const link of (linkRows ?? []) as TaskLinkRow[]) {
    if (!studentLinkByTask.has(link.task_id)) {
      studentLinkByTask.set(link.task_id, link.entity_id);
    }
  }

  const linkedStudentIds = Array.from(new Set(studentLinkByTask.values()));
  const isAdmin =
    roles.includes("tenant_admin") || Boolean(user.profile?.is_platform_admin);

  let accessibleStudentIds: string[] | null = null;
  if (!isAdmin) {
    const [lessonsResult, appointmentsResult, conversationsResult] =
      await Promise.all([
        service
          .from("lessons")
          .select("student_id")
          .eq("tenant_id", tenant.id)
          .eq("instructor_id", user.id),
        service
          .from("agenda_appointments")
          .select("student_id")
          .eq("tenant_id", tenant.id)
          .eq("instructor_id", user.id)
          .not("student_id", "is", null),
        service
          .from("chat_conversations")
          .select("student_id")
          .eq("tenant_id", tenant.id)
          .eq("instructor_id", user.id),
      ]);
    if (lessonsResult.error) throw lessonsResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;
    if (conversationsResult.error) throw conversationsResult.error;

    accessibleStudentIds = Array.from(
      new Set([
        ...((lessonsResult.data ?? []) as { student_id: string }[]).map(
          (row) => row.student_id,
        ),
        ...(
          (appointmentsResult.data ?? []) as {
            student_id: string | null;
          }[]
        )
          .map((row) => row.student_id)
          .filter((id): id is string => Boolean(id)),
        ...((conversationsResult.data ?? []) as { student_id: string }[]).map(
          (row) => row.student_id,
        ),
        ...linkedStudentIds,
      ]),
    );
  }

  let studentsQuery = service
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenant.id)
    .order("full_name", { ascending: true })
    .limit(500);
  if (accessibleStudentIds) {
    if (accessibleStudentIds.length === 0) {
      return {
        tasks: mapTasks(
          (taskRows ?? []) as InstructorTaskRow[],
          studentLinkByTask,
          new Map(),
          tenant,
        ),
        students: [],
      };
    }
    studentsQuery = studentsQuery.in("id", accessibleStudentIds);
  }
  const { data: studentRows, error: studentError } = await studentsQuery;
  if (studentError) throw studentError;

  const students = (
    (studentRows ?? []) as {
      id: string;
      full_name: string | null;
    }[]
  ).map((student) => ({
    id: student.id,
    name: student.full_name ?? "Naamloze leerling",
  }));
  const studentNameById = new Map(
    students.map((student) => [student.id, student.name]),
  );

  return {
    tasks: mapTasks(
      (taskRows ?? []) as InstructorTaskRow[],
      studentLinkByTask,
      studentNameById,
      tenant,
    ),
    students,
  };
}

function mapTasks(
  rows: InstructorTaskRow[],
  studentLinkByTask: Map<string, string>,
  studentNameById: Map<string, string>,
  tenant: Parameters<typeof resolveTenantTimeZone>[0],
): InstructorTaskWorkspace["tasks"] {
  const today = zonedYmd(new Date(), resolveTenantTimeZone(tenant));
  return rows.map((task) => {
    const studentId = studentLinkByTask.get(task.id) ?? null;
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.due_date,
      status: instructorTaskStatus(task.due_date, today),
      studentId,
      studentName: studentId
        ? (studentNameById.get(studentId) ?? "Onbekende leerling")
        : null,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };
  });
}
