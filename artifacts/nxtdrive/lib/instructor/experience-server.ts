import "server-only";

import {
  ADVICE_LABELS,
  PHASE_LABELS,
  type ReadinessResult,
} from "@workspace/leskaart";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  loadAgendaAppointments,
  type AgendaAppointmentView,
} from "@/lib/agenda/appointments";
import {
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_SHORT,
  durationMinutes,
} from "@/lib/agenda/types";
import {
  loadAgendaTrialLessons,
  type AgendaTrialLesson,
} from "@/lib/trial-lessons/agenda";
import {
  loadExceptions,
  loadWeeklyAvailability,
  resolveAvailabilityDays,
  type ResolvedAvailabilityDay,
} from "@/lib/availability/service";
import { minutesToHHMM } from "@/lib/availability/types";
import {
  loadInstructorConversations,
  loadThreadMessages,
} from "@/lib/chat/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import {
  VEHICLE_TRANSMISSION_LABEL,
  type Lesson,
  type Vehicle,
} from "@/lib/lessons/types";
import type { Student, StudentBalance } from "@/lib/students/types";
import type { Task, TaskPriority } from "@/lib/tasks/types";
import {
  addDaysYmd,
  createNlDateTimeFormatter,
  isSameZonedDay,
  resolveTenantTimeZone,
  startOfZonedDayUtc,
  zonedYmd,
} from "@/lib/datetime";
import {
  type InstructorAppointment,
  type InstructorAppointmentType,
  type InstructorAvailabilityDay,
  type InstructorEvaluation,
  type InstructorExperience,
  type InstructorMessageThread,
  type InstructorStudent,
  type InstructorTask,
  type InstructorTaskPriority,
  type InstructorVehicle,
} from "@/lib/instructor/redesign-data";
import { deriveNextInstructorAction } from "@/lib/instructor/next-action";
import { loadStudentsReadiness } from "@/lib/skills/readiness-data";
import {
  resolveInstructorAgendaPeriod,
  type InstructorAgendaMode,
} from "@/lib/instructor/agenda-period";

type StudentSummary = Pick<
  Student,
  "id" | "full_name" | "phone" | "postcode" | "email"
>;
type DashboardTask = Pick<
  Task,
  "id" | "title" | "priority" | "due_date" | "created_at" | "updated_at"
>;

type InstructorFormatters = {
  timeZone: string;
  timeFmt: Intl.DateTimeFormat;
  shortDateFmt: Intl.DateTimeFormat;
};

function createInstructorFormatters(timeZone: string): InstructorFormatters {
  return {
    timeZone,
    timeFmt: createNlDateTimeFormatter(
      {
        hour: "2-digit",
        minute: "2-digit",
      },
      timeZone,
    ),
    shortDateFmt: createNlDateTimeFormatter(
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      },
      timeZone,
    ),
  };
}

function capitalize(text: string) {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function dateLabel(iso: string, formatters: InstructorFormatters) {
  return capitalize(formatters.shortDateFmt.format(new Date(iso)));
}

function durationLabel(startsAt: string, endsAt: string) {
  return `${Math.max(1, durationMinutes(startsAt, endsAt))} min`;
}

function taskPriority(priority: TaskPriority): InstructorTaskPriority {
  if (priority === "urgent" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function appointmentType(
  type: AgendaAppointmentView["type"],
): InstructorAppointmentType {
  if (type === "exam" || type === "interim_test") return "exam";
  if (type === "theory_guidance") return "theory";
  if (type === "private_block" || type === "vacation") return "private";
  if (
    type === "free_block" ||
    type === "break" ||
    type === "maintenance" ||
    type === "admin"
  ) {
    return "admin";
  }
  return "lesson";
}

function mapVehicleStatus(vehicle: Vehicle): InstructorVehicle["status"] {
  if (
    !vehicle.active ||
    vehicle.status === "inactive" ||
    vehicle.status === "sold"
  )
    return "unavailable";
  if (vehicle.status === "maintenance" || vehicle.status === "damaged")
    return "maintenance";
  return "active";
}

function vehicleLabel(vehicle: Vehicle | null | undefined) {
  if (!vehicle) return undefined;
  return [vehicle.label, vehicle.license_plate].filter(Boolean).join(" - ");
}

function mapLesson(
  lesson: Lesson,
  studentMap: Map<string, StudentSummary>,
  vehiclesById: Map<string, Vehicle>,
  formatters: InstructorFormatters,
): InstructorAppointment {
  const student = studentMap.get(lesson.student_id);
  const vehicle = lesson.vehicle_id
    ? vehiclesById.get(lesson.vehicle_id)
    : null;
  return {
    id: lesson.id,
    type: "lesson",
    title: "Rijles",
    studentName: student?.full_name ?? "Leerling",
    dateYmd: zonedYmd(new Date(lesson.starts_at), formatters.timeZone),
    dateLabel: dateLabel(lesson.starts_at, formatters),
    startsAtIso: lesson.starts_at,
    startsAt: formatters.timeFmt.format(new Date(lesson.starts_at)),
    endsAt: formatters.timeFmt.format(new Date(lesson.ends_at)),
    duration: durationLabel(lesson.starts_at, lesson.ends_at),
    location: lesson.location ?? student?.postcode ?? "Locatie volgt",
    vehicle: vehicleLabel(vehicle),
    status:
      lesson.status === "completed"
        ? "completed"
        : lesson.status === "in_progress"
          ? "confirmed"
          : "planned",
    href: `/instructeur/lessen/${lesson.id}`,
    evaluationHref: `/instructeur/lessen/${lesson.id}`,
  };
}

function mapTrial(
  trial: AgendaTrialLesson,
  formatters: InstructorFormatters,
): InstructorAppointment {
  return {
    id: trial.id,
    type: "trial",
    title: "Proefles",
    studentName: trial.lead_name,
    dateYmd: zonedYmd(new Date(trial.starts_at), formatters.timeZone),
    dateLabel: dateLabel(trial.starts_at, formatters),
    startsAtIso: trial.starts_at,
    startsAt: formatters.timeFmt.format(new Date(trial.starts_at)),
    endsAt: formatters.timeFmt.format(new Date(trial.ends_at)),
    duration: `${trial.duration_min} min`,
    location: trial.pickup_location ?? "Ophaallocatie volgt",
    status: trial.status === "confirmed" ? "confirmed" : "planned",
    href: "/instructeur/agenda",
  };
}

function mapAppointment(
  appointment: AgendaAppointmentView,
  vehiclesById: Map<string, Vehicle>,
  formatters: InstructorFormatters,
): InstructorAppointment {
  const vehicle = appointment.vehicle_id
    ? vehiclesById.get(appointment.vehicle_id)
    : null;
  return {
    id: appointment.id,
    type: appointmentType(appointment.type),
    title: appointment.title ?? APPOINTMENT_TYPE_SHORT[appointment.type],
    studentName: appointment.student_name ?? appointment.team_name ?? undefined,
    dateYmd: zonedYmd(new Date(appointment.starts_at), formatters.timeZone),
    dateLabel: dateLabel(appointment.starts_at, formatters),
    startsAtIso: appointment.starts_at,
    startsAt: formatters.timeFmt.format(new Date(appointment.starts_at)),
    endsAt: formatters.timeFmt.format(new Date(appointment.ends_at)),
    duration: durationLabel(appointment.starts_at, appointment.ends_at),
    location:
      appointment.location ??
      appointment.team_name ??
      APPOINTMENT_TYPE_LABEL[appointment.type],
    vehicle: vehicleLabel(vehicle),
    status: appointment.status === "completed" ? "completed" : "planned",
    href: `/instructeur/agenda/${appointment.id}`,
  };
}

function mapStudent(
  student: StudentSummary,
  lessons: Lesson[],
  balanceMap: Map<string, number>,
  formatters: InstructorFormatters,
  readiness: ReadinessResult,
  conversationId?: string | null,
): InstructorStudent {
  const studentLessons = lessons
    .filter((lesson) => lesson.student_id === student.id)
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const now = Date.now();
  const completed = studentLessons.filter(
    (lesson) => lesson.status === "completed",
  );
  const next = studentLessons.find(
    (lesson) => new Date(lesson.starts_at).getTime() >= now,
  );
  const latest = [...completed].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  )[0];
  const balance = balanceMap.get(student.id) ?? 0;
  const progress = readiness.readinessPct;

  return {
    id: student.id,
    name: student.full_name ?? "Leerling",
    license: `${completed.length} lessen afgerond`,
    progress,
    status:
      balance <= 300
        ? "attention"
        : progress >= 75
          ? "exam"
          : completed.length === 0
            ? "new"
            : "active",
    nextLesson: next
      ? `${dateLabel(next.starts_at, formatters)} - ${formatters.timeFmt.format(new Date(next.starts_at))}`
      : "Niet gepland",
    latestLesson: latest
      ? `${dateLabel(latest.starts_at, formatters)} - ${formatters.timeFmt.format(new Date(latest.starts_at))}`
      : "Nog geen les afgerond",
    phone: student.phone,
    email: student.email,
    conversationId: conversationId ?? null,
    attention:
      balance <= 300
        ? "Lespakket bijna op of vervolgplanning nodig."
        : "Geen urgente aandachtspunten.",
    readiness: `${ADVICE_LABELS[readiness.advice]} · ${PHASE_LABELS[readiness.phase]}`,
    creditMinutes: balance,
  };
}

function mapTask(
  task: DashboardTask,
  formatters: InstructorFormatters,
): InstructorTask {
  return {
    id: task.id,
    title: task.title,
    subject: task.due_date
      ? `Deadline ${dateLabel(task.due_date, formatters)}`
      : "Geen deadline",
    due: task.due_date
      ? formatters.timeFmt.format(new Date(task.due_date))
      : "Later",
    priority: taskPriority(task.priority),
    status:
      task.due_date && new Date(task.due_date).getTime() < Date.now()
        ? "late"
        : "open",
  };
}

function mapAvailabilityDays(
  days: readonly ResolvedAvailabilityDay[],
): InstructorAvailabilityDay[] {
  return days.map((day) => {
    const first = day.intervals[0];
    const last = day.intervals[day.intervals.length - 1];

    return {
      day: day.dayLabel,
      active: day.active,
      start: first ? minutesToHHMM(first.start_min) : "-",
      end: last ? minutesToHHMM(last.end_min) : "-",
      breakLabel: day.intervalLabel,
      date: day.date,
      sourceLabel: day.sourceLabel,
      availableMinutes: day.availableMinutes,
      intervals: day.intervals.map(
        (interval) =>
          `${minutesToHHMM(interval.start_min)}-${minutesToHHMM(interval.end_min)}`,
      ),
    };
  });
}

type InstructorRouteScope =
  | "cockpit"
  | "agenda"
  | "students"
  | "student"
  | "messages"
  | "vehicles"
  | "reports"
  | "profile";

type InstructorAgendaRequest = {
  mode?: InstructorAgendaMode | string | null;
  date?: string | null;
};

async function loadInstructorRouteExperience(
  scope: InstructorRouteScope,
  selectedConversationId?: string,
  agendaRequest?: InstructorAgendaRequest,
): Promise<InstructorExperience> {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const supabase = await createServerSupabaseClient();
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const now = new Date();
  const timeZone = resolveTenantTimeZone(tenant);
  const formatters = createInstructorFormatters(timeZone);
  const todayYmd = zonedYmd(now, timeZone);
  const dayStart = startOfZonedDayUtc(todayYmd, timeZone);
  const dayEnd = startOfZonedDayUtc(addDaysYmd(todayYmd, 1), timeZone);
  const horizonEnd = startOfZonedDayUtc(addDaysYmd(todayYmd, 15), timeZone);
  const agendaPeriod =
    scope === "agenda"
      ? resolveInstructorAgendaPeriod({
          mode: agendaRequest?.mode,
          date: agendaRequest?.date,
          now,
          timeZone,
        })
      : undefined;
  const experienceFrom = agendaPeriod
    ? startOfZonedDayUtc(agendaPeriod.fromYmd, timeZone)
    : dayStart;
  const experienceTo = agendaPeriod
    ? startOfZonedDayUtc(agendaPeriod.toYmd, timeZone)
    : horizonEnd;
  const availabilityFrom = dayStart;
  const availabilityTo = horizonEnd;
  const needsLessons = [
    "cockpit",
    "agenda",
    "students",
    "student",
    "reports",
  ].includes(scope);
  const needsTasks = ["cockpit", "reports"].includes(scope);
  const needsAgenda = ["cockpit", "agenda", "reports"].includes(scope);
  const needsConversations = [
    "cockpit",
    "students",
    "student",
    "messages",
  ].includes(scope);
  const needsVehicles = ["cockpit", "agenda", "vehicles", "reports"].includes(
    scope,
  );
  const needsAvailability = scope === "cockpit";
  const needsStudents = ["students", "student"].includes(scope);
  const needsStudentRows = [
    "cockpit",
    "agenda",
    "students",
    "student",
    "reports",
  ].includes(scope);
  const needsBalances = ["cockpit", "students", "student", "reports"].includes(
    scope,
  );

  const [
    lessonWindowResult,
    openTasksResult,
    openTaskCountResult,
    agendaTrials,
    appointmentWindow,
    conversations,
    vehicles,
    weeklyAvailability,
    availabilityExceptions,
    ris20QualificationResult,
  ] = await Promise.all([
    needsLessons
      ? supabase
          .from("lessons")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("instructor_id", user.id)
          .gte("starts_at", experienceFrom.toISOString())
          .lt("starts_at", experienceTo.toISOString())
          .order("starts_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    needsTasks
      ? supabase
          .from("tasks")
          .select("id, title, priority, due_date, created_at, updated_at")
          .eq("tenant_id", tenant.id)
          .eq("assignee_user_id", user.id)
          .is("archived_at", null)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    needsTasks
      ? supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant.id)
          .eq("assignee_user_id", user.id)
          .is("archived_at", null)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    needsAgenda
      ? loadAgendaTrialLessons(supabase, {
          tenantId: tenant.id,
          from: experienceFrom,
          to: agendaPeriod ? experienceTo : dayEnd,
          instructorId: user.id,
        })
      : Promise.resolve([]),
    needsAgenda
      ? loadAgendaAppointments(supabase, {
          tenantId: tenant.id,
          from: experienceFrom,
          to: experienceTo,
          instructorId: user.id,
        })
      : Promise.resolve([]),
    needsConversations
      ? loadInstructorConversations({
          tenantId: tenant.id,
          instructorId: user.id,
          isAdmin,
        })
      : Promise.resolve([]),
    needsVehicles
      ? loadVehicles(supabase, tenant.id, { includeShared: true })
      : Promise.resolve([]),
    needsAvailability
      ? loadWeeklyAvailability(supabase, tenant.id, user.id)
      : Promise.resolve([]),
    needsAvailability
      ? loadExceptions(supabase, tenant.id, user.id, {
          from: availabilityFrom,
          to: availabilityTo,
          timeZone,
        })
      : Promise.resolve([]),
    needsStudents && roles.includes("instructor")
      ? supabase
          .from("instructor_training_qualifications")
          .select("is_qualified")
          .eq("tenant_id", tenant.id)
          .eq("instructor_id", user.id)
          .eq("training_method", "RIS_2_0")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (lessonWindowResult.error) throw lessonWindowResult.error;
  if (openTasksResult.error) throw openTasksResult.error;
  if (openTaskCountResult.error) throw openTaskCountResult.error;
  if (ris20QualificationResult.error) throw ris20QualificationResult.error;

  const lessonWindow = (lessonWindowResult.data ?? []) as Lesson[];
  const todayLessons = lessonWindow.filter((lesson) =>
    isSameZonedDay(new Date(lesson.starts_at), now, timeZone),
  );
  const todayAppointments = (appointmentWindow ?? []).filter((appointment) =>
    isSameZonedDay(new Date(appointment.starts_at), now, timeZone),
  );
  const todayTrials = (agendaTrials ?? []).filter((trial) =>
    isSameZonedDay(new Date(trial.starts_at), now, timeZone),
  );
  const studentIds = Array.from(
    new Set([
      ...lessonWindow.map((lesson) => lesson.student_id),
      ...appointmentWindow
        .map((appointment) => appointment.student_id)
        .filter((studentId): studentId is string => Boolean(studentId)),
      ...conversations.map((conversation) => conversation.studentId),
    ]),
  );

  const [
    { data: studentsRaw, error: studentsError },
    { data: balancesRaw, error: balancesError },
    readinessByStudent,
  ] = await Promise.all([
    needsStudentRows && studentIds.length
      ? supabase
          .from("students")
          .select("id, full_name, phone, postcode, email")
          .eq("tenant_id", tenant.id)
          .in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    needsBalances && studentIds.length
      ? supabase
          .from("student_credit_balance")
          .select("student_id, balance")
          .eq("tenant_id", tenant.id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    needsStudents && studentIds.length
      ? loadStudentsReadiness(supabase, tenant.id, studentIds)
      : Promise.resolve(new Map<string, ReadinessResult>()),
  ]);
  if (studentsError) throw studentsError;
  if (balancesError) throw balancesError;

  const students = (studentsRaw ?? []) as StudentSummary[];
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((balance) => [
      balance.student_id,
      balance.balance,
    ]),
  );
  const vehiclesById = new Map(
    vehicles.map((vehicle) => [vehicle.id, vehicle]),
  );
  const isHistory = agendaPeriod?.mode === "history";
  const displayedLessons = isHistory
    ? lessonWindow.filter(
        (lesson) => new Date(lesson.starts_at).getTime() < now.getTime(),
      )
    : agendaPeriod
      ? lessonWindow
      : todayLessons;
  const displayedTrials = isHistory
    ? []
    : agendaPeriod
      ? agendaTrials
      : todayTrials;
  const displayedAppointments = isHistory
    ? []
    : agendaPeriod
      ? appointmentWindow
      : todayAppointments;
  const mappedAppointments = [
    ...displayedLessons.map((lesson) =>
      mapLesson(lesson, studentMap, vehiclesById, formatters),
    ),
    ...displayedTrials.map((trial) => mapTrial(trial, formatters)),
    ...displayedAppointments.map((appointment) =>
      mapAppointment(appointment, vehiclesById, formatters),
    ),
  ].sort((a, b) =>
    agendaPeriod?.mode === "history"
      ? b.startsAtIso.localeCompare(a.startsAtIso)
      : a.startsAtIso.localeCompare(b.startsAtIso),
  );

  const activeVehicles = vehicles.filter((vehicle) => vehicle.active);
  const evaluations: InstructorEvaluation[] = lessonWindow
    .slice(0, 8)
    .map((lesson) => {
      const student = studentMap.get(lesson.student_id);
      return {
        id: lesson.id,
        studentId: lesson.student_id,
        studentName: student?.full_name ?? "Leerling",
        lessonLabel: "Rijles",
        lessonDate: `${dateLabel(lesson.starts_at, formatters)} - ${formatters.timeFmt.format(new Date(lesson.starts_at))}`,
        status: lesson.status === "completed" ? "published" : "todo",
        mode: "ris",
        modules: [],
      };
    });
  const conversationMessages =
    scope === "messages"
      ? await Promise.all(
          conversations
            .filter(
              (conversation) =>
                conversation.id ===
                (selectedConversationId ?? conversations[0]?.id),
            )
            .map(async (conversation) => ({
              conversationId: conversation.id,
              messages: await loadThreadMessages(tenant.id, conversation.id),
            })),
        )
      : [];
  const messagesByConversation = new Map(
    conversationMessages.map((thread) => [
      thread.conversationId,
      thread.messages,
    ]),
  );
  const messages: InstructorMessageThread[] = conversations
    .slice(0, 8)
    .map((conversation) => ({
      id: conversation.id,
      name: conversation.studentName,
      role: "Leerling",
      preview: conversation.lastMessagePreview ?? "Nog geen berichtinhoud.",
      time: conversation.lastMessageAt
        ? formatters.timeFmt.format(new Date(conversation.lastMessageAt))
        : "Nieuw",
      unread: conversation.unreadCount,
      messages: messagesByConversation.get(conversation.id) ?? [],
    }));
  const radar = mapStudentsForRadar(students, lessonWindow, balanceMap);
  const profileName = user.profile?.full_name ?? user.email ?? "Instructeur";
  const displayedExamCount = displayedAppointments.filter(
    (appointment) =>
      appointment.type === "exam" || appointment.type === "interim_test",
  ).length;
  const resolvedAvailability = resolveAvailabilityDays(
    weeklyAvailability,
    availabilityExceptions,
    {
      from: availabilityFrom,
      days: 7,
      timeZone,
    },
  );
  const todayAvailability = resolvedAvailability[0];
  const bookedTodayMinutes =
    todayLessons.reduce(
      (sum, lesson) => sum + durationMinutes(lesson.starts_at, lesson.ends_at),
      0,
    ) +
    todayTrials.reduce(
      (sum, trial) => sum + Math.max(0, trial.duration_min),
      0,
    ) +
    todayAppointments.reduce(
      (sum, appointment) =>
        sum + durationMinutes(appointment.starts_at, appointment.ends_at),
      0,
    );
  const availableTodayMinutes = todayAvailability?.availableMinutes ?? 0;

  const mappedTasks = ((openTasksResult.data ?? []) as DashboardTask[]).map(
    (task) => mapTask(task, formatters),
  );
  const conversationByStudentId = new Map(
    conversations.map((conversation) => [
      conversation.studentId,
      conversation.id,
    ]),
  );
  const mappedStudents = needsStudents
    ? students.map((student) => {
        const readiness = readinessByStudent.get(student.id);
        if (!readiness) {
          throw new Error(
            `readiness: instructor projection missing for student=${student.id}`,
          );
        }
        return mapStudent(
          student,
          lessonWindow,
          balanceMap,
          formatters,
          readiness,
          conversationByStudentId.get(student.id),
        );
      })
    : [];
  const nextAction = deriveNextInstructorAction({
    appointments: mappedAppointments,
    tasks: mappedTasks,
    radar,
  });

  return {
    profile: {
      name: profileName,
      role: "Instructeur",
      status: "Online",
      tenantName: tenant.name,
      email: user.email,
      phone: null,
      ris20Qualified: Boolean(
        (
          ris20QualificationResult.data as {
            is_qualified: boolean;
          } | null
        )?.is_qualified,
      ),
    },
    stats: [
      {
        label: "Rijlessen",
        value: String(displayedLessons.length),
        hint: agendaPeriod?.label ?? "Vandaag",
        tone: "blue",
      },
      {
        label: "Proeflessen",
        value: String(displayedTrials.length),
        hint: agendaPeriod?.label ?? "Vandaag",
        tone: "purple",
      },
      {
        label: "Examens / TTT",
        value: String(displayedExamCount),
        hint: agendaPeriod?.label ?? "Vandaag",
        tone: "rose",
      },
      {
        label: "Open taken",
        value: String(
          openTaskCountResult.count ?? openTasksResult.data?.length ?? 0,
        ),
        hint: "Totaal",
        tone: "green",
      },
    ],
    appointments: mappedAppointments,
    agendaPeriod,
    students: mappedStudents,
    tasks: mappedTasks,
    messages,
    vehicles: activeVehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.label,
      plate: vehicle.license_plate ?? "Kenteken niet ingevuld",
      transmission: vehicle.transmission
        ? VEHICLE_TRANSMISSION_LABEL[vehicle.transmission]
        : "Transmissie onbekend",
      status: mapVehicleStatus(vehicle),
      apk: vehicle.apk_expires_at
        ? dateLabel(vehicle.apk_expires_at, formatters)
        : "Niet ingevuld",
      mileage: vehicle.current_odometer_km
        ? `${vehicle.current_odometer_km.toLocaleString("nl-NL")} km`
        : "Niet ingevuld",
      maintenance:
        vehicle.status === "maintenance" ? "In onderhoud" : "Geen melding",
    })),
    evaluations,
    availability: mapAvailabilityDays(resolvedAvailability),
    availabilityToday: {
      availableMinutes: availableTodayMinutes,
      bookedMinutes: bookedTodayMinutes,
      utilizationPct:
        availableTodayMinutes > 0
          ? Math.min(
              100,
              Math.round((bookedTodayMinutes / availableTodayMinutes) * 100),
            )
          : 0,
      intervalLabel: todayAvailability?.intervalLabel ?? "Geen beschikbaarheid",
      sourceLabel: todayAvailability?.sourceLabel ?? "Geen schema",
    },
    radar,
    nextAction,
  };
}

export function loadInstructorCockpit(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("cockpit");
}

export function loadInstructorAgenda(
  request: InstructorAgendaRequest = {},
): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("agenda", undefined, request);
}

export function loadInstructorStudents(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("students");
}

export function loadInstructorStudent(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("student");
}

export function loadInstructorMessages(
  conversationId?: string,
): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("messages", conversationId);
}

export function loadInstructorVehicles(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("vehicles");
}

export function loadInstructorReports(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("reports");
}

export function loadInstructorProfile(): Promise<InstructorExperience> {
  return loadInstructorRouteExperience("profile");
}

function mapStudentsForRadar(
  students: StudentSummary[],
  lessons: Lesson[],
  balanceMap: Map<string, number>,
): InstructorExperience["radar"] {
  const items: InstructorExperience["radar"] = [];
  for (const student of students) {
    const balance = balanceMap.get(student.id) ?? 0;
    const studentLessons = lessons.filter(
      (lesson) => lesson.student_id === student.id,
    );
    const futureCount = studentLessons.filter(
      (lesson) => new Date(lesson.starts_at).getTime() >= Date.now(),
    ).length;
    if (balance <= 300) {
      items.push({
        id: `balance-${student.id}`,
        student: student.full_name ?? "Leerling",
        reason: "Pakket bijna op",
        priority: "high",
      });
    } else if (futureCount === 0) {
      items.push({
        id: `followup-${student.id}`,
        student: student.full_name ?? "Leerling",
        reason: "Nog geen vervolgles ingepland",
        priority: "medium",
      });
    }
  }
  return items.slice(0, 4);
}
