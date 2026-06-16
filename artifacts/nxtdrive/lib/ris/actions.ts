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
import { requireStudentBackofficeAccess } from "@/lib/students/access";
import type { MemberRole } from "@/lib/types";
import {
  normalizeRisStep,
  translateRisStepForStudent,
  type RISStepValue,
} from "@workspace/leskaart";
import {
  loadInstructorRisLessonCard,
  type InstructorRisLessonCard,
  type LessonCardMode,
} from "./data";
import {
  canActivateRisAfterMigration,
  loadRisLegacyMigrationReport,
} from "./migration";

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

export async function activateRisAfterMigrationCheckAction(): Promise<ActionResult> {
  try {
    const { tenant } = await requireActiveTenant(["tenant_admin"]);
    const service = createServiceRoleClient();
    const report = await loadRisLegacyMigrationReport(service, tenant.id);

    if (!canActivateRisAfterMigration(report)) {
      return {
        error:
          report.blockingReasons[0] ??
          "RIS kan nog niet worden geactiveerd. Controleer de migratiepreflight.",
      };
    }
    if (!report.risVersionId) {
      return { error: "Geen actieve RIS-versie gevonden." };
    }
    if (report.lessonCardMode === "ris") {
      return {};
    }

    const result = await setTenantRisSettingsAction({
      lessonCardMode: "ris",
      activeRisVersionId: report.risVersionId,
      aiAssistEnabled: true,
    });
    if (result.error) return result;

    revalidatePath("/backoffice/ris");
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
  conceptRisStep: RISStepValue | number | "N";
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
    if (!step) return { error: "Kies een geldige RIS stap (N of 1 t/m 8)." };

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
    revalidatePath(`/instructor/${input.lessonId}`);
    return { assessmentId: typeof data === "string" ? data : undefined };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function setGuidedReflectionAction(input: {
  lessonCardId: string;
  studentPresent?: boolean;
  ratingOverall?: number | null;
  ratingIndependence?: number | null;
  wentWellText?: string | null;
  difficultText?: string | null;
  nextLessonWish?: string | null;
  instructorContextNote?: string | null;
}): Promise<ActionResult> {
  try {
    const { tenant, user } = await requireActiveTenant([
      "instructor",
      "tenant_admin",
    ]);
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("set_guided_reflection", {
      p_lesson_card_id: requiredId(input.lessonCardId, "RIS-leskaart"),
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_student_present: input.studentPresent ?? true,
      p_rating_overall: input.ratingOverall ?? null,
      p_rating_independence: input.ratingIndependence ?? null,
      p_went_well_text: input.wentWellText ?? null,
      p_difficult_text: input.difficultText ?? null,
      p_next_lesson_wish: input.nextLessonWish ?? null,
      p_instructor_context_note: input.instructorContextNote ?? null,
    });
    if (error) return { error: error.message };
    revalidatePath("/instructor");
    void data;
    return {};
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
    if (input.lessonId) revalidatePath(`/instructor/${input.lessonId}`);
    if (input.studentId) {
      revalidatePath("/student/voortgang");
      revalidatePath(`/backoffice/leerlingen/${input.studentId}`);
    }
    return {};
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
