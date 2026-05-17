/**
 * Add a membership for an existing user to a tenant, with a given role.
 * The user must already exist in auth.users / profiles (sign up first).
 *
 *   pnpm --filter @workspace/scripts run db:add-membership -- you@example.com demo-academy tenant_admin
 *   pnpm --filter @workspace/scripts run db:add-membership -- you@example.com demo-academy instructor --env=production
 *
 * Role must be one of: tenant_admin | instructor | student | parent
 * Safe to re-run — UNIQUE(user_id, tenant_id, role) prevents duplicates.
 */
import pg from "pg";
import {
  bannerFor,
  parseEnvFromArgv,
  resolveConnectionString,
} from "./lib/db-env.js";

const { Client } = pg;

const VALID_ROLES = ["tenant_admin", "instructor", "student", "parent"] as const;
type Role = (typeof VALID_ROLES)[number];

async function main(): Promise<void> {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [emailRaw, slugRaw, roleRaw] = positional;

  if (!emailRaw || !slugRaw || !roleRaw) {
    console.error(
      "Usage: db:add-membership -- <email> <tenant-slug> <role> [--env=staging|production]\n" +
        `Roles: ${VALID_ROLES.join(" | ")}`,
    );
    process.exit(1);
  }
  const email = emailRaw.trim().toLowerCase();
  const slug = slugRaw.trim().toLowerCase();
  const role = roleRaw.trim() as Role;

  if (!VALID_ROLES.includes(role)) {
    console.error(`Invalid role "${role}". Allowed: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — adding ${email} as ${role} of ${slug}`);

  const client = new Client({ connectionString: resolveConnectionString(env) });
  await client.connect();
  try {
    const user = await client.query<{ id: string; email: string }>(
      `select id, email from public.profiles where lower(email) = $1`,
      [email],
    );
    if (user.rowCount === 0) {
      console.error(
        `No profile for ${email}. Sign up via the app first, then re-run.`,
      );
      process.exit(2);
    }

    const tenant = await client.query<{ id: string; name: string }>(
      `select id, name from public.tenants where slug = $1`,
      [slug],
    );
    if (tenant.rowCount === 0) {
      console.error(`No tenant with slug "${slug}".`);
      process.exit(3);
    }

    const result = await client.query<{ id: string }>(
      `insert into public.memberships (user_id, tenant_id, role)
       values ($1, $2, $3::public.member_role)
       on conflict (user_id, tenant_id, role) do nothing
       returning id`,
      [user.rows[0]!.id, tenant.rows[0]!.id, role],
    );

    if (result.rowCount === 0) {
      console.log(
        `Membership already exists: ${email} is ${role} of ${tenant.rows[0]!.name}.`,
      );
    } else {
      console.log(
        `Added ${email} as ${role} of ${tenant.rows[0]!.name}.`,
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
