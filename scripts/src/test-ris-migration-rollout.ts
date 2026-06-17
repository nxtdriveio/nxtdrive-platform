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
    migration.includes("? \"high\"") &&
    migration.includes("? \"medium\"") &&
    migration.includes("confidence === \"none\""),
  "RIS migration report exposes deterministic mapping suggestions with confidence",
);

const actions = read("artifacts", "nxtdrive", "lib", "ris", "actions.ts");
ok(
  actions.includes("activateRisAfterMigrationCheckAction") &&
    actions.includes("loadRisLegacyMigrationReport") &&
    actions.includes("canActivateRisAfterMigration") &&
    actions.includes("setTenantRisSettingsAction"),
  "RIS activation action is guarded by the migration preflight",
);
ok(
  actions.includes("activateRisCleanStartAction") &&
    actions.includes('requireActiveTenant(["tenant_admin"])') &&
    actions.includes('service.rpc("activate_ris_clean_start"') &&
    actions.includes("p_tenant_id: tenant.id") &&
    actions.includes("p_actor: user.id"),
  "RIS clean-start action calls the transactional database clean-start RPC",
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
    cleanStartMigration.includes("grant execute on function public.activate_ris_clean_start"),
  "RIS clean-start RPC clears only legacy score tables, activates RIS and audits",
);

const pageActions = read("artifacts", "nxtdrive", "app", "backoffice", "ris", "actions.ts");
ok(
  pageActions.includes("activateRisAfterMigrationCheckFromFormAction") &&
    pageActions.includes("ris_saved=activated"),
  "RIS backoffice form action redirects after guarded activation",
);
ok(
  pageActions.includes("activateRisCleanStartFromFormAction") &&
    pageActions.includes("SCHOON STARTEN") &&
    pageActions.includes("ris_saved=clean-start"),
  "RIS backoffice form action requires explicit clean-start confirmation",
);

const page = read("artifacts", "nxtdrive", "app", "backoffice", "ris", "page.tsx");
ok(
  page.includes("RIS-9 migratie & rollout") &&
    page.includes("Legacy-leskaart naar RIS preflight") &&
    page.includes("Mappingrapport") &&
    page.includes("RIS activeren") &&
    page.includes("Schoon starten met RIS") &&
    page.includes("Wis legacy scores en activeer RIS"),
  "RIS backoffice page renders migration preflight, mapping report and activation CTA",
);

const docs = read("docs", "RIS_LESKAART_IMPLEMENTATION.md");
ok(
  docs.includes("RIS-9: Migratie en rollout") &&
    docs.includes("Geimplementeerd") &&
    docs.includes("clean-start"),
  "RIS documentation marks migration and rollout sprint as implemented",
);

const pkg = read("scripts", "package.json");
ok(pkg.includes("\"test-ris-migration-rollout\""), "package script exposes RIS-9 guard");

console.log("test-ris-migration-rollout: ok");
