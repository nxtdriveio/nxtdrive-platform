"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadInstructorLeskaart } from "@/lib/skills/leskaart-data";
import {
  generateLessonReportDraft,
  analyzeStudentProgress,
  type ProgressAnalysis,
  type WeakSkill,
} from "@/lib/ai/leskaart-advisor";
import type { Lesson } from "@/lib/lessons/types";

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

export async function generateLessonReportAction(
  formData: FormData,
): Promise<{ report?: string; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 4000);
  if (!notes) return { error: "Voer eerst korte notities in." };

  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

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

export async function analyzeProgressAction(
  formData: FormData,
): Promise<{ analysis?: ProgressAnalysis; error?: string }> {
  const lessonId = String(formData.get("lesson_id") ?? "");
  const ctx = await loadOwnedLesson(lessonId);
  if (typeof ctx === "string") return { error: ctx };

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

    // Flatten all gradable leaves and pick the weakest: critical-below-niveau-8
    // first, then the lowest scored, then a few not-yet-scored, capped at 8.
    const allLeaves = leskaart.categories.flatMap((c) =>
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

    const analysis = await analyzeStudentProgress({
      studentName,
      readiness,
      weakestSkills,
    });
    return { analysis };
  } catch (err) {
    return { error: aiErrorMessage(err) };
  }
}
