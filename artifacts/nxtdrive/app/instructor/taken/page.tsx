import Link from "next/link";
import { CalendarClock, ListTodo, PanelsTopLeft } from "lucide-react";
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
import {
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";

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
      <PWAPage app="instructor" contentClassName="space-y-5">
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
  const dueSoonCount = tasks.filter((task) => {
    if (!task.due_date) return false;
    const due = new Date(task.due_date).getTime();
    const now = Date.now();
    const threeDays = 1000 * 60 * 60 * 24 * 3;
    return due >= now && due <= now + threeDays;
  }).length;

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
    <PWAPage app="instructor" contentClassName="space-y-5">
      <Header />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Open taken"
          value={tasks.length}
          hint="Alles wat nog bij jou in beweging is."
          info="Dit zijn alle taken die nog aan jou hangen en nog niet zijn gearchiveerd of afgerond."
        />
        <PWAKpiTile
          label="Actieve borden"
          value={boards.length}
          hint="Schakel per bord tussen je werkstromen."
          info="Elke werkstroom of afdeling kan een eigen bord hebben. Hier zie je hoeveel borden voor jou relevant zijn."
        />
        <PWAKpiTile
          label="Binnen 3 dagen"
          value={dueSoonCount}
          hint="Taken met een due date die snel aandacht vragen."
          info="Deze teller markeert taken waarvan de deadline binnen drie dagen valt, zodat je sneller kunt prioriteren."
        />
      </PWAKpiGrid>

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
        layout="grid"
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
      actions={
        <div className="hidden items-center gap-2 text-xs text-muted-foreground xl:flex">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden />
            Tabletboard
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <ListTodo className="h-3.5 w-3.5" aria-hidden />
            Compacte kolommen
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            Sneller overzicht
          </span>
        </div>
      }
    />
  );
}
