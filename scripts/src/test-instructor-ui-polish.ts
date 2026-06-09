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
  topbar.includes("<ThemeToggle current={theme}") &&
    sidebar.includes("<ThemeToggle current={theme}"),
  "instructor shell should expose a theme toggle on desktop and mobile",
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

console.log("test-instructor-ui-polish: ok");
