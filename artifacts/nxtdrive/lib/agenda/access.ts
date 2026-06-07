import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
  type AuthorizedOrganizationContext,
} from "@/lib/organization";
import {
  canAccessBranch,
  rolesGrantPermission,
  type BranchAccessScope,
} from "@/lib/permissions";
import type { AgendaAppointment } from "@/lib/agenda/types";
import type { Lesson } from "@/lib/lessons/types";
import type { MemberRole } from "@/lib/types";

export const AGENDA_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

export const AGENDA_BACKOFFICE_MANAGE_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "instructor",
] as const satisfies readonly MemberRole[];

export type AgendaAccessMode = "read" | "manage";
export type AgendaLessonAccessRow = Lesson & { branch_id: string | null };

export type AgendaLessonAccess = {
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
  lesson: AgendaLessonAccessRow | null;
};

export type AgendaAppointmentAccess = {
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
  appointment: AgendaAppointment | null;
  appointmentBranchId: string | null;
  studentBranchId: string | null;
};

export async function requireAgendaAccessContext(
  client: SupabaseClient,
  roles: readonly MemberRole[] = AGENDA_BACKOFFICE_READ_ROLES,
): Promise<{
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
}> {
  const context = await requireOrganizationPermission("planning:read", {
    allowedRoles: [...roles],
  });
  const branchScope = await loadOrganizationBranchScope(client, context);
  return { context, branchScope };
}

export function canManageAgendaForInstructor(
  context: AuthorizedOrganizationContext,
  instructorId: string | null | undefined,
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (rolesGrantPermission(context.roles, "planning:manage")) return true;
  return Boolean(
    instructorId &&
      context.roles.includes("instructor") &&
      instructorId === context.user.id,
  );
}

export function canReadAgendaRow(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  row: { branch_id?: string | null; instructor_id?: string | null },
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (canAccessBranch(branchScope, row.branch_id)) return true;
  return Boolean(
    row.instructor_id &&
      context.roles.includes("instructor") &&
      row.instructor_id === context.user.id,
  );
}

export function canManageAgendaRow(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  row: { branch_id?: string | null; instructor_id?: string | null },
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (
    rolesGrantPermission(context.roles, "planning:manage") &&
    canAccessBranch(branchScope, row.branch_id)
  ) {
    return true;
  }
  return Boolean(
    row.instructor_id &&
      context.roles.includes("instructor") &&
      row.instructor_id === context.user.id,
  );
}

export async function requireAgendaLessonAccess(
  client: SupabaseClient,
  lessonId: string,
  mode: AgendaAccessMode = "read",
): Promise<AgendaLessonAccess> {
  const { context, branchScope } = await requireAgendaAccessContext(client);
  const { data, error } = await client
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("tenant_id", context.organization.id)
    .maybeSingle();

  if (error) throw new Error(`requireAgendaLessonAccess: ${error.message}`);

  const lesson = (data ?? null) as AgendaLessonAccessRow | null;
  if (!lesson) return { context, branchScope, lesson: null };

  const allowed =
    mode === "manage"
      ? canManageAgendaRow(context, branchScope, lesson)
      : canReadAgendaRow(context, branchScope, lesson);

  return { context, branchScope, lesson: allowed ? lesson : null };
}

async function loadAppointmentStudentBranchId(
  client: SupabaseClient,
  tenantId: string,
  studentId: string | null,
): Promise<string | null> {
  if (!studentId) return null;
  const { data, error } = await client
    .from("students")
    .select("branch_id")
    .eq("id", studentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`loadAppointmentStudentBranchId: ${error.message}`);
  }
  return (data?.branch_id as string | null | undefined) ?? null;
}

export async function requireAgendaAppointmentAccess(
  client: SupabaseClient,
  appointmentId: string,
  mode: AgendaAccessMode = "read",
): Promise<AgendaAppointmentAccess> {
  const { context, branchScope } = await requireAgendaAccessContext(client);
  const { data, error } = await client
    .from("agenda_appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("tenant_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new Error(`requireAgendaAppointmentAccess: ${error.message}`);
  }

  const appointment = (data ?? null) as AgendaAppointment | null;
  if (!appointment) {
    return {
      context,
      branchScope,
      appointment: null,
      appointmentBranchId: null,
      studentBranchId: null,
    };
  }

  // appointment.branch_id is the source of truth for branch-scoped reads/writes.
  // The student fallback keeps pre-migration student-linked rows accessible until
  // production has run the branch backfill migration.
  const studentBranchId = await loadAppointmentStudentBranchId(
    client,
    context.organization.id,
    appointment.student_id,
  );
  const appointmentBranchId = appointment.branch_id ?? studentBranchId;
  const scopedAppointment = {
    branch_id: appointmentBranchId,
    instructor_id: appointment.instructor_id,
  };
  const allowed =
    mode === "manage"
      ? canManageAgendaRow(context, branchScope, scopedAppointment)
      : canReadAgendaRow(context, branchScope, scopedAppointment);

  return {
    context,
    branchScope,
    appointment: allowed ? appointment : null,
    appointmentBranchId,
    studentBranchId,
  };
}
