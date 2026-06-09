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

expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "student", "layout.tsx"),
  "homePathForRoles(roles) !== \"/student\"",
  "student primary app guard",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructor", "layout.tsx"),
  "homePathForRoles(roles) !== \"/instructor\"",
  "instructor primary app guard",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "backoffice", "layout.tsx"),
  "data-management-shell",
  "management shell backdrop",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "components", "pwa", "primitives.tsx"),
  "export function PWAHero",
  "shared hero primitive",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "student", "manifest.webmanifest", "route.ts"),
  'orientation: "portrait"',
  "student portrait manifest",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructor", "manifest.webmanifest", "route.ts"),
  'orientation: "landscape"',
  "instructor landscape manifest",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "student", "page.tsx"),
  "<PWAHero",
  "student hero shell",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructor", "page.tsx"),
  "tablet-first cockpit",
  "instructor product copy",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "student", "lessons", "[lessonId]", "page.tsx"),
  "<PWAPageHeader",
  "student lesson detail shell",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructor", "[lessonId]", "page.tsx"),
  "<PWAPageHeader",
  "instructor lesson cockpit shell",
);
expectIncludes(
  repoPath("docs", "SPRINT_10_APP_POLISH.md"),
  "# Sprint 10 - App Polish",
  "sprint 10 docs",
);
expectIncludes(
  repoPath("scripts", "package.json"),
  "\"test-app-polish-foundation\"",
  "package script registration",
);

console.log("test-app-polish-foundation: ok");
