/**
 * One-time script: promote a user to platform admin by email.
 * The user must already have signed up (i.e. exist in auth.users / profiles).
 *
 *   DATABASE_URL=postgres://... \
 *   pnpm --filter @workspace/scripts run db:promote-admin -- jurriaan@nxtdrive.io
 */
import pg from "pg";

const { Client } = pg;

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: db:promote-admin -- <email>");
    process.exit(1);
  }

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<{ id: string; email: string }>(
      `update public.profiles
         set is_platform_admin = true
       where lower(email) = $1
       returning id, email`,
      [email],
    );

    if (result.rowCount === 0) {
      console.error(
        `No profile found for ${email}. The user must sign up first (magic link), then re-run this command.`,
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
