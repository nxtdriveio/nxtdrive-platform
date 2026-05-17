/**
 * Promote a user to platform admin by email.
 * The user must already exist in auth.users / profiles.
 *
 *   pnpm --filter @workspace/scripts run db:promote-admin -- you@example.com
 *   pnpm --filter @workspace/scripts run db:promote-admin -- you@example.com --env=production
 */
import pg from "pg";
import {
  bannerFor,
  parseEnvFromArgv,
  resolveConnectionString,
} from "./lib/db-env.js";

const { Client } = pg;

async function main(): Promise<void> {
  const positional = process.argv
    .slice(2)
    .find((a) => !a.startsWith("--"))
    ?.trim()
    .toLowerCase();

  if (!positional) {
    console.error(
      "Usage: db:promote-admin -- <email> [--env=staging|production]",
    );
    process.exit(1);
  }

  const env = parseEnvFromArgv(process.argv);
  const connectionString = resolveConnectionString(env);
  console.log(`${bannerFor(env)} — promoting ${positional}`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ id: string; email: string }>(
      `update public.profiles
         set is_platform_admin = true
       where lower(email) = $1
       returning id, email`,
      [positional],
    );

    if (result.rowCount === 0) {
      console.error(
        `No profile found for ${positional}. The user must sign up first, then re-run this command.`,
      );
      process.exit(2);
    }

    console.log(`Promoted ${result.rows[0]!.email} → platform admin.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
