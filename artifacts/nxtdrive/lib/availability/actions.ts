"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  STUDENT_DAYPARTS,
  type WeeklyBlockInput,
} from "@/lib/availability/types";

// Allowed pages an action may redirect back to (prevents open-redirect abuse).
function safeRedirect(value: FormDataEntryValue | null): string {
  const v = String(value ?? "");
  if (v === "/instructor/beschikbaarheid") return v;
  if (v.startsWith("/backoffice/beschikbaarheid")) return v;
  return "/backoffice/beschikbaarheid";
}

// Resolve which instructor this action targets. Non-admins may only ever touch
// their own availability; admins may target any instructor in the tenant.
function resolveInstructorId(
  roles: string[],
  userId: string,
  requested: FormDataEntryValue | null,
): string {
  const isAdmin = roles.includes("tenant_admin");
  const requestedId = String(requested ?? "").trim();
  if (isAdmin && requestedId) return requestedId;
  return userId;
}

export async function saveWeeklyAvailability(formData: FormData) {
  const { tenant, user, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const instructorId = resolveInstructorId(
    roles,
    user.id,
    formData.get("instructor_id"),
  );
  const back = safeRedirect(formData.get("redirect_to"));

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
  const { error } = await service.rpc("set_instructor_weekly_availability", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
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
  ]);
  const instructorId = resolveInstructorId(
    roles,
    user.id,
    formData.get("instructor_id"),
  );
  const back = safeRedirect(formData.get("redirect_to"));

  const date = String(formData.get("exception_date") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const wholeDay = String(formData.get("whole_day") ?? "") === "on";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  if (!date || (kind !== "available" && kind !== "blocked")) {
    redirect(`${back}?error=invalid`);
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
  const { error } = await service.rpc("upsert_availability_exception", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
    p_id: null,
    p_exception_date: date,
    p_kind: kind,
    p_start_min: startMin,
    p_end_min: endMin,
    p_note: note || null,
  });
  if (error) {
    redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(back);
  redirect(back);
}

export async function deleteAvailabilityException(formData: FormData) {
  const { tenant, user } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
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
  const { tenant, user } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const studentId = String(formData.get("student_id") ?? "").trim();
  const back = `/backoffice/leerlingen/${studentId}`;
  if (!studentId) redirect("/backoffice/leerlingen");

  const dayparts = STUDENT_DAYPARTS.filter(
    (d) => String(formData.get(`daypart_${d}`) ?? "") === "on",
  );

  const service = createServiceRoleClient();
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
