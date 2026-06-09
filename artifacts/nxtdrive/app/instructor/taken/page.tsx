import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ResolvedTaskLink,
  Task,
  TaskBoard,
  TaskColumn,
  TaskLinkRow,
  TenantMember,
} from "@/lib/tasks/types";
import { resolveTaskLinks } from "@/lib/tasks/links";
import { Board } from "@/app/backoffice/taken/board";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

export default async function InstructorTakenPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string }>;
}) {
  const { user, tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const { board: boardParam } = await searchParams;

  const supabase = await createServerSupabaseClient();

  const { data: boardsRaw } = await supabase
    .from("task_boards")
    .select("id, tenant_id, department_id, name, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });
  const boards = (boardsRaw ?? []) as TaskBoard[];

  if (boards.length === 0) {
    return (
      <PWAPage contentClassName="space-y-6">
        <Header />
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Er zijn nog geen taakborden voor deze rijschool.
        </Card>
      </PWAPage>
    );
  }

  const selectedBoard =
    boards.find((b) => b.id === boardParam) ?? boards[0]!;

  const { data: columnsRaw } = await supabase
    .from("task_columns")
    .select("id, tenant_id, board_id, name, sort_order, wip_limit")
    .eq("tenant_id", tenant.id)
    .eq("board_id", selectedBoard.id)
    .order("sort_order", { ascending: true });
  const columns = (columnsRaw ?? []) as TaskColumn[];

  // Only show tasks assigned to the logged-in instructor.
  const { data: tasksRaw } = await supabase
    .from("tasks")
    .select(
      "id, tenant_id, board_id, column_id, department_id, title, description, priority, due_date, assignee_user_id, position, archived_at, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .eq("board_id", selectedBoard.id)
    .eq("assignee_user_id", user.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const tasks = (tasksRaw ?? []) as Task[];

  // Members list — needed so the Board card dialog can show the assignee name.
  const service = createServiceRoleClient();
  const { data: membershipsRaw } = await service
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .in("role", ["instructor", "tenant_admin"]);
  const memberIds = Array.from(
    new Set((membershipsRaw ?? []).map((m) => m.user_id as string)),
  );
  const { data: profilesRaw } = memberIds.length
    ? await service.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] };
  const members = (profilesRaw ?? []) as TenantMember[];
  members.sort((a, b) =>
    (a.full_name ?? "").localeCompare(b.full_name ?? "", "nl"),
  );

  // Linked entities for the board's cards.
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

  return (
    <PWAPage contentClassName="space-y-6">
      <Header />

      <div className="flex flex-wrap items-center gap-2">
        {boards.map((b) => (
          <Link
            key={b.id}
            href={`/instructor/taken?board=${b.id}`}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
              b.id === selectedBoard.id
                ? "bg-primary-soft text-primary"
                : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {b.name}
          </Link>
        ))}
      </div>

      <Board
        boardId={selectedBoard.id}
        columns={columns}
        initialTasks={tasks}
        members={members}
        links={linksByTask}
        canCreate={false}
      />
    </PWAPage>
  );
}

function Header() {
  return (
    <PWAPageHeader
      eyebrow="Taken"
      title="Mijn taken"
      description="Taken die aan jou zijn toegewezen. Versleep kaarten om ze te herordenen of naar een andere kolom te verplaatsen."
      align="left"
    />
  );
}
