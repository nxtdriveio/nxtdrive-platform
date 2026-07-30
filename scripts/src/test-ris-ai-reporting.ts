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

const advisor = read(
  "artifacts",
  "nxtdrive",
  "lib",
  "ai",
  "leskaart-advisor.ts",
);
ok(
  advisor.includes("generateRisLessonPublicationDraft") &&
    advisor.includes("RisLessonPublicationDraft") &&
    advisor.includes("studentSummary") &&
    advisor.includes("homeworkOrNextFocus") &&
    advisor.includes("internalAttentionPoints"),
  "RIS AI advisor returns student summary, next focus and internal attention",
);
ok(
  advisor.includes('response_format: { type: "json_object" }') &&
    advisor.includes("De instructeur controleert") &&
    advisor.includes("publiceert handmatig"),
  "RIS AI advisor is structured JSON and explicitly advisory",
);

const actions = read("artifacts", "nxtdrive", "lib", "ris", "actions.ts");
const flags = read("artifacts", "nxtdrive", "lib", "features", "flags.ts");
const disableMigration = read(
  "supabase",
  "migrations",
  "20260730113000_disable_ai_assist.sql",
);
ok(
  actions.includes("generateRisLessonAiDraftAction") &&
    actions.includes('isFeatureEnabled("ai.instructor.enabled")') &&
    actions.includes("AI-assistentie is tijdelijk uitgeschakeld") &&
    flags.includes("AI_TEMPORARILY_DISABLED = true") &&
    disableMigration.includes("new.ai_assist_enabled := false"),
  "RIS AI is hard-paused in application and database gates",
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
  publicationPanel.includes("regelgebaseerde voorstel") &&
    publicationPanel.includes("Het voorstel gebruikt alleen") &&
    !publicationPanel.includes("generateRisLessonAiDraftAction"),
  "RIS publication panel uses an explainable local proposal without model calls",
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

const page = read(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "ris",
  "page.tsx",
);
ok(
  page.includes("RIS-rapportage & signalen") &&
    page.includes("Moduleadvies") &&
    page.includes("Zwakke scripts") &&
    page.includes("Interne opvolging"),
  "RIS backoffice page renders reporting and follow-up sections",
);

const docs = read("docs", "RIS_LESKAART_IMPLEMENTATION.md");
ok(
  docs.includes("RIS-8: Verklaarbare signalen en rapportage") &&
    docs.includes("tijdelijk op productniveau uitgeschakeld") &&
    docs.includes("zonder AI-configuratie of externe modelcall"),
  "RIS documentation records the temporary AI pause and deterministic reporting",
);

const pkg = read("scripts", "package.json");
ok(
  pkg.includes('"test-ris-ai-reporting"'),
  "package script exposes RIS AI/reporting guard",
);

console.log("test-ris-ai-reporting: ok");
