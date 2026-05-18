"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function scheduleLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const instructorId = String(formData.get("instructor_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = parseInt(String(formData.get("duration_min") ?? "60"), 10);
  const credits = parseInt(String(formData.get("credits_cost") ?? "1"), 10);
  const location = String(formData.get("location") ?? "").trim().slice(0, 200);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);

  if (!instructorId || !studentId || !date || !time) {
    redirect("/backoffice/agenda/nieuw?error=missing");
  }
  if (!Number.isFinite(duration) || duration < 15) {
    redirect("/backoffice/agenda/nieuw?error=duration");
  }
  if (!Number.isFinite(credits) || credits < 1) {
    redirect("/backoffice/agenda/nieuw?error=credits");
  }

  // Combine local datetime as ISO string. Browser submits date as YYYY-MM-DD
  // and time as HH:mm; we keep it in the server's TZ which is UTC. For demo
  // purposes this is acceptable; later we'll attach a tenant TZ.
  const startsAt = new Date(`${date}T${time}:00`);
  if (isNaN(startsAt.getTime())) {
    redirect("/backoffice/agenda/nieuw?error=date");
  }

  const service = createServiceRoleClient();
  const { data: lessonId, error } = await service.rpc("schedule_lesson", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
    p_student_id: studentId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_credits_cost: credits,
    p_location: location || null,
    p_notes: notes || null,
  });
  if (error || !lessonId) {
    const code = encodeURIComponent(error?.message ?? "unknown");
    redirect(`/backoffice/agenda/nieuw?error=${code}`);
  }

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/leerlingen/${studentId}`);
  redirect(`/backoffice/agenda/${lessonId as string}`);
}

export async function completeLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "");
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("complete_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=complete`);

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}

export async function cancelLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const lessonId = String(formData.get("lesson_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!lessonId) redirect("/backoffice/agenda");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason || null,
  });
  if (error) redirect(`/backoffice/agenda/${lessonId}?error=cancel`);

  revalidatePath("/backoffice/agenda");
  revalidatePath(`/backoffice/agenda/${lessonId}`);
  redirect(`/backoffice/agenda/${lessonId}`);
}
