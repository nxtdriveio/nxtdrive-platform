import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysYmd, resolveTenantTimeZone, zonedYmd } from "@/lib/datetime";
import {
  generateSmartLessonSuggestions,
  type SmartLessonSlotSuggestion,
} from "@/lib/lesson-planning/smart-scheduling";
import { loadTenantPlanningSettings } from "@/lib/planning-settings/service";
import type { PlanningActorAccess, PlanningScope } from "@/lib/planning-core";

export type EndOfLessonNextLesson = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  location: string | null;
};

export type EndOfLessonSchedulingSuggestion = SmartLessonSlotSuggestion & {
  durationMin: number;
  canDirectPlan: boolean;
};

export type EndOfLessonSchedulingState = {
  sourceLessonId: string;
  studentId: string;
  instructorId: string | null;
  nextLesson: EndOfLessonNextLesson | null;
  suggestions: EndOfLessonSchedulingSuggestion[];
  balanceMinutes: number;
  blockingReasons: string[];
  lowCreditWarning: string | null;
};

type LessonRow = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  student_id: string;
  instructor_id: string | null;
  starts_at: string;
  ends_at: string | null;
  duration_min: number | null;
  location: string | null;
};

type NextLessonRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  location: string | null;
};

function localTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(date);
}

function scopeForLesson(tenantId: string, branchId: string | null): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

export async function loadEndOfLessonSchedulingState(
  client: SupabaseClient,
  args: {
    tenant: { id: string; timezone?: string | null };
    lessonId: string;
    actor: PlanningActorAccess;
  },
): Promise<EndOfLessonSchedulingState> {
  const { data: lessonRaw, error: lessonError } = await client
    .from("lessons")
    .select(
      "id, tenant_id, branch_id, student_id, instructor_id, starts_at, ends_at, duration_min, location",
    )
    .eq("id", args.lessonId)
    .eq("tenant_id", args.tenant.id)
    .maybeSingle();
  if (lessonError) {
    throw new Error(`Einde-les planning laden mislukt: ${lessonError.message}`);
  }
  const lesson = lessonRaw as LessonRow | null;
  if (!lesson) {
    return {
      sourceLessonId: args.lessonId,
      studentId: "",
      instructorId: null,
      nextLesson: null,
      suggestions: [],
      balanceMinutes: 0,
      blockingReasons: ["Les niet gevonden."],
      lowCreditWarning: null,
    };
  }

  const after = lesson.ends_at ?? lesson.starts_at;
  const { data: nextRaw, error: nextError } = await client
    .from("lessons")
    .select("id, starts_at, ends_at, status, location")
    .eq("tenant_id", args.tenant.id)
    .eq("student_id", lesson.student_id)
    .neq("id", lesson.id)
    .in("status", ["planned", "in_progress"])
    .gt("starts_at", after)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextError) {
    throw new Error(`Volgende les laden mislukt: ${nextError.message}`);
  }
  if (nextRaw) {
    const next = nextRaw as NextLessonRow;
    return {
      sourceLessonId: lesson.id,
      studentId: lesson.student_id,
      instructorId: lesson.instructor_id,
      nextLesson: {
        id: next.id,
        startsAt: next.starts_at,
        endsAt: next.ends_at,
        status: next.status,
        location: next.location,
      },
      suggestions: [],
      balanceMinutes: 0,
      blockingReasons: [],
      lowCreditWarning: null,
    };
  }

  if (!lesson.instructor_id) {
    return {
      sourceLessonId: lesson.id,
      studentId: lesson.student_id,
      instructorId: null,
      nextLesson: null,
      suggestions: [],
      balanceMinutes: 0,
      blockingReasons: ["Deze les heeft geen instructeur gekoppeld."],
      lowCreditWarning: null,
    };
  }

  const timeZone = resolveTenantTimeZone(args.tenant);
  const settings = await loadTenantPlanningSettings(client, args.tenant.id);
  const sourceStart = new Date(lesson.starts_at);
  const seedDate = addDaysYmd(zonedYmd(sourceStart, timeZone), 7);
  const seedTime = localTime(sourceStart, timeZone);
  const durationMin =
    lesson.duration_min && lesson.duration_min >= 15
      ? lesson.duration_min
      : settings.defaultLessonDurationMinutes;

  const result = await generateSmartLessonSuggestions(client, {
    tenantId: args.tenant.id,
    studentId: lesson.student_id,
    instructorId: lesson.instructor_id,
    seedDate,
    seedTime,
    durationMin,
    bufferMin: settings.defaultLessonBufferMinutes,
    timeZone,
    actor: args.actor,
    scope: scopeForLesson(args.tenant.id, lesson.branch_id),
    branchId: lesson.branch_id,
    allowInsufficientCredit: true,
    limit: 5,
  });

  const lowCreditWarning =
    result.balanceMinutes < durationMin
      ? `Onvoldoende tegoed: ${result.balanceMinutes} min beschikbaar voor ${durationMin} min les.`
      : null;

  return {
    sourceLessonId: lesson.id,
    studentId: lesson.student_id,
    instructorId: lesson.instructor_id,
    nextLesson: null,
    suggestions: result.suggestions.map((suggestion) => ({
      ...suggestion,
      durationMin,
      canDirectPlan: result.balanceMinutes >= durationMin,
    })),
    balanceMinutes: result.balanceMinutes,
    blockingReasons: result.blockingReasons,
    lowCreditWarning,
  };
}
