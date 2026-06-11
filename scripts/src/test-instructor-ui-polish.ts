import { readFileSync } from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), "..", ...parts);
}

const read = (...parts: string[]) => readFileSync(repoPath(...parts), "utf8");

const globalsCss = read("artifacts", "nxtdrive", "app", "globals.css");
assert(
  !globalsCss.includes("[data-instructor] {"),
  "instructor shell should no longer force its own dark amber theme",
);
assert(
  globalsCss.includes("--color-popover: var(--popover);"),
  "popover theme tokens should be registered",
);

const topbar = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "InstructorTopbar.tsx",
);
assert(
  !topbar.includes('label: "Meldingen"'),
  "desktop instructor topbar should not duplicate notifications as a nav item",
);
assert(
  topbar.includes('label: "Leerlingenlijst"'),
  "desktop instructor topbar should keep the students list available in actions",
);
assert(
  !topbar.includes("ArrowLeft") && !topbar.includes("Home"),
  "desktop instructor topbar should keep navigation actions out of the content rail",
);
assert(
  topbar.includes("InstructorQuickSearch") &&
    topbar.includes('href="/instructor/berichten"') &&
    topbar.includes('href: "/instructor/afspraak/nieuw"') &&
    topbar.includes('href: "/instructor/intake"'),
  "desktop instructor topbar should use the centered quick search and corrected action links",
);

const sidebar = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "Sidebar.tsx",
);
const notificationUses = sidebar.match(/\{notifications\}/g) ?? [];
assert(
  notificationUses.length === 1,
  "instructor sidebar should only render notifications once for mobile shell controls",
);

const bell = read(
  "artifacts",
  "nxtdrive",
  "components",
  "notifications",
  "NotificationBell.tsx",
);
assert(
  bell.includes("viewAllHref?: string;") && bell.includes("Bekijk alles"),
  "notification bell should expose a dedicated view-all link",
);

const layout = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "layout.tsx",
);
assert(
  layout.includes("const theme = await getTheme();"),
  "instructor layout should load the persisted theme",
);

assert(
  topbar.includes("ThemeToggle") &&
    topbar.includes("current={theme}") &&
    sidebar.includes("ThemeToggle") &&
    sidebar.includes("current={theme}"),
  "instructor shell should expose a theme toggle on desktop and mobile",
);
assert(
  sidebar.includes('href="/instructor"') && sidebar.includes("Home"),
  "instructor shell should keep a persistent home action next to the logo",
);
assert(
  sidebar.includes("MobileSearch"),
  "mobile instructor shell should expose quick search too",
);

const quickSearch = read(
  "artifacts",
  "nxtdrive",
  "components",
  "instructor",
  "InstructorQuickSearch.tsx",
);
assert(
  quickSearch.includes("globalSearch") &&
    quickSearch.includes("Zoek in leerlingen, leads en lessen"),
  "instructor shell should expose a dedicated quick search component",
);

const searchActions = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "search",
  "actions.ts",
);
assert(
  searchActions.includes("loadInstructorAccessibleStudentIds") &&
    searchActions.includes('href: `/instructor/leerlingen/${student.id}`') &&
    searchActions.includes('href: `/instructor/${lesson.id}`'),
  "instructor quick search should stay permission-aware and route students and lessons inside the instructor app",
);

const page = read("artifacts", "nxtdrive", "app", "instructor", "page.tsx");
assert(
  !page.includes("redirect(`/instructor/${target.id}`)"),
  "instructor dashboard should stay visible instead of auto-redirecting into a lesson",
);
assert(
  !page.includes("redirect(`/instructor/${target.id}`)") &&
    page.includes("Goedemorgen") &&
    page.includes("Volgende les") &&
    page.includes("Op de radar") &&
    page.includes("Quick links"),
  "instructor dashboard should expose richer overview cards",
);
assert(
  page.includes(
    'contentClassName="space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-y-3.5 lg:space-y-0 lg:overflow-hidden"',
  ) &&
    page.includes("lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.96fr)_minmax(0,0.96fr)]"),
  "instructor dashboard should use the denser responsive home layout",
);

const primitives = read(
  "artifacts",
  "nxtdrive",
  "components",
  "pwa",
  "primitives.tsx",
);
assert(
  primitives.includes("mx-auto w-full max-w-[100rem]"),
  "instructor pages should be allowed to span the wider tablet shell",
);

const availabilityPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "beschikbaarheid",
  "page.tsx",
);
assert(
  availabilityPage.includes('<PWAPage app="instructor"') &&
    availabilityPage.includes("xl:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)]"),
  "availability should use the instructor-wide shell and split layout",
);

const notificationsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "meldingen",
  "page.tsx",
);
assert(
  notificationsPage.includes('<PWAPage app="instructor"') &&
    notificationsPage.includes("xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]"),
  "notifications should use the broader two-column instructor layout",
);

const settingsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "instellingen",
  "page.tsx",
);
assert(
  settingsPage.includes('<PWAPage app="instructor"') &&
    settingsPage.includes("Pushstatus"),
  "settings should now use the instructor shell and summary tiles",
);

const studentsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "leerlingen",
  "page.tsx",
);
assert(
  studentsPage.includes("Open leerlingdossier") &&
    studentsPage.includes("2xl:grid-cols-3"),
  "students should use richer responsive cards instead of a bare table-only view",
);

const studentDetailPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "leerlingen",
  "[id]",
  "page.tsx",
);
assert(
  studentDetailPage.includes("Leerlingcontext") &&
    studentDetailPage.includes("loadStudentDossier") &&
    studentDetailPage.includes("PlannedCard") &&
    studentDetailPage.includes('scope="instructor"') &&
    studentDetailPage.includes("Planningcontext") &&
    studentDetailPage.includes("openInstructorConversationAction"),
  "instructor app should provide its own student detail cockpit instead of bouncing into backoffice",
);

const messagesPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "berichten",
  "page.tsx",
);
assert(
  messagesPage.includes("Nieuw gesprek") &&
    messagesPage.includes("ChatThread") &&
    messagesPage.includes("xl:grid-cols-[minmax(22rem,0.82fr)_minmax(0,1.18fr)]"),
  "messages should provide a real inbox workspace with thread preview on wide screens",
);

const weekPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "week",
  "page.tsx",
);
assert(
  weekPage.includes('title="Agenda"') &&
    weekPage.includes("InstructorAgendaWorkspace") &&
    weekPage.includes("visibleStartHour") &&
    weekPage.includes("visibleEndHour"),
  "instructor planning should now render as the new agenda workspace with persisted visible hour settings",
);

const appointmentPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "afspraak",
  "nieuw",
  "page.tsx",
);
assert(
  appointmentPage.includes("Nieuwe agenda-afspraak") &&
    appointmentPage.includes('href="/instructor/les/nieuw"') &&
    appointmentPage.includes("Reguliere les nodig?"),
  "appointment flow should clearly route regular lessons back to the lesson planner",
);

const lessonPlannerPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "les",
  "nieuw",
  "page.tsx",
);
assert(
  lessonPlannerPage.includes("Nieuwe les") &&
    lessonPlannerPage.includes('name="detail_base" value="/instructor"') &&
    lessonPlannerPage.includes("loadInstructorAccessibleStudentIds"),
  "lesson planning should stay inside the instructor shell and respect instructor student scope",
);

const evaluationsPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "les-evaluaties",
  "page.tsx",
);
assert(
  evaluationsPage.includes("Les evaluaties") &&
    evaluationsPage.includes("Recente lesfeedback"),
  "instructor app should expose an internal lesson evaluations overview",
);

const vehiclesPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "voertuigen",
  "page.tsx",
);
assert(
  vehiclesPage.includes("Voertuigen") &&
    vehiclesPage.includes("Lesauto's") &&
    vehiclesPage.includes("Locaties"),
  "instructor app should expose an internal vehicles overview",
);

const intakePage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "intake",
  "page.tsx",
);
assert(
  intakePage.includes("Intakeoverzicht") &&
    intakePage.includes("lead_intake_details") &&
    intakePage.includes("Open leerlingcontext"),
  "instructor app should expose an internal intake overview instead of linking back to backoffice",
);

const tasksPage = read(
  "artifacts",
  "nxtdrive",
  "app",
  "instructor",
  "taken",
  "page.tsx",
);
assert(
  tasksPage.includes('layout="grid"') &&
    tasksPage.includes("Binnen 3 dagen") &&
    tasksPage.includes("info="),
  "tasks should use the denser tablet-first board layout and summary tiles",
);

const board = read(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "taken",
  "board.tsx",
);
assert(
  board.includes('xl:grid-cols-3'),
  "task board grid layout should settle into three columns on wide instructor screens",
);

assert(
  primitives.includes("InfoBubble") && primitives.includes("info?: ReactNode"),
  "shared KPI tiles should support inline info bubbles",
);

console.log("test-instructor-ui-polish: ok");
