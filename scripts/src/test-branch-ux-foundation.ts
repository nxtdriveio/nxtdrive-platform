/**
 * Static guardrails for Sprint 4G branch UX cleanup.
 *
 *   pnpm --filter @workspace/scripts run test-branch-ux-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const branchUiSrc = source("artifacts/nxtdrive/components/backoffice/branch-scope-ui.tsx");
const vehiclesPageSrc = source("artifacts/nxtdrive/app/backoffice/voertuigen/page.tsx");
const tasksPageSrc = source("artifacts/nxtdrive/app/backoffice/taken/page.tsx");
const taskBoardSrc = source("artifacts/nxtdrive/app/backoffice/taken/board.tsx");
const invoicesPageSrc = source("artifacts/nxtdrive/app/backoffice/facturen/page.tsx");
const agendaPageSrc = source("artifacts/nxtdrive/app/backoffice/agenda/page.tsx");
const sprintDocSrc = source("docs/SPRINT_4_BRANCH_COMPLETENESS.md");

check(
  "shared branch scope UI exposes the canonical components",
  branchUiSrc.includes("BranchScopeSummary") &&
    branchUiSrc.includes("BranchFilterChips") &&
    branchUiSrc.includes("BranchScopedEmptyState") &&
    branchUiSrc.includes("ReadOnlyScopeNotice") &&
    branchUiSrc.includes("Alle toegestane vestigingen") &&
    branchUiSrc.includes("Alle vestigingen"),
);

check(
  "vehicles page shows scope summary, read-only notice and branch badges",
  vehiclesPageSrc.includes("BranchScopeSummary") &&
    vehiclesPageSrc.includes("ReadOnlyScopeNotice") &&
    vehiclesPageSrc.includes("BranchScopeBadge") &&
    vehiclesPageSrc.includes("Gedeelde voertuigen en locaties blijven zichtbaar") &&
    vehiclesPageSrc.includes("Geen voertuigen binnen deze vestigingsscope") &&
    vehiclesPageSrc.includes("Geen locaties binnen deze vestigingsscope"),
);

check(
  "tasks page uses shared branch chips and scoped empty state",
  tasksPageSrc.includes("BranchFilterChips") &&
    tasksPageSrc.includes("BranchScopeSummary") &&
    tasksPageSrc.includes("BranchScopedEmptyState") &&
    tasksPageSrc.includes("Geen taakborden binnen deze scope") &&
    !tasksPageSrc.includes("function BranchFilters"),
);

check(
  "task board communicates read-only and empty columns",
  taskBoardSrc.includes("ReadOnlyScopeNotice") &&
    taskBoardSrc.includes("Geen taken in deze kolom") &&
    taskBoardSrc.includes("!canManage"),
);

check(
  "invoice page uses shared branch chips and scoped empty state",
  invoicesPageSrc.includes("BranchFilterChips") &&
    invoicesPageSrc.includes("BranchScopeSummary") &&
    invoicesPageSrc.includes("BranchScopedEmptyState") &&
    invoicesPageSrc.includes("Geen facturen binnen deze filter") &&
    !invoicesPageSrc.includes("function BranchFilters"),
);

check(
  "agenda page uses shared branch chips instead of a custom branch select",
  agendaPageSrc.includes("BranchFilterChips") &&
    agendaPageSrc.includes("BranchScopeSummary") &&
    agendaPageSrc.includes("Beschikbaarheid wordt berekend over zichtbare instructeurs") &&
    agendaPageSrc.includes("Geen planning binnen deze scope") &&
    !agendaPageSrc.includes('name="branch"') &&
    !agendaPageSrc.includes("<select"),
);

check(
  "agenda page hides planning actions for read-only roles",
  agendaPageSrc.includes("ReadOnlyScopeNotice") &&
    agendaPageSrc.includes("BranchScopedEmptyState") &&
    agendaPageSrc.includes("Geen agenda-items deze week") &&
    agendaPageSrc.includes('rolesGrantPermission(context.roles, "planning:manage")') &&
    agendaPageSrc.includes("canManagePlanning ?"),
);

check(
  "Sprint 4 documentation records the branch UX cleanup slice",
  sprintDocSrc.includes("Sprint 4G") &&
    sprintDocSrc.includes("Branch UX cleanup") &&
    sprintDocSrc.includes("test-branch-ux-foundation") &&
    !sprintDocSrc.includes("- Sprint 4G: Branch UX cleanup"),
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
console.log("All branch UX foundation tests passed.");
