import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RIS_JOURNEY_CHECKS,
  RisJourneyAssertionError,
  RisJourneyBot,
  loadRisJourneyBaseline,
  type RisJourneyBaseline,
  type RisJourneyReport,
} from "./lib/ris-journey-bot.js";

type Test = { name: string; run: () => void };
const tests: Test[] = [];

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const allCheckIds = Object.keys(RIS_JOURNEY_CHECKS);

function baseline(
  overrides: Partial<RisJourneyBaseline> = {},
): RisJourneyBaseline {
  return {
    schemaVersion: 1,
    name: "synthetic baseline",
    requiredCheckIds: allCheckIds,
    minPassRate: 100,
    minExplainabilityScore: 100,
    maxTotalDurationMs: 60_000,
    maxCheckDurationMs: {},
    ...overrides,
  };
}

function botWithAllPassing(
  inputBaseline: RisJourneyBaseline = baseline(),
): RisJourneyBot {
  const bot = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
    runId: "synthetic-pass",
    commitSha: "test-sha",
  });
  for (const checkId of inputBaseline.requiredCheckIds) {
    bot.verify(checkId, {
      passed: true,
      observed: "De synthetische waarneming voldoet aan de eis.",
      evidence: [
        {
          kind: "database",
          source: "synthetic fixture",
          summary: "De verwachte toestand is aangetroffen.",
        },
      ],
      durationMs: 5,
    });
  }
  return bot;
}

test("een volledig verklaarbare journey passeert de baseline", () => {
  const report = botWithAllPassing().report();
  assert(report.outcome === "PASS", `verwacht PASS, kreeg ${report.outcome}`);
  assert(report.summary.passRate === 100, "pass rate is niet 100%");
  assert(
    report.summary.explainabilityScore === 100,
    "verklaarbaarheid is niet 100%",
  );
  assert(
    report.comparison.missingRequired.length === 0,
    "verplichte controles ontbreken",
  );
});

test("een kritieke mislukking wordt verklaard en faalt de releasegate", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.JOURNEY.DRAFT_PRIVACY"],
  });
  const bot = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
  });
  let thrown: unknown;
  try {
    bot.verify("RIS.JOURNEY.DRAFT_PRIVACY", {
      passed: false,
      observed: "Concepttekst was zichtbaar in het leerlingportaal.",
      evidence: [
        {
          kind: "ui",
          source: "/leerling/lessen/test",
          summary: "De unieke conceptmarker was zichtbaar.",
        },
      ],
    });
  } catch (error) {
    thrown = error;
  }
  assert(
    thrown instanceof RisJourneyAssertionError,
    "mislukte controle gooit geen herkenbare assertion",
  );
  const report = bot.report();
  assert(report.outcome === "FAIL", "kritieke mislukking faalt niet");
  assert(
    report.checks[0]?.rationale.includes("gepubliceerde"),
    "rapport mist inhoudelijke rationale",
  );
});

test("niet uitgevoerde controles worden expliciet geblokkeerd", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.PREFLIGHT.TENANT_MODE", "RIS.JOURNEY.PUBLICATION"],
  });
  const bot = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
  });
  bot.verify("RIS.PREFLIGHT.TENANT_MODE", {
    passed: true,
    observed: "RIS actief en AI uit.",
    evidence: [
      {
        kind: "configuration",
        source: "tenant_ris_settings",
        summary: "lesson_card_mode=ris, ai_assist_enabled=false",
      },
    ],
  });
  bot.blockRemaining("Publicatie niet bereikbaar door ontbrekende fixture.");
  const report = bot.report();
  assert(report.outcome === "BLOCKED", "geblokkeerde journey is niet BLOCKED");
  assert(
    report.comparison.blockedRequired.includes("RIS.JOURNEY.PUBLICATION"),
    "geblokkeerde verplichte controle ontbreekt",
  );
});

test("timingregressie ten opzichte van baseline wordt gerapporteerd", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.JOURNEY.PUBLICATION"],
    maxCheckDurationMs: { "RIS.JOURNEY.PUBLICATION": 100 },
  });
  const bot = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
  });
  bot.verify("RIS.JOURNEY.PUBLICATION", {
    passed: true,
    observed: "Publicatie slaagde, maar te langzaam.",
    evidence: [
      {
        kind: "calculation",
        source: "monotonic timer",
        summary: "250 ms gemeten.",
      },
    ],
    durationMs: 250,
  });
  const report = bot.report();
  assert(report.outcome === "FAIL", "timingregressie faalt de baseline niet");
  assert(
    report.comparison.durationRegressions[0]?.actualMs === 250,
    "gemeten timing ontbreekt",
  );
});

test("vergelijking met vorige run toont regressie en herstel", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.JOURNEY.PUBLICATION", "RIS.JOURNEY.COMPLETION"],
  });
  const previous = botWithAllPassing(inputBaseline).report();
  const current = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
  });
  current.verify("RIS.JOURNEY.PUBLICATION", {
    passed: true,
    observed: "Publicatie is nog in orde.",
    evidence: [
      {
        kind: "database",
        source: "ris_lesson_cards",
        summary: "Status klopt.",
      },
    ],
  });
  try {
    current.verify("RIS.JOURNEY.COMPLETION", {
      passed: false,
      observed: "Kaart bleef open.",
      evidence: [
        {
          kind: "database",
          source: "ris_lesson_cards",
          summary: "Onverwachte status.",
        },
      ],
    });
  } catch {
    // De mislukking hoort als resultaat in het rapport te blijven staan.
  }
  const report = current.report(previous);
  assert(
    report.comparison.regressedSincePrevious.includes("RIS.JOURNEY.COMPLETION"),
    "statusregressie ontbreekt",
  );
});

test("JSON, Markdown en JUnit bevatten dezelfde verklaarbare controles", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.JOURNEY.NEXT_FOCUS"],
  });
  const bot = botWithAllPassing(inputBaseline);
  const directory = mkdtempSync(join(tmpdir(), "ris-journey-"));
  try {
    const { files } = bot.writeReports({ outputDirectory: directory });
    const json = readFileSync(files[0]!, "utf8");
    const markdown = readFileSync(files[1]!, "utf8");
    const junit = readFileSync(files[2]!, "utf8");
    assert(json.includes('"reportType": "nxtdrive.ris.journey"'), "JSON fout");
    assert(markdown.includes("Waarom:"), "Markdown mist uitleg");
    assert(junit.includes("<testsuite"), "JUnit ontbreekt");
    assert(
      [json, markdown, junit].every((value) =>
        value.includes("RIS.JOURNEY.NEXT_FOCUS"),
      ),
      "rapportformaten lopen uiteen",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("baseline-loader weigert onbekende controles", () => {
  const directory = mkdtempSync(join(tmpdir(), "ris-baseline-"));
  const path = join(directory, "baseline.json");
  try {
    writeFileSync(
      path,
      JSON.stringify({
        ...baseline(),
        requiredCheckIds: ["RIS.UNKNOWN"],
      }),
    );
    let message = "";
    try {
      loadRisJourneyBaseline(path);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    assert(
      message.includes("RIS.UNKNOWN"),
      "onbekende controle wordt aanvaard",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rapporten redigeren e-mailadressen en volledige database-id's", () => {
  const inputBaseline = baseline({
    requiredCheckIds: ["RIS.JOURNEY.AUDIT_TRAIL"],
  });
  const bot = new RisJourneyBot({
    baseline: inputBaseline,
    target: "synthetic://ris",
  });
  bot.verify("RIS.JOURNEY.AUDIT_TRAIL", {
    passed: true,
    observed:
      "Actor leerling@example.com gebruikte 12b7d9c2-3f30-4fe2-98f6-44cb53459913.",
    evidence: [
      {
        kind: "audit",
        source: "audit_log",
        summary:
          "Event voor leerling@example.com en 12b7d9c2-3f30-4fe2-98f6-44cb53459913.",
      },
    ],
  });
  const serialized = JSON.stringify(bot.report());
  assert(!serialized.includes("leerling@example.com"), "e-mail lekt");
  assert(
    !serialized.includes("12b7d9c2-3f30-4fe2-98f6-44cb53459913"),
    "database-id lekt",
  );
  assert(
    serialized.includes("{email}") && serialized.includes("{id}"),
    "redactiemarkers ontbreken",
  );
});

let failures = 0;
for (const item of tests) {
  try {
    item.run();
    console.log(`OK ${item.name}`);
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL ${item.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failures > 0) {
  console.error(`${failures} journeybot-test(s) gefaald.`);
  process.exit(1);
}

console.log(`Alle ${tests.length} RIS-journeybot-tests geslaagd.`);
