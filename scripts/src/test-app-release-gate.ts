import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const appRoot = path.join(root, "artifacts", "nxtdrive");
const read = (...parts: string[]) =>
  readFileSync(path.join(root, ...parts), "utf8");
const appRead = (...parts: string[]) =>
  readFileSync(path.join(appRoot, ...parts), "utf8");

assert.equal(
  existsSync(path.join(appRoot, "app", "student")),
  false,
  "legacy /student implementation directory must not exist",
);
assert.equal(
  existsSync(path.join(appRoot, "app", "instructor")),
  false,
  "legacy /instructor implementation directory must not exist",
);

const instructorPages = [
  "app/instructeur/page.tsx",
  "app/instructeur/agenda/page.tsx",
  "app/instructeur/leerlingen/page.tsx",
  "app/instructeur/berichten/page.tsx",
  "app/instructeur/voertuigen/page.tsx",
  "app/instructeur/rapportages/page.tsx",
  "app/instructeur/profiel/page.tsx",
];
for (const relativePath of instructorPages) {
  const source = appRead(...relativePath.split("/"));
  assert.equal(
    source.includes("loadInstructorExperience"),
    false,
    `${relativePath} must not load the complete instructor experience`,
  );
}

const readiness = appRead("lib", "skills", "readiness-data.ts");
const instructorData = appRead("lib", "instructor", "experience-server.ts");
assert.equal(
  instructorData.includes("loadInstructorExperience"),
  false,
  "the unused full instructor experience loader must stay removed",
);
assert.match(readiness, /export async function loadStudentsReadiness/);
assert.match(
  readiness,
  /const results = await loadStudentsReadiness\(client, tenantId, \[studentId\]\)/,
);
assert.match(instructorData, /loadStudentsReadiness/);

const redesign = appRead("components", "instructor", "RedesignViews.tsx");
assert.match(redesign, /<ChatThread/);
assert.equal(
  redesign.includes('variant="success">Online</Badge>') ||
    redesign.includes('className="text-xs text-success">Online</p>'),
  false,
  "instructor chat must not invent online presence",
);
assert.equal(
  existsSync(
    path.join(
      appRoot,
      "components",
      "instructor",
      "InstructorMessageComposer.tsx",
    ),
  ),
  false,
  "duplicate instructor chat composer must stay removed",
);

const documents = appRead("lib", "students", "documents.ts");
for (const contract of [
  "loadStudentDocumentMetadata",
  "loadStudentDocuments",
  "createStudentDocumentDownloadUrl",
]) {
  assert.ok(
    documents.includes(contract),
    `document source must expose ${contract}`,
  );
}

const risActions = appRead("lib", "ris", "actions.ts");
const completionPanel = appRead(
  "components",
  "ris",
  "RisLessonPublicationPanel.tsx",
);
assert.ok(
  risActions.includes("recordRisLessonCompletionMeasurementAction") &&
    risActions.includes("ris.lesson_completion_usability_measured") &&
    completionPanel.includes("data-completion-flow") &&
    completionPanel.includes("Date.now() - started.startedAtMs"),
  "canonical lesson completion must record the real user boundary through publish acknowledgement",
);

const e2e = read("scripts", "src", "e2e-release-smoke.ts");
for (const viewport of [
  "{ width: 390, height: 844 }",
  "{ width: 768, height: 1024 }",
  "{ width: 1024, height: 768 }",
  "{ width: 1180, height: 820 }",
  "{ width: 1440, height: 1000 }",
]) {
  assert.ok(e2e.includes(viewport), `release E2E must include ${viewport}`);
}
for (const releaseCheck of [
  "assertNoViewportClipping",
  "assertVisibleActions",
  "Account en instellingen",
  "Uitloggen",
  "Leerling toevoegen",
  "mobile instructor chat page itself must not scroll",
  "conversation must use inline vertical scrolling",
  "Terug naar gesprekken",
  "?afspraak=",
  "?leerling=",
]) {
  assert.ok(
    e2e.includes(releaseCheck),
    `release E2E must enforce ${releaseCheck}`,
  );
}

const workflow = read(".github", "workflows", "e2e.yml");
assert.ok(
  workflow.includes('VISUAL_FIXTURES_ENABLED: "true"') &&
    workflow.includes("e2e:release-smoke"),
  "pull requests must run the functional viewport release gate",
);

console.log("test-app-release-gate: ok");
