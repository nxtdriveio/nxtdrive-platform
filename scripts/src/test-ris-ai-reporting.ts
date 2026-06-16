import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), "utf8");
}

function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  console.log(`OK ${message}`);
}

const advisor = read("artifacts", "nxtdrive", "lib", "ai", "leskaart-advisor.ts");
ok(
  advisor.includes("generateRisLessonPublicationDraft") &&
    advisor.includes("RisLessonPublicationDraft") &&
    advisor.includes("studentSummary") &&
    advisor.includes("homeworkOrNextFocus") &&
    advisor.includes("internalAttentionPoints"),
  "RIS AI advisor returns student summary, next focus and internal attention",
);
ok(
  advisor.includes("response_format: { type: \"json_object\" }") &&
    advisor.includes("De instructeur controleert") &&
    advisor.includes("publiceert handmatig"),
  "RIS AI advisor is structured JSON and explicitly advisory",
);

const actions = read("artifacts", "nxtdrive", "lib", "ris", "actions.ts");
ok(
  actions.includes("generateRisLessonAiDraftAction") &&
    actions.includes("loadTenantEntitlementSnapshot") &&
    actions.includes("featureAccess.ai_features.allowed") &&
    actions.includes("primeAiClientIfNeeded"),
  "RIS AI action is entitlement-gated and primes platform AI",
);
ok(
  actions.includes("lesson.instructor_id !== user.id") &&
    actions.includes("tenant_admin") &&
    actions.includes("loadInstructorRisLessonCard"),
  "RIS AI action checks lesson ownership and loads server-side RIS data",
);

const publicationPanel = read(
  "artifacts",
  "nxtdrive",
  "components",
  "ris",
  "RisLessonPublicationPanel.tsx",
);
ok(
  publicationPanel.includes("Genereer AI-voorstel") &&
    publicationPanel.includes("generateRisLessonAiDraftAction") &&
    publicationPanel.includes("Controleer en pas aan voordat je publiceert"),
  "RIS publication panel exposes AI as editable draft only",
);

const data = read("artifacts", "nxtdrive", "lib", "ris", "data.ts");
ok(
  data.includes("BackofficeRisReport") &&
    data.includes("weakScripts") &&
    data.includes("moduleAdvice") &&
    data.includes("internalAttentionPoints") &&
    data.includes("buildBackofficeRisReport"),
  "RIS backoffice loader exposes reporting signals",
);

const page = read("artifacts", "nxtdrive", "app", "backoffice", "ris", "page.tsx");
ok(
  page.includes("RIS-rapportage & AI-signalen") &&
    page.includes("Moduleadvies") &&
    page.includes("Zwakke scripts") &&
    page.includes("Interne opvolging"),
  "RIS backoffice page renders reporting and follow-up sections",
);

const docs = read("docs", "RIS_LESKAART_IMPLEMENTATION.md");
ok(
  docs.includes("RIS-8: AI en rapportage") &&
    docs.includes("Geimplementeerd") &&
    docs.includes("AI publiceert nooit zelfstandig"),
  "RIS documentation marks AI/reporting sprint as implemented",
);

const pkg = read("scripts", "package.json");
ok(
  pkg.includes("\"test-ris-ai-reporting\""),
  "package script exposes RIS AI/reporting guard",
);

console.log("test-ris-ai-reporting: ok");
