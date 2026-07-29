import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
  type AuthorizedOrganizationContext,
} from "@/lib/organization";
import { canAccessBranch, type BranchAccessScope } from "@/lib/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuthenticatedUser, MemberRole } from "@/lib/types";
import { getActiveChildId } from "./active-child";
import type { Student } from "./types";

export const STUDENT_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

export const STUDENT_BACKOFFICE_ADMIN_ROLES = [
  "tenant_admin",
] as const satisfies readonly MemberRole[];

export const STUDENT_BACKOFFICE_COLLABORATE_ROLES = [
  "tenant_admin",
  "instructor",
] as const satisfies readonly MemberRole[];

export type StudentBackofficeAccessMode = "read" | "admin" | "collaborate";

export type StudentBackofficeAccess = {
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
  student: Student | null;
};

export type InstructorStudentAccess = {
  tenantId: string;
  userId: string;
  isAdmin: boolean;
  student: Student | null;
};

const STUDENT_SELECT =
  "id, tenant_id, branch_id, user_id, lead_id, full_name, email, phone, postcode, birth_date, address_line, city, pickup_address, notes, preferred_dayparts, refill_opt_in, refill_preferred_dayparts, review_consent, review_consent_at, review_consent_by, active, created_at, updated_at";

function rolesForStudentAccessMode(
  mode: StudentBackofficeAccessMode,
): readonly MemberRole[] {
  if (mode === "admin") return STUDENT_BACKOFFICE_ADMIN_ROLES;
  if (mode === "collaborate") return STUDENT_BACKOFFICE_COLLABORATE_ROLES;
  return STUDENT_BACKOFFICE_READ_ROLES;
}

/**
 * Validates backoffice access to a single student before service-role or dossier reads.
 *
 * This intentionally does not model learner/parent own-scope portal access. It is
 * only for staff-facing backoffice routes/actions, and therefore accepts an
 * explicit staff role allowlist per mode.
 */
export async function requireStudentBackofficeAccess(
  client: SupabaseClient,
  studentId: string,
  mode: StudentBackofficeAccessMode,
  options: { allowedRoles?: readonly MemberRole[] } = {},
): Promise<StudentBackofficeAccess> {
  const allowedRoles = [
    ...(options.allowedRoles ?? rolesForStudentAccessMode(mode)),
  ];
  const permission = mode === "admin" ? "student:manage" : "student:read";
  const context = await requireOrganizationPermission(permission, {
    allowedRoles,
  });
  const branchScope = await loadOrganizationBranchScope(client, context);

  const { data, error } = await client
    .from("students")
    .select(STUDENT_SELECT)
    .eq("id", studentId)
    .eq("tenant_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new Error(`requireStudentBackofficeAccess: ${error.message}`);
  }

  const student = (data ?? null) as Student | null;
  if (!student) return { context, branchScope, student: null };

  if (!canAccessBranch(branchScope, student.branch_id)) {
    return { context, branchScope, student: null };
  }

  return { context, branchScope, student };
}

export async function loadInstructorAccessibleStudentIds(
  client: SupabaseClient,
  tenantId: string,
  instructorId: string,
): Promise<string[]> {
  const [lessonsResult, conversationsResult] = await Promise.all([
    client
      .from("lessons")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId),
    client
      .from("chat_conversations")
      .select("student_id")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId),
  ]);

  if (lessonsResult.error) {
    throw new Error(
      `loadInstructorAccessibleStudentIds: ${lessonsResult.error.message}`,
    );
  }
  if (conversationsResult.error) {
    throw new Error(
      `loadInstructorAccessibleStudentIds: ${conversationsResult.error.message}`,
    );
  }

  return Array.from(
    new Set(
      [...(lessonsResult.data ?? []), ...(conversationsResult.data ?? [])]
        .map((row) => row.student_id as string | null)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function requireInstructorStudentAccess(
  client: SupabaseClient,
  studentId: string,
): Promise<InstructorStudentAccess> {
  const { tenant, user, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const { data, error } = await client
    .from("students")
    .select(STUDENT_SELECT)
    .eq("id", studentId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (error) {
    throw new Error(`requireInstructorStudentAccess: ${error.message}`);
  }

  const student = (data ?? null) as Student | null;
  if (!student) {
    return { tenantId: tenant.id, userId: user.id, isAdmin, student: null };
  }

  if (!isAdmin) {
    const accessibleStudentIds = await loadInstructorAccessibleStudentIds(
      client,
      tenant.id,
      user.id,
    );
    if (!accessibleStudentIds.includes(student.id)) {
      return { tenantId: tenant.id, userId: user.id, isAdmin, student: null };
    }
  }

  return { tenantId: tenant.id, userId: user.id, isAdmin, student };
}

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
 * Default (student PWA, `preferGuardianChildren` false/omitted):
 *  - If the user is linked to a `students` row by `user_id` (i.e. they ARE a
 *    student), that record always wins.
 *  - Otherwise (parent-only login), resolve from guardian-linked children.
 *
 * Parent portal (`preferGuardianChildren: true`):
 *  - Always resolve from guardian-linked children and IGNORE the user's own
 *    student row. This lets a dual-role user (student + parent) switch the
 *    /ouder context to a linked child instead of being pinned to their own
 *    student row — the /student PWA still uses the default (own row wins).
 *
 * Child resolution in both branches:
 *      * exactly 1 child → auto-pick;
 *      * multiple        → pick the cookie-selected one, else return null with
 *                          needsChildPicker so the page can redirect to a picker.
 *
 * The active-child cookie value is verified against the accessible set
 * before being honoured.
 */
export async function getActiveStudent(
  user: AuthenticatedUser,
  tenantId: string,
  roles: MemberRole[],
  opts: { preferGuardianChildren?: boolean } = {},
): Promise<{
  student: Student | null;
  accessible: Student[];
  needsChildPicker: boolean;
}> {
  const accessible = await getAccessibleStudents(tenantId);

  if (!opts.preferGuardianChildren) {
    const own = accessible.find((s) => s.user_id === user.id) ?? null;
    if (own) {
      return { student: own, accessible, needsChildPicker: false };
    }
  }

  // Guardian path: filter to children the user sees as a guardian (i.e. NOT
  // their own student row). Defensive — RLS already scopes this, but we should
  // not auto-pick a row the user only sees via a future RLS branch.
  const children = accessible.filter((s) => s.user_id !== user.id);

  if (children.length === 0) {
    return { student: null, accessible, needsChildPicker: false };
  }

  if (children.length === 1) {
    return {
      student: children[0]!,
      accessible: children,
      needsChildPicker: false,
    };
  }

  // Multi-child: honour the cookie if it points at one of the children.
  const cookieId = await getActiveChildId();
  const cookieMatch = cookieId
    ? (children.find((s) => s.id === cookieId) ?? null)
    : null;
  if (cookieMatch) {
    return {
      student: cookieMatch,
      accessible: children,
      needsChildPicker: false,
    };
  }

  // Silence unused-var lint for the `roles` parameter — kept in the
  // signature so future role-specific branching has a hook.
  void roles;

  return { student: null, accessible: children, needsChildPicker: true };
}
