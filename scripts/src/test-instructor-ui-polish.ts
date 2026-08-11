import { readFileSync } from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), "..", ...parts);
}

const read = (...parts: string[]) => readFileSync(repoPath(...parts), "utf8");

function routeBlock(source: string, id: string) {
  const marker = `id: "${id}",`;
  const start = source.indexOf(marker);
  assert(start >= 0, `instructor route ${id} should exist`);
  const next = source.indexOf("\n  {\n    id:", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

const globalsCss = read("artifacts", "nxtdrive", "app", "globals.css");
assert(
  !globalsCss.includes("[data-instructor] {"),
  "instructor shell should not force a separate theme",
);
assert(
  globalsCss.includes("--color-popover: var(--popover);"),
  "popover theme tokens should be registered",
);

const routes = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "instructor",
  "routes.ts",
);
const routeDefinitions = routes.split("export const instructorRoutes = [")[1] ?? "";
assert(
  (routeDefinitions.match(/visibility: "navigation"/g) ?? []).length === 5,
  "instructor app should expose exactly five primary routes",
);
for (const [id, pathName, label] of [
  ["home", "/instructeur", "Vandaag"],
  ["agenda", "/instructeur/agenda", "Planning"],
  ["students", "/instructeur/leerlingen", "Leerlingen"],
  ["tasks", "/instructeur/taken", "Taken"],
  ["more", "/instructeur/meer", "Account"],
] as const) {
  const block = routeBlock(routes, id);
  assert(
    block.includes(`canonicalPath: "${pathName}"`) &&
      block.includes(`navLabel: "${label}"`) &&
      block.includes('visibility: "navigation"'),
    `${label} should be a canonical primary instructor route`,
  );
}
assert(
  routeBlock(routes, "messages").includes('visibility: "contextual"') &&
    routeBlock(routes, "theory").includes('visibility: "contextual"'),
  "messages and unfinished theory should stay contextual",
);

const topbar = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "InstructorTopbar.tsx",
);
assert(
  topbar.includes("InstructorQuickSearch") &&
    topbar.includes('href="/instructeur/berichten"') &&
    topbar.includes('href="/instructeur/agenda/nieuw"') &&
    topbar.includes('href="/instructeur/profiel"') &&
    topbar.includes("SecureInstructorLogoutForm"),
  "desktop instructor controls should use canonical, functional destinations",
);
assert(
  !topbar.includes("/instructeur/intake"),
  "topbar should not expose the obsolete intake placeholder",
);

const sidebar = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "Sidebar.tsx",
);
assert(
  (sidebar.match(/\{notifications\}/g) ?? []).length === 2 &&
    sidebar.includes("xl:hidden") &&
    sidebar.includes('href="/instructeur/meer"') &&
    sidebar.includes('aria-label="Account en instellingen"') &&
    sidebar.includes("grid-cols-5"),
  "mobile and tablet instructor shells should expose notifications, account and five primary items",
);

const layout = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "layout.tsx",
);
assert(
  layout.includes("const theme = await getTheme();") &&
    layout.includes('viewAllHref="/instructeur/meldingen"') &&
    layout.includes("notifications={notificationBell}"),
  "canonical instructor layout should load theme and wire notifications",
);

const quickSearch = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "InstructorQuickSearch.tsx",
);
const searchActions = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "search",
  "actions.ts",
);
assert(
  quickSearch.includes("globalSearch") &&
    quickSearch.includes("Zoek in leerlingen, leads en lessen"),
  "instructor shell should expose working quick search",
);
assert(
  searchActions.includes("loadInstructorAccessibleStudentIds") &&
    searchActions.includes("isAdmin") &&
    searchActions.includes(": Promise.resolve({ data: [], error: null })") &&
    searchActions.includes('href: `/instructeur/leerlingen/${student.id}`') &&
    searchActions.includes('href: `/instructeur/lessen/${lesson.id}`'),
  "quick search should respect instructor scope and canonical destinations",
);

const redesign = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "RedesignViews.tsx",
);
const cockpitStart = redesign.indexOf("export function InstructorCockpitView");
const cockpitEnd = redesign.indexOf("\nexport function ", cockpitStart + 1);
const cockpit = redesign.slice(cockpitStart, cockpitEnd);
assert(
  (cockpit.match(/title="Volgende actie"/g) ?? []).length === 1 &&
    !cockpit.includes('title="Volgende les"') &&
    !cockpit.includes("Quick links") &&
    cockpit.includes('title="Vandaag"') &&
    cockpit.includes("href={data.nextAction.href}"),
  "cockpit should focus on one actionable next step without duplicate shortcuts",
);

const moreStart = redesign.indexOf("export function InstructorMoreView");
const moreEnd = redesign.indexOf("\nexport function ", moreStart + 1);
const more = redesign.slice(moreStart, moreEnd);
assert(
  more.includes("SecureInstructorLogoutForm") &&
    more.includes('"/instructeur/meldingen"') &&
    more.includes('"/instructeur/profiel"'),
  "instructor account should expose notifications, profile and secure logout",
);

const settingsStart = redesign.indexOf("export function InstructorSettingsView");
const settingsEnd = redesign.indexOf("\nexport function ", settingsStart + 1);
const settings = redesign.slice(settingsStart, settingsEnd);
assert(
  settings.includes('title="Account en voorkeuren"') &&
    settings.includes("Je rijschool beheert je accountgegevens") &&
    !settings.includes("<input") &&
    !settings.includes("<button"),
  "settings should not present fake editable controls",
);

const notificationsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "meldingen",
  "page.tsx",
);
assert(
  notificationsPage.includes("loadInAppNotifications") &&
    redesign.includes("<NotificationInbox items={items} unreadCount={unreadCount} />"),
  "instructor notifications should load and render an actionable inbox",
);

const studentDetailPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "leerlingen",
  "[studentId]",
  "page.tsx",
);
assert(
  studentDetailPage.includes("loadInstructorStudent") &&
    redesign.includes("student.conversationId") &&
    redesign.includes("`/instructeur/berichten/${student.conversationId}`"),
  "instructor student workspace should expose the scoped conversation",
);

const agendaPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "agenda",
  "page.tsx",
);
const studentsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "leerlingen",
  "page.tsx",
);
const dayCalendar = read(
  "artifacts",
  "nxtdrive",
  "domains",
  "planning",
  "ui",
  "instructor-day-calendar",
  "InstructorDayCalendar.tsx",
);
assert(
  agendaPage.includes("loadInstructorAgenda") &&
    agendaPage.includes("selectedAppointmentId") &&
    dayCalendar.includes("AppointmentQuickView") &&
    dayCalendar.includes("setSelectedItem") &&
    studentsPage.includes("loadInstructorStudents") &&
    studentsPage.includes("selectedStudentId") &&
    redesign.includes("?leerling="),
  "tablet agenda and student routes should use scoped master-detail loaders",
);
assert(
  cockpit.includes("sm:grid-cols-2 xl:grid-cols-4") &&
    !cockpit.includes("lg:grid-cols-3"),
  "instructor cockpit should stay at no more than two columns on tablet",
);

const intakePage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructeur",
  "intake",
  "page.tsx",
);
assert(
  intakePage.includes('redirect("/instructeur/agenda")'),
  "obsolete intake route should resolve to the working agenda",
);
const dayList = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "DayList.tsx",
);
assert(
  !dayList.includes('return "/instructeur/intake"'),
  "trial appointments should not link through the obsolete intake route",
);

console.log("test-instructor-ui-polish: ok");
