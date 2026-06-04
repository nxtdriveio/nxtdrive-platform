import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveTaskLinks } from "@/lib/tasks/links";
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_VARIANT,
  TASK_TYPE_LABEL,
  type Task,
  type TaskBoard,
  type TaskColumn,
  type TaskLinkRow,
  type ResolvedTaskLink,
} from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
});

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export default async function InstructorTakenPage() {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);

  const supabase = await createServerSupabaseClient();

  /* Load boards + columns for label lookups */
  const [{ data: boardsRaw }, { data: columnsRaw }] = await Promise.all([
    supabase
      .from("task_boards")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("task_columns")
      .select("id, board_id, name, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true }),
  ]);
  const boards = (boardsRaw ?? []) as TaskBoard[];
  const columns = (columnsRaw ?? []) as TaskColumn[];
  const boardById = new Map(boards.map((b) => [b.id, b]));
  const columnById = new Map(columns.map((c) => [c.id, c]));

  /* Load only MY tasks (not archived) */
  const { data: tasksRaw } = await supabase
    .from("tasks")
    .select(
      "id, tenant_id, board_id, column_id, department_id, title, description, priority, due_date, assignee_user_id, position, archived_at, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .eq("assignee_user_id", user.id)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  const tasks = (tasksRaw ?? []) as Task[];

  /* Resolve task links (entity labels + hrefs) */
  const service = createServiceRoleClient();
  const taskIds = tasks.map((t) => t.id);
  const { data: linkRowsRaw } = taskIds.length
    ? await service
        .from("task_links")
        .select("id, tenant_id, task_id, entity_type, entity_id, created_at")
        .eq("tenant_id", tenant.id)
        .in("task_id", taskIds)
    : { data: [] };
  const linkRows = (linkRowsRaw ?? []) as TaskLinkRow[];
  const resolvedLinks = await resolveTaskLinks(service, tenant.id, linkRows);
  const linksByTask: Record<string, ResolvedTaskLink[]> = {};
  for (const link of resolvedLinks) {
    (linksByTask[link.task_id] ??= []).push(link);
  }

  /* Group: overdue → today → upcoming → no due date */
  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  type Group = { label: string; tasks: Task[] };
  const groups: Group[] = [
    { label: "Vervallen", tasks: [] },
    { label: "Vandaag", tasks: [] },
    { label: "Binnenkort", tasks: [] },
    { label: "Geen deadline", tasks: [] },
  ];

  for (const task of tasks) {
    if (!task.due_date) {
      groups[3]!.tasks.push(task);
    } else {
      const d = new Date(task.due_date);
      if (d < now) groups[0]!.tasks.push(task);
      else if (d <= todayEnd) groups[1]!.tasks.push(task);
      else groups[2]!.tasks.push(task);
    }
  }

  const hasAny = tasks.length > 0;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Mijn taken</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Taken die aan jou zijn toegewezen.
        </p>
      </div>

      {!hasAny ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Je hebt geen openstaande taken 🎉
          </CardContent>
        </Card>
      ) : (
        groups
          .filter((g) => g.tasks.length > 0)
          .map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                {group.label}
                <span className="ml-1.5 text-primary font-semibold">
                  {group.tasks.length}
                </span>
              </h2>
              <div className="space-y-2">
                {group.tasks.map((task) => {
                  const board = boardById.get(task.board_id);
                  const column = columnById.get(task.column_id);
                  const links = linksByTask[task.id] ?? [];
                  const overdue = isOverdue(task.due_date);

                  return (
                    <Card key={task.id}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-foreground">
                                {task.title}
                              </span>
                              <Badge
                                variant={
                                  TASK_PRIORITY_VARIANT[task.priority]
                                }
                              >
                                {TASK_PRIORITY_LABEL[task.priority]}
                              </Badge>
                            </div>

                            {task.description ? (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {task.description}
                              </p>
                            ) : null}

                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {task.due_date ? (
                                <span
                                  className={
                                    overdue ? "font-medium text-danger" : ""
                                  }
                                >
                                  {overdue ? "Vervallen: " : "Deadline: "}
                                  {dateFmt.format(new Date(task.due_date))}
                                </span>
                              ) : null}
                              {board ? (
                                <span>
                                  {board.name}
                                  {column ? ` · ${column.name}` : ""}
                                </span>
                              ) : null}
                            </div>

                            {links.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {links.map((l) =>
                                  l.href ? (
                                    <Link
                                      key={l.id}
                                      href={l.href}
                                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-foreground hover:bg-muted"
                                    >
                                      {l.label}
                                    </Link>
                                  ) : (
                                    <span
                                      key={l.id}
                                      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
                                    >
                                      {l.label}
                                    </span>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))
      )}

      <div className="border-t border-border pt-2">
        <Link
          href="/backoffice/taken"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Alle taken op het bord bekijken →
        </Link>
      </div>
    </div>
  );
}
