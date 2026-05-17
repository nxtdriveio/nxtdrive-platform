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
  parseEnvFromArgv,
  resolveConnectionString,
} from "./lib/db-env.js";

const { Client } = pg;

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, "..", "..", "supabase", "migrations");

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  const connectionString = resolveConnectionString(env);

  console.log(`${bannerFor(env)} — applying migrations from ${MIGRATIONS_DIR}`);

  const client = new Client({ connectionString });
  await client.connect();

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
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public._migrations (filename) values ($1)",
          [file],
        );
        await client.query("commit");
        appliedCount++;
      } catch (err) {
        await client.query("rollback");
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
