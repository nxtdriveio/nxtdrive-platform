/**
 * Seed (or upsert) fixed DEV test accounts in Supabase Auth + their
 * `profiles` / `memberships` rows for the `demo-academy` tenant.
 *
 * Powers the one-click "Dev Accounts" panel on the /login page (development only).
 * No real auth is bypassed — these are real Supabase users with a known password.
 *
 *   pnpm --filter @workspace/scripts run db:seed-dev-accounts
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the current Replit secrets
 * point at the STAGING Supabase project). Safe to re-run — every step upserts.
 *
 * ---------------------------------------------------------------------------
 * Credentials (development only — never use in production):
 *
 *   Platform Admin : dev-admin@nxtdrive.io          / NxtDev2024!
 *   School Admin    : dev-school@demo.nxtdrive.io    / NxtDev2024!
 *   Instructor      : dev-instructor@demo.nxtdrive.io / NxtDev2024!
 *   Student         : dev-student@demo.nxtdrive.io   / NxtDev2024!
 * ---------------------------------------------------------------------------
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEV_PASSWORD = "NxtDev2024!";
const DEMO_TENANT_SLUG = "demo-academy";

type MemberRole = "tenant_admin" | "instructor" | "student" | "parent";

type DevAccount = {
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  /** Membership role in demo-academy, or null for platform admin (no membership). */
  role: MemberRole | null;
  /** Whether to also link a `students` row (so the student PWA lands cleanly). */
  createStudent?: boolean;
};

const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: "dev-admin@nxtdrive.io",
    fullName: "Dev Platform Admin",
    isPlatformAdmin: true,
    role: null,
  },
  {
    email: "dev-school@demo.nxtdrive.io",
    fullName: "Dev School Admin",
    isPlatformAdmin: false,
    role: "tenant_admin",
  },
  {
    email: "dev-instructor@demo.nxtdrive.io",
    fullName: "Dev Instructor",
    isPlatformAdmin: false,
    role: "instructor",
  },
  {
    email: "dev-student@demo.nxtdrive.io",
    fullName: "Dev Student",
    isPlatformAdmin: false,
    role: "student",
    createStudent: true,
  },
];

function serviceClient(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "(current Replit secrets target the STAGING Supabase project).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Find an existing auth user by email, paging through the admin list. */
async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Create the auth user (or update the existing one) so its password and
 * confirmation state are always known. Returns the user id.
 */
async function upsertAuthUser(
  supabase: SupabaseClient,
  account: DevAccount,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: account.fullName },
  });

  if (!error && data.user) {
    return data.user.id;
  }

  // Already registered — find it and reset password + confirmation.
  const existingId = await findUserIdByEmail(supabase, account.email);
  if (!existingId) {
    throw new Error(
      `Failed to create ${account.email} and could not find an existing user: ` +
        (error?.message ?? "unknown error"),
    );
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    existingId,
    {
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    },
  );
  if (updateError) throw updateError;
  return existingId;
}

async function main(): Promise<void> {
  console.log("🟡 STAGING Supabase — seeding dev test accounts");
  const supabase = serviceClient();

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("slug", DEMO_TENANT_SLUG)
    .maybeSingle<{ id: string; name: string }>();

  if (tenantError) throw tenantError;
  if (!tenant) {
    throw new Error(
      `No tenant with slug "${DEMO_TENANT_SLUG}". Run db:seed first.`,
    );
  }

  for (const account of DEV_ACCOUNTS) {
    const userId = await upsertAuthUser(supabase, account);

    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: account.email,
        full_name: account.fullName,
        is_platform_admin: account.isPlatformAdmin,
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    if (account.role) {
      const { error: membershipError } = await supabase
        .from("memberships")
        .upsert(
          { user_id: userId, tenant_id: tenant.id, role: account.role },
          { onConflict: "user_id,tenant_id,role" },
        );
      if (membershipError) throw membershipError;
    }

    if (account.createStudent) {
      const { error: studentError } = await supabase.from("students").upsert(
        {
          tenant_id: tenant.id,
          user_id: userId,
          full_name: account.fullName,
          email: account.email,
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (studentError) throw studentError;
    }

    const label = account.isPlatformAdmin
      ? "platform_admin"
      : account.role ?? "no role";
    console.log(`  ✓ ${account.email} (${label})`);
  }

  console.log(`\nDone — ${DEV_ACCOUNTS.length} dev accounts ready in ${tenant.name}.`);
  console.log(`Password for all dev accounts: ${DEV_PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
