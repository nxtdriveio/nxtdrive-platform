/**
 * Apply supabase/seed.sql against the configured Postgres database.
 * Safe to re-run — seed.sql is idempotent.
 *
 *   pnpm --filter @workspace/scripts run db:seed                  # staging
 *   pnpm --filter @workspace/scripts run db:seed -- --env=production
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  bannerFor,
  parseEnvFromArgv,
  resolveConnectionString,
} from "./lib/db-env.js";

const { Client } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = resolve(HERE, "..", "..", "supabase", "seed.sql");

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  const connectionString = resolveConnectionString(env);
  console.log(`${bannerFor(env)} — seeding ${SEED_FILE}`);

  const sql = await readFile(SEED_FILE, "utf8");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Seed applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
