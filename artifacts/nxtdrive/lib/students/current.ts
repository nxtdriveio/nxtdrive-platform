import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Student } from "./types";

/**
 * Resolves the `students` row that the currently authenticated user is linked
 * to within the given tenant. Returns null when no student record is linked
 * (e.g. parent-only accounts, or a freshly invited login not yet linked).
 *
 * Goes through the anon-key server client so Supabase RLS is enforced.
 */
export async function getCurrentStudent(
  userId: string,
  tenantId: string,
): Promise<Student | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle<Student>();
  return data ?? null;
}
