import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRisTree,
  computeRisProgress,
  translateRisStepForStudent,
  type RISModuleProgress,
  type RISProgressInput,
  type RisPerformanceOutcome,
  type RisSafetyStatus,
  type RISStepDefinition,
  type RISStepValue,
  type RISTreeModule,
} from "@workspace/leskaart";
import type { BranchAccessScope } from "@/lib/permissions";

export type LessonCardMode = "legacy" | "ris";

export type TenantRisSettings = {
  tenantId: string;
  lessonCardMode: LessonCardMode;
  activeRisVersionId: string | null;
  aiAssistEnabled: boolean;
};

export type RisLessonCardStatus =
  | "draft"
  | "completion_in_progress"
  | "ready_to_publish"
  | "published"
  | "published_to_student"
  | "waiting_for_student_response"
  | "fully_completed"
  | "archived";

export const STUDENT_VISIBLE_RIS_CARD_STATUSES = [
  "published",
  "published_to_student",
  "waiting_for_student_response",
  "fully_completed",
] as const satisfies readonly RisLessonCardStatus[];

export const STAFF_OPEN_RIS_CARD_STATUSES = [
  "draft",
  "completion_in_progress",
  "ready_to_publish",
] as const satisfies readonly RisLessonCardStatus[];

export type RisReflectionRating =
  | "very_insufficient"
  | "insufficient"
  | "moderate"
  | "sufficient"
  | "very_sufficient";

export const RIS_REFLECTION_RATING_LABELS: Record<RisReflectionRating, string> = {
  very_insufficient: "Zeer onvoldoende",
  insufficient: "Onvoldoende",
  moderate: "Matig",
  sufficient: "Voldoende",
  very_sufficient: "Zeer voldoende",
};

export type RisReflectionEntryMode =
  | "student_self"
  | "instructor_assisted";

export const RIS_REFLECTION_ENTRY_MODE_LABELS: Record<
  RisReflectionEntryMode,
  string
> = {
  student_self: "Door leerling zelf",
  instructor_assisted: "Met hulp van instructeur",
};

export type RisCatalog = {
  version: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  } | null;
  tree: RISTreeModule[];
  steps: RISStepDefinition[];
};

export type RisScriptAssessment = {
  id: string;
  lessonCardId: string;
  scriptId: string;
  scriptVariantId: string | null;
  previousRisStep: RISStepValue | null;
  conceptRisStep: RISStepValue | null;
  finalRisStep: RISStepValue | null;
  status: string;
  isAttentionPoint: boolean;
  isFeaturedForLesson: boolean;
  shouldRepeat: boolean;
  readyForTest: boolean;
  performanceOutcome: RisPerformanceOutcome | null;
  safetyStatus: RisSafetyStatus | null;
  instructorNote: string | null;
  studentVisibleNote: string | null;
};

export type RisLessonCard = {
  id: string;
  tenantId: string;
  lessonId: string;
  studentId: string;
  instructorId: string;
  risVersionId: string;
  publicationStatus: RisLessonCardStatus;
  internalSummary: string | null;
  studentFriendlySummary: string | null;
  homeworkOrNextFocus: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
};

export type StudentPostLessonResponse = {
  id: string;
  lessonCardId: string;
  studentId: string;
  commentText: string | null;
  nextLessonWish: string | null;
  skippedResponse: boolean;
  submittedAt: string;
};

export type StudentRisPublishedCard = Omit<RisLessonCard, "internalSummary"> & {
  reflection: RisGuidedReflection | null;
  response: StudentPostLessonResponse | null;
};

export type RisGuidedReflection = {
  lessonCardId: string;
  studentPresent: boolean;
  entryMode: RisReflectionEntryMode;
  capturedSurface: string | null;
  overallRating: RisReflectionRating | null;
  independenceRating: RisReflectionRating | null;
  insightRating: RisReflectionRating | null;
  confidenceRating: RisReflectionRating | null;
  oneSentenceReflection: string | null;
  ratingOverall: number | null;
  ratingIndependence: number | null;
  wentWellText: string | null;
  difficultText: string | null;
  nextLessonWish: string | null;
  instructorContextNote: string | null;
  capturedAt: string | null;
  publishedAt: string | null;
};

export type InstructorRisLessonCard = {
  settings: TenantRisSettings;
  catalog: RisCatalog;
  card: RisLessonCard | null;
  assessments: RisScriptAssessment[];
  reflection: RisGuidedReflection | null;
};

export type StudentRisProgressItem = {
  scriptId: string;
  scriptVariantId: string | null;
  currentFinalStep: RISStepValue | null;
  studentLabel: string;
  phase: string;
  lastAssessedLessonId: string | null;
  lastAssessedAt: string | null;
  isAttentionPoint: boolean;
  isCompleted: boolean;
  readyForModuleTest: boolean;
};

export type StudentRisProgress = {
  settings: TenantRisSettings;
  catalog: RisCatalog;
  progress: StudentRisProgressItem[];
  moduleProgress: RISModuleProgress[];
  progressPct: number;
  publishedCards: StudentRisPublishedCard[];
};

export type PlanningCardGoalStatus =
  | "active"
  | "achieved"
  | "in_progress"
  | "carry_forward"
  | "archived";

export type PlanningCardGoal = {
  id: string;
  title: string;
  description: string | null;
  status: PlanningCardGoalStatus;
  sortOrder: number;
};

export type PlanningCard = {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  nextLessonId: string | null;
  previousLessonCardId: string | null;
  status:
    | "draft"
    | "submitted_by_instructor"
    | "shared_with_student"
    | "used_in_lesson"
    | "evaluated"
    | "archived";
  studentVisibleSummary: string | null;
  sharedWithStudent: boolean;
  sharedAt: string | null;
  confirmedAt: string | null;
  goals: PlanningCardGoal[];
};

export type StudentRisLessonCardDetail = {
  card: StudentRisPublishedCard | null;
  assessments: Array<
    Omit<
      RisScriptAssessment,
      "conceptRisStep" | "instructorNote"
    > & {
      scriptTitle: string;
      moduleNumber: number;
      studentLabel: string;
    }
  >;
  planningCard: PlanningCard | null;
};

export type BackofficeRisOverview = {
  settings: TenantRisSettings;
  draftLessonCards: number;
  publishedLessonCards: number;
  attentionPoints: number;
  readyForModuleTest: number;
  moduleTestsPlanned: number;
  report: BackofficeRisReport;
  students: BackofficeRisStudentSummary[];
  attentionRows: BackofficeRisAttentionRow[];
  draftCards: BackofficeRisDraftCard[];
  moduleTests: BackofficeRisModuleTest[];
  instructorFollowups: BackofficeRisInstructorFollowup[];
};

export type BackofficeRisReport = {
  weakScripts: BackofficeRisWeakScript[];
  moduleAdvice: BackofficeRisModuleAdvice[];
  internalAttentionPoints: string[];
  nextActions: string[];
};

export type BackofficeRisWeakScript = {
  studentId: string;
  studentName: string;
  scriptId: string;
  scriptTitle: string;
  moduleNumber: number;
  currentFinalStep: RISStepValue | null;
  studentLabel: string;
  reason: string;
};

export type BackofficeRisModuleAdvice = {
  moduleNumber: number;
  label: string;
  progressPct: number;
  attentionPoints: number;
  readyForTest: number;
  advice: string;
};

export type BackofficeRisStudentSummary = {
  studentId: string;
  fullName: string;
  branchId: string | null;
  progressPct: number;
  assessedScripts: number;
  totalScripts: number;
  attentionPoints: number;
  readyForModuleTestCount: number;
  moduleProgress: RISModuleProgress[];
};

export type BackofficeRisAttentionRow = {
  studentId: string;
  fullName: string;
  scriptId: string;
  scriptTitle: string;
  currentFinalStep: RISStepValue | null;
  studentLabel: string;
  lastAssessedAt: string | null;
  instructorId: string | null;
  instructorName: string;
};

export type BackofficeRisDraftCard = {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  createdAt: string;
  updatedAt: string;
};

export type BackofficeRisModuleTest = {
  id: string;
  studentId: string;
  studentName: string;
  moduleNumber: number;
  testType: string;
  result: string;
  plannedAt: string | null;
  completedAt: string | null;
  instructorId: string | null;
  instructorName: string | null;
  cbrReference: string | null;
  notes: string | null;
  exemptionSpecialManoeuvres: boolean;
};

export type BackofficeRisInstructorFollowup = {
  instructorId: string;
  instructorName: string;
  draftLessonCards: number;
  attentionPoints: number;
  readyForModuleTest: number;
};

export async function loadTenantRisSettings(
  client: SupabaseClient,
  tenantId: string,
): Promise<TenantRisSettings> {
  const { data, error } = await client
    .from("tenant_ris_settings")
    .select("tenant_id, lesson_card_mode, active_ris_version_id, ai_assist_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`RIS settings laden mislukt (tenant=${tenantId}): ${error.message}`);
  }

  return {
    tenantId,
    lessonCardMode:
      data?.lesson_card_mode === "ris" || data?.lesson_card_mode === "legacy"
        ? data.lesson_card_mode
        : "ris",
    activeRisVersionId: (data?.active_ris_version_id as string | null | undefined) ?? null,
    aiAssistEnabled: data?.ai_assist_enabled !== false,
  };
}

export async function loadRisCatalog(
  client: SupabaseClient,
  risVersionId: string | null,
): Promise<RisCatalog> {
  const versionQuery = client
    .from("ris_versions")
    .select("id, name, description, is_active")
    .eq("is_active", true)
    .order("active_from", { ascending: false })
    .limit(1);

  const versionRes = risVersionId
    ? await client
        .from("ris_versions")
        .select("id, name, description, is_active")
        .eq("id", risVersionId)
        .maybeSingle()
    : await versionQuery.maybeSingle();

  if (versionRes.error) {
    throw new Error(`RIS versie laden mislukt: ${versionRes.error.message}`);
  }

  const version = versionRes.data as
    | { id: string; name: string; description: string | null; is_active: boolean }
    | null;
  if (!version) return { version: null, tree: [], steps: [] };

  const [modulesRes, categoriesRes, scriptsRes, variantsRes, stepsRes] =
    await Promise.all([
      client
        .from("ris_modules")
        .select("id, module_number, title, description, sort_order")
        .eq("ris_version_id", version.id),
      client
        .from("ris_categories")
        .select("id, ris_module_id, title, sort_order"),
      client
        .from("ris_scripts")
        .select("id, module_id, category_id, script_number, code, title, description_short, sort_order, is_active")
        .eq("ris_version_id", version.id)
        .eq("is_active", true),
      client
        .from("ris_script_variants")
        .select("id, script_id, code, title, sort_order, is_active")
        .eq("is_active", true),
      client
        .from("ris_step_definitions")
        .select("step_value, instructor_label, student_label, explanation, phase, sort_order")
        .eq("ris_version_id", version.id)
        .order("sort_order", { ascending: true }),
    ]);

  const ctx = `RIS versie=${version.id}`;
  if (modulesRes.error) throw new Error(`RIS modules laden mislukt (${ctx}): ${modulesRes.error.message}`);
  if (categoriesRes.error) throw new Error(`RIS categorieen laden mislukt (${ctx}): ${categoriesRes.error.message}`);
  if (scriptsRes.error) throw new Error(`RIS scripts laden mislukt (${ctx}): ${scriptsRes.error.message}`);
  if (variantsRes.error) throw new Error(`RIS varianten laden mislukt (${ctx}): ${variantsRes.error.message}`);
  if (stepsRes.error) throw new Error(`RIS-scoredefinities laden mislukt (${ctx}): ${stepsRes.error.message}`);

  const moduleIds = new Set((modulesRes.data ?? []).map((row) => row.id as string));
  const scriptIds = new Set((scriptsRes.data ?? []).map((row) => row.id as string));
  const categories = (categoriesRes.data ?? []).filter((row) =>
    moduleIds.has(row.ris_module_id as string),
  );
  const variants = (variantsRes.data ?? []).filter((row) =>
    scriptIds.has(row.script_id as string),
  );

  return {
    version: {
      id: version.id,
      name: version.name,
      description: version.description,
      isActive: version.is_active,
    },
    tree: buildRisTree({
      modules: modulesRes.data ?? [],
      categories,
      scripts: scriptsRes.data ?? [],
      variants,
    }),
    steps: (stepsRes.data ?? []).map((row) => ({
      stepValue: row.step_value as RISStepValue,
      instructorLabel: row.instructor_label as string,
      studentLabel: row.student_label as string,
      explanation: row.explanation as string,
      phase: row.phase as RISStepDefinition["phase"],
      sortOrder: row.sort_order as number,
    })),
  };
}

export async function loadInstructorRisLessonCard(
  client: SupabaseClient,
  tenantId: string,
  lessonId: string,
): Promise<InstructorRisLessonCard> {
  const settings = await loadTenantRisSettings(client, tenantId);
  const catalog = await loadRisCatalog(client, settings.activeRisVersionId);
  const { data: cardRaw, error: cardError } = await client
    .from("ris_lesson_cards")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (cardError) {
    throw new Error(`RIS leskaart laden mislukt (lesson=${lessonId}): ${cardError.message}`);
  }

  const card = cardRaw ? mapLessonCard(cardRaw) : null;
  if (!card) {
    return { settings, catalog, card: null, assessments: [], reflection: null };
  }

  const [assessmentsRes, reflectionRes] = await Promise.all([
    client
      .from("ris_script_assessments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("lesson_card_id", card.id),
    client
      .from("ris_guided_reflections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("lesson_card_id", card.id)
      .maybeSingle(),
  ]);

  if (assessmentsRes.error) {
    throw new Error(`RIS beoordelingen laden mislukt (lesson=${lessonId}): ${assessmentsRes.error.message}`);
  }
  if (reflectionRes.error) {
    throw new Error(`RIS reflectie laden mislukt (lesson=${lessonId}): ${reflectionRes.error.message}`);
  }

  return {
    settings,
    catalog,
    card,
    assessments: (assessmentsRes.data ?? []).map(mapAssessment),
    reflection: reflectionRes.data ? mapGuidedReflection(reflectionRes.data) : null,
  };
}

export async function loadStudentRisProgress(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentRisProgress> {
  const settings = await loadTenantRisSettings(client, tenantId);
  const catalog = await loadRisCatalog(client, settings.activeRisVersionId);

  const [progressRes, cardsRes] = await Promise.all([
    client
      .from("student_ris_progress")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    client
      .from("ris_lesson_cards")
      .select(
        "id, tenant_id, lesson_id, student_id, instructor_id, ris_version_id, publication_status, student_friendly_summary, homework_or_next_focus, published_at, published_by",
      )
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .in("publication_status", Array.from(STUDENT_VISIBLE_RIS_CARD_STATUSES))
      .order("published_at", { ascending: false }),
  ]);

  if (progressRes.error) {
    throw new Error(`RIS voortgang laden mislukt (student=${studentId}): ${progressRes.error.message}`);
  }
  if (cardsRes.error) {
    throw new Error(`RIS gepubliceerde leskaarten laden mislukt (student=${studentId}): ${cardsRes.error.message}`);
  }

  const cards = (cardsRes.data ?? []).map(mapLessonCard);
  const cardIds = cards.map((card) => card.id);
  const [reflectionsRes, responsesRes] =
    cardIds.length > 0
      ? await Promise.all([
          client
            .from("ris_guided_reflections")
            .select(
              "lesson_card_id, student_present, entry_mode, captured_surface, overall_rating, independence_rating, insight_rating, confidence_rating, one_sentence_reflection, rating_overall, rating_independence, went_well_text, difficult_text, next_lesson_wish, captured_at, published_at",
            )
            .eq("tenant_id", tenantId)
            .in("lesson_card_id", cardIds),
          client
            .from("student_post_lesson_responses")
            .select("id, lesson_card_id, student_id, comment_text, next_lesson_wish, skipped_response, submitted_at")
            .eq("tenant_id", tenantId)
            .in("lesson_card_id", cardIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  if (reflectionsRes.error) {
    throw new Error(
      `RIS reflecties laden mislukt (student=${studentId}): ${reflectionsRes.error.message}`,
    );
  }
  if (responsesRes.error) {
    throw new Error(
      `RIS leerlingreacties laden mislukt (student=${studentId}): ${responsesRes.error.message}`,
    );
  }

  const reflectionByCardId = new Map(
    ((reflectionsRes.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.lesson_card_id as string,
      mapGuidedReflection(row),
    ]),
  );
  const responseByCardId = new Map(
    ((responsesRes.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.lesson_card_id as string,
      mapStudentPostLessonResponse(row),
    ]),
  );

  const moduleByScript = new Map<string, number>();
  for (const module of catalog.tree) {
    for (const category of module.categories) {
      for (const script of category.scripts) {
        moduleByScript.set(script.id, module.moduleNumber);
      }
    }
  }

  const progress = (progressRes.data ?? []).map((row) => {
    const step = (row.current_final_step as RISStepValue | null) ?? null;
    const definition = translateRisStepForStudent(step, catalog.steps);
    return {
      scriptId: row.script_id as string,
      scriptVariantId: (row.script_variant_id as string | null) ?? null,
      currentFinalStep: step,
      studentLabel: definition.studentLabel,
      phase: definition.phase,
      lastAssessedLessonId: (row.last_assessed_lesson_id as string | null) ?? null,
      lastAssessedAt: (row.last_assessed_at as string | null) ?? null,
      isAttentionPoint: Boolean(row.is_attention_point),
      isCompleted: Boolean(row.is_completed),
      readyForModuleTest: Boolean(row.ready_for_module_test),
    };
  });

  const inputs: RISProgressInput[] = catalog.tree.flatMap((module) =>
    module.categories.flatMap((category) =>
      category.scripts.map((script) => {
        const row = progress.find((item) => item.scriptId === script.id);
        return {
          scriptId: script.id,
          moduleNumber: moduleByScript.get(script.id) ?? module.moduleNumber,
          step: row?.currentFinalStep ?? null,
          isAttentionPoint: row?.isAttentionPoint ?? false,
          readyForModuleTest: row?.readyForModuleTest ?? false,
        };
      }),
    ),
  );
  const computed = computeRisProgress(inputs);

  return {
    settings,
    catalog,
    progress,
    moduleProgress: computed.modules,
    progressPct: computed.progressPct,
    publishedCards: cards.map((card) =>
      toStudentPublishedCard(
        card,
        reflectionByCardId.get(card.id) ?? null,
        responseByCardId.get(card.id) ?? null,
      ),
    ),
  };
}

export async function loadStudentRisLessonCardDetail(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  lessonId: string,
): Promise<StudentRisLessonCardDetail> {
  const settings = await loadTenantRisSettings(client, tenantId);
  const catalog = await loadRisCatalog(client, settings.activeRisVersionId);
  const { data: cardRaw, error: cardError } = await client
    .from("ris_lesson_cards")
    .select(
      "id, tenant_id, lesson_id, student_id, instructor_id, ris_version_id, publication_status, student_friendly_summary, homework_or_next_focus, published_at, published_by",
    )
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("lesson_id", lessonId)
    .in("publication_status", Array.from(STUDENT_VISIBLE_RIS_CARD_STATUSES))
    .maybeSingle();

  if (cardError) {
    throw new Error(`RIS leskaart laden mislukt (lesson=${lessonId}): ${cardError.message}`);
  }

  const planningCard = await loadStudentPlanningCardForLesson(client, tenantId, studentId, lessonId);

  if (!cardRaw) {
    return { card: null, assessments: [], planningCard };
  }

  const card = mapLessonCard(cardRaw);
  const [assessmentsRes, reflectionRes, responseRes] = await Promise.all([
    client
      .from("ris_script_assessments")
      .select(
        "id, lesson_card_id, script_id, script_variant_id, previous_ris_step, final_ris_step, final_performance_outcome, final_safety_status, status, is_attention_point, is_featured_for_lesson, should_repeat, ready_for_test, student_visible_note",
      )
      .eq("tenant_id", tenantId)
      .eq("lesson_card_id", card.id)
      .not("final_ris_step", "is", null),
    client
      .from("ris_guided_reflections")
      .select(
        "lesson_card_id, student_present, entry_mode, captured_surface, overall_rating, independence_rating, insight_rating, confidence_rating, one_sentence_reflection, rating_overall, rating_independence, went_well_text, difficult_text, next_lesson_wish, captured_at, published_at",
      )
      .eq("tenant_id", tenantId)
      .eq("lesson_card_id", card.id)
      .maybeSingle(),
    client
      .from("student_post_lesson_responses")
      .select("id, lesson_card_id, student_id, comment_text, next_lesson_wish, skipped_response, submitted_at")
      .eq("tenant_id", tenantId)
      .eq("lesson_card_id", card.id)
      .maybeSingle(),
  ]);

  if (assessmentsRes.error) {
    throw new Error(`RIS leskaartonderdelen laden mislukt: ${assessmentsRes.error.message}`);
  }
  if (reflectionRes.error) {
    throw new Error(`RIS reflectie laden mislukt: ${reflectionRes.error.message}`);
  }
  if (responseRes.error) {
    throw new Error(`RIS leerlingreactie laden mislukt: ${responseRes.error.message}`);
  }

  const assessments = ((assessmentsRes.data ?? []) as Record<string, unknown>[]).map((row) => {
    const mapped = mapAssessment(row);
    const finalStep = mapped.finalRisStep;
    const definition = translateRisStepForStudent(finalStep, catalog.steps);
    return {
      id: mapped.id,
      lessonCardId: mapped.lessonCardId,
      scriptId: mapped.scriptId,
      scriptVariantId: mapped.scriptVariantId,
      previousRisStep: mapped.previousRisStep,
      finalRisStep: mapped.finalRisStep,
      status: mapped.status,
      isAttentionPoint: mapped.isAttentionPoint,
      isFeaturedForLesson: mapped.isFeaturedForLesson,
      shouldRepeat: mapped.shouldRepeat,
      readyForTest: mapped.readyForTest,
      studentVisibleNote: mapped.studentVisibleNote,
      scriptTitle: scriptTitleForCatalog(catalog, mapped.scriptId),
      moduleNumber: scriptModuleForCatalog(catalog, mapped.scriptId),
      studentLabel: definition.studentLabel,
    };
  });

  return {
    card: toStudentPublishedCard(
      card,
      reflectionRes.data ? mapGuidedReflection(reflectionRes.data) : null,
      responseRes.data ? mapStudentPostLessonResponse(responseRes.data) : null,
    ),
    assessments,
    planningCard,
  };
}

export async function loadStudentPlanningCardForLesson(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  lessonId: string,
  options: { includeDraft?: boolean } = {},
): Promise<PlanningCard | null> {
  let query = client
    .from("planning_cards")
    .select(
      "id, tenant_id, student_id, instructor_id, next_lesson_id, previous_lesson_card_id, status, student_visible_summary, shared_with_student, shared_at, confirmed_at",
    )
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("next_lesson_id", lessonId);

  if (!options.includeDraft) {
    query = query.eq("shared_with_student", true);
  }

  const { data: cardRaw, error: cardError } = await query.maybeSingle();

  if (cardError) {
    throw new Error(`Plankaart laden mislukt (lesson=${lessonId}): ${cardError.message}`);
  }
  if (!cardRaw) return null;
  return hydratePlanningCard(client, cardRaw as Record<string, unknown>);
}

export async function loadLatestStudentPlanningCard(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<PlanningCard | null> {
  const { data: cardRaw, error } = await client
    .from("planning_cards")
    .select(
      "id, tenant_id, student_id, instructor_id, next_lesson_id, previous_lesson_card_id, status, student_visible_summary, shared_with_student, shared_at, confirmed_at",
    )
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("shared_with_student", true)
    .order("shared_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Laatste plankaart laden mislukt (student=${studentId}): ${error.message}`);
  }
  if (!cardRaw) return null;
  return hydratePlanningCard(client, cardRaw as Record<string, unknown>);
}

export async function loadBackofficeRisOverview(
  client: SupabaseClient,
  tenantId: string,
  options: { branchScope?: BranchAccessScope } = {},
): Promise<BackofficeRisOverview> {
  const settings = await loadTenantRisSettings(client, tenantId);
  const catalog = await loadRisCatalog(client, settings.activeRisVersionId);
  let studentsQuery = client
    .from("students")
    .select("id, full_name, branch_id")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (options.branchScope?.scope_type === "branches") {
    if (options.branchScope.branch_ids.length === 0) {
      return emptyBackofficeRisOverview(settings);
    }
    studentsQuery = studentsQuery.in("branch_id", options.branchScope.branch_ids);
  }

  const studentsRes = await studentsQuery.order("full_name", { ascending: true });
  if (studentsRes.error) {
    throw new Error(
      `RIS backoffice leerlingen laden mislukt (tenant=${tenantId}): ${studentsRes.error.message}`,
    );
  }

  const studentRows = (studentsRes.data ?? []) as Array<{
    id: string;
    full_name: string;
    branch_id: string | null;
  }>;
  const studentIds = studentRows.map((student) => student.id);
  if (studentIds.length === 0) {
    return emptyBackofficeRisOverview(settings);
  }

  const [progressRes, cardsRes, testsRes] = await Promise.all([
    client
      .from("student_ris_progress")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds),
    client
      .from("ris_lesson_cards")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .order("updated_at", { ascending: false }),
    client
      .from("ris_module_tests")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .order("planned_at", { ascending: true, nullsFirst: false }),
  ]);

  if (progressRes.error) {
    throw new Error(
      `RIS backoffice voortgang laden mislukt (tenant=${tenantId}): ${progressRes.error.message}`,
    );
  }
  if (cardsRes.error) {
    throw new Error(
      `RIS backoffice leskaarten laden mislukt (tenant=${tenantId}): ${cardsRes.error.message}`,
    );
  }
  if (testsRes.error) {
    throw new Error(
      `RIS backoffice moduletoetsen laden mislukt (tenant=${tenantId}): ${testsRes.error.message}`,
    );
  }

  const progressRows = (progressRes.data ?? []) as RisProgressDbRow[];
  const cardRows = (cardsRes.data ?? []) as RisLessonCardDbRow[];
  const testRows = (testsRes.data ?? []) as RisModuleTestDbRow[];
  const studentNameById = new Map(studentRows.map((student) => [student.id, student.full_name]));
  const instructorIds = Array.from(
    new Set(
      [
        ...cardRows.map((card) => card.instructor_id),
        ...testRows.map((test) => test.instructor_id).filter(Boolean),
      ].filter((id): id is string => Boolean(id)),
    ),
  );
  const instructorNames = await loadProfileNames(client, instructorIds);
  const moduleByScript = moduleMapForCatalog(catalog);
  const progressByStudent = groupBy(progressRows, (row) => row.student_id);
  const instructorByLessonId = instructorByLesson(cardRows);

  const students = studentRows.map((student) => {
    const rows = progressByStudent.get(student.id) ?? [];
    const computed = computeRisProgress(
      catalog.tree.flatMap((module) =>
        module.categories.flatMap((category) =>
          category.scripts.map((script) => {
            const row = rows.find((item) => item.script_id === script.id);
            return {
              scriptId: script.id,
              moduleNumber: moduleByScript.get(script.id) ?? module.moduleNumber,
              step: (row?.current_final_step as RISStepValue | null | undefined) ?? null,
              isAttentionPoint: row?.is_attention_point ?? false,
              readyForModuleTest: row?.ready_for_module_test ?? false,
            };
          }),
        ),
      ),
    );

    return {
      studentId: student.id,
      fullName: student.full_name,
      branchId: student.branch_id,
      progressPct: computed.progressPct,
      assessedScripts: computed.assessedScripts,
      totalScripts: computed.totalScripts,
      attentionPoints: rows.filter((row) => row.is_attention_point).length,
      readyForModuleTestCount: rows.filter((row) => row.ready_for_module_test).length,
      moduleProgress: computed.modules,
    };
  });

  const attentionRows = progressRows
    .filter((row) => row.is_attention_point)
    .sort((left, right) => (right.last_assessed_at ?? "").localeCompare(left.last_assessed_at ?? ""))
    .slice(0, 12)
    .map((row) => {
      const instructorId =
        row.last_assessed_lesson_id
          ? instructorByLessonId.get(row.last_assessed_lesson_id) ?? null
          : null;
      const definition = translateRisStepForStudent(
        (row.current_final_step as RISStepValue | null | undefined) ?? null,
        catalog.steps,
      );
      return {
        studentId: row.student_id,
        fullName: studentNameById.get(row.student_id) ?? "Leerling",
        scriptId: row.script_id,
        scriptTitle: scriptTitleForCatalog(catalog, row.script_id),
        currentFinalStep: (row.current_final_step as RISStepValue | null | undefined) ?? null,
        studentLabel: definition.studentLabel,
        lastAssessedAt: row.last_assessed_at,
        instructorId,
        instructorName: instructorId ? instructorNames.get(instructorId) ?? "Instructeur" : "Onbekend",
      };
    });

  const draftCards = cardRows
    .filter((card) =>
      (STAFF_OPEN_RIS_CARD_STATUSES as readonly string[]).includes(card.publication_status),
    )
    .slice(0, 12)
    .map((card) => ({
      id: card.id,
      lessonId: card.lesson_id,
      studentId: card.student_id,
      studentName: studentNameById.get(card.student_id) ?? "Leerling",
      instructorId: card.instructor_id,
      instructorName: instructorNames.get(card.instructor_id) ?? "Instructeur",
      createdAt: card.created_at,
      updatedAt: card.updated_at,
    }));

  const moduleTests = testRows.slice(0, 12).map((test) => ({
    id: test.id,
    studentId: test.student_id,
    studentName: studentNameById.get(test.student_id) ?? "Leerling",
    moduleNumber: test.module_number,
    testType: test.test_type,
    result: test.result,
    plannedAt: test.planned_at,
    completedAt: test.completed_at,
    instructorId: test.instructor_id,
    instructorName: test.instructor_id
      ? instructorNames.get(test.instructor_id) ?? "Instructeur"
      : null,
    cbrReference: test.cbr_reference,
    notes: test.notes,
    exemptionSpecialManoeuvres: test.exemption_special_manoeuvres,
  }));

  const instructorFollowups = buildInstructorFollowups({
    cardRows,
    progressRows,
    instructorNames,
    instructorByLessonId,
  });
  const report = buildBackofficeRisReport({
    students,
    progressRows,
    catalog,
    studentNameById,
    instructorFollowups,
    draftCards,
  });

  return {
    settings,
    draftLessonCards: cardRows.filter((card) =>
      (STAFF_OPEN_RIS_CARD_STATUSES as readonly string[]).includes(card.publication_status),
    ).length,
    publishedLessonCards: cardRows.filter((card) =>
      (STUDENT_VISIBLE_RIS_CARD_STATUSES as readonly string[]).includes(card.publication_status),
    ).length,
    attentionPoints: progressRows.filter((row) => row.is_attention_point).length,
    readyForModuleTest: progressRows.filter((row) => row.ready_for_module_test).length,
    moduleTestsPlanned: testRows.filter((test) => test.result === "planned").length,
    report,
    students,
    attentionRows,
    draftCards,
    moduleTests,
    instructorFollowups,
  };
}

type RisProgressDbRow = {
  student_id: string;
  script_id: string;
  script_variant_id: string | null;
  current_final_step: RISStepValue | null;
  last_assessed_lesson_id: string | null;
  last_assessed_at: string | null;
  is_attention_point: boolean;
  is_completed: boolean;
  ready_for_module_test: boolean;
};

type RisLessonCardDbRow = {
  id: string;
  lesson_id: string;
  student_id: string;
  instructor_id: string;
  publication_status: RisLessonCard["publicationStatus"];
  created_at: string;
  updated_at: string;
};

type RisModuleTestDbRow = {
  id: string;
  student_id: string;
  module_number: number;
  test_type: string;
  result: string;
  planned_at: string | null;
  completed_at: string | null;
  instructor_id: string | null;
  cbr_reference: string | null;
  notes: string | null;
  exemption_special_manoeuvres: boolean;
};

function emptyBackofficeRisOverview(settings: TenantRisSettings): BackofficeRisOverview {
  return {
    settings,
    draftLessonCards: 0,
    publishedLessonCards: 0,
    attentionPoints: 0,
    readyForModuleTest: 0,
    moduleTestsPlanned: 0,
    report: {
      weakScripts: [],
      moduleAdvice: [],
      internalAttentionPoints: [],
      nextActions: [],
    },
    students: [],
    attentionRows: [],
    draftCards: [],
    moduleTests: [],
    instructorFollowups: [],
  };
}

function moduleMapForCatalog(catalog: RisCatalog): Map<string, number> {
  const moduleByScript = new Map<string, number>();
  for (const module of catalog.tree) {
    for (const category of module.categories) {
      for (const script of category.scripts) {
        moduleByScript.set(script.id, module.moduleNumber);
      }
    }
  }
  return moduleByScript;
}

function scriptTitleForCatalog(catalog: RisCatalog, scriptId: string): string {
  for (const module of catalog.tree) {
    for (const category of module.categories) {
      const script = category.scripts.find((candidate) => candidate.id === scriptId);
      if (script) return script.title;
    }
  }
  return "RIS-script";
}

function scriptModuleForCatalog(catalog: RisCatalog, scriptId: string): number {
  for (const module of catalog.tree) {
    for (const category of module.categories) {
      if (category.scripts.some((candidate) => candidate.id === scriptId)) {
        return module.moduleNumber;
      }
    }
  }
  return 0;
}

function risStepRank(step: RISStepValue | null): number {
  if (step == null) return 0;
  return typeof step === "number" ? step : Number(step) || 0;
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const rows = groups.get(key) ?? [];
    rows.push(item);
    groups.set(key, rows);
  }
  return groups;
}

function instructorByLesson(cardRows: readonly RisLessonCardDbRow[]): Map<string, string> {
  return new Map(cardRows.map((card) => [card.lesson_id, card.instructor_id]));
}

async function loadProfileNames(
  client: SupabaseClient,
  profileIds: readonly string[],
): Promise<Map<string, string>> {
  if (profileIds.length === 0) return new Map();
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email")
    .in("id", Array.from(new Set(profileIds)));
  if (error) throw new Error(`RIS profielnamen laden mislukt: ${error.message}`);
  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
      (profile) => [profile.id, profile.full_name ?? profile.email ?? "Instructeur"],
    ),
  );
}

function buildInstructorFollowups({
  cardRows,
  progressRows,
  instructorNames,
  instructorByLessonId,
}: {
  cardRows: readonly RisLessonCardDbRow[];
  progressRows: readonly RisProgressDbRow[];
  instructorNames: Map<string, string>;
  instructorByLessonId: Map<string, string>;
}): BackofficeRisInstructorFollowup[] {
  const followups = new Map<string, BackofficeRisInstructorFollowup>();
  const ensure = (instructorId: string) => {
    const existing = followups.get(instructorId);
    if (existing) return existing;
    const next = {
      instructorId,
      instructorName: instructorNames.get(instructorId) ?? "Instructeur",
      draftLessonCards: 0,
      attentionPoints: 0,
      readyForModuleTest: 0,
    };
    followups.set(instructorId, next);
    return next;
  };

  for (const card of cardRows) {
    if (!(STAFF_OPEN_RIS_CARD_STATUSES as readonly string[]).includes(card.publication_status)) {
      continue;
    }
    ensure(card.instructor_id).draftLessonCards++;
  }

  for (const row of progressRows) {
    const instructorId = row.last_assessed_lesson_id
      ? instructorByLessonId.get(row.last_assessed_lesson_id)
      : null;
    if (!instructorId) continue;
    const summary = ensure(instructorId);
    if (row.is_attention_point) summary.attentionPoints++;
    if (row.ready_for_module_test) summary.readyForModuleTest++;
  }

  return Array.from(followups.values())
    .sort(
      (left, right) =>
        right.draftLessonCards - left.draftLessonCards ||
        right.attentionPoints - left.attentionPoints ||
        right.readyForModuleTest - left.readyForModuleTest ||
        left.instructorName.localeCompare(right.instructorName),
    )
    .slice(0, 8);
}

function buildBackofficeRisReport({
  students,
  progressRows,
  catalog,
  studentNameById,
  instructorFollowups,
  draftCards,
}: {
  students: readonly BackofficeRisStudentSummary[];
  progressRows: readonly RisProgressDbRow[];
  catalog: RisCatalog;
  studentNameById: Map<string, string>;
  instructorFollowups: readonly BackofficeRisInstructorFollowup[];
  draftCards: readonly BackofficeRisDraftCard[];
}): BackofficeRisReport {
  const weakScripts = progressRows
    .filter(
      (row) =>
        row.is_attention_point || risStepRank(row.current_final_step) <= 3,
    )
    .sort((left, right) => {
      const rankDiff =
        risStepRank(left.current_final_step) - risStepRank(right.current_final_step);
      if (rankDiff !== 0) return rankDiff;
      return Number(right.is_attention_point) - Number(left.is_attention_point);
    })
    .slice(0, 10)
    .map((row) => {
      const step = (row.current_final_step as RISStepValue | null | undefined) ?? null;
      const definition = translateRisStepForStudent(step, catalog.steps);
      return {
        studentId: row.student_id,
        studentName: studentNameById.get(row.student_id) ?? "Leerling",
        scriptId: row.script_id,
        scriptTitle: scriptTitleForCatalog(catalog, row.script_id),
        moduleNumber: scriptModuleForCatalog(catalog, row.script_id),
        currentFinalStep: step,
        studentLabel: definition.studentLabel,
        reason: row.is_attention_point
          ? "Aandachtspunt"
          : "Lage RIS-score",
      };
    });

  const moduleAdvice: BackofficeRisModuleAdvice[] = [1, 2, 3, 4].map(
    (moduleNumber) => {
      const moduleRows = students
        .map((student) =>
          student.moduleProgress.find((item) => item.moduleNumber === moduleNumber),
        )
        .filter((item): item is RISModuleProgress => Boolean(item));
      const progressPct =
        moduleRows.length === 0
          ? 0
          : Math.round(
              moduleRows.reduce((sum, item) => sum + item.progressPct, 0) /
                moduleRows.length,
            );
      const attentionPoints = moduleRows.reduce(
        (sum, item) => sum + item.attentionPoints,
        0,
      );
      const readyForTest = moduleRows.filter((item) => item.readyForModuleTest).length;
      const advice =
        attentionPoints > 0
          ? "Plan gerichte herhaling voordat je toetsmomenten opschaalt."
          : readyForTest > 0
            ? "Controleer planning en CBR-momenten voor toetsklare leerlingen."
            : progressPct >= 70
              ? "Module loopt goed. Blijf publiceren zodat voortgang actueel blijft."
              : "Nog weinig gepubliceerde RIS-data. Rond conceptkaarten af.";

      return {
        moduleNumber,
        label: `Module ${moduleNumber}`,
        progressPct,
        attentionPoints,
        readyForTest,
        advice,
      };
    },
  );

  const internalAttentionPoints = [
    ...instructorFollowups
      .filter((row) => row.draftLessonCards > 0)
      .slice(0, 3)
      .map(
        (row) =>
          `${row.instructorName}: ${row.draftLessonCards} RIS-leskaart(en) nog publiceren.`,
      ),
    ...instructorFollowups
      .filter((row) => row.attentionPoints > 0)
      .slice(0, 3)
      .map(
        (row) =>
          `${row.instructorName}: ${row.attentionPoints} aandachtspunt(en) vragen opvolging.`,
      ),
  ].slice(0, 6);

  const nextActions = [
    draftCards.length > 0
      ? "Publiceer openstaande conceptleskaarten zodat leerlingen actuele RIS-voortgang zien."
      : "",
    weakScripts.length > 0
      ? "Gebruik zwakke scripts als focuslijst voor komende lessen."
      : "",
    moduleAdvice.some((module) => module.readyForTest > 0)
      ? "Plan of bevestig toetsmomenten voor leerlingen die toetsklaar staan."
      : "",
  ].filter(Boolean);

  return {
    weakScripts,
    moduleAdvice,
    internalAttentionPoints,
    nextActions,
  };
}

async function countRows(
  client: SupabaseClient,
  table: string,
  tenantId: string,
  eq: Record<string, string | boolean>,
): Promise<number> {
  let query = client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  for (const [key, value] of Object.entries(eq)) {
    query = query.eq(key, value);
  }
  const { count, error } = await query;
  if (error) throw new Error(`RIS count mislukt (${table}): ${error.message}`);
  return count ?? 0;
}

function mapLessonCard(row: Record<string, unknown>): RisLessonCard {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    lessonId: row.lesson_id as string,
    studentId: row.student_id as string,
    instructorId: row.instructor_id as string,
    risVersionId: row.ris_version_id as string,
    publicationStatus: row.publication_status as RisLessonCard["publicationStatus"],
    internalSummary: (row.internal_summary as string | null) ?? null,
    studentFriendlySummary: (row.student_friendly_summary as string | null) ?? null,
    homeworkOrNextFocus: (row.homework_or_next_focus as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    publishedBy: (row.published_by as string | null) ?? null,
  };
}

function mapAssessment(row: Record<string, unknown>): RisScriptAssessment {
  return {
    id: row.id as string,
    lessonCardId: row.lesson_card_id as string,
    scriptId: row.script_id as string,
    scriptVariantId: (row.script_variant_id as string | null) ?? null,
    previousRisStep: (row.previous_ris_step as RISStepValue | null) ?? null,
    conceptRisStep: (row.concept_ris_step as RISStepValue | null) ?? null,
    finalRisStep: (row.final_ris_step as RISStepValue | null) ?? null,
    status: row.status as string,
    isAttentionPoint: Boolean(row.is_attention_point),
    isFeaturedForLesson: Boolean(row.is_featured_for_lesson),
    shouldRepeat: Boolean(row.should_repeat),
    readyForTest: Boolean(row.ready_for_test),
    performanceOutcome:
      ((row.concept_performance_outcome ??
        row.final_performance_outcome) as RisPerformanceOutcome | null) ?? null,
    safetyStatus:
      ((row.concept_safety_status ??
        row.final_safety_status) as RisSafetyStatus | null) ?? null,
    instructorNote: (row.instructor_note as string | null) ?? null,
    studentVisibleNote: (row.student_visible_note as string | null) ?? null,
  };
}

function mapGuidedReflection(row: Record<string, unknown>): RisGuidedReflection {
  return {
    lessonCardId: row.lesson_card_id as string,
    studentPresent: row.student_present !== false,
    entryMode:
      row.entry_mode === "student_self"
        ? "student_self"
        : "instructor_assisted",
    capturedSurface: (row.captured_surface as string | null) ?? null,
    overallRating: (row.overall_rating as RisReflectionRating | null) ?? null,
    independenceRating: (row.independence_rating as RisReflectionRating | null) ?? null,
    insightRating: (row.insight_rating as RisReflectionRating | null) ?? null,
    confidenceRating: (row.confidence_rating as RisReflectionRating | null) ?? null,
    oneSentenceReflection: (row.one_sentence_reflection as string | null) ?? null,
    ratingOverall: (row.rating_overall as number | null) ?? null,
    ratingIndependence: (row.rating_independence as number | null) ?? null,
    wentWellText: (row.went_well_text as string | null) ?? null,
    difficultText: (row.difficult_text as string | null) ?? null,
    nextLessonWish: (row.next_lesson_wish as string | null) ?? null,
    instructorContextNote: (row.instructor_context_note as string | null) ?? null,
    capturedAt: (row.captured_at as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

function toStudentPublishedCard(
  card: RisLessonCard,
  reflection: RisGuidedReflection | null,
  response: StudentPostLessonResponse | null,
): StudentRisPublishedCard {
  const { internalSummary: _internalSummary, ...studentCard } = card;
  return {
    ...studentCard,
    reflection,
    response,
  };
}

function mapStudentPostLessonResponse(
  row: Record<string, unknown>,
): StudentPostLessonResponse {
  return {
    id: row.id as string,
    lessonCardId: row.lesson_card_id as string,
    studentId: row.student_id as string,
    commentText: (row.comment_text as string | null) ?? null,
    nextLessonWish: (row.next_lesson_wish as string | null) ?? null,
    skippedResponse: Boolean(row.skipped_response),
    submittedAt: row.submitted_at as string,
  };
}

function mapPlanningCard(row: Record<string, unknown>): PlanningCard {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    studentId: row.student_id as string,
    instructorId: row.instructor_id as string,
    nextLessonId: (row.next_lesson_id as string | null) ?? null,
    previousLessonCardId: (row.previous_lesson_card_id as string | null) ?? null,
    status: row.status as PlanningCard["status"],
    studentVisibleSummary: (row.student_visible_summary as string | null) ?? null,
    sharedWithStudent: Boolean(row.shared_with_student),
    sharedAt: (row.shared_at as string | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    goals: [],
  };
}

function mapPlanningCardGoal(row: Record<string, unknown>): PlanningCardGoal {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as PlanningCardGoalStatus,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

async function hydratePlanningCard(
  client: SupabaseClient,
  row: Record<string, unknown>,
): Promise<PlanningCard> {
  const card = mapPlanningCard(row);
  const { data, error } = await client
    .from("planning_card_goals")
    .select("id, title, description, status, sort_order")
    .eq("tenant_id", card.tenantId)
    .eq("planning_card_id", card.id)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Plankaartdoelen laden mislukt: ${error.message}`);
  }

  return {
    ...card,
    goals: ((data ?? []) as Record<string, unknown>[]).map(mapPlanningCardGoal),
  };
}
