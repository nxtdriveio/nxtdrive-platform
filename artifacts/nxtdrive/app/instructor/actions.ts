"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Lesson } from "@/lib/lessons/types";

type ActionResult = { error?: string };

/**
 * Loads the lesson and asserts the actor either owns it (instructor_id matches)
 * or is a tenant_admin. The RPCs themselves enforce a broader role gate; this
 * check is an additional defense-in-depth layer so one instructor cannot mutate
 * another instructor's lesson via the instructor UI.
 */
async function loadOwnedLesson(
  lessonId: string,
): Promise<{ lesson: Lesson; userId: string; tenantId: string } | string> {
  if (!lessonId) return "lesson_id ontbreekt";
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "Les niet gevonden";
  const lesson = data as Lesson;
  const isAdmin = roles.includes("tenant_admin");
  if (!isAdmin && lesson.instructor_id !== user.id) {
    return "Niet geautoriseerd voor deze les";
  }
  return { lesson, userId: user.id, tenantId: tenant.id };
}

export async function completeLessonAction(formData: FormData): Promise<void> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") {
    redirect(`/instructor/${lessonId}?error=${encodeURIComponent(ctx)}`);
  }
  const service = createServiceRoleClient();
  const { error } = await service.rpc("complete_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
  });
  if (error) {
    redirect(
      `/instructor/${lessonId}?error=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/instructor");
  redirect(`/instructor/${lessonId}`);
}

export async function cancelLessonAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!reason) return { error: "Reden is verplicht" };
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("cancel_lesson", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/instructor");
  return {};
}

export async function markNoShowAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("mark_lesson_no_show", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/instructor");
  return {};
}

export async function addLessonNoteAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return { error: "Notitie kan niet leeg zijn" };
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("add_lesson_note", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_body: body,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  return {};
}

export async function toggleStudentCbrCompetencyAction(
  formData: FormData,
): Promise<ActionResult> {
  const studentId = String(formData.get("student_id") ?? "");
  const competencyId = String(formData.get("competency_id") ?? "");
  const achieved = String(formData.get("achieved") ?? "") === "1";
  if (!studentId) return { error: "student_id ontbreekt" };
  if (!competencyId) return { error: "competency_id ontbreekt" };

  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin");

  const service = createServiceRoleClient();

  // Defense-in-depth: an instructor may only edit a student's checklist if
  // they have taught that student at least one lesson. tenant_admin can edit
  // any student in the tenant.
  if (!isAdmin) {
    const { data: link } = await service
      .from("lessons")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("student_id", studentId)
      .eq("instructor_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!link) return { error: "Niet geautoriseerd voor deze leerling" };
  } else {
    const { data: stu } = await service
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!stu) return { error: "Leerling niet gevonden" };
  }

  const { error } = await service.rpc("set_student_cbr_progress", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_competency_id: competencyId,
    p_achieved: achieved,
  });
  if (error) return { error: error.message };

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
  return {};
}

export async function setLessonProgressAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const scoreRaw = String(formData.get("score") ?? "");
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 2000);
  const score = parseInt(scoreRaw, 10);
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return { error: "Score moet tussen 0 en 10 liggen" };
  }
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_lesson_progress", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_score: score,
    p_summary: summary || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  return {};
}
