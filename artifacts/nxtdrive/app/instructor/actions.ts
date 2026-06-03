"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  notifyCbrAuthorizationNeeded,
  maybeFireLessonReviewMoments,
} from "@/lib/notifications/dispatch";
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

export async function startLessonAction(formData: FormData): Promise<void> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") {
    redirect(`/instructor/${lessonId}?error=${encodeURIComponent(ctx)}`);
  }
  const service = createServiceRoleClient();
  const { error } = await service.rpc("start_lesson", {
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
  // Task #113 — beoordeel reviewmomenten (na N lessen / examenwaardig). Best-
  // effort: faalt nooit de lesactie; idempotent via de dedupe key.
  await maybeFireLessonReviewMoments(service, ctx.tenantId, ctx.lesson.student_id);
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

/**
 * Records a 1–10 grade for one skill during one lesson (Leskaart L2). Auth via
 * lesson ownership; the locked `set_skill_score` RPC re-validates the score,
 * the active leaf, the lesson↔student↔tenant link, recomputes the rollup and
 * writes the audit row. Server-side only.
 */
export async function setSkillScoreAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const skillId = String(formData.get("skill_id") ?? "");
  const score = parseInt(String(formData.get("score") ?? ""), 10);
  if (!skillId) return { error: "skill_id ontbreekt" };
  if (!Number.isFinite(score) || score < 1 || score > 10) {
    return { error: "Score moet tussen 1 en 10 liggen" };
  }
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_skill_score", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_student_id: ctx.lesson.student_id,
    p_skill_id: skillId,
    p_score: score,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  return {};
}

/**
 * Updates the exam preconditions (theorie / machtiging / gezondheidsverklaring)
 * that feed the advisory readiness verdict (Leskaart L1/L2). See
 * setStudentCbrStatusAction below.
 */
/**
 * Records the full lesson context (Leskaart L4): voertuig, locatie,
 * leerlingnotitie, interne notitie, aandachtspunten en de behandelde
 * onderdelen (gekoppelde vaardigheden). Auth via lesson ownership; the locked
 * `set_lesson_context` RPC re-validates tenant scope and writes the audit row.
 */
export async function setLessonContextAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim() || null;
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const studentNote = String(formData.get("student_note") ?? "").trim().slice(0, 4000);
  const internalNote = String(formData.get("internal_note") ?? "").trim().slice(0, 4000);
  const attention = String(formData.get("attention_points") ?? "").trim().slice(0, 4000);
  const advies = String(formData.get("advice") ?? "").trim().slice(0, 4000);
  const topicSkillIds = formData
    .getAll("topic_skill_ids")
    .map((v) => String(v))
    .filter(Boolean);

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_lesson_context", {
    p_lesson_id: lessonId,
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_vehicle_id: vehicleId,
    p_location_id: locationId,
    p_student_note: studentNote || null,
    p_internal_note: internalNote || null,
    p_attention_points: attention || null,
    p_advies: advies || null,
    p_topic_skill_ids: topicSkillIds,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/student", "layout");
  return {};
}

/**
 * Assigns theory homework (Leskaart L4) to the lesson's student, optionally
 * tied to this lesson, with an optional deadline + note. Auth via lesson
 * ownership; the locked `assign_theory_homework` RPC validates module/student
 * scope and audits.
 */
export async function assignTheoryHomeworkAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!moduleId) return { error: "Kies een theoriemodule" };

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("assign_theory_homework", {
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_student_id: ctx.lesson.student_id,
    p_module_id: moduleId,
    p_lesson_id: lessonId,
    p_deadline: deadline,
    p_note: note || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/student", "layout");
  return {};
}

/**
 * Updates a theory homework status (Leskaart L4) from the instructor cockpit.
 * Auth via lesson ownership; the locked `set_theory_homework_status` RPC
 * re-validates that the actor is staff (or the owning student) and audits.
 */
export async function setTheoryHomeworkStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const homeworkId = String(formData.get("homework_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!homeworkId) return { error: "homework_id ontbreekt" };
  if (!["open", "done", "cancelled"].includes(status)) {
    return { error: "Ongeldige status" };
  }

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_theory_homework_status", {
    p_tenant_id: ctx.tenantId,
    p_actor: ctx.userId,
    p_homework_id: homeworkId,
    p_status: status,
  });
  if (error) return { error: error.message };

  revalidatePath(`/instructor/${lessonId}`);
  revalidatePath("/student", "layout");
  return {};
}

export async function setStudentCbrStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) return { error: "student_id ontbreekt" };
  const theorie = String(formData.get("theorie_behaald") ?? "") === "1";
  const machtigingStatusRaw = String(formData.get("machtiging_status") ?? "");
  const machtigingStatus = (
    ["nog_nodig", "aangevraagd", "ontvangen"] as const
  ).includes(machtigingStatusRaw as never)
    ? machtigingStatusRaw
    : "nog_nodig";
  const gvVereist =
    String(formData.get("gezondheidsverklaring_vereist") ?? "") === "1";
  const gvGeregeld =
    String(formData.get("gezondheidsverklaring_geregeld") ?? "") === "1";

  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin");
  const service = createServiceRoleClient();

  // Defense-in-depth: an instructor may only edit a student they have taught;
  // tenant_admin may edit any student in the tenant.
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

  const { error } = await service.rpc("set_student_cbr_status", {
    p_student_id: studentId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_theorie_behaald: theorie,
    p_machtiging_status: machtigingStatus,
    p_gezondheidsverklaring_vereist: gvVereist,
    p_gezondheidsverklaring_geregeld: gvGeregeld,
  });
  if (error) return { error: error.message };

  // Task #107 — als de machtiging nog geregeld moet worden, vraag de leerling
  // per e-mail om dit in MijnCBR te doen. Best-effort + idempotent per leerling.
  if (machtigingStatus === "nog_nodig") {
    try {
      await notifyCbrAuthorizationNeeded(service, tenant.id, studentId);
    } catch (e) {
      console.error("[instructor] notifyCbrAuthorizationNeeded failed", e);
    }
  }

  revalidatePath("/instructor", "layout");
  revalidatePath("/student", "layout");
  return {};
}
