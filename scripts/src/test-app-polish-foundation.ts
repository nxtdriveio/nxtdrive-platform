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
  repoPath("artifacts", "nxtdrive", "app", "leerling", "layout.tsx"),
  "homePathForRoles(roles) !== \"/leerling\"",
  "student primary app guard",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructeur", "layout.tsx"),
  "homePathForRoles(roles) !== \"/instructeur\"",
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
  repoPath("artifacts", "nxtdrive", "app", "leerling", "manifest.webmanifest", "route.ts"),
  'start_url: "/leerling"',
  "student canonical manifest",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructeur", "manifest.webmanifest", "route.ts"),
  'start_url: "/instructeur"',
  "instructor canonical manifest",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "leerling", "page.tsx"),
  "deriveStudentNextAction",
  "student cross-domain next action",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructeur", "page.tsx"),
  "InstructorCockpitView",
  "instructor canonical cockpit",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "leerling", "lessen", "[lessonId]", "page.tsx"),
  "<PWAPageHeader",
  "student lesson detail shell",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "app", "instructeur", "lessen", "[lessonId]", "page.tsx"),
  "RisEvaluationWorkspace",
  "instructor lesson cockpit shell",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "public", "sw.js"),
  '"/offline-leerling.html"',
  "privacy-safe student offline fallback",
);
expectIncludes(
  repoPath("artifacts", "nxtdrive", "public", "sw.js"),
  '"/offline-instructeur.html"',
  "privacy-safe instructor offline fallback",
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
