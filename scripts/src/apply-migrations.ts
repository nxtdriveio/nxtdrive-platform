/**
 * Apply SQL migrations from supabase/migrations/ to the configured Postgres DB.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run db:migrate                  # staging (default)
 *   pnpm --filter @workspace/scripts run db:migrate -- --env=production
 *
 * Secrets read:
 *   - staging:    STAGING_DATABASE_URL (or DATABASE_URL fallback)
 *   - production: PRODUCTION_DATABASE_URL  (no fallback — must be set explicitly)
 *
 * Each .sql file in supabase/migrations/ is applied exactly once, in filename
 * order. Applied filenames are tracked in public._migrations (created on first
 * run). Each migration runs in its own transaction.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  bannerFor,
  describeConnectionTarget,
  explainConnectionFailure,
  parseEnvFromArgv,
  resolveConnectionString,
  validateConnectionTarget,
} from "./lib/db-env.js";

const { Client } = pg;

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, "..", "..", "supabase", "migrations");

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  const connectionString = resolveConnectionString(env);
  validateConnectionTarget(env, connectionString);

  console.log(`${bannerFor(env)} — applying migrations from ${MIGRATIONS_DIR}`);
  console.log(`Database target: ${describeConnectionTarget(connectionString)}`);

  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw explainConnectionFailure(err, env, connectionString);
  }

  try {
    await client.query(`
      create table if not exists public._migrations (
        filename   text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows } = await client.query<{ filename: string }>(
      "select filename from public._migrations",
    );
    const applied = new Set(rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[skip]  ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`[apply] ${file}`);

      // PostgreSQL does not allow using a newly added enum value in the same
      // transaction that added it (error: "unsafe use of new value of enum type").
      // Solution: run ALTER TYPE ... ADD VALUE statements BEFORE the transaction
      // so they auto-commit and are visible to the subsequent transaction.
      const enumAddRe =
        /^\s*alter\s+type\s+\S+\s+add\s+value\s+[^;]+;/gim;
      const enumStatements = sql.match(enumAddRe) ?? [];
      const sqlWithoutEnumAdds = sql.replace(enumAddRe, "");

      try {
        // Phase 1: commit enum additions individually (outside any transaction).
        for (const stmt of enumStatements) {
          await client.query(stmt);
        }

        // Phase 2: run the rest in a single transaction.
        await client.query("begin");
        try {
          await client.query(sqlWithoutEnumAdds);
          await client.query(
            "insert into public._migrations (filename) values ($1)",
            [file],
          );
          await client.query("commit");
          appliedCount++;
        } catch (err) {
          await client.query("rollback");
          throw err;
        }
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log(`\nDone. Applied ${appliedCount} new migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
