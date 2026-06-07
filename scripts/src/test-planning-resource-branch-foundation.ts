/**
 * Static guardrails for Sprint 4E planning resource branch scope.
 *
 *   pnpm --filter @workspace/scripts run test-planning-resource-branch-foundation
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

const availabilityServiceSrc = source("artifacts/nxtdrive/lib/availability/service.ts");
const agendaPageSrc = source("artifacts/nxtdrive/app/backoffice/agenda/page.tsx");
const newLessonPageSrc = source("artifacts/nxtdrive/app/backoffice/agenda/nieuw/page.tsx");
const newAppointmentPageSrc = source("artifacts/nxtdrive/app/backoffice/agenda/afspraak/nieuw/page.tsx");
const lessonTypesSrc = source("artifacts/nxtdrive/lib/lessons/types.ts");

check(
  "planning permissions still grant scoped manage access to operational planners",
  rolesGrantPermission(["tenant_admin"], "planning:manage") &&
    rolesGrantPermission(["franchise_admin"], "planning:manage") &&
    rolesGrantPermission(["branch_manager"], "planning:manage") &&
    rolesGrantPermission(["planner"], "planning:manage") &&
    rolesGrantPermission(["instructor"], "planning:read") &&
    !rolesGrantPermission(["marketing"], "planning:manage"),
);

check(
  "availability service can filter tenant instructors by branch membership",
  availabilityServiceSrc.includes("branchIds?: readonly string[] | null") &&
    availabilityServiceSrc.includes("membership_branches") &&
    availabilityServiceSrc.includes('m.branch_scope_type !== "branches"') &&
    availabilityServiceSrc.includes("matchingMembershipIds.has(m.id)") &&
    availabilityServiceSrc.includes("Organization-wide memberships remain available"),
);

check(
  "availability free-space loader can limit computation to visible instructors",
  availabilityServiceSrc.includes("instructorIds?: readonly string[]") &&
    availabilityServiceSrc.includes("instructorIds = opts.instructorId") &&
    availabilityServiceSrc.includes('.in("instructor_id", instructorIds)') &&
    availabilityServiceSrc.includes("if (instructorIds && instructorIds.length === 0) return new Map()"),
);

check(
  "agenda week view scopes background availability to visible instructors",
  agendaPageSrc.includes("loadTenantInstructors") &&
    agendaPageSrc.includes("branchIds: branchFilterIds") &&
    agendaPageSrc.includes("instructorIds: availabilityInstructors.map") &&
    agendaPageSrc.includes("Background availability: union across visible instructors only."),
);

check(
  "new lesson form uses agenda access context and branch-scoped resources",
  newLessonPageSrc.includes("requireAgendaAccessContext") &&
    newLessonPageSrc.includes("AGENDA_BACKOFFICE_MANAGE_ROLES") &&
    newLessonPageSrc.includes("branchScope.scope_type === \"branches\"") &&
    newLessonPageSrc.includes("loadTenantInstructors(tenant.id") &&
    newLessonPageSrc.includes("branchIds: branchFilterIds") &&
    newLessonPageSrc.includes('.in("branch_id", branchFilterIds)') &&
    newLessonPageSrc.includes('.in("student_id", studentIds)') &&
    !newLessonPageSrc.includes("requireActiveTenant"),
);

check(
  "new appointment form scopes students and instructor options by branch",
  newAppointmentPageSrc.includes("requireAgendaAccessContext") &&
    newAppointmentPageSrc.includes("branchScope.scope_type === \"branches\"") &&
    newAppointmentPageSrc.includes("loadTenantInstructors(tenant.id") &&
    newAppointmentPageSrc.includes("branchIds: branchFilterIds") &&
    newAppointmentPageSrc.includes('.in("branch_id", branchFilterIds)') &&
    newAppointmentPageSrc.includes("AppointmentForm"),
);

check(
  "lesson type carries branch id for planning resources",
  lessonTypesSrc.includes("export type Lesson") &&
    lessonTypesSrc.includes("branch_id: string | null") &&
    lessonTypesSrc.includes("vehicle_id: string | null") &&
    lessonTypesSrc.includes("location_id: string | null"),
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
console.log("All planning resource branch foundation tests passed.");
