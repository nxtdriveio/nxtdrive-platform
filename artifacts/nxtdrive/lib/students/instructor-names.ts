import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Display-only lookup of instructor names for the *calling* student.
 *
 * Uses the SECURITY DEFINER RPC `public.my_lesson_instructors`, which is
 * intrinsically scoped to `auth.uid()` via a join on `students.user_id`.
 * That means we keep the student read path on the anon key (no service
 * role) and still surface the instructor's display name on lesson cards.
 *
 * Returns a Map keyed by instructor user id. Missing entries simply mean
 * the lesson's instructor has not (yet) taught the caller, which should
 * not happen for lessons the caller can read but is handled gracefully.
 */
export async function getInstructorNames(
  _instructorIds: string[],
): Promise<Map<string, string>> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("my_lesson_instructors");
  const rows = (data ?? []) as { instructor_id: string; full_name: string | null }[];
  return new Map(rows.map((r) => [r.instructor_id, r.full_name ?? "Instructeur"]));
}
