import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Outcome = { name: string; ok: boolean };
const results: Outcome[] = [];

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

function check(name: string, ok: boolean): void {
  results.push({ name, ok });
}

const risData = source("artifacts/nxtdrive/lib/ris/data.ts");
const studentProgressPage = source(
  "artifacts/nxtdrive/app/student/voortgang/page.tsx",
);
const studentRisView = source(
  "artifacts/nxtdrive/components/ris/StudentRisProgressView.tsx",
);
const docs = source("docs/RIS_LESKAART_IMPLEMENTATION.md");
const packageJson = source("scripts/package.json");

check(
  "student RIS loader only exposes published lesson cards",
  risData.includes('from("ris_lesson_cards")') &&
    risData.includes(
      '.in("publication_status", Array.from(STUDENT_VISIBLE_RIS_CARD_STATUSES))',
    ) &&
    risData.includes("StudentRisPublishedCard"),
);

check(
  "student RIS loader includes guided reflections for published cards",
  risData.includes('from("ris_guided_reflections")') &&
    risData.includes("reflectionByCardId") &&
    risData.includes("reflectionByCardId.get(card.id) ?? null"),
);

check(
  "student progress page switches RIS tenants to RIS view",
  studentProgressPage.includes("loadStudentRisProgress") &&
    studentProgressPage.includes('lessonCardMode === "ris"') &&
    studentProgressPage.includes("StudentRisProgressView") &&
    studentProgressPage.includes("legacyProgressTabFrom"),
);

check(
  "RIS student view covers learner-friendly progress requirements",
  studentRisView.includes("Mijn RIS-rijbewijsreis") &&
    studentRisView.includes("Dekkingskaart") &&
    studentRisView.includes("geen examenadvies") &&
    studentRisView.includes("Moduleprogressie") &&
    studentRisView.includes("Laatst geoefend") &&
    studentRisView.includes("Gepubliceerde leskaarten") &&
    studentRisView.includes("Huiswerk / volgende focus") &&
    studentRisView.includes("Jouw leerwens"),
);

check(
  "RIS student view hides internal instructor-only fields",
  !studentRisView.includes("instructorNote") &&
    !studentRisView.includes("internalSummary") &&
    !studentRisView.includes("instructorContextNote") &&
    studentRisView.includes("studentFriendlySummary"),
);

check(
  "RIS documentation marks student view as implemented",
  docs.includes("RIS-5: Leerlingweergave") &&
    docs.includes("Geimplementeerd") &&
    docs.includes("student PWA toont RIS-voortgang"),
);

check(
  "package script exposes RIS student-view guard",
  packageJson.includes('"test-ris-student-view"'),
);

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS student-view check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-student-view: ok");
