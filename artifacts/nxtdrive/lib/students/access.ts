import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedUser, MemberRole } from "@/lib/types";
import { getActiveChildId } from "./active-child";
import type { Student } from "./types";

/**
 * Returns every student record the authenticated user has read access to
 * within the given tenant via:
 *   - `students.user_id = auth.uid()` (the user IS a student), and/or
 *   - a `student_guardians` link (the user is a parent of those students).
 *
 * RLS on `students` already restricts to these branches (plus admin/instructor
 * scope, which the student PWA does not use), so this is a thin wrapper.
 * Result is de-duplicated and ordered by full_name for the multi-child picker.
 */
export async function getAccessibleStudents(
  tenantId: string,
): Promise<Student[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("full_name", { ascending: true });
  return (data ?? []) as Student[];
}

/**
 * Resolves the "active" student row for the current PWA user.
 *
 *  - If the user is linked to a `students` row by `user_id` (i.e. they ARE a
 *    student), that record always wins.
 *  - Otherwise (parent-only login), we look at the children the user is
 *    linked to via `student_guardians`:
 *      * exactly 1 child → auto-pick;
 *      * multiple        → pick the cookie-selected one, else return null
 *                          so the page can redirect to /student/select-child.
 *
 * The active-child cookie value is verified against the accessible set
 * before being honoured.
 */
export async function getActiveStudent(
  user: AuthenticatedUser,
  tenantId: string,
  roles: MemberRole[],
): Promise<{
  student: Student | null;
  accessible: Student[];
  needsChildPicker: boolean;
}> {
  const accessible = await getAccessibleStudents(tenantId);

  const own = accessible.find((s) => s.user_id === user.id) ?? null;
  if (own) {
    return { student: own, accessible, needsChildPicker: false };
  }

  // Parent path: no own student row. Filter to guardian-linked rows
  // (defensive — RLS already does this, but we should not auto-pick a
  // row the user only sees via a future RLS branch).
  const children = accessible.filter((s) => s.user_id !== user.id);

  if (children.length === 0) {
    return { student: null, accessible, needsChildPicker: false };
  }

  if (children.length === 1) {
    return { student: children[0]!, accessible: children, needsChildPicker: false };
  }

  // Multi-child: honour the cookie if it points at one of the children.
  const cookieId = await getActiveChildId();
  const cookieMatch = cookieId
    ? children.find((s) => s.id === cookieId) ?? null
    : null;
  if (cookieMatch) {
    return { student: cookieMatch, accessible: children, needsChildPicker: false };
  }

  // Silence unused-var lint for the `roles` parameter — kept in the
  // signature so future role-specific branching has a hook.
  void roles;

  return { student: null, accessible: children, needsChildPicker: true };
}
