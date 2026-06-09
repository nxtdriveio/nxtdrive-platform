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
  "desktop instructor topbar should surface the students list directly",
);
assert(
  !topbar.includes("ArrowLeft") && !topbar.includes("Home"),
  "desktop instructor topbar should keep navigation actions out of the content rail",
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

const page = read("artifacts", "nxtdrive", "app", "instructor", "page.tsx");
assert(
  !page.includes("redirect(`/instructor/${target.id}`)"),
  "instructor dashboard should stay visible instead of auto-redirecting into a lesson",
);
assert(
  !page.includes("Dagoverzicht") &&
    page.includes("Vandaag op je radar") &&
    page.includes("Snelle routes"),
  "instructor dashboard should expose richer overview cards",
);
assert(
  page.includes('contentClassName="space-y-5 xl:space-y-6"') &&
    page.includes("sm:grid-cols-2"),
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

console.log("test-instructor-ui-polish: ok");
