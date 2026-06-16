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

const risActions = source("artifacts/nxtdrive/lib/ris/actions.ts");
const risFormActions = source("artifacts/nxtdrive/app/backoffice/ris/actions.ts");
const risData = source("artifacts/nxtdrive/lib/ris/data.ts");
const risPage = source("artifacts/nxtdrive/app/backoffice/ris/page.tsx");
const appointmentPage = source("artifacts/nxtdrive/app/backoffice/agenda/afspraak/nieuw/page.tsx");
const docs = source("docs/RIS_LESKAART_IMPLEMENTATION.md");
const migration = source("supabase/migrations/20260616104647_ris_lesson_card_foundation.sql");
const packageJson = source("scripts/package.json");

check(
  "RIS module test enum covers internal and CBR moments",
  risActions.includes('"instructor_test_1"') &&
    risActions.includes('"instructor_test_2"') &&
    risActions.includes('"ris_test_cbr"') &&
    risActions.includes('"ris_exam_cbr"') &&
    migration.includes("'ris_test_cbr'") &&
    migration.includes("'ris_exam_cbr'"),
);

check(
  "RIS module test action validates student branch scope before service-role write",
  risActions.includes("requireStudentBackofficeAccess") &&
    risActions.includes("RIS_MODULE_TEST_WRITE_ROLES") &&
    risActions.includes("Geen toegang tot deze leerling binnen je vestigingsscope"),
);

check(
  "RIS module test form action parses CBR fields and exemption",
  risFormActions.includes("upsertRisModuleTestFromFormAction") &&
    risFormActions.includes("cbr_reference") &&
    risFormActions.includes("exemption_special_manoeuvres") &&
    risFormActions.includes("needs_repeat"),
);

check(
  "RIS backoffice loader exposes CBR reference, notes and manoeuvre exemption",
  risData.includes("cbrReference: string | null") &&
    risData.includes("notes: string | null") &&
    risData.includes("exemptionSpecialManoeuvres: boolean") &&
    risData.includes("test.cbr_reference") &&
    risData.includes("test.exemption_special_manoeuvres"),
);

check(
  "RIS backoffice page registers and surfaces CBR module tests",
  risPage.includes("Moduletoets of CBR-moment registreren") &&
    risPage.includes("RIS-toets CBR") &&
    risPage.includes("RIS-examen CBR") &&
    risPage.includes("Vrijstelling bijzondere verrichtingen") &&
    risPage.includes("Plan in agenda") &&
    risPage.includes("agendaHrefForModuleTest"),
);

check(
  "RIS agenda bridge maps CBR exam to exam and other RIS tests to interim_test",
  risPage.includes('test.testType === "ris_exam_cbr" ? "exam" : "interim_test"') &&
    risPage.includes("duration_min") &&
    risPage.includes("student_id"),
);

check(
  "Generic appointment create page accepts RIS prefill query params",
  appointmentPage.includes("NewAppointmentSearchParams") &&
    appointmentPage.includes("appointmentType(sp.type)") &&
    appointmentPage.includes("defaultStudentId") &&
    appointmentPage.includes("durationParam(sp.duration_min)") &&
    appointmentPage.includes("notes: param(sp.notes"),
);

check(
  "RIS documentation marks RIS-7 as implemented",
  docs.includes("### RIS-7: Moduletoetsen en CBR-koppeling") &&
    docs.includes("Geimplementeerd:") &&
    docs.includes("agenda-prefill") &&
    docs.includes("RIS-examen CBR linkt naar `exam`"),
);

check("package script exposes RIS-7 guard", packageJson.includes('"test-ris-module-tests-cbr"'));

let failed = 0;
for (const result of results) {
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}`);
  if (!result.ok) failed++;
}

if (failed > 0) {
  console.error(`${failed} RIS module test / CBR check(s) failed.`);
  process.exit(1);
}

console.log("test-ris-module-tests-cbr: ok");
