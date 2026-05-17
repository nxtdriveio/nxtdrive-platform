/**
 * Apply supabase/seed.sql against the configured Postgres database.
 * Safe to re-run — seed.sql is idempotent.
 *
 *   DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run db:seed
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = resolve(HERE, "..", "..", "supabase", "seed.sql");

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set.");
  }

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
