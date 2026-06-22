"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import { loadOrganizationBranchScope } from "@/lib/organization/branch-scope";
import { canAccessBranch, type BranchAccessScope } from "@/lib/permissions";
import { requireStudentBackofficeAccess } from "@/lib/students/access";
import {
  STUDENT_DAYPARTS,
  type WeeklyBlockInput,
} from "@/lib/availability/types";
import type { ActiveOrganizationContext } from "@/lib/organization/context";
import type { MemberRole } from "@/lib/types";
import { addDaysYmd } from "@/lib/datetime";

// Allowed pages an action may redirect back to (prevents open-redirect abuse).
function safeRedirect(value: FormDataEntryValue | null): string {
  const v = String(value ?? "");
  if (v === "/instructor/availability") return v;
  if (v === "/instructor/beschikbaarheid") return v;
  if (v.startsWith("/backoffice/beschikbaarheid")) return v;
  return "/backoffice/beschikbaarheid";
}

function parseBranchId(value: FormDataEntryValue | null): string | null {
  const branchId = String(value ?? "").trim();
  return branchId.length > 0 ? branchId : null;
}

// Resolve which instructor this action targets. Non-admins may only ever touch
// their own availability; admins may target any instructor in the tenant.
function resolveInstructorId(
  roles: readonly MemberRole[],
  userId: string,
  requested: FormDataEntryValue | null,
): string {
  const canTargetOther =
    roles.includes("tenant_admin") ||
    roles.includes("franchise_admin") ||
    roles.includes("branch_manager") ||
    roles.includes("planner");
  const requestedId = String(requested ?? "").trim();
  if (canTargetOther && requestedId) return requestedId;
  return userId;
}

function branchScopeError(back: string): never {
  redirect(`${back}?error=${encodeURIComponent("Geen toegang tot deze vestiging.")}`);
}

async function assertAvailabilityWriteScope(input: {
  context: ActiveOrganizationContext;
  branchScope: BranchAccessScope;
  instructorId: string;
  branchId: string | null;
  back: string;
}) {
  const { context, branchScope, branchId, instructorId, back } = input;
  const tenantId = context.organization.id;
  const isOwnInstructor = instructorId === context.user.id;
  const canManageOthers =
    context.user.profile?.is_platform_admin ||
    context.roles.includes("tenant_admin") ||
    context.roles.includes("franchise_admin") ||
    context.roles.includes("branch_manager") ||
    context.roles.includes("planner");

  if (!isOwnInstructor && !canManageOthers) {
    redirect(`${back}?error=${encodeURIComponent("Je mag alleen je eigen beschikbaarheid beheren.")}`);
  }

  if (branchId && !canAccessBranch(branchScope, branchId)) {
    branchScopeError(back);
  }

  if (!branchId && branchScope.scope_type === "branches" && !isOwnInstructor) {
    redirect(
      `${back}?error=${encodeURIComponent(
        "Kies een vestiging voordat je beschikbaarheid voor een andere instructeur beheert.",
      )}`,
    );
  }

  if (!isOwnInstructor) {
    const instructors = await loadTenantInstructors(tenantId, {
      branchIds: branchId ? [branchId] : null,
    });
    if (!instructors.some((instructor) => instructor.id === instructorId)) {
      redirect(`${back}?error=${encodeURIComponent("Deze instructeur valt buiten je scope.")}`);
    }
  }
}

export async function saveWeeklyAvailability(formData: FormData) {
  const { tenant, user, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "franchise_admin",
    "branch_manager",
    "planner",
  ]);
  const context = { user, tenant, organization: tenant, roles };
  const instructorId = resolveInstructorId(
    roles,
    user.id,
    formData.get("instructor_id"),
  );
  const back = safeRedirect(formData.get("redirect_to"));
  const branchId = parseBranchId(formData.get("branch_id"));

  let blocks: WeeklyBlockInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("blocks") ?? "[]"));
    if (Array.isArray(parsed)) {
      blocks = parsed
        .map((b) => ({
          weekday: Number(b.weekday),
          start_min: Number(b.start_min),
          end_min: Number(b.end_min),
        }))
        .filter(
          (b) =>
            Number.isInteger(b.weekday) &&
            b.weekday >= 0 &&
            b.weekday <= 6 &&
            Number.isInteger(b.start_min) &&
            Number.isInteger(b.end_min) &&
            b.start_min >= 0 &&
            b.start_min < b.end_min &&
            b.end_min <= 1440,
        );
    }
  } catch {
    redirect(`${back}?error=invalid`);
  }

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  await assertAvailabilityWriteScope({
    context,
    branchScope,
    instructorId,
    branchId,
    back,
  });

  const { error } = await service.rpc("set_instructor_weekly_availability", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
    p_branch_id: branchId,
    p_blocks: blocks,
  });
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(back);
  redirect(back);
}

export async function addAvailabilityException(formData: FormData) {
  const { tenant, user, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "franchise_admin",
    "branch_manager",
    "planner",
  ]);
  const context = { user, tenant, organization: tenant, roles };
  const instructorId = resolveInstructorId(
    roles,
    user.id,
    formData.get("instructor_id"),
  );
  const back = safeRedirect(formData.get("redirect_to"));
  const branchId = parseBranchId(formData.get("branch_id"));

  const date = String(formData.get("exception_date") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const wholeDay = String(formData.get("whole_day") ?? "") === "on";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const repeatMode = String(formData.get("repeat_mode") ?? "none").trim();
  const repeatUntil = String(formData.get("repeat_until") ?? "").trim();

  if (!date || (kind !== "available" && kind !== "blocked")) {
    redirect(`${back}?error=invalid`);
  }
  if (!isDateKey(date)) {
    redirect(`${back}?error=invalid_date`);
  }

  let startMin: number | null = null;
  let endMin: number | null = null;
  if (!(kind === "blocked" && wholeDay)) {
    const s = parseHHMM(formData.get("start_time"));
    const e = parseHHMM(formData.get("end_time"));
    if (s === null || e === null || s >= e) {
      redirect(`${back}?error=invalid_time`);
    }
    startMin = s;
    endMin = e;
  }

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  await assertAvailabilityWriteScope({
    context,
    branchScope,
    instructorId,
    branchId,
    back,
  });

  const dates = buildExceptionDates(date, repeatMode, repeatUntil);
  if (dates.length === 0) {
    redirect(`${back}?error=invalid_repeat`);
  }

  for (const exceptionDate of dates) {
    const { error } = await service.rpc("upsert_availability_exception", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_instructor_id: instructorId,
      p_id: null,
      p_branch_id: branchId,
      p_exception_date: exceptionDate,
      p_kind: kind,
      p_start_min: startMin,
      p_end_min: endMin,
      p_note: note || null,
    });
    if (error) {
      redirect(`${back}?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath(back);
  redirect(back);
}

export async function deleteAvailabilityException(formData: FormData) {
  const { tenant, user } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
    "franchise_admin",
    "branch_manager",
    "planner",
  ]);
  const back = safeRedirect(formData.get("redirect_to"));
  const id = String(formData.get("exception_id") ?? "").trim();
  if (!id) redirect(back);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("delete_availability_exception", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
  });
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(back);
  redirect(back);
}

export async function saveStudentDaypartPreference(formData: FormData) {
  const studentId = String(formData.get("student_id") ?? "").trim();
  const back = `/backoffice/leerlingen/${studentId}`;
  if (!studentId) redirect("/backoffice/leerlingen");

  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "admin",
  );
  if (!student) redirect("/backoffice/leerlingen");

  const { user, organization: tenant } = context;
  const dayparts = STUDENT_DAYPARTS.filter(
    (d) => String(formData.get(`daypart_${d}`) ?? "") === "on",
  );

  const { error } = await service.rpc("set_student_daypart_preference", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: studentId,
    p_dayparts: dayparts,
  });
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(back);
  redirect(back);
}

function parseHHMM(value: FormDataEntryValue | null): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  const total = h * 60 + m;
  if (total < 0 || total > 1440) return null;
  return total;
}

function isDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function buildExceptionDates(
  startDate: string,
  repeatMode: string,
  repeatUntil: string,
): string[] {
  if (repeatMode === "none" || repeatMode === "") return [startDate];
  if (
    repeatMode !== "daily" &&
    repeatMode !== "weekdays" &&
    repeatMode !== "weekly"
  ) {
    return [];
  }
  if (!isDateKey(repeatUntil)) return [];

  if (repeatUntil < startDate) return [];

  const maxItems = 180;
  const result: string[] = [];
  for (let cursor = startDate; cursor <= repeatUntil && result.length < maxItems;) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay();
    if (repeatMode !== "weekdays" || (weekday !== 0 && weekday !== 6)) {
      result.push(cursor);
    }
    cursor = addDaysYmd(cursor, repeatMode === "weekly" ? 7 : 1);
  }
  return result;
}
