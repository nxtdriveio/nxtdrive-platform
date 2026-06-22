"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  generateRisLessonPublicationDraft,
  type RisLessonPublicationDraft,
} from "@/lib/ai/leskaart-advisor";
import { primeAiClientIfNeeded } from "@/lib/ai/platform-config";
import { loadEndOfLessonSchedulingState } from "@/lib/end-of-lesson-scheduling/service";
import type { PlanningActorAccess } from "@/lib/planning-core";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import {
  completeInstructorNextLessonBooking,
  createBookingConfirmationsForCandidate,
  ensureBookingRequest,
  findBookingCandidateBySlot,
  replaceBookingCandidatePreferences,
  replaceBookingCandidates,
} from "@/lib/smart-booking/service";
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

function schedulingActor(ctx: {
  userId: string;
  tenantId: string;
  roles: readonly MemberRole[];
  isPlatformAdmin: boolean;
}): PlanningActorAccess {
  const canManageTenant =
    ctx.isPlatformAdmin || ctx.roles.includes("tenant_admin");
  return {
    userId: ctx.userId,
    roles: ctx.roles as PlanningActorAccess["roles"],
    isPlatformAdmin: ctx.isPlatformAdmin,
    tenantIds: canManageTenant ? [ctx.tenantId] : [],
    branchAccess: [{ tenantId: ctx.tenantId, branchIds: "all" }],
  };
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

type NextLessonSchedulingInput = {
  lessonId: string;
  startsAt: string;
  endsAt: string;
  durationMin: number;
};

async function loadValidatedNextLessonSuggestion(
  input: NextLessonSchedulingInput,
) {
  const { tenant, user, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const lessonId = requiredId(input.lessonId, "Les");
  const service = createServiceRoleClient();
  const { data: lessonRaw, error: lessonError } = await service
    .from("lessons")
    .select("id, student_id, instructor_id, branch_id, location, starts_at")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (lessonError) throw new Error(lessonError.message);
  const lesson = lessonRaw as {
    id: string;
    student_id: string;
    instructor_id: string | null;
    branch_id: string | null;
    location: string | null;
    starts_at: string;
  } | null;
  if (!lesson) throw new Error("Les niet gevonden.");
  const isAdmin = roles.includes("tenant_admin");
  if (!isAdmin && lesson.instructor_id !== user.id) {
    throw new Error("Je kunt alleen een volgende les plannen voor je eigen les.");
  }

  const state = await loadEndOfLessonSchedulingState(service, {
    tenant,
    lessonId,
    actor: schedulingActor({
      userId: user.id,
      tenantId: tenant.id,
      roles,
      isPlatformAdmin: Boolean(user.profile?.is_platform_admin),
    }),
  });
  if (state.nextLesson) {
    throw new Error("Er staat al een volgende les gepland voor deze leerling.");
  }
  const suggestion = state.suggestions.find(
    (item) =>
      item.startsAt === input.startsAt &&
      item.endsAt === input.endsAt &&
      item.durationMin === input.durationMin,
  );
  if (!suggestion) {
    throw new Error("Dit voorstel is niet meer beschikbaar. Vernieuw de leskaart.");
  }
  if (!state.instructorId) {
    throw new Error("Deze les heeft geen instructeur gekoppeld.");
  }

  return { tenant, user, service, lesson, state, suggestion };
}

async function createNextLessonCandidate(input: {
  service: ReturnType<typeof createServiceRoleClient>;
  tenantId: string;
  actorId: string;
  lessonId: string;
  studentId: string;
  instructorId: string;
  branchId: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  durationMin: number;
  score: number;
  reasons: string[];
  warnings: string[];
  mode: "direct" | "proposal";
}) {
  const requestId = await ensureBookingRequest(input.service, {
    tenantId: input.tenantId,
    branchId: input.branchId,
    source: "instructor_next_lesson",
    requesterType: "staff",
    entityType: "lesson",
    studentId: input.studentId,
    requestedDurationMin: input.durationMin,
    preferredInstructorId: input.instructorId,
    pickupLocation: input.location,
    desiredStartDate: input.startsAt.slice(0, 10),
    idempotencyKey: [
      "instructor-next-lesson",
      input.mode,
      input.lessonId,
      input.startsAt,
    ].join(":"),
    metadata: {
      source_lesson_id: input.lessonId,
      mode: input.mode,
    },
    actor: input.actorId,
  });

  await replaceBookingCandidates(input.service, {
    tenantId: input.tenantId,
    bookingRequestId: requestId,
    actor: input.actorId,
    candidates: [
      {
        rank: 1,
        instructorId: input.instructorId,
        candidateStudentId: input.studentId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        durationMin: input.durationMin,
        pickupLocation: input.location,
        score: input.score,
        scoreFactors: input.reasons.map((reason) => ({ label: reason })),
        warnings: input.warnings.map((warning) => ({ label: warning })),
        reason: input.reasons[0] ?? "Beste vervolg lesmoment",
        status: "selected",
        metadata: {
          source: "instructor_next_lesson",
          source_lesson_id: input.lessonId,
          mode: input.mode,
        },
      },
    ],
  });

  const candidateId = await findBookingCandidateBySlot(input.service, {
    tenantId: input.tenantId,
    bookingRequestId: requestId,
    instructorId: input.instructorId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  });
  if (!candidateId) {
    throw new Error("Lesvoorstel kon niet worden vastgelegd.");
  }

  await replaceBookingCandidatePreferences(input.service, {
    tenantId: input.tenantId,
    bookingRequestId: requestId,
    actor: input.actorId,
    preferences: [
      {
        bookingCandidateId: candidateId,
        preferenceRank: 1,
        requesterType: "staff",
        selectedByUserId: input.actorId,
        status: "selected",
        metadata: { source: "instructor_next_lesson", mode: input.mode },
      },
    ],
  });

  return { requestId, candidateId };
}

async function notifyNextLessonProposal(input: {
  service: ReturnType<typeof createServiceRoleClient>;
  tenantId: string;
  studentId: string;
  bookingRequestId: string;
  bookingCandidateId: string;
  startsAt: string;
  durationMin: number;
}) {
  const [{ data: studentRaw }, { data: guardianRows }] = await Promise.all([
    input.service
      .from("students")
      .select("user_id")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.studentId)
      .maybeSingle(),
    input.service
      .from("student_guardians")
      .select("user_id")
      .eq("tenant_id", input.tenantId)
      .eq("student_id", input.studentId),
  ]);
  const recipients = Array.from(
    new Set(
      [
        (studentRaw as { user_id?: string | null } | null)?.user_id,
        ...((guardianRows as Array<{ user_id: string | null }> | null) ?? []).map(
          (row) => row.user_id,
        ),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  if (recipients.length === 0) return;

  const rows = recipients.map((recipientId) => ({
    tenant_id: input.tenantId,
    recipient_user_id: recipientId,
    type: "instructor_next_lesson_proposal",
    title: "Voorstel voor je volgende rijles",
    body: "Je instructeur heeft een nieuw lesmoment voorgesteld.",
    link: "/student",
    related_type: "booking_candidate",
    related_id: input.bookingCandidateId,
    dedupe_key: `next-lesson:${input.bookingCandidateId}:${recipientId}`,
    payload: {
      booking_request_id: input.bookingRequestId,
      booking_candidate_id: input.bookingCandidateId,
      student_id: input.studentId,
      starts_at: input.startsAt,
      duration_min: input.durationMin,
    },
  }));

  const { error } = await input.service
    .from("app_notifications")
    .upsert(rows, {
      onConflict: "tenant_id,dedupe_key",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
}

export async function planInstructorNextLessonAction(
  input: NextLessonSchedulingInput,
): Promise<ActionResult<{ lessonId?: string }>> {
  try {
    const { tenant, user, service, lesson, suggestion } =
      await loadValidatedNextLessonSuggestion(input);
    if (!suggestion.canDirectPlan) {
      return {
        error:
          suggestion.warnings[0] ??
          "Deze leerling heeft onvoldoende tegoed om direct te plannen.",
      };
    }
    const { candidateId } = await createNextLessonCandidate({
      service,
      tenantId: tenant.id,
      actorId: user.id,
      lessonId: lesson.id,
      studentId: lesson.student_id,
      instructorId: lesson.instructor_id!,
      branchId: lesson.branch_id,
      location: lesson.location,
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
      durationMin: suggestion.durationMin,
      score: suggestion.score,
      reasons: suggestion.reasons,
      warnings: suggestion.warnings,
      mode: "direct",
    });
    const nextLessonId = await completeInstructorNextLessonBooking(service, {
      tenantId: tenant.id,
      bookingCandidateId: candidateId,
      actor: user.id,
    });
    revalidatePath("/instructor");
    revalidatePath(`/instructor/evaluations/${lesson.id}`);
    revalidatePath("/student");
    revalidatePath(`/backoffice/leerlingen/${lesson.student_id}`);
    return { lessonId: nextLessonId };
  } catch (error) {
    return { error: err(error) };
  }
}

export async function proposeInstructorNextLessonAction(
  input: NextLessonSchedulingInput,
): Promise<ActionResult<{ bookingRequestId?: string }>> {
  try {
    const { tenant, user, service, lesson, suggestion } =
      await loadValidatedNextLessonSuggestion(input);
    const { requestId, candidateId } = await createNextLessonCandidate({
      service,
      tenantId: tenant.id,
      actorId: user.id,
      lessonId: lesson.id,
      studentId: lesson.student_id,
      instructorId: lesson.instructor_id!,
      branchId: lesson.branch_id,
      location: lesson.location,
      startsAt: suggestion.startsAt,
      endsAt: suggestion.endsAt,
      durationMin: suggestion.durationMin,
      score: suggestion.score,
      reasons: suggestion.reasons,
      warnings: suggestion.warnings,
      mode: "proposal",
    });
    await createBookingConfirmationsForCandidate(service, {
      tenantId: tenant.id,
      bookingRequestId: requestId,
      bookingCandidateId: candidateId,
      actor: user.id,
      requiresBackoffice: false,
      requiresInstructor: false,
      requiresStudent: true,
      studentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: { source: "instructor_next_lesson" },
    });
    await notifyNextLessonProposal({
      service,
      tenantId: tenant.id,
      studentId: lesson.student_id,
      bookingRequestId: requestId,
      bookingCandidateId: candidateId,
      startsAt: suggestion.startsAt,
      durationMin: suggestion.durationMin,
    });
    revalidatePath("/instructor");
    revalidatePath(`/instructor/evaluations/${lesson.id}`);
    revalidatePath("/student");
    revalidatePath(`/backoffice/leerlingen/${lesson.student_id}`);
    return { bookingRequestId: requestId };
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
