import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-options";
import { getServerSupabaseAnonKey, getServerSupabaseUrl } from "@/lib/supabase/env";

export async function createServerSupabaseClient() {
  const { url } = getServerSupabaseUrl();
  const anonKey = getServerSupabaseAnonKey();

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: getSupabaseCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }>,
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as never);
          }
        } catch {
          // Called from a Server Component — middleware will refresh the cookie.
        }
      },
    },
  });
}
