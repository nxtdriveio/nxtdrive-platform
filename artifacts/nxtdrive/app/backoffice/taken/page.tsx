import Link from "next/link";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { rolesGrantPermission, scopesForPermission } from "@/lib/permissions";
import type { MemberRole } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  BranchFilterChips,
  BranchScopeSummary,
  BranchScopedEmptyState,
} from "@/components/backoffice/branch-scope-ui";
import { cn } from "@/lib/utils";
import { listBranches, type Branch } from "@/lib/branches/service";
import type {
  ResolvedTaskLink,
  Task,
  TaskBoard,
  TaskColumn,
  TaskLinkRow,
  TenantMember,
} from "@/lib/tasks/types";
import { resolveTaskLinks } from "@/lib/tasks/links";
import { Board } from "./board";

export const dynamic = "force-dynamic";

const TASK_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

function branchOrFilter(branchIds: readonly string[]): string {
  if (branchIds.length === 0) return "branch_id.is.null";
  return `branch_id.is.null,branch_id.in.(${branchIds.join(",")})`;
}

function taskVisibilityFilter(
  branchIds: readonly string[] | null,
  ownUserId: string | null,
): string | null {
  const parts: string[] = [];
  if (branchIds) {
    parts.push("branch_id.is.null");
    if (branchIds.length > 0) parts.push(`branch_id.in.(${branchIds.join(",")})`);
  }
  if (ownUserId) parts.push(`assignee_user_id.eq.${ownUserId}`);
  return parts.length > 0 ? parts.join(",") : null;
}

export default async function TakenPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; branch?: string }>;
}) {
  const context = await requireOrganizationPermission("task:read", {
    allowedRoles: [...TASK_BACKOFFICE_READ_ROLES],
  });
  const { organization: tenant } = context;
  const { board: boardParam, branch: branchParam } = await searchParams;

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const allBranches = await listBranches(service, tenant.id, { activeOnly: true });
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;
  const selectedBranchId =
    branchParam && branches.some((b) => b.id === branchParam) ? branchParam : null;
  const selectedBranchName = branches.find((b) => b.id === selectedBranchId)?.name;
  const branchFilterIds = selectedBranchId
    ? [selectedBranchId]
    : branchScope.scope_type === "branches"
      ? branchScope.branch_ids
      : null;

  const canManageTasks =
    context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "task:manage");
  const readScopes = scopesForPermission(context.roles, "task:read");
  const includeOwnTasks = !canManageTasks && readScopes.includes("own")
    ? context.user.id
    : null;

  let boardsQuery = service
    .from("task_boards")
    .select("id, tenant_id, branch_id, department_id, name, sort_order")
    .eq("tenant_id", tenant.id)
    .order("sort_order", { ascending: true });
  if (branchFilterIds) boardsQuery = boardsQuery.or(branchOrFilter(branchFilterIds));
  const { data: boardsRaw } = await boardsQuery;
  let boards = (boardsRaw ?? []) as TaskBoard[];

  if (includeOwnTasks) {
    const { data: ownTasksRaw } = await service
      .from("tasks")
      .select("board_id")
      .eq("tenant_id", tenant.id)
      .eq("assignee_user_id", includeOwnTasks)
      .is("archived_at", null);
    const ownBoardIds = new Set(
      ((ownTasksRaw ?? []) as { board_id: string }[]).map((t) => t.board_id),
    );
    boards = boards.filter((b) => ownBoardIds.has(b.id));
  }

  if (boards.length === 0) {
    return (
      <div className="space-y-6">
        <Header tenantName={tenant.name} />
        <BranchScopeSummary
          scope={branchScope}
          selectedBranchName={selectedBranchName}
          branchCount={branches.length}
          sharedRowsLabel="Gedeelde taakborden blijven zichtbaar wanneer je daar toegang toe hebt."
        />
        <BranchFilterChips
          branches={branches}
          selectedBranchId={selectedBranchId}
          allHref="/backoffice/taken"
          hrefForBranch={(branchId) => `/backoffice/taken?branch=${branchId}`}
        />
        <BranchScopedEmptyState
          title="Geen taakborden binnen deze scope"
          description="Er zijn geen gedeelde taakborden of taakborden voor de geselecteerde vestiging gevonden. Kies een andere vestiging of maak een nieuw bord aan via organisatiebeheer zodra die module beschikbaar is."
        />
      </div>
    );
  }

  const selectedBoard =
    boards.find((b) => b.id === boardParam) ?? boards[0]!;

  const { data: columnsRaw } = await service
    .from("task_columns")
    .select("id, tenant_id, board_id, name, sort_order, wip_limit")
    .eq("tenant_id", tenant.id)
    .eq("board_id", selectedBoard.id)
    .order("sort_order", { ascending: true });
  const columns = (columnsRaw ?? []) as TaskColumn[];

  let tasksQuery = service
    .from("tasks")
    .select(
      "id, tenant_id, branch_id, board_id, column_id, department_id, title, description, priority, due_date, assignee_user_id, position, archived_at, created_at, updated_at",
    )
    .eq("tenant_id", tenant.id)
    .eq("board_id", selectedBoard.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const visibility = taskVisibilityFilter(branchFilterIds, includeOwnTasks);
  if (visibility) tasksQuery = tasksQuery.or(visibility);
  const { data: tasksRaw } = await tasksQuery;
  const tasks = (tasksRaw ?? []) as Task[];

  // Tenant members = users with instructor or tenant_admin role, for assignment.
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

  // Linked entities for the board's cards, resolved to names + deep-links.
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
    <div className="space-y-6">
      <Header tenantName={tenant.name} />
      <BranchScopeSummary
        scope={branchScope}
        selectedBranchName={selectedBranchName}
        branchCount={branches.length}
        sharedRowsLabel="Gedeelde taakborden en taken blijven zichtbaar."
      />
      <BranchFilterChips
        branches={branches}
        selectedBranchId={selectedBranchId}
        allHref={boardHref(selectedBoard.id, null)}
        hrefForBranch={(branchId) => boardHref(selectedBoard.id, branchId)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {boards.map((b) => (
          <Link
            key={b.id}
            href={boardHref(b.id, selectedBranchId)}
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
        canCreate={canManageTasks}
        canManage={canManageTasks}
        branches={branches}
        canUseSharedBranch={branchScope.scope_type === "all"}
        defaultBranchId={selectedBranchId ?? selectedBoard.branch_id ?? null}
      />
    </div>
  );
}

function boardHref(boardId: string, branchId: string | null): string {
  const params = new URLSearchParams({ board: boardId });
  if (branchId) params.set("branch", branchId);
  return `/backoffice/taken?${params.toString()}`;
}

function Header({ tenantName }: { tenantName: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Taken
      </h1>
      <p className="text-sm text-muted-foreground">
        Werkborden per afdeling voor {tenantName}. Je ziet alleen taken binnen
        jouw organisatie- en vestigingsscope.
      </p>
    </div>
  );
}
