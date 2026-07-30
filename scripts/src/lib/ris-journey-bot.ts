import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type RisJourneyStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
export type RisJourneySeverity = "critical" | "high" | "medium" | "info";
export type RisEvidenceKind =
  | "configuration"
  | "database"
  | "ui"
  | "audit"
  | "calculation";

export type RisJourneyCheckDefinition = {
  id: string;
  title: string;
  phase: "preflight" | "instructor" | "publication" | "student" | "planning";
  severity: RisJourneySeverity;
  requirement: string;
  rationale: string;
  remediation: string;
};

export type RisJourneyEvidence = {
  kind: RisEvidenceKind;
  source: string;
  summary: string;
};

export type RisJourneyCheckResult = RisJourneyCheckDefinition & {
  status: RisJourneyStatus;
  observed: string;
  evidence: RisJourneyEvidence[];
  startedAt: string;
  durationMs: number;
};

export type RisJourneyBaseline = {
  schemaVersion: 1;
  name: string;
  requiredCheckIds: string[];
  minPassRate: number;
  minExplainabilityScore: number;
  maxTotalDurationMs: number;
  maxCheckDurationMs: Record<string, number>;
};

export type RisJourneyComparison = {
  baselineName: string;
  missingRequired: string[];
  failedRequired: string[];
  blockedRequired: string[];
  durationRegressions: Array<{
    checkId: string;
    actualMs: number;
    maximumMs: number;
  }>;
  totalDurationRegression: boolean;
  regressedSincePrevious: string[];
  recoveredSincePrevious: string[];
};

export type RisJourneyReport = {
  schemaVersion: 1;
  reportType: "nxtdrive.ris.journey";
  run: {
    id: string;
    target: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    commitSha: string | null;
  };
  outcome: RisJourneyStatus;
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    passRate: number;
    explainabilityScore: number;
  };
  comparison: RisJourneyComparison;
  checks: RisJourneyCheckResult[];
};

type VerificationInput = {
  passed: boolean;
  observed: string;
  evidence: RisJourneyEvidence[];
  durationMs?: number;
};

const checks = [
  {
    id: "RIS.PREFLIGHT.TENANT_MODE",
    title: "RIS-modus is bewust en veilig geactiveerd",
    phase: "preflight",
    severity: "critical",
    requirement:
      "De testtenant gebruikt RIS met een actieve catalogus en AI-assistentie staat uit.",
    rationale:
      "De reis mag alleen RIS-functionaliteit bewijzen en mag geen AI-uitkomst als didactisch bewijs behandelen.",
    remediation:
      "Activeer een gevalideerde RIS-catalogus voor de testtenant en schakel AI-assistentie uit.",
  },
  {
    id: "RIS.PREFLIGHT.CATALOG_STRUCTURE",
    title: "De actieve catalogus heeft de canonieke RIS-structuur",
    phase: "preflight",
    severity: "critical",
    requirement:
      "De actieve versie bevat precies modules 1–4, 46 actieve scripts en de negen waarden N plus stap 1–8.",
    rationale:
      "Een geslaagde gebruikersreis op een onvolledige catalogus geeft een vals releasebewijs.",
    remediation:
      "Herstel de catalogusinhoud of activeer de juiste gepubliceerde versie.",
  },
  {
    id: "RIS.PREFLIGHT.READINESS_INVARIANTS",
    title: "De centrale readiness-engine bewaakt de RIS-invarianten",
    phase: "preflight",
    severity: "critical",
    requirement:
      "N verlaagt alleen dekking, stap 8 verhoogt geen beheersing en een veiligheidsblokkade blijft niet-compenseerbaar.",
    rationale:
      "Deze drie beslisregels voorkomen dat ontbrekend bewijs of didactische voortgang als examenrijpheid wordt gepresenteerd.",
    remediation:
      "Herstel de centrale readiness-engine of adapter; implementeer geen afwijkende berekening in de RIS-interface.",
  },
  {
    id: "RIS.PREFLIGHT.CURRICULUM_VALIDATION",
    title: "Curriculumpublicatie heeft een exacte expertvalidatie",
    phase: "preflight",
    severity: "critical",
    requirement:
      "Het RIS 2.0-curriculum is gepubliceerd en de goedkeuring hoort bij exact hetzelfde content-hash.",
    rationale:
      "Een oude of inhoudelijk afwijkende goedkeuring mag een gewijzigde catalogus niet vrijgeven.",
    remediation:
      "Laat de actuele curriculumversie inhoudelijk valideren en publiceer die via de publicatiegate.",
  },
  {
    id: "RIS.PREFLIGHT.READINESS_POLICY",
    title: "Readinessbeleid is gevalideerd en gepubliceerd",
    phase: "preflight",
    severity: "critical",
    requirement:
      "Er is een gepubliceerd readinessbeleid met een goedgekeurde expertvalidatie op het actuele content-hash.",
    rationale:
      "Readiness moet gebaseerd zijn op een expliciet beleid, niet op impliciete gemiddelden of een handmatige status.",
    remediation:
      "Valideer en publiceer het readinessbeleid dat bij deze curriculumversie hoort.",
  },
  {
    id: "RIS.PREFLIGHT.MODULE_TEST_DEFINITIONS",
    title: "Moduletoetsdefinities zijn gevalideerd en gepubliceerd",
    phase: "preflight",
    severity: "critical",
    requirement:
      "De definities voor RIS-moduletoets 1 en 2 zijn gepubliceerd met een exacte expertvalidatie.",
    rationale:
      "Een moduletoetsstatus is alleen betekenisvol als criteria versieerbaar, herleidbaar en gevalideerd zijn.",
    remediation:
      "Valideer en publiceer de ontbrekende of gewijzigde moduletoetsdefinities.",
  },
  {
    id: "RIS.PREFLIGHT.ENROLLMENT",
    title: "De testleerling volgt aantoonbaar RIS 2.0",
    phase: "preflight",
    severity: "critical",
    requirement:
      "De testleerling heeft een actieve RIS_2_0-inschrijving binnen dezelfde tenant.",
    rationale:
      "De journeybot mag een RIS-reis niet bewijzen met een legacy- of standaarddossier.",
    remediation:
      "Koppel een afzonderlijke testleerling aan een actieve RIS 2.0-inschrijving.",
  },
  {
    id: "RIS.JOURNEY.FOCUS_SCRIPT",
    title: "Een actief focusscript is beschikbaar",
    phase: "instructor",
    severity: "critical",
    requirement:
      "De les kan ten minste één actief script uit de gepubliceerde catalogus beoordelen.",
    rationale:
      "Zonder catalogusgebonden script is de beoordeling niet herleidbaar naar de gevalideerde inhoud.",
    remediation:
      "Controleer de actieve scripts en de koppeling met de leskaart.",
  },
  {
    id: "RIS.JOURNEY.SEPARATED_OBSERVATION",
    title: "De instructeur legt gescheiden observatiedimensies vast",
    phase: "instructor",
    severity: "critical",
    requirement:
      "RIS-stap, prestatie-uitkomst, ondersteuningsniveau en veiligheidsstatus worden afzonderlijk opgeslagen.",
    rationale:
      "De didactische instructiestap is geen uniforme kwaliteitsscore en mag veiligheidsinformatie niet maskeren.",
    remediation:
      "Herstel het beoordelingsformulier en de opslag zodat iedere dimensie onafhankelijk verplicht blijft.",
  },
  {
    id: "RIS.JOURNEY.STAGE_NOT_MASTERY",
    title: "RIS-stap 8 wordt niet als beheersingsscore uitgelegd",
    phase: "instructor",
    severity: "critical",
    requirement:
      "Een observatie op stap 8 bewaart de prestatie- en veiligheidsdimensie zonder automatisch mastery of examenrijpheid toe te kennen.",
    rationale:
      "Stap 8 beschrijft didactische complexiteit; het is geen bewijs dat alle criteria veilig en stabiel beheerst zijn.",
    remediation:
      "Verwijder iedere directe numerieke omzetting van RIS-stap naar mastery of examenadvies.",
  },
  {
    id: "RIS.JOURNEY.REFLECTION_AUTHORSHIP",
    title: "Auteurschap van zelfreflectie blijft herleidbaar",
    phase: "instructor",
    severity: "critical",
    requirement:
      "De reflectie wordt met entry_mode student_self opgeslagen wanneer de leerling de tekst zelf invoert.",
    rationale:
      "Echte zelfreflectie en invoer met hulp van de instructeur moeten aantoonbaar te onderscheiden zijn.",
    remediation:
      "Maak de auteurschapskeuze verplicht en bewaar die bij iedere reflectieversie.",
  },
  {
    id: "RIS.JOURNEY.DRAFT_PRIVACY",
    title: "De leerling ziet geen conceptbeoordeling",
    phase: "publication",
    severity: "critical",
    requirement:
      "De reflectie en beoordeling zijn vóór expliciete publicatie niet zichtbaar in het leerlingportaal.",
    rationale:
      "De leerling mag alleen door de instructeur gepubliceerde beoordelingen zien.",
    remediation:
      "Herstel publicatiefilters en RLS zodat conceptkaarten en conceptreflecties niet uitlekken.",
  },
  {
    id: "RIS.JOURNEY.PUBLICATION",
    title: "Publicatie maakt een expliciete toestandsovergang",
    phase: "publication",
    severity: "critical",
    requirement:
      "Afronden en publiceren zet de leskaart aantoonbaar op waiting_for_student_response.",
    rationale:
      "Een expliciete publicatiestatus voorkomt ambiguïteit tussen intern concept en leerlingzichtbare feedback.",
    remediation:
      "Herstel de publicatie-RPC, statusovergang en vereiste publicatievelden.",
  },
  {
    id: "RIS.JOURNEY.STUDENT_VISIBILITY",
    title: "De leerling ziet exact de gepubliceerde reflectie en bron",
    phase: "student",
    severity: "critical",
    requirement:
      "Na publicatie toont de leerlingapp de gepubliceerde reflectie en het juiste auteurschapslabel.",
    rationale:
      "De zichtbare kaart moet dezelfde waarheid tonen als het gepubliceerde dossier.",
    remediation:
      "Herstel de leerlingquery of presentatie van gepubliceerde reflecties en auteurschap.",
  },
  {
    id: "RIS.JOURNEY.STUDENT_RESPONSE",
    title: "Leerlingreactie en leerwens worden gekoppeld",
    phase: "student",
    severity: "high",
    requirement:
      "De reactie en leerwens worden bij dezelfde leerling, les en leskaart opgeslagen.",
    rationale:
      "De volgende planning mag alleen op herleidbare feedback van de juiste les voortbouwen.",
    remediation:
      "Herstel de respons-RPC en de relaties naar tenant, leerling, leskaart en les.",
  },
  {
    id: "RIS.JOURNEY.COMPLETION",
    title: "De RIS-leskaart wordt volledig afgerond",
    phase: "student",
    severity: "high",
    requirement:
      "Na de leerlingreactie bereikt de kaart de toestand fully_completed.",
    rationale:
      "Een gesloten cyclus voorkomt dat afgeronde lessen als open feedbacktaak blijven staan.",
    remediation:
      "Herstel de statusovergang nadat de leerling reageert of bewust overslaat.",
  },
  {
    id: "RIS.JOURNEY.NEXT_FOCUS",
    title: "De volgende les gebruikt een verklaarbaar voorstel",
    phase: "planning",
    severity: "critical",
    requirement:
      "De volgende plankaart toont de leerwens en een regelgebaseerd lesvoorstel met herkenbare reden.",
    rationale:
      "Een voorstel moet beoordeling en leerlingwens verbinden zonder een onverklaarde AI-claim.",
    remediation:
      "Herstel de next-focusselectie en toon bij het voorstel welke recente signalen de keuze verklaren.",
  },
  {
    id: "RIS.JOURNEY.AUDIT_TRAIL",
    title: "Publicatie en leerlingreactie zijn auditeerbaar",
    phase: "planning",
    severity: "critical",
    requirement:
      "De audittrail bevat afzonderlijke events voor publicatie en ingediende leerlingreactie op dezelfde leskaart.",
    rationale:
      "Achteraf moet aantoonbaar zijn wie welke releasegrens passeerde en wanneer de leerling reageerde.",
    remediation:
      "Herstel de auditregistratie in de publicatie- en respons-RPC's.",
  },
] as const satisfies readonly RisJourneyCheckDefinition[];

export const RIS_JOURNEY_CHECKS = Object.fromEntries(
  checks.map((check) => [check.id, check]),
) as Record<string, RisJourneyCheckDefinition>;

export class RisJourneyAssertionError extends Error {
  readonly checkId: string;

  constructor(checkId: string, message: string) {
    super(message);
    this.name = "RisJourneyAssertionError";
    this.checkId = checkId;
  }
}

export class RisJourneyBot {
  readonly #baseline: RisJourneyBaseline;
  readonly #checks: RisJourneyCheckResult[] = [];
  readonly #startedAt = new Date();
  readonly #runId: string;
  readonly #target: string;
  readonly #commitSha: string | null;

  constructor(options: {
    baseline: RisJourneyBaseline;
    target: string;
    runId?: string;
    commitSha?: string | null;
  }) {
    this.#baseline = options.baseline;
    this.#target = options.target;
    this.#runId =
      options.runId ??
      `ris-${this.#startedAt.toISOString().replaceAll(/[:.]/g, "-")}`;
    this.#commitSha = options.commitSha ?? null;
  }

  verify(checkId: string, input: VerificationInput): void {
    const definition = this.#definition(checkId);
    this.#record(definition, input.passed ? "PASS" : "FAIL", {
      observed: input.observed,
      evidence: input.evidence,
      durationMs: input.durationMs,
    });
    if (!input.passed) {
      throw new RisJourneyAssertionError(checkId, input.observed);
    }
  }

  blocked(checkId: string, observed: string): void {
    const definition = this.#definition(checkId);
    this.#record(definition, "BLOCKED", {
      observed,
      evidence: [
        {
          kind: "configuration",
          source: "journey state machine",
          summary:
            "Deze controle kon door een eerdere blokkerende conditie niet worden uitgevoerd.",
        },
      ],
    });
  }

  blockRemaining(reason: string): void {
    for (const checkId of this.#baseline.requiredCheckIds) {
      if (!this.#checks.some((check) => check.id === checkId)) {
        this.blocked(checkId, reason);
      }
    }
  }

  report(previous?: RisJourneyReport | null): RisJourneyReport {
    const finishedAt = new Date();
    const durationMs = Math.max(
      0,
      finishedAt.getTime() - this.#startedAt.getTime(),
    );
    const counts = {
      passed: this.#checks.filter((check) => check.status === "PASS").length,
      failed: this.#checks.filter((check) => check.status === "FAIL").length,
      blocked: this.#checks.filter((check) => check.status === "BLOCKED")
        .length,
      skipped: this.#checks.filter((check) => check.status === "SKIPPED")
        .length,
    };
    const comparison = this.#comparison(durationMs, previous ?? null);
    const executedCount = counts.passed + counts.failed;
    const passRate =
      executedCount === 0 ? 0 : round((counts.passed / executedCount) * 100);
    const explainabilityScore = this.#explainabilityScore();
    const outcome: RisJourneyStatus =
      counts.failed > 0 ||
      comparison.missingRequired.length > 0 ||
      comparison.failedRequired.length > 0 ||
      comparison.durationRegressions.length > 0 ||
      comparison.totalDurationRegression ||
      (executedCount > 0 && passRate < this.#baseline.minPassRate) ||
      explainabilityScore < this.#baseline.minExplainabilityScore
        ? "FAIL"
        : counts.blocked > 0 || comparison.blockedRequired.length > 0
          ? "BLOCKED"
          : "PASS";

    return {
      schemaVersion: 1,
      reportType: "nxtdrive.ris.journey",
      run: {
        id: this.#runId,
        target: this.#target,
        startedAt: this.#startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        commitSha: this.#commitSha,
      },
      outcome,
      summary: {
        total: this.#checks.length,
        ...counts,
        passRate,
        explainabilityScore,
      },
      comparison,
      checks: [...this.#checks],
    };
  }

  writeReports(options: {
    outputDirectory: string;
    previousReportPath?: string | null;
  }): { report: RisJourneyReport; files: string[] } {
    let previous: RisJourneyReport | null = null;
    if (options.previousReportPath && existsSync(options.previousReportPath)) {
      previous = JSON.parse(
        readFileSync(options.previousReportPath, "utf8"),
      ) as RisJourneyReport;
    }
    const report = this.report(previous);
    mkdirSync(options.outputDirectory, { recursive: true });
    const jsonPath = resolve(
      options.outputDirectory,
      "ris-journey-report.json",
    );
    const markdownPath = resolve(
      options.outputDirectory,
      "ris-journey-report.md",
    );
    const junitPath = resolve(options.outputDirectory, "ris-journey-junit.xml");
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(markdownPath, `${renderMarkdown(report)}\n`);
    writeFileSync(junitPath, `${renderJUnit(report)}\n`);
    return { report, files: [jsonPath, markdownPath, junitPath] };
  }

  #definition(checkId: string): RisJourneyCheckDefinition {
    const definition = RIS_JOURNEY_CHECKS[checkId];
    if (!definition) {
      throw new Error(`Onbekende RIS-journeycontrole: ${checkId}`);
    }
    return definition;
  }

  #record(
    definition: RisJourneyCheckDefinition,
    status: RisJourneyStatus,
    input: {
      observed: string;
      evidence: RisJourneyEvidence[];
      durationMs?: number;
    },
  ): void {
    if (this.#checks.some((check) => check.id === definition.id)) {
      throw new Error(
        `RIS-journeycontrole dubbel geregistreerd: ${definition.id}`,
      );
    }
    const now = new Date();
    this.#checks.push({
      ...definition,
      status,
      observed: redactSensitive(input.observed),
      evidence: input.evidence.map((item) => ({
        ...item,
        source: redactSensitive(item.source),
        summary: redactSensitive(item.summary),
      })),
      startedAt: now.toISOString(),
      durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
    });
  }

  #comparison(
    durationMs: number,
    previous: RisJourneyReport | null,
  ): RisJourneyComparison {
    const byId = new Map(this.#checks.map((check) => [check.id, check]));
    const previousById = new Map(
      (previous?.checks ?? []).map((check) => [check.id, check]),
    );
    const missingRequired = this.#baseline.requiredCheckIds.filter(
      (id) => !byId.has(id),
    );
    const failedRequired = this.#baseline.requiredCheckIds.filter(
      (id) => byId.get(id)?.status === "FAIL",
    );
    const blockedRequired = this.#baseline.requiredCheckIds.filter(
      (id) => byId.get(id)?.status === "BLOCKED",
    );
    const durationRegressions = Object.entries(
      this.#baseline.maxCheckDurationMs,
    ).flatMap(([checkId, maximumMs]) => {
      const actualMs = byId.get(checkId)?.durationMs;
      return actualMs !== undefined && actualMs > maximumMs
        ? [{ checkId, actualMs, maximumMs }]
        : [];
    });
    const regressedSincePrevious = this.#checks
      .filter(
        (check) =>
          previousById.get(check.id)?.status === "PASS" &&
          check.status !== "PASS",
      )
      .map((check) => check.id);
    const recoveredSincePrevious = this.#checks
      .filter(
        (check) =>
          previousById.has(check.id) &&
          previousById.get(check.id)?.status !== "PASS" &&
          check.status === "PASS",
      )
      .map((check) => check.id);
    return {
      baselineName: this.#baseline.name,
      missingRequired,
      failedRequired,
      blockedRequired,
      durationRegressions,
      totalDurationRegression: durationMs > this.#baseline.maxTotalDurationMs,
      regressedSincePrevious,
      recoveredSincePrevious,
    };
  }

  #explainabilityScore(): number {
    if (this.#checks.length === 0) return 0;
    const scored = this.#checks.reduce((sum, check) => {
      const fields = [
        check.requirement,
        check.rationale,
        check.remediation,
        check.observed,
      ];
      const fieldScore = fields.filter(
        (field) => field.trim().length > 0,
      ).length;
      const evidenceScore = check.evidence.length > 0 ? 1 : 0;
      return sum + fieldScore + evidenceScore;
    }, 0);
    return round((scored / (this.#checks.length * 5)) * 100);
  }
}

export function loadRisJourneyBaseline(path: string): RisJourneyBaseline {
  const baseline = JSON.parse(readFileSync(path, "utf8")) as RisJourneyBaseline;
  if (
    baseline.schemaVersion !== 1 ||
    !baseline.name ||
    !Array.isArray(baseline.requiredCheckIds) ||
    baseline.requiredCheckIds.length === 0
  ) {
    throw new Error(`Ongeldige RIS-journeybaseline: ${path}`);
  }
  for (const checkId of baseline.requiredCheckIds) {
    if (!RIS_JOURNEY_CHECKS[checkId]) {
      throw new Error(`Baseline verwijst naar onbekende controle: ${checkId}`);
    }
  }
  return baseline;
}

export function renderMarkdown(report: RisJourneyReport): string {
  const lines = [
    "# RIS journeybot-rapport",
    "",
    `**Uitkomst:** ${report.outcome}`,
    `**Doel:** ${report.run.target}`,
    `**Run:** ${report.run.id}`,
    `**Duur:** ${report.run.durationMs} ms`,
    `**Geslaagd:** ${report.summary.passed}/${report.summary.total} (${report.summary.passRate}%)`,
    `**Verklaarbaarheid:** ${report.summary.explainabilityScore}%`,
    "",
    "## Baselinevergelijking",
    "",
    `- Ontbrekende verplichte controles: ${listOrNone(report.comparison.missingRequired)}`,
    `- Gefaalde verplichte controles: ${listOrNone(report.comparison.failedRequired)}`,
    `- Geblokkeerde verplichte controles: ${listOrNone(report.comparison.blockedRequired)}`,
    `- Regressies sinds vorig rapport: ${listOrNone(report.comparison.regressedSincePrevious)}`,
    `- Hersteld sinds vorig rapport: ${listOrNone(report.comparison.recoveredSincePrevious)}`,
    `- Timingregressies: ${
      report.comparison.durationRegressions.length === 0
        ? "geen"
        : report.comparison.durationRegressions
            .map(
              (item) =>
                `${item.checkId} (${item.actualMs} ms > ${item.maximumMs} ms)`,
            )
            .join(", ")
    }`,
    "",
    "## Controles",
    "",
    "| Status | Ernst | Fase | Controle | Duur |",
    "| --- | --- | --- | --- | ---: |",
    ...report.checks.map(
      (check) =>
        `| ${check.status} | ${check.severity} | ${check.phase} | ${check.id} — ${escapeMarkdown(check.title)} | ${check.durationMs} ms |`,
    ),
    "",
  ];

  for (const check of report.checks) {
    lines.push(
      `### ${check.status} · ${check.id}`,
      "",
      check.title,
      "",
      `- Verwachting: ${check.requirement}`,
      `- Waarom: ${check.rationale}`,
      `- Waargenomen: ${check.observed}`,
      `- Hersteladvies: ${check.remediation}`,
      "- Bewijs:",
      ...check.evidence.map(
        (evidence) =>
          `  - ${evidence.kind} · ${evidence.source}: ${evidence.summary}`,
      ),
      "",
    );
  }
  return lines.join("\n");
}

export function renderJUnit(report: RisJourneyReport): string {
  const failures = report.checks.filter(
    (check) => check.status === "FAIL",
  ).length;
  const skipped = report.checks.filter(
    (check) => check.status === "BLOCKED" || check.status === "SKIPPED",
  ).length;
  const cases = report.checks.map((check) => {
    const attributes = `classname="ris.${xml(check.phase)}" name="${xml(
      `${check.id} ${check.title}`,
    )}" time="${(check.durationMs / 1000).toFixed(3)}"`;
    const detail = `${check.requirement}\nWaarom: ${check.rationale}\nWaargenomen: ${check.observed}\nHerstel: ${check.remediation}`;
    if (check.status === "FAIL") {
      return `  <testcase ${attributes}><failure message="${xml(
        check.observed,
      )}">${xml(detail)}</failure></testcase>`;
    }
    if (check.status === "BLOCKED" || check.status === "SKIPPED") {
      return `  <testcase ${attributes}><skipped message="${xml(
        check.observed,
      )}"/></testcase>`;
    }
    return `  <testcase ${attributes}/>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="NXTDrive RIS journeybot" tests="${report.checks.length}" failures="${failures}" skipped="${skipped}" time="${(
      report.run.durationMs / 1000
    ).toFixed(3)}">`,
    ...cases,
    "</testsuite>",
  ].join("\n");
}

export function defaultRisJourneyOutputDirectory(repoRoot: string): string {
  return resolve(repoRoot, "test-results", "ris-journey");
}

export function ensureParentDirectory(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function listOrNone(items: string[]): string {
  return items.length === 0 ? "geen" : items.join(", ");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|");
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function redactSensitive(value: string): string {
  return value
    .replaceAll(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "{id}",
    )
    .replaceAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "{email}");
}
