/**
 * Static guardrails for Sprint 4C task branch scope.
 *
 *   pnpm --filter @workspace/scripts run test-task-branch-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rolesGrantPermission } from "../../artifacts/nxtdrive/lib/permissions/index.ts";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const tasksPageSrc = source("artifacts/nxtdrive/app/backoffice/taken/page.tsx");
const taskActionsSrc = source("artifacts/nxtdrive/app/backoffice/taken/actions.ts");
const taskBoardSrc = source("artifacts/nxtdrive/app/backoffice/taken/board.tsx");
const taskDialogSrc = source("artifacts/nxtdrive/app/backoffice/taken/task-dialog.tsx");
const taskTypesSrc = source("artifacts/nxtdrive/lib/tasks/types.ts");
const taskBranchMigration = source("supabase/migrations/0105_task_branch_scope.sql");

check(
  "task permissions distinguish read and manage scope",
  rolesGrantPermission(["tenant_admin"], "task:manage") &&
    rolesGrantPermission(["franchise_admin"], "task:manage") &&
    rolesGrantPermission(["branch_manager"], "task:manage") &&
    rolesGrantPermission(["admin_staff"], "task:manage") &&
    rolesGrantPermission(["planner"], "task:read") &&
    rolesGrantPermission(["marketing"], "task:read") &&
    rolesGrantPermission(["instructor"], "task:read") &&
    !rolesGrantPermission(["planner"], "task:manage"),
);

check(
  "tasks page uses organization permission and branch scope",
  tasksPageSrc.includes('requireOrganizationPermission("task:read"') &&
    tasksPageSrc.includes("TASK_BACKOFFICE_READ_ROLES") &&
    tasksPageSrc.includes("loadOrganizationBranchScope") &&
    tasksPageSrc.includes("branchFilterIds") &&
    tasksPageSrc.includes("scopesForPermission(context.roles, \"task:read\")") &&
    tasksPageSrc.includes("rolesGrantPermission(context.roles, \"task:manage\")") &&
    tasksPageSrc.includes("Alle toegestane vestigingen") &&
    !tasksPageSrc.includes("requireActiveTenant"),
);

check(
  "tasks page selects branch-aware boards and tasks",
  tasksPageSrc.includes("id, tenant_id, branch_id, department_id, name, sort_order") &&
    tasksPageSrc.includes("id, tenant_id, branch_id, board_id") &&
    tasksPageSrc.includes("taskVisibilityFilter") &&
    tasksPageSrc.includes("branchOrFilter") &&
    tasksPageSrc.includes("assignee_user_id.eq"),
);

check(
  "task board supports read-only and branch-aware dialog props",
  taskBoardSrc.includes("canManage") &&
    taskBoardSrc.includes("disabled: !canManage") &&
    taskBoardSrc.includes("branches={branches}") &&
    taskBoardSrc.includes("canUseSharedBranch={canUseSharedBranch}") &&
    taskBoardSrc.includes("defaultBranchId={defaultBranchId}") &&
    taskBoardSrc.includes("t.branch_id"),
);

check(
  "task dialog exposes branch selection",
  taskDialogSrc.includes('name="branch_id"') &&
    taskDialogSrc.includes("BranchOptions") &&
    taskDialogSrc.includes("Alle vestigingen") &&
    taskDialogSrc.includes("Huidige vestiging") &&
    taskDialogSrc.includes("defaultBranchId"),
);

check(
  "task actions use task manage permission before service-role mutations",
  taskActionsSrc.includes('requireOrganizationPermission("task:manage")') &&
    taskActionsSrc.includes("requireTaskManageAccess") &&
    taskActionsSrc.includes("requireExistingTaskManage") &&
    taskActionsSrc.includes("loadOrganizationBranchScope") &&
    taskActionsSrc.includes("canAccessBranch") &&
    !taskActionsSrc.includes("requireActiveTenant"),
);

check(
  "task actions assign and validate task branches",
  taskActionsSrc.includes("assignTaskBranch") &&
    taskActionsSrc.includes('service.rpc("assign_task_branch"') &&
    taskActionsSrc.includes("p_branch_id: branchId") &&
    taskActionsSrc.includes("validateTargetBranch") &&
    taskActionsSrc.includes("Geen toegang tot deze vestiging"),
);

check(
  "task actions default single-branch launcher submissions safely",
  taskActionsSrc.includes("resolveSubmittedBranchId") &&
    taskActionsSrc.includes('access.branchScope.scope_type === "branches"') &&
    taskActionsSrc.includes("access.branchScope.branch_ids.length === 1") &&
    taskActionsSrc.includes('formData.has("branch_id")'),
);

check(
  "task actions validate board and column branch scope",
  taskActionsSrc.includes("loadBoardBranch") &&
    taskActionsSrc.includes("requireTaskColumnAccess") &&
    taskActionsSrc.includes("validateTaskBoardBranch") &&
    taskActionsSrc.includes("Kolom hoort niet bij dit taakbord") &&
    taskActionsSrc.includes("Taak kan niet naar een ander bord worden verplaatst"),
);

check(
  "task entity search is branch scoped",
  taskActionsSrc.includes("branchIds = branchScope.scope_type === \"branches\"") &&
    taskActionsSrc.includes('.in("branch_id", [...branchIds])') &&
    taskActionsSrc.includes('.in("student_id", studentIds)') &&
    taskActionsSrc.includes("return { ok: true, results: [] }"),
);

check(
  "task types include branch ids",
  taskTypesSrc.includes("export type TaskBoard") &&
    taskTypesSrc.includes("branch_id: string | null") &&
    taskTypesSrc.includes("export type Task"),
);

check(
  "task branch migration adds columns, indexes, guard and RPC",
  taskBranchMigration.includes("alter table public.task_boards") &&
    taskBranchMigration.includes("alter table public.tasks") &&
    taskBranchMigration.includes("idx_task_boards_tenant_branch") &&
    taskBranchMigration.includes("idx_tasks_tenant_branch") &&
    taskBranchMigration.includes("ensure_task_branch_tenant") &&
    taskBranchMigration.includes("assign_task_branch") &&
    taskBranchMigration.includes("grant execute on function public.assign_task_branch") &&
    taskBranchMigration.includes("to service_role"),
);

console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "OK" : "FAIL";
  console.log(`${mark} ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All task branch foundation tests passed.");
