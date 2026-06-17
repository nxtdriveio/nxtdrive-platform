import { readFileSync } from "node:fs";
import path from "node:path";

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), "..", ...parts);
}

function expectIncludes(filePath: string, snippet: string, label: string) {
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(snippet)) {
    throw new Error(`Expected ${label} in ${filePath}`);
  }
}

function expectRouteInfoBubble(filePath: string, scope: string, label: string) {
  const content = readFileSync(filePath, "utf8");
  if (!content.includes("RouteInfoBubble") || !content.includes(`scope="${scope}"`)) {
    throw new Error(`Expected ${label} in ${filePath}`);
  }
}

expectIncludes(
  repoPath("artifacts", "nxtdrive", "components", "navigation", "RouteInfoBubble.tsx"),
  "const ROUTE_INFO",
  "route info registry",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "components", "navigation", "RouteInfoBubble.tsx"),
  "student: [",
  "student route info entries",
);
expectRouteInfoBubble(
  repoPath("artifacts", "nxtdrive", "components", "student", "TopBar.tsx"),
  "student",
  "student topbar info bubble",
);
expectRouteInfoBubble(
  repoPath("artifacts", "nxtdrive", "components", "instructor", "InstructorTopbar.tsx"),
  "instructor",
  "instructor desktop info bubble",
);
expectRouteInfoBubble(
  repoPath("artifacts", "nxtdrive", "components", "instructor", "Sidebar.tsx"),
  "instructor",
  "instructor mobile info bubble",
);
expectRouteInfoBubble(
  repoPath("artifacts", "nxtdrive", "components", "backoffice", "topbar.tsx"),
  "backoffice",
  "backoffice info bubble",
);
expectIncludes(
  repoPath("scripts", "package.json"),
  '"test-route-info-bubbles"',
  "package script registration",
);

console.log("test-route-info-bubbles: ok");
