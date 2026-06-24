import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getPublicSupabaseConfig } from "@/lib/supabase/env";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getPublicSupabaseConfig();

  return createBrowserClient(url, anonKey, {
    cookieOptions: getSupabaseCookieOptions(),
  });
}
