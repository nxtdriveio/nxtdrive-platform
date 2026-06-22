"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  generateRisLessonPublicationDraft,
  type RisLessonPublicationDraft,
} from "@/lib/ai/leskaart-advisor";
import { primeAiClientIfNeeded } from "@/lib/ai/platform-config";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getActiveStudent,
  requireStudentBackofficeAccess,
} from "@/lib/students/access";
import type { MemberRole } from "@/lib/types";
import {
  normalizeRisStep,
  translateRisStepForStudent,
  type RISStepValue,
} from "@workspace/leskaart";
import {
  loadInstructorRisLessonCard,
  STAFF_OPEN_RIS_CARD_STATUSES,
  type InstructorRisLessonCard,
  type LessonCardMode,
  type PlanningCardGoalStatus,
  type RisReflectionRating,
} from "./data";

type ActionResult<T = undefined> =
  | (T extends undefined ? { error?: string } : { error?: string } & T)
  | { error: string };

export type RisScriptStatus =
  | "not_started"
  | "prepared"
  | "explained"
  | "practiced"
  | "needs_attention"
  | "progressing"
  | "sufficient"
  | "independent"
  | "mastered"
  | "ready_for_test";

export type RisModuleTestType =
  | "instructor_test_1"
  | "instructor_test_2"
  | "ris_test_cbr"
  | "ris_exam_cbr";

export type RisModuleTestResult =
  | "planned"
  | "passed"
  | "failed"
  | "needs_repeat"
  | "cancelled";

const RIS_MODULE_TEST_WRITE_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "instructor",
] as const satisfies readonly MemberRole[];

function err(error: unknown): string {
  return error instanceof Error ? error.message : "RIS actie is mislukt.";
}

function aiErr(error: unknown): string {
  if (error instanceof Error) {
    console.error(`[RIS AI] ${error.name}: ${error.message.slice(0, 200)}`);
    if (error.message && error.message.length < 160) return error.message;
  } else {
    console.error("[RIS AI] onbekende fout");
  }
  return "De RIS AI-functie is momenteel niet beschikbaar. Probeer het later opnieuw.";
}

function requiredId(value: string, label: string): string {
  const id = value.trim();
  if (!id) throw new Error(`${label} ontbreekt.`);
  return id;
}

export async function setTenantRisSettingsAction(input: {
  lessonCardMode: LessonCardMode;
  activeRisVersionId?: string | null;
  aiAssistEnabled?: boolean;
}): Promise<ActionResult> {
  try {
    const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
    const mode = input.lessonCardMode === "ris" ? "ris" : "legacy";
    const service = createServiceRoleClient();
    const { error } = await service.rpc("set_tenant_ris_settings", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_lesson_card_mode: mode,
      p_active_ris_version_id: input.activeRisVersionId ?? null,
      p_ai_assist_enabled: input.aiAssistEnabled ?? true,
    });
    if (error) return { error: error.message };
    revalidatePath("/backoffice/instellingen");
    revalidatePath("/backoffice/leerlingen");
    return {};
  } catch (error) {
    return { error: err(error) };
  }
}

export async function setRisConceptScoreAction(input: {
  lessonId: string;
  scriptId: string;
  scriptVariantId?: string | null;
  conceptRisStep: RISStepValue | number;
  status?: RisScriptStatus;
  isAttentionPoint?: boolean;
  isFeaturedForLesson?: boolean;
  shouldRepeat?: boolean;
  readyForTest?: boolean;
  instructorNote?: string | null;
  studentVisibleNote?: string | null;
}): Promise<ActionResult<{ assessmentId?: string }>> {
  try {
    const { tenant, user } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const step = normalizeRisStep(input.conceptRisStep);
    if (!step) return { error: "Kies een geldige RIS-score van 1 t/m 10." };

    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("set_ris_concept_score", {
      p_tenant_id: tenant.id,
      p_lesson_id: requiredId(input.lessonId, "Les"),
      p_actor: user.id,
      p_script_id: requiredId(input.scriptId, "RIS-script"),
      p_script_variant_id: input.scriptVariantId ?? null,
      p_concept_ris_step: step,
      p_status: input.status ?? "progressing",
      p_is_attention_point: input.isAttentionPoint ?? false,
      p_is_featured_for_lesson: input.isFeaturedForLesson ?? false,
      p_should_repeat: input.shouldRepeat ?? false,
      p_ready_for_test: input.readyForTest ?? false,
      p_instructor_note: input.instructorNote ?? null,
      p_student_visible_note: input.studentVisibleNote ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath(`/instructor/evaluations/${input.lessonId}`);
    return { assessmentId: typeof data === "string" ? data : undefined };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function setGuidedReflectionAction(input: {
  lessonCardId: string;
  studentPresent?: boolean;
  overallRating?: RisReflectionRating | null;
  independenceRating?: RisReflectionRating | null;
  insightRating?: RisReflectionRating | null;
  confidenceRating?: RisReflectionRating | null;
  oneSentenceReflection?: string | null;
  instructorContextNote?: string | null;
  lessonId?: string | null;
}): Promise<ActionResult> {
  try {
    const { tenant, user } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const service = createServiceRoleClient();
    const { error } = await service.rpc("set_ris_guided_reflection_v2", {
      p_lesson_card_id: requiredId(input.lessonCardId, "RIS-leskaart"),
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_student_present: input.studentPresent ?? true,
      p_overall_rating: input.overallRating ?? null,
      p_independence_rating: input.independenceRating ?? null,
      p_insight_rating: input.insightRating ?? null,
      p_confidence_rating: input.confidenceRating ?? null,
      p_one_sentence_reflection: input.oneSentenceReflection ?? null,
      p_instructor_context_note: input.instructorContextNote ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath("/instructor");
    if (input.lessonId) revalidatePath(`/instructor/evaluations/${input.lessonId}`);
    return {};
  } catch (error) {
    return { error: err(error) };
  }
}

export async function saveRisLessonCardDraftAction(input: {
  lessonId: string;
  internalSummary?: string | null;
  studentFriendlySummary?: string | null;
  homeworkOrNextFocus?: string | null;
}): Promise<ActionResult<{ lessonCardId?: string }>> {
  try {
    const { tenant, user, roles } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const lessonId = requiredId(input.lessonId, "Les");
    const service = createServiceRoleClient();

    const { data: lessonRaw, error: lessonError } = await service
      .from("lessons")
      .select("id, instructor_id, student_id")
      .eq("id", lessonId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (lessonError) return { error: lessonError.message };
    const lesson = lessonRaw as {
      id: string;
      instructor_id: string | null;
      student_id: string;
    } | null;
    if (!lesson) return { error: "Les niet gevonden." };
    if (!roles.includes("tenant_admin") && lesson.instructor_id !== user.id) {
      return { error: "Niet geautoriseerd voor deze RIS-les." };
    }

    const { data, error } = await service.rpc("_ensure_ris_lesson_card", {
      p_tenant_id: tenant.id,
      p_lesson_id: lessonId,
      p_actor: user.id,
    });
    if (error) return { error: error.message };
    const lessonCardId = typeof data === "string" ? data : null;
    if (!lessonCardId) return { error: "RIS-leskaart kon niet worden aangemaakt." };

    const patch: Record<string, string | null> = {};
    if ("internalSummary" in input) {
      patch.internal_summary = input.internalSummary?.trim().slice(0, 2000) || null;
    }
    if ("studentFriendlySummary" in input) {
      patch.student_friendly_summary =
        input.studentFriendlySummary?.trim().slice(0, 2000) || null;
    }
    if ("homeworkOrNextFocus" in input) {
      patch.homework_or_next_focus =
        input.homeworkOrNextFocus?.trim().slice(0, 2000) || null;
    }

    if (Object.keys(patch).length > 0) {
      const { data: updated, error: updateError } = await service
        .from("ris_lesson_cards")
        .update(patch)
        .eq("tenant_id", tenant.id)
        .eq("id", lessonCardId)
        .in("publication_status", Array.from(STAFF_OPEN_RIS_CARD_STATUSES))
        .select("id")
        .maybeSingle();
      if (updateError) return { error: updateError.message };
      if (!updated) {
        return { error: "Deze RIS-leskaart is al gepubliceerd en kan niet meer als concept worden aangepast." };
      }
    }

    revalidatePath("/instructor");
    revalidatePath(`/instructor/evaluations/${lessonId}`);
    revalidatePath(`/backoffice/leerlingen/${lesson.student_id}`);
    return { lessonCardId };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function publishRisLessonCardAction(input: {
  lessonCardId: string;
  internalSummary?: string | null;
  studentFriendlySummary?: string | null;
  homeworkOrNextFocus?: string | null;
  lessonId?: string | null;
  studentId?: string | null;
}): Promise<ActionResult> {
  try {
    const { tenant, user } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const service = createServiceRoleClient();
    const { error } = await service.rpc("publish_ris_lesson_card", {
      p_lesson_card_id: requiredId(input.lessonCardId, "RIS-leskaart"),
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_internal_summary: input.internalSummary ?? null,
      p_student_friendly_summary: input.studentFriendlySummary ?? null,
      p_homework_or_next_focus: input.homeworkOrNextFocus ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath("/instructor");
    if (input.lessonId) revalidatePath(`/instructor/evaluations/${input.lessonId}`);
    if (input.studentId) {
      revalidatePath("/student");
      revalidatePath("/student/voortgang");
      if (input.lessonId) revalidatePath(`/student/lessons/${input.lessonId}`);
      revalidatePath(`/backoffice/leerlingen/${input.studentId}`);
    }
    return {};
  } catch (error) {
    return { error: err(error) };
  }
}

export async function submitStudentRisLessonResponseAction(input: {
  lessonCardId: string;
  commentText?: string | null;
  nextLessonWish?: string | null;
  skippedResponse?: boolean;
  lessonId?: string | null;
}): Promise<ActionResult<{ responseId?: string }>> {
  try {
    const { tenant, user, roles } = await requireActiveTenant([
      "student",
      "parent",
    ]);
    const { student, needsChildPicker } = await getActiveStudent(user, tenant.id, roles);
    if (needsChildPicker || !student) {
      return { error: "Geen actief leerlingdossier gekozen." };
    }

    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("mark_ris_lesson_card_student_response", {
      p_lesson_card_id: requiredId(input.lessonCardId, "RIS-leskaart"),
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_comment_text: input.commentText ?? null,
      p_next_lesson_wish: input.nextLessonWish ?? null,
      p_skipped_response: input.skippedResponse ?? false,
    });
    if (error) return { error: error.message };

    revalidatePath("/student");
    revalidatePath("/student/voortgang");
    revalidatePath("/student/lessons");
    if (input.lessonId) revalidatePath(`/student/lessons/${input.lessonId}`);
    revalidatePath(`/backoffice/leerlingen/${student.id}`);
    return { responseId: typeof data === "string" ? data : undefined };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function upsertPlanningCardAction(input: {
  id?: string | null;
  studentId: string;
  nextLessonId?: string | null;
  previousLessonCardId?: string | null;
  studentVisibleSummary?: string | null;
  sharedWithStudent?: boolean;
  goals?: Array<{
    title: string;
    description?: string | null;
    status?: PlanningCardGoalStatus;
  }>;
}): Promise<ActionResult<{ planningCardId?: string }>> {
  try {
    const { tenant, user, roles } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const service = createServiceRoleClient();
    const studentId = requiredId(input.studentId, "Leerling");

    const { data: studentRaw, error: studentError } = await service
      .from("students")
      .select("id")
      .eq("id", studentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (studentError) return { error: studentError.message };
    if (!studentRaw) return { error: "Leerling niet gevonden." };

    if (input.nextLessonId) {
      const { data: lessonRaw, error: lessonError } = await service
        .from("lessons")
        .select("id, instructor_id, student_id")
        .eq("id", input.nextLessonId)
        .eq("tenant_id", tenant.id)
        .eq("student_id", studentId)
        .maybeSingle();
      if (lessonError) return { error: lessonError.message };
      const lesson = lessonRaw as {
        id: string;
        instructor_id: string | null;
        student_id: string;
      } | null;
      if (!lesson) return { error: "Les voor deze plankaart niet gevonden." };
      if (!roles.includes("tenant_admin") && lesson.instructor_id !== user.id) {
        return { error: "Je kunt alleen plankaarten maken voor je eigen lessen." };
      }
    }

    const shared = input.sharedWithStudent ?? true;
    const row = {
      tenant_id: tenant.id,
      student_id: studentId,
      instructor_id: user.id,
      next_lesson_id: input.nextLessonId ?? null,
      previous_lesson_card_id: input.previousLessonCardId ?? null,
      status: shared ? "shared_with_student" : "draft",
      student_visible_summary: input.studentVisibleSummary ?? null,
      shared_with_student: shared,
      shared_at: shared ? new Date().toISOString() : null,
    };

    let planningCardId = input.id ?? null;
    if (!planningCardId && input.nextLessonId) {
      const { data: existing, error: existingError } = await service
        .from("planning_cards")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("next_lesson_id", input.nextLessonId)
        .maybeSingle();
      if (existingError) return { error: existingError.message };
      planningCardId = (existing as { id: string } | null)?.id ?? null;
    }

    if (planningCardId) {
      const { error } = await service
        .from("planning_cards")
        .update(row)
        .eq("tenant_id", tenant.id)
        .eq("id", planningCardId);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await service
        .from("planning_cards")
        .insert(row)
        .select("id")
        .single();
      if (error) return { error: error.message };
      planningCardId = (data as { id: string }).id;
    }

    if (input.goals) {
      const { error: deleteError } = await service
        .from("planning_card_goals")
        .delete()
        .eq("tenant_id", tenant.id)
        .eq("planning_card_id", planningCardId);
      if (deleteError) return { error: deleteError.message };

      const goals = input.goals
        .map((goal, index) => ({
          tenant_id: tenant.id,
          planning_card_id: planningCardId,
          title: goal.title.trim().slice(0, 160),
          description: goal.description?.trim().slice(0, 500) || null,
          status: goal.status ?? "active",
          sort_order: index,
        }))
        .filter((goal) => goal.title.length > 0);
      if (goals.length > 0) {
        const { error: insertError } = await service
          .from("planning_card_goals")
          .insert(goals);
        if (insertError) return { error: insertError.message };
      }
    }

    revalidatePath("/instructor");
    if (input.nextLessonId) {
      revalidatePath(`/instructor/evaluations/${input.nextLessonId}`);
      revalidatePath(`/student/lessons/${input.nextLessonId}`);
    }
    revalidatePath("/student");
    revalidatePath(`/backoffice/leerlingen/${studentId}`);
    return { planningCardId: planningCardId ?? undefined };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function setRisModuleTestAction(input: {
  id?: string | null;
  studentId: string;
  moduleNumber: 1 | 2 | 3 | 4;
  testType: RisModuleTestType;
  plannedAt?: string | null;
  completedAt?: string | null;
  result?: RisModuleTestResult;
  instructorId?: string | null;
  cbrReference?: string | null;
  notes?: string | null;
  exemptionSpecialManoeuvres?: boolean;
}): Promise<ActionResult<{ moduleTestId?: string }>> {
  try {
    const service = createServiceRoleClient();
    const access = await requireStudentBackofficeAccess(
      service,
      requiredId(input.studentId, "Leerling"),
      "read",
      { allowedRoles: RIS_MODULE_TEST_WRITE_ROLES },
    );
    if (!access.student) {
      return { error: "Geen toegang tot deze leerling binnen je vestigingsscope." };
    }
    const { organization: tenant, user } = access.context;
    const { data, error } = await service.rpc("set_ris_module_test", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_id: input.id ?? null,
      p_student_id: access.student.id,
      p_module_number: input.moduleNumber,
      p_test_type: input.testType,
      p_planned_at: input.plannedAt ?? null,
      p_completed_at: input.completedAt ?? null,
      p_result: input.result ?? "planned",
      p_instructor_id: input.instructorId ?? null,
      p_cbr_reference: input.cbrReference ?? null,
      p_notes: input.notes ?? null,
      p_exemption_special_manoeuvres:
        input.exemptionSpecialManoeuvres ?? false,
    });
    if (error) return { error: error.message };
    revalidatePath("/backoffice/ris");
    revalidatePath("/backoffice/leerlingen");
    revalidatePath(`/backoffice/leerlingen/${input.studentId}`);
    revalidatePath("/backoffice/agenda");
    revalidatePath("/backoffice/cbr");
    return { moduleTestId: typeof data === "string" ? data : undefined };
  } catch (error) {
    return { error: err(error) };
  }
}

function buildRisAiSignals(ris: InstructorRisLessonCard) {
  const scriptMeta = new Map<
    string,
    { code: string; title: string; moduleNumber: number }
  >();
  for (const module of ris.catalog.tree) {
    for (const category of module.categories) {
      for (const script of category.scripts) {
        scriptMeta.set(script.id, {
          code: script.code,
          title: script.title,
          moduleNumber: module.moduleNumber,
        });
      }
    }
  }

  return ris.assessments
    .filter((assessment) => assessment.conceptRisStep != null || assessment.finalRisStep != null)
    .map((assessment) => {
      const meta = scriptMeta.get(assessment.scriptId);
      const step = assessment.conceptRisStep ?? assessment.finalRisStep;
      const translation = translateRisStepForStudent(step, ris.catalog.steps);
      return {
        code: meta?.code ?? "RIS",
        title: meta?.title ?? "RIS-script",
        moduleNumber: meta?.moduleNumber ?? 0,
        risStep: step,
        studentLabel: translation.studentLabel,
        isAttentionPoint: assessment.isAttentionPoint,
        isFeaturedForLesson: assessment.isFeaturedForLesson,
        shouldRepeat: assessment.shouldRepeat,
        readyForTest: assessment.readyForTest,
        instructorNote: assessment.instructorNote,
        studentVisibleNote: assessment.studentVisibleNote,
      };
    });
}

export async function generateRisLessonAiDraftAction(input: {
  lessonId: string;
}): Promise<ActionResult<{ draft?: RisLessonPublicationDraft }>> {
  try {
    const { tenant, user, roles } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const lessonId = requiredId(input.lessonId, "Les");
    const service = createServiceRoleClient();

    const { data: lessonRaw, error: lessonError } = await service
      .from("lessons")
      .select("id, student_id, instructor_id")
      .eq("id", lessonId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (lessonError) return { error: lessonError.message };
    if (!lessonRaw) return { error: "Les niet gevonden." };

    const lesson = lessonRaw as {
      id: string;
      student_id: string;
      instructor_id: string;
    };
    const isAdmin = roles.includes("tenant_admin");
    if (!isAdmin && lesson.instructor_id !== user.id) {
      return { error: "Niet geautoriseerd voor deze RIS-les." };
    }

    const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
    if (!snapshot.featureAccess.ai_features.allowed) {
      return { error: "AI-functies vereisen het Elite-abonnement." };
    }

    const ris = await loadInstructorRisLessonCard(service, tenant.id, lessonId);
    if (ris.settings.lessonCardMode !== "ris") {
      return { error: "RIS AI is alleen beschikbaar voor RIS-leskaarten." };
    }
    if (!ris.settings.aiAssistEnabled) {
      return { error: "AI-assistentie staat uit voor deze RIS-leskaart." };
    }
    if (!ris.card) {
      return { error: "Maak eerst minimaal een RIS-conceptscore aan." };
    }

    const signals = buildRisAiSignals(ris);
    if (signals.length === 0) {
      return { error: "Beoordeel eerst minimaal een RIS-script." };
    }

    const { data: studentRaw } = await service
      .from("students")
      .select("full_name")
      .eq("id", lesson.student_id)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const studentName =
      (studentRaw?.full_name as string | undefined) ?? "de leerling";

    await primeAiClientIfNeeded(service);
    const draft = await generateRisLessonPublicationDraft({
      studentName,
      assessments: signals,
      reflection: ris.reflection
        ? {
            wentWellText: ris.reflection.wentWellText,
            difficultText: ris.reflection.difficultText,
            nextLessonWish: ris.reflection.nextLessonWish,
            instructorContextNote: ris.reflection.instructorContextNote,
          }
        : undefined,
    });

    return { draft };
  } catch (error) {
    return { error: aiErr(error) };
  }
}
