"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadInstructorLeskaart } from "@/lib/skills/leskaart-data";
import {
  generateLessonReportDraft,
  analyzeStudentProgress,
  generateInternalAttention,
  type ProgressAnalysis,
  type InternalAttention,
  type WeakSkill,
} from "@/lib/ai/leskaart-advisor";
import { primeAiClientIfNeeded } from "@/lib/ai/platform-config";
import { tenantHasFeature } from "@/lib/platform/features";
import { requireStudentBackofficeAccess } from "@/lib/students/access";
import type { Lesson } from "@/lib/lessons/types";
import type { Tenant } from "@/lib/types";

/**
 * Leskaart L6 — on-demand ADVISORY AI server actions. They read the structured
 * leskaart/readiness data the instructor already produced, ask the model for a
 * draft or analysis, and return it. Nothing is persisted here; raw AI output is
 * only saved if the instructor explicitly saves it through an existing flow.
 */

/**
 * Defense-in-depth ownership check mirroring app/instructor/actions.ts: the actor
 * must own the lesson (instructor_id) or be a tenant_admin, and the lesson must
 * belong to their active tenant.
 */
async function loadOwnedLesson(
  lessonId: string,
): Promise<
  | {
      lesson: Lesson;
      userId: string;
      tenantId: string;
      tenant: Tenant;
    }
  | string
> {
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
  return { lesson, userId: user.id, tenantId: tenant.id, tenant };
}

function aiErrorMessage(err: unknown): string {
  // Log redacted metadata only (name + short message) — never the full provider
  // error object, which can echo the request payload (notes / labels).
  if (err instanceof Error) {
    console.error(`[L6 AI] ${err.name}: ${err.message.slice(0, 200)}`);
    // Surface our own validation-style messages (already NL) verbatim.
    if (err.message && err.message.length < 160) return err.message;
  } else {
    console.error("[L6 AI] onbekende fout");
  }
  return "De AI-functie is momenteel niet beschikbaar. Probeer het later opnieuw.";
}

function aiPlanError(): string {
  return "AI-functies vereisen het Elite-abonnement.";
}

export async function generateLessonReportAction(
  formData: FormData,
): Promise<{ report?: string; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000);
  if (!notes) return { error: "Voer eerst korte notities in." };

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };
  if (!tenantHasFeature(ctx.tenant, "ai_features")) {
    return { error: aiPlanError() };
  }

  const service = createServiceRoleClient();
  await primeAiClientIfNeeded(service);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: studentRow } = await supabase
      .from("students")
      .select("full_name")
      .eq("id", ctx.lesson.student_id)
      .maybeSingle();
    const studentName =
      (studentRow?.full_name as string | undefined) ?? "de leerling";

    const leskaart = await loadInstructorLeskaart(
      supabase,
      ctx.tenantId,
      ctx.lesson.student_id,
      ctx.lesson.id,
    );

    const report = await generateLessonReportDraft({
      studentName,
      notes,
      todaySkills: leskaart.todaySkills.map((s) => ({
        label: s.label,
        score: s.score,
      })),
      attentionPoints: ctx.lesson.attention_points,
    });
    return { report };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

/**
 * Pick the weakest leaves across the leskaart: critical-below-niveau-8 first,
 * then the lowest scored, then a few not-yet-scored, capped at 8.
 */
function pickWeakestSkills(
  categories: Awaited<
    ReturnType<typeof loadInstructorLeskaart>
  >["categories"],
): WeakSkill[] {
  const allLeaves = categories.flatMap((c) =>
    c.subcategories.flatMap((s) =>
      s.leaves.map((l) => ({
        label: l.label,
        score: l.currentScore,
        isCritical: l.isCritical,
      })),
    ),
  );
  const criticalBelow = allLeaves.filter(
    (l) => l.isCritical && (l.score == null || l.score < 8),
  );
  const scoredAsc = allLeaves
    .filter((l) => l.score != null)
    .sort((a, b) => (a.score as number) - (b.score as number));
  const notScored = allLeaves.filter((l) => l.score == null && !l.isCritical);

  const seen = new Set<string>();
  const weakestSkills: WeakSkill[] = [];
  for (const l of [...criticalBelow, ...scoredAsc, ...notScored]) {
    if (seen.has(l.label)) continue;
    seen.add(l.label);
    weakestSkills.push(l);
    if (weakestSkills.length >= 8) break;
  }
  return weakestSkills;
}

export async function analyzeProgressAction(
  formData: FormData,
): Promise<{ analysis?: ProgressAnalysis; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };
  if (!tenantHasFeature(ctx.tenant, "ai_features")) {
    return { error: aiPlanError() };
  }

  const service = createServiceRoleClient();
  await primeAiClientIfNeeded(service);

  try {
    const supabase = await createServerSupabaseClient();
    const [studentRes, readiness, leskaart] = await Promise.all([
      supabase
        .from("students")
        .select("full_name")
        .eq("id", ctx.lesson.student_id)
        .maybeSingle(),
      loadStudentReadiness(supabase, ctx.tenantId, ctx.lesson.student_id),
      loadInstructorLeskaart(
        supabase,
        ctx.tenantId,
        ctx.lesson.student_id,
        ctx.lesson.id,
      ),
    ]);
    const studentName =
      (studentRes.data?.full_name as string | undefined) ?? "de leerling";

    const analysis = await analyzeStudentProgress({
      studentName,
      readiness,
      weakestSkills: pickWeakestSkills(leskaart.categories),
    });
    return { analysis };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

/**
 * Module 15 — on-demand AI interne aandachtspunten (staff-only). Summarizes the
 * student's RECURRING attention points across recent lessons + notes and gives
 * concrete advice for the next lesson. Kept separate from the student-facing
 * lesson report. Reads the structured lesson data the instructor already
 * produced; nothing is persisted.
 */
export async function analyzeInternalAttentionAction(
  formData: FormData,
): Promise<{ attention?: InternalAttention; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };
  if (!tenantHasFeature(ctx.tenant, "ai_features")) {
    return { error: aiPlanError() };
  }

  const service = createServiceRoleClient();
  await primeAiClientIfNeeded(service);

  try {
    const supabase = await createServerSupabaseClient();

    // Recent lessons of this student: their attention_points + progress
    // summaries are the structured signal for "recurring" points.
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("id, attention_points, progress_summary")
      .eq("tenant_id", ctx.tenantId)
      .eq("student_id", ctx.lesson.student_id)
      .order("starts_at", { ascending: false })
      .limit(12);
    const lessons = (lessonRows ?? []) as {
      id: string;
      attention_points: string | null;
      progress_summary: string | null;
    }[];

    const attentionPoints: string[] = [];
    for (const l of lessons) {
      const ap = (l.attention_points ?? "").trim();
      if (ap) attentionPoints.push(ap);
      const ps = (l.progress_summary ?? "").trim();
      if (ps) attentionPoints.push(ps);
    }

    // Recent lesson notes across these lessons add free-text observations.
    const lessonIds = lessons.map((l) => l.id);
    let recentNotes: string[] = [];
    if (lessonIds.length > 0) {
      const { data: noteRows } = await supabase
        .from("lesson_notes")
        .select("body, created_at")
        .in("lesson_id", lessonIds)
        .order("created_at", { ascending: false })
        .limit(15);
      recentNotes = ((noteRows ?? []) as { body: string }[])
        .map((n) => (n.body ?? "").trim())
        .filter(Boolean);
    }

    const [studentRes, readiness, leskaart] = await Promise.all([
      supabase
        .from("students")
        .select("full_name")
        .eq("id", ctx.lesson.student_id)
        .maybeSingle(),
      loadStudentReadiness(supabase, ctx.tenantId, ctx.lesson.student_id),
      loadInstructorLeskaart(
        supabase,
        ctx.tenantId,
        ctx.lesson.student_id,
        ctx.lesson.id,
      ),
    ]);
    const studentName =
      (studentRes.data?.full_name as string | undefined) ?? "de leerling";

    const attention = await generateInternalAttention({
      studentName,
      attentionPoints,
      recentNotes,
      weakestSkills: pickWeakestSkills(leskaart.categories),
      readiness,
    });
    return { attention };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

/**
 * Examenflow C — on-demand AI herexamen-analyse keyed by student (not lesson).
 * Used in the backoffice retake card after a failed exam AND for the backoffice
 * student dossier AI-analyse. Reuses the advisory engine; nothing is persisted.
 * The leskaart rollup drives the weakest skills, so the latest lesson id (if
 * any) is only passed to satisfy the loader.
 */
export async function analyzeRetakeAction(
  studentId: string,
): Promise<{ analysis?: ProgressAnalysis; error?: string }> {
  if (!studentId) return { error: "student_id ontbreekt" };
  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    studentId,
    "collaborate",
  );
  if (!student) return { error: "Leerling niet gevonden" };

  const { organization: tenant } = context;
  if (!tenantHasFeature(tenant, "ai_features")) {
    return { error: aiPlanError() };
  }
  await primeAiClientIfNeeded(service);

  try {
    const supabase = await createServerSupabaseClient();
    const { data: latestLesson } = await supabase
      .from("lessons")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("student_id", studentId)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestLessonId = (latestLesson?.id as string | undefined) ?? "";

    const [readiness, leskaart] = await Promise.all([
      loadStudentReadiness(supabase, tenant.id, studentId),
      loadInstructorLeskaart(supabase, tenant.id, studentId, latestLessonId),
    ]);

    const analysis = await analyzeStudentProgress({
      studentName: student.full_name,
      readiness,
      weakestSkills: pickWeakestSkills(leskaart.categories),
    });
    return { analysis };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}

/**
 * Module 15 — save an AI-generated (or instructor-edited) lesson report draft
 * to lessons.progress_summary. Requires the same ownership check as the other
 * lesson-scoped AI actions. Passing an empty summary clears the field.
 */
export async function saveLessonProgressSummaryAction(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const summary = String(formData.get("summary") ?? "").trim().slice(0, 10000);

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

  const service = createServiceRoleClient();
  const { error } = await service
    .from("lessons")
    .update({ progress_summary: summary || null })
    .eq("id", lessonId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };
  return { ok: true };
}
