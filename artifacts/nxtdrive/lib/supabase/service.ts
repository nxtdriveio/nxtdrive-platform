import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseUrl } from "@/lib/supabase/env";

/**
 * Server-only Supabase client using the SERVICE ROLE key.
 * Bypasses RLS — use exclusively from server actions, route handlers, or scripts
 * for: credit ledger writes, invoice mutations, audit log inserts, intake form
 * submissions, platform-admin operations, migrations and seed scripts.
 *
 * NEVER import this from a Client Component.
 */
export function createServiceRoleClient(): SupabaseClient {
  const { url } = getServerSupabaseUrl();
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
