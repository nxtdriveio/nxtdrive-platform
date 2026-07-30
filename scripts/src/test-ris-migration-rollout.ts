import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

function read(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), "utf8");
}

function ok(condition: unknown, message: string): void {
  assert.ok(condition, message);
  console.log(`OK ${message}`);
}

const migration = read("artifacts", "nxtdrive", "lib", "ris", "migration.ts");
ok(
  migration.includes("loadRisLegacyMigrationReport") &&
    migration.includes("RisLegacyMigrationReport") &&
    migration.includes("skill_taxonomy") &&
    migration.includes("student_skill_scores"),
  "RIS migration loader reads legacy taxonomy and score rollups",
);
ok(
  migration.includes("orphanLegacyScores") &&
    migration.includes("unmappedScoredLeaves") &&
    migration.includes("blockingReasons") &&
    migration.includes("canActivateRisAfterMigration"),
  "RIS migration report blocks orphan and unmapped legacy data before activation",
);
ok(
  migration.includes("mapLegacySkillToRisScript") &&
    migration.includes("tokenOverlap") &&
    migration.includes('? "high"') &&
    migration.includes('? "medium"') &&
    migration.includes('confidence === "none"'),
  "RIS migration report exposes deterministic mapping suggestions with confidence",
);

const actions = read("artifacts", "nxtdrive", "lib", "ris", "actions.ts");
ok(
  !actions.includes("activateRisAfterMigrationCheckAction") &&
    !actions.includes("activateRisCleanStartAction"),
  "RIS activation is not exposed before real expert validation",
);

const cleanStartMigration = read(
  "supabase",
  "migrations",
  "20260616181232_ris_clean_start_default.sql",
);
ok(
  cleanStartMigration.includes("function public.activate_ris_clean_start") &&
    cleanStartMigration.includes("delete from public.lesson_skill_scores") &&
    cleanStartMigration.includes("delete from public.student_skill_scores") &&
    cleanStartMigration.includes("'ris.clean_start_activated'") &&
    cleanStartMigration.includes(
      "grant execute on function public.activate_ris_clean_start",
    ),
  "RIS clean-start RPC clears only legacy score tables, activates RIS and audits",
);

const pageActions = read(
  "artifacts",
  "nxtdrive",
  "app",
  "backoffice",
  "ris",
  "actions.ts",
);
ok(
  !pageActions.includes("activateRisAfterMigrationCheckFromFormAction") &&
    !pageActions.includes("activateRisCleanStartFromFormAction"),
  "RIS backoffice has no activation or destructive clean-start form action",
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
  page.includes("Inhoudelijke releasegate") &&
    page.includes("geen formeel CBR-") &&
    !page.includes("Wis legacy scores en activeer RIS"),
  "RIS backoffice exposes the expert gate without an activation CTA",
);

const docs = read("docs", "RIS_LESKAART_IMPLEMENTATION.md");
ok(
  docs.includes("RIS-9: Migratie en rollout") &&
    docs.includes("activatie-UI is bewust niet") &&
    docs.includes("service-role-only clean-startcontract"),
  "RIS documentation distinguishes migration tooling from rollout approval",
);

const pkg = read("scripts", "package.json");
ok(
  pkg.includes('"test-ris-migration-rollout"'),
  "package script exposes RIS-9 guard",
);

console.log("test-ris-migration-rollout: ok");
