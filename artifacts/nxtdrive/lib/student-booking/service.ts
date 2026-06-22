import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTenantInstructors, type TenantInstructor } from "@/lib/availability/service";
import {
  addDaysYmd,
  resolveTenantTimeZone,
  zonedMinuteOfDay,
  zonedYmd,
} from "@/lib/datetime";
import {
  generateSmartLessonSuggestions,
  type SmartLessonSlotSuggestion,
} from "@/lib/lesson-planning/smart-scheduling";
import {
  LESSON_DURATION_OPTIONS,
  loadTenantPlanningSettings,
} from "@/lib/planning-settings/service";
import type { PlanningActorAccess } from "@/lib/planning-core";
import type { Package } from "@/lib/packages/types";
import type { Student } from "@/lib/students/types";
import type { MemberRole } from "@/lib/types";
import {
  loadStudentSelfBookingPolicy,
  type StudentSelfBookingPolicy,
} from "./policy";

export type StudentSelfBookingSuggestion = SmartLessonSlotSuggestion & {
  instructorId: string;
  instructorName: string;
  durationMin: number;
};

export type StudentSelfBookingPackage = Pick<
  Package,
  | "id"
  | "name"
  | "self_booking_allowed"
  | "max_lessons_per_week"
  | "allowed_lesson_durations"
  | "allowed_lesson_types"
  | "fixed_instructor_only"
  | "requires_paid_installment"
  | "credit_release_strategy"
>;

export type StudentSelfBookingState = {
  policy: StudentSelfBookingPolicy;
  balanceMinutes: number;
  latestPackage: StudentSelfBookingPackage | null;
  durationOptions: number[];
  selectedDurationMin: number;
  instructors: TenantInstructor[];
  suggestions: StudentSelfBookingSuggestion[];
  blockingReasons: string[];
  helperMessages: string[];
  requiresApproval: boolean;
  sendsRequestWhenInsufficientCredit: boolean;
  futureBookingsCount: number;
};

const DEFAULT_EMPTY_STATE: Omit<
  StudentSelfBookingState,
  "policy" | "balanceMinutes" | "latestPackage"
> = {
  durationOptions: [],
  selectedDurationMin: 50,
  instructors: [],
  suggestions: [],
  blockingReasons: [],
  helperMessages: [],
  requiresApproval: false,
  sendsRequestWhenInsufficientCredit: false,
  futureBookingsCount: 0,
};

type PackageRow = StudentSelfBookingPackage & {
  allowed_lesson_durations: unknown;
  allowed_lesson_types: unknown;
};

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 15 && item <= 240),
    ),
  ).sort((a, b) => a - b);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizePackage(row: PackageRow | null): StudentSelfBookingPackage | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    self_booking_allowed: row.self_booking_allowed,
    max_lessons_per_week: row.max_lessons_per_week,
    allowed_lesson_durations: normalizeNumberArray(row.allowed_lesson_durations),
    allowed_lesson_types: normalizeStringArray(row.allowed_lesson_types),
    fixed_instructor_only: row.fixed_instructor_only,
    requires_paid_installment: row.requires_paid_installment,
    credit_release_strategy: row.credit_release_strategy,
  };
}

async function loadLatestStudentPackage(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentSelfBookingPackage | null> {
  const { data: ledgerRow, error: ledgerError } = await client
    .from("credit_ledger")
    .select("related_id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("reason", "package_purchase")
    .eq("related_type", "package")
    .gt("delta", 0)
    .not("related_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ledgerError) throw new Error(`Pakket laden mislukt: ${ledgerError.message}`);

  const packageId =
    typeof ledgerRow?.related_id === "string" ? ledgerRow.related_id : null;
  if (!packageId) return null;

  const { data: packageRow, error: packageError } = await client
    .from("packages")
    .select(
      [
        "id",
        "name",
        "self_booking_allowed",
        "max_lessons_per_week",
        "allowed_lesson_durations",
        "allowed_lesson_types",
        "fixed_instructor_only",
        "requires_paid_installment",
        "credit_release_strategy",
      ].join(", "),
    )
    .eq("tenant_id", tenantId)
    .eq("id", packageId)
    .maybeSingle();
  if (packageError) throw new Error(`Pakketregels laden mislukt: ${packageError.message}`);

  return normalizePackage((packageRow ?? null) as PackageRow | null);
}

async function loadLatestInstructorId(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<string | null> {
  const { data } = await client
    .from("lessons")
    .select("instructor_id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .in("status", ["planned", "in_progress", "completed"])
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.instructor_id === "string" ? data.instructor_id : null;
}

async function hasBlockingOpenInvoice(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("invoices")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .eq("status", "open")
    .eq("kind", "invoice")
    .limit(1);
  if (error) throw new Error(`Open facturen laden mislukt: ${error.message}`);
  return (data ?? []).length > 0;
}

function pickDurationOptions(
  packageRules: StudentSelfBookingPackage | null,
  defaultDuration: number,
): number[] {
  const fromPackage = packageRules?.allowed_lesson_durations ?? [];
  if (fromPackage.length > 0) return fromPackage;
  const standard: number[] = Array.from(LESSON_DURATION_OPTIONS).filter(
    (value) => value >= 40 && value <= 120,
  );
  return standard.includes(defaultDuration)
    ? standard
    : [defaultDuration, ...standard].sort((a, b) => a - b);
}

function localSeedAfter(policy: StudentSelfBookingPolicy, timeZone: string): {
  seedDate: string;
  seedTime: string;
} {
  const earliest = new Date(
    Date.now() + policy.min_notice_hours_for_booking * 60 * 60 * 1000,
  );
  let seedDate = zonedYmd(earliest, timeZone);
  const minuteOfDay = zonedMinuteOfDay(earliest, timeZone);
  let rounded = Math.ceil(minuteOfDay / 30) * 30;
  if (rounded < 9 * 60) rounded = 9 * 60;
  if (rounded > 17 * 60) {
    seedDate = addDaysYmd(seedDate, 1);
    rounded = 9 * 60;
  }
  const hour = Math.floor(rounded / 60);
  const minute = rounded % 60;
  return {
    seedDate,
    seedTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export async function loadStudentSelfBookingState(
  client: SupabaseClient,
  args: {
    tenantId: string;
    tenantTimeZone?: string | null;
    student: Student;
    actorUserId: string;
    roles: MemberRole[];
    requestedDurationMin?: number | null;
  },
): Promise<StudentSelfBookingState> {
  const policy = await loadStudentSelfBookingPolicy(client, args.tenantId);
  const [{ data: balanceRaw }, latestPackage, planningSettings] =
    await Promise.all([
      client
        .from("student_credit_balance")
        .select("balance")
        .eq("tenant_id", args.tenantId)
        .eq("student_id", args.student.id)
        .maybeSingle(),
      loadLatestStudentPackage(client, args.tenantId, args.student.id),
      loadTenantPlanningSettings(client, args.tenantId),
    ]);
  const balanceMinutes =
    typeof balanceRaw?.balance === "number" ? balanceRaw.balance : 0;

  const base: StudentSelfBookingState = {
    policy,
    balanceMinutes,
    latestPackage,
    ...DEFAULT_EMPTY_STATE,
  };

  const blockingReasons: string[] = [];
  const helperMessages: string[] = [];

  if (!policy.self_booking_enabled || !policy.students_can_book_lessons) {
    return {
      ...base,
      blockingReasons: [
        "Zelf lessen boeken staat nog niet aan voor jouw rijschool.",
      ],
    };
  }
  if (!args.student.active) {
    return {
      ...base,
      blockingReasons: ["Je leerlingdossier is niet actief."],
    };
  }

  const packageBlocksSelfBooking =
    latestPackage && !latestPackage.self_booking_allowed;
  if (packageBlocksSelfBooking) {
    blockingReasons.push(
      `Je huidige pakket (${latestPackage.name}) staat zelf boeken niet toe.`,
    );
  }
  if (
    latestPackage &&
    latestPackage.allowed_lesson_types.length > 0 &&
    !latestPackage.allowed_lesson_types.includes("lesson")
  ) {
    blockingReasons.push(
      `Je huidige pakket (${latestPackage.name}) bevat geen zelf te plannen rijlessen.`,
    );
  }

  const [futureRes, openInvoice, latestInstructorId] = await Promise.all([
    client
      .from("lessons")
      .select("id")
      .eq("tenant_id", args.tenantId)
      .eq("student_id", args.student.id)
      .eq("status", "planned")
      .gt("starts_at", new Date().toISOString()),
    hasBlockingOpenInvoice(client, args.tenantId, args.student.id),
    latestPackage?.fixed_instructor_only
      ? loadLatestInstructorId(client, args.tenantId, args.student.id)
      : Promise.resolve(null),
  ]);
  if (futureRes.error) {
    throw new Error(`Toekomstige lessen laden mislukt: ${futureRes.error.message}`);
  }
  const futureBookingsCount = (futureRes.data ?? []).length;
  if (futureBookingsCount >= policy.max_future_bookings_per_student) {
    blockingReasons.push(
      `Je hebt al ${futureBookingsCount} geplande les(sen). De limiet is ${policy.max_future_bookings_per_student}.`,
    );
  }
  if (
    openInvoice &&
    (!policy.allow_booking_with_unpaid_invoice ||
      latestPackage?.requires_paid_installment)
  ) {
    blockingReasons.push(
      "Er staat nog een open factuur die eerst afgehandeld moet worden.",
    );
  }

  const durationOptions = pickDurationOptions(
    latestPackage,
    planningSettings.defaultLessonDurationMinutes,
  );
  const requestedDuration = args.requestedDurationMin ?? null;
  const selectedDurationMin =
    requestedDuration && durationOptions.includes(requestedDuration)
      ? requestedDuration
      : durationOptions[0] ?? planningSettings.defaultLessonDurationMinutes;
  if (balanceMinutes < selectedDurationMin) {
    if (policy.allow_booking_without_sufficient_credit) {
      helperMessages.push(
        "Je tegoed is lager dan de lesduur. Je kunt nog wel een aanvraag versturen; je rijschool bevestigt die handmatig.",
      );
    } else {
      blockingReasons.push(
        `Onvoldoende tegoed: ${balanceMinutes} min beschikbaar voor ${selectedDurationMin} min les.`,
      );
    }
  }

  const instructors = await loadTenantInstructors(args.tenantId, {
    branchIds: args.student.branch_id ? [args.student.branch_id] : null,
  });
  const scopedInstructors =
    latestPackage?.fixed_instructor_only && latestInstructorId
      ? instructors.filter((instructor) => instructor.id === latestInstructorId)
      : instructors;
  if (scopedInstructors.length === 0) {
    blockingReasons.push(
      latestPackage?.fixed_instructor_only
        ? "Je pakket vereist je vaste instructeur, maar die is nu niet beschikbaar voor zelf boeken."
        : "Er zijn nog geen instructeurs beschikbaar voor jouw vestiging.",
    );
  }

  if (blockingReasons.length > 0) {
    return {
      ...base,
      durationOptions,
      selectedDurationMin,
      instructors: scopedInstructors,
      blockingReasons,
      helperMessages,
      futureBookingsCount,
    };
  }

  const timeZone = resolveTenantTimeZone(args.tenantTimeZone);
  const { seedDate, seedTime } = localSeedAfter(policy, timeZone);
  const actor: PlanningActorAccess = {
    userId: args.actorUserId,
    roles: args.roles,
    tenantIds: [],
    branchAccess: [{ tenantId: args.tenantId, branchIds: "all" }],
  };
  const scope = args.student.branch_id
    ? { type: "branch" as const, tenantId: args.tenantId, branchId: args.student.branch_id }
    : { type: "tenant" as const, tenantId: args.tenantId };

  const perInstructor = await Promise.all(
    scopedInstructors.slice(0, 8).map(async (instructor) => {
      const result = await generateSmartLessonSuggestions(client, {
        tenantId: args.tenantId,
        studentId: args.student.id,
        instructorId: instructor.id,
        seedDate,
        seedTime,
        durationMin: selectedDurationMin,
        bufferMin: planningSettings.defaultLessonBufferMinutes,
        timeZone,
        actor,
        scope,
        branchId: args.student.branch_id,
        allowInsufficientCredit: policy.allow_booking_without_sufficient_credit,
        limit: 3,
      });
      return {
        instructor,
        result,
      };
    }),
  );

  const suggestions = perInstructor
    .flatMap(({ instructor, result }) =>
      result.suggestions.map((suggestion) => ({
        ...suggestion,
        instructorId: instructor.id,
        instructorName: instructor.full_name,
        durationMin: selectedDurationMin,
      })),
    )
    .sort((left, right) => right.score - left.score || left.startsAt.localeCompare(right.startsAt))
    .slice(0, 8);
  const candidateBlocks = Array.from(
    new Set(
      perInstructor.flatMap(({ result }) => result.blockingReasons),
    ),
  ).slice(0, 4);

  return {
    policy,
    balanceMinutes,
    latestPackage,
    durationOptions,
    selectedDurationMin,
    instructors: scopedInstructors,
    suggestions,
    blockingReasons: suggestions.length === 0 ? candidateBlocks : [],
    helperMessages,
    requiresApproval:
      policy.manual_approval_required || policy.instructor_approval_required,
    sendsRequestWhenInsufficientCredit:
      balanceMinutes < selectedDurationMin &&
      policy.allow_booking_without_sufficient_credit,
    futureBookingsCount,
  };
}
