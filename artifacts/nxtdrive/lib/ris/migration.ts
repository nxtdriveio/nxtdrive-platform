import type { SupabaseClient } from "@supabase/supabase-js";
import type { RISTreeScript } from "@workspace/leskaart";
import {
  loadRisCatalog,
  loadTenantRisSettings,
  type LessonCardMode,
  type RisCatalog,
} from "./data";

export type RisMigrationReadiness =
  | "ready"
  | "already_active"
  | "needs_mapping"
  | "no_ris_catalog";

export type RisMigrationChecklistItem = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type RisLegacySkillMapping = {
  legacySkillId: string;
  legacyCode: string;
  legacyLabel: string;
  legacyScoreCount: number;
  matchedScriptId: string | null;
  matchedRisCode: string | null;
  matchedRisTitle: string | null;
  confidence: "high" | "medium" | "none";
  reason: string;
};

export type RisLegacyMigrationReport = {
  tenantId: string;
  lessonCardMode: LessonCardMode;
  risVersionId: string | null;
  risVersionName: string | null;
  totalLegacyLeaves: number;
  scoredLegacyLeaves: number;
  mappedScoredLeaves: number;
  unmappedScoredLeaves: number;
  orphanLegacyScores: number;
  studentsWithLegacyScores: number;
  totalLegacyScores: number;
  risScriptCount: number;
  publishedRisCards: number;
  readiness: RisMigrationReadiness;
  blockingReasons: string[];
  checklist: RisMigrationChecklistItem[];
  mappings: RisLegacySkillMapping[];
  unmapped: RisLegacySkillMapping[];
};

type LegacySkillRow = {
  id: string;
  code: string;
  label: string;
  active: boolean;
};

type LegacyScoreRow = {
  student_id: string;
  skill_id: string;
  score: number;
};

export async function loadRisLegacyMigrationReport(
  client: SupabaseClient,
  tenantId: string,
): Promise<RisLegacyMigrationReport> {
  const settings = await loadTenantRisSettings(client, tenantId);
  const catalog = await loadRisCatalog(client, settings.activeRisVersionId);

  const [legacySkillsRes, legacyScoresRes, publishedCardsRes] = await Promise.all([
    client
      .from("skill_taxonomy")
      .select("id, code, label, active")
      .eq("tenant_id", tenantId)
      .eq("level", 3)
      .order("code", { ascending: true }),
    client
      .from("student_skill_scores")
      .select("student_id, skill_id, score")
      .eq("tenant_id", tenantId),
    client
      .from("ris_lesson_cards")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("publication_status", "published"),
  ]);

  if (legacySkillsRes.error) {
    throw new Error(
      `Legacy leskaartonderdelen laden mislukt (tenant=${tenantId}): ${legacySkillsRes.error.message}`,
    );
  }
  if (legacyScoresRes.error) {
    throw new Error(
      `Legacy leskaartscores laden mislukt (tenant=${tenantId}): ${legacyScoresRes.error.message}`,
    );
  }
  if (publishedCardsRes.error) {
    throw new Error(
      `RIS publicatiecount laden mislukt (tenant=${tenantId}): ${publishedCardsRes.error.message}`,
    );
  }

  const legacySkills = (legacySkillsRes.data ?? []) as LegacySkillRow[];
  const legacyScores = (legacyScoresRes.data ?? []) as LegacyScoreRow[];
  const legacySkillById = new Map(legacySkills.map((skill) => [skill.id, skill]));
  const scoreCountBySkill = new Map<string, number>();
  const studentsWithLegacyScores = new Set<string>();
  let orphanLegacyScores = 0;

  for (const row of legacyScores) {
    studentsWithLegacyScores.add(row.student_id);
    if (!legacySkillById.has(row.skill_id)) {
      orphanLegacyScores++;
      continue;
    }
    scoreCountBySkill.set(row.skill_id, (scoreCountBySkill.get(row.skill_id) ?? 0) + 1);
  }

  const scoredSkills = legacySkills.filter((skill) => (scoreCountBySkill.get(skill.id) ?? 0) > 0);
  const risScripts = flattenRisScripts(catalog);
  const mappings = scoredSkills
    .map((skill) =>
      mapLegacySkillToRisScript(skill, scoreCountBySkill.get(skill.id) ?? 0, risScripts),
    )
    .sort((left, right) => {
      const confidenceRank = { none: 0, medium: 1, high: 2 };
      return (
        confidenceRank[left.confidence] - confidenceRank[right.confidence] ||
        right.legacyScoreCount - left.legacyScoreCount ||
        left.legacyCode.localeCompare(right.legacyCode)
      );
    });

  const unmapped = mappings.filter((mapping) => mapping.confidence === "none");
  const blockingReasons = buildBlockingReasons({
    catalog,
    unmappedScoredLeaves: unmapped.length,
    orphanLegacyScores,
  });
  const readiness = determineReadiness({
    settings,
    catalog,
    blockingReasons,
  });

  return {
    tenantId,
    lessonCardMode: settings.lessonCardMode,
    risVersionId: catalog.version?.id ?? null,
    risVersionName: catalog.version?.name ?? null,
    totalLegacyLeaves: legacySkills.length,
    scoredLegacyLeaves: scoredSkills.length,
    mappedScoredLeaves: mappings.length - unmapped.length,
    unmappedScoredLeaves: unmapped.length,
    orphanLegacyScores,
    studentsWithLegacyScores: studentsWithLegacyScores.size,
    totalLegacyScores: legacyScores.length,
    risScriptCount: risScripts.length,
    publishedRisCards: publishedCardsRes.count ?? 0,
    readiness,
    blockingReasons,
    checklist: buildChecklist({
      settings,
      catalog,
      mappings,
      unmapped,
      orphanLegacyScores,
      legacyScores,
      publishedRisCards: publishedCardsRes.count ?? 0,
    }),
    mappings,
    unmapped,
  };
}

export function canActivateRisAfterMigration(report: RisLegacyMigrationReport): boolean {
  return report.readiness === "ready" || report.readiness === "already_active";
}

function determineReadiness({
  settings,
  catalog,
  blockingReasons,
}: {
  settings: { lessonCardMode: LessonCardMode };
  catalog: RisCatalog;
  blockingReasons: readonly string[];
}): RisMigrationReadiness {
  if (!catalog.version || catalog.tree.length === 0) return "no_ris_catalog";
  if (settings.lessonCardMode === "ris") return "already_active";
  return blockingReasons.length === 0 ? "ready" : "needs_mapping";
}

function buildBlockingReasons({
  catalog,
  unmappedScoredLeaves,
  orphanLegacyScores,
}: {
  catalog: RisCatalog;
  unmappedScoredLeaves: number;
  orphanLegacyScores: number;
}): string[] {
  const reasons: string[] = [];
  if (!catalog.version || catalog.tree.length === 0) {
    reasons.push("Geen actieve RIS-catalogus gevonden.");
  }
  if (unmappedScoredLeaves > 0) {
    reasons.push(
      `${unmappedScoredLeaves} gescoorde legacy-onderdeel(en) hebben nog geen RIS-match.`,
    );
  }
  if (orphanLegacyScores > 0) {
    reasons.push(
      `${orphanLegacyScores} legacy-score(s) verwijzen naar ontbrekende leskaartonderdelen.`,
    );
  }
  return reasons;
}

function buildChecklist({
  settings,
  catalog,
  mappings,
  unmapped,
  orphanLegacyScores,
  legacyScores,
  publishedRisCards,
}: {
  settings: { lessonCardMode: LessonCardMode };
  catalog: RisCatalog;
  mappings: readonly RisLegacySkillMapping[];
  unmapped: readonly RisLegacySkillMapping[];
  orphanLegacyScores: number;
  legacyScores: readonly LegacyScoreRow[];
  publishedRisCards: number;
}): RisMigrationChecklistItem[] {
  return [
    {
      key: "catalog",
      label: "RIS-catalogus beschikbaar",
      ok: Boolean(catalog.version && catalog.tree.length > 0),
      detail: catalog.version
        ? `${catalog.version.name} met ${flattenRisScripts(catalog).length} scripts.`
        : "Seed eerst de RIS-catalogus voordat deze tenant kan overstappen.",
    },
    {
      key: "legacy_scores",
      label: "Legacy-scorehistorie geanalyseerd",
      ok: true,
      detail:
        legacyScores.length === 0
          ? "Geen legacy-scores gevonden; tenant kan schoon starten met RIS."
          : `${legacyScores.length} legacy-score(s) meegenomen in de preflight.`,
    },
    {
      key: "mapped_scores",
      label: "Gescoorde legacy-onderdelen gemapt",
      ok: unmapped.length === 0,
      detail:
        mappings.length === 0
          ? "Geen gescoorde legacy-onderdelen om te mappen."
          : `${mappings.length - unmapped.length} van ${mappings.length} gescoorde onderdelen hebben een RIS-match.`,
    },
    {
      key: "orphan_scores",
      label: "Geen verweesde legacy-scores",
      ok: orphanLegacyScores === 0,
      detail:
        orphanLegacyScores === 0
          ? "Alle legacy-scores verwijzen naar bestaande taxonomy-items."
          : `${orphanLegacyScores} score(s) verwijzen naar ontbrekende skill_taxonomy rows.`,
    },
    {
      key: "activation",
      label: "Tenantmodus gecontroleerd",
      ok: settings.lessonCardMode === "legacy" || settings.lessonCardMode === "ris",
      detail:
        settings.lessonCardMode === "ris"
          ? `RIS is al actief. Er zijn ${publishedRisCards} gepubliceerde RIS-leskaart(en).`
          : "Tenant staat nog op legacy. Gebruik een groene preflight voor echte data of clean-start voor mock-data.",
    },
  ];
}

function flattenRisScripts(catalog: RisCatalog): RISTreeScript[] {
  return catalog.tree.flatMap((module) =>
    module.categories.flatMap((category) => category.scripts),
  );
}

function mapLegacySkillToRisScript(
  skill: LegacySkillRow,
  scoreCount: number,
  scripts: readonly RISTreeScript[],
): RisLegacySkillMapping {
  const normalizedCode = normalizeText(skill.code);
  const normalizedLabel = normalizeText(skill.label);
  const labelTokens = tokenSet(skill.label);
  let best:
    | {
        script: RISTreeScript;
        confidence: RisLegacySkillMapping["confidence"];
        score: number;
        reason: string;
      }
    | null = null;

  for (const script of scripts) {
    const scriptCode = normalizeText(script.code);
    const scriptTitle = normalizeText(script.title);
    const scriptTokens = tokenSet(script.title);
    const overlap = tokenOverlap(labelTokens, scriptTokens);
    const codeMatch =
      normalizedCode.length > 0 &&
      (scriptCode === normalizedCode ||
        scriptCode.endsWith(normalizedCode) ||
        normalizedCode.endsWith(scriptCode));
    const titleMatch =
      normalizedLabel.length > 0 &&
      (scriptTitle === normalizedLabel ||
        scriptTitle.includes(normalizedLabel) ||
        normalizedLabel.includes(scriptTitle));

    const confidence: RisLegacySkillMapping["confidence"] =
      codeMatch || titleMatch || overlap >= 0.76
        ? "high"
        : overlap >= 0.45
          ? "medium"
          : "none";
    if (confidence === "none") continue;

    const score =
      (confidence === "high" ? 100 : 50) +
      Math.round(overlap * 40) +
      (codeMatch ? 20 : 0) +
      (titleMatch ? 15 : 0);
    if (!best || score > best.score) {
      best = {
        script,
        confidence,
        score,
        reason: codeMatch
          ? "Code-match"
          : titleMatch
            ? "Label-match"
            : `${Math.round(overlap * 100)}% token-overlap`,
      };
    }
  }

  return {
    legacySkillId: skill.id,
    legacyCode: skill.code,
    legacyLabel: skill.label,
    legacyScoreCount: scoreCount,
    matchedScriptId: best?.script.id ?? null,
    matchedRisCode: best?.script.code ?? null,
    matchedRisTitle: best?.script.title ?? null,
    confidence: best?.confidence ?? "none",
    reason: best?.reason ?? "Geen betrouwbare automatische match gevonden.",
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  const stopWords = new Set([
    "aan",
    "de",
    "en",
    "het",
    "in",
    "met",
    "op",
    "over",
    "te",
    "uit",
    "van",
    "voor",
  ]);
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) matches++;
  }
  return matches / Math.max(left.size, right.size);
}
