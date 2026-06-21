import "server-only";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAgendaAppointments, type AgendaAppointmentView } from "@/lib/agenda/appointments";
import { APPOINTMENT_TYPE_LABEL, APPOINTMENT_TYPE_SHORT, durationMinutes } from "@/lib/agenda/types";
import { loadAgendaTrialLessons, type AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import { loadWeeklyAvailability } from "@/lib/availability/service";
import {
  minutesToHHMM,
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  type WeeklyAvailability,
} from "@/lib/availability/types";
import { loadInstructorConversations, loadThreadMessages } from "@/lib/chat/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import { VEHICLE_TRANSMISSION_LABEL, type Lesson, type Vehicle } from "@/lib/lessons/types";
import type { Student, StudentBalance } from "@/lib/students/types";
import type { Task, TaskPriority } from "@/lib/tasks/types";
import {
  addDaysYmd,
  amsterdamHour,
  amsterdamYmd,
  createNlDateTimeFormatter,
  isSameAmsterdamDay,
  startOfAmsterdamDayUtc,
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

type StudentSummary = Pick<Student, "id" | "full_name" | "phone" | "postcode" | "email">;
type DashboardTask = Pick<Task, "id" | "title" | "priority" | "due_date" | "created_at" | "updated_at">;

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFmt = createNlDateTimeFormatter({
  weekday: "short",
  day: "numeric",
  month: "short",
});

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

function greetingFor(date: Date) {
  const hour = amsterdamHour(date);
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function capitalize(text: string) {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function dateLabel(iso: string) {
  return capitalize(shortDateFmt.format(new Date(iso)));
}

function durationLabel(startsAt: string, endsAt: string) {
  return `${Math.max(1, durationMinutes(startsAt, endsAt))} min`;
}

function taskPriority(priority: TaskPriority): InstructorTaskPriority {
  if (priority === "urgent" || priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function appointmentType(type: AgendaAppointmentView["type"]): InstructorAppointmentType {
  if (type === "exam" || type === "interim_test") return "exam";
  if (type === "theory_guidance") return "theory";
  if (type === "private_block" || type === "vacation") return "private";
  if (type === "free_block" || type === "break" || type === "maintenance" || type === "admin") {
    return "admin";
  }
  return "lesson";
}

function mapVehicleStatus(vehicle: Vehicle): InstructorVehicle["status"] {
  if (!vehicle.active || vehicle.status === "inactive" || vehicle.status === "sold") return "unavailable";
  if (vehicle.status === "maintenance" || vehicle.status === "damaged") return "maintenance";
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
): InstructorAppointment {
  const student = studentMap.get(lesson.student_id);
  const vehicle = lesson.vehicle_id ? vehiclesById.get(lesson.vehicle_id) : null;
  return {
    id: lesson.id,
    type: "lesson",
    title: "Rijles",
    studentName: student?.full_name ?? "Leerling",
    startsAt: timeFmt.format(new Date(lesson.starts_at)),
    endsAt: timeFmt.format(new Date(lesson.ends_at)),
    duration: durationLabel(lesson.starts_at, lesson.ends_at),
    location: lesson.location ?? student?.postcode ?? "Locatie volgt",
    vehicle: vehicleLabel(vehicle),
    status: lesson.status === "completed" ? "completed" : lesson.status === "in_progress" ? "confirmed" : "planned",
    href: `/instructor/evaluations/${lesson.id}`,
  };
}

function mapTrial(trial: AgendaTrialLesson): InstructorAppointment {
  return {
    id: trial.id,
    type: "trial",
    title: "Proefles",
    studentName: trial.lead_name,
    startsAt: timeFmt.format(new Date(trial.starts_at)),
    endsAt: timeFmt.format(new Date(trial.ends_at)),
    duration: `${trial.duration_min} min`,
    location: trial.pickup_location ?? "Ophaallocatie volgt",
    status: trial.status === "confirmed" ? "confirmed" : "planned",
    href: "/instructor/intake",
  };
}

function mapAppointment(appointment: AgendaAppointmentView, vehiclesById: Map<string, Vehicle>): InstructorAppointment {
  const vehicle = appointment.vehicle_id ? vehiclesById.get(appointment.vehicle_id) : null;
  return {
    id: appointment.id,
    type: appointmentType(appointment.type),
    title: appointment.title ?? APPOINTMENT_TYPE_SHORT[appointment.type],
    studentName: appointment.student_name ?? appointment.team_name ?? undefined,
    startsAt: timeFmt.format(new Date(appointment.starts_at)),
    endsAt: timeFmt.format(new Date(appointment.ends_at)),
    duration: durationLabel(appointment.starts_at, appointment.ends_at),
    location: appointment.location ?? appointment.team_name ?? APPOINTMENT_TYPE_LABEL[appointment.type],
    vehicle: vehicleLabel(vehicle),
    status: appointment.status === "completed" ? "completed" : "planned",
    href: `/instructor/agenda/${appointment.id}`,
  };
}

function mapStudent(
  student: StudentSummary,
  lessons: Lesson[],
  balanceMap: Map<string, number>,
): InstructorStudent {
  const studentLessons = lessons
    .filter((lesson) => lesson.student_id === student.id)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const now = Date.now();
  const completed = studentLessons.filter((lesson) => lesson.status === "completed");
  const next = studentLessons.find((lesson) => new Date(lesson.starts_at).getTime() >= now);
  const latest = [...completed].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
  const balance = balanceMap.get(student.id) ?? 0;
  const progress = Math.max(0, Math.min(100, Math.round((completed.length / Math.max(40, completed.length || 1)) * 100)));

  return {
    id: student.id,
    name: student.full_name ?? "Leerling",
    license: `${completed.length} lessen afgerond`,
    progress,
    status: balance <= 300 ? "attention" : progress >= 75 ? "exam" : completed.length === 0 ? "new" : "active",
    nextLesson: next ? `${dateLabel(next.starts_at)} - ${timeFmt.format(new Date(next.starts_at))}` : "Niet gepland",
    latestLesson: latest ? `${dateLabel(latest.starts_at)} - ${timeFmt.format(new Date(latest.starts_at))}` : "Nog geen les afgerond",
    phone: student.phone ?? "Niet ingevuld",
    email: student.email ?? "Niet ingevuld",
    attention: balance <= 300 ? "Lespakket bijna op of vervolgplanning nodig." : "Geen urgente aandachtspunten.",
    readiness: `${progress}% voortgang`,
  };
}

function mapTask(task: DashboardTask): InstructorTask {
  return {
    id: task.id,
    title: task.title,
    subject: task.due_date ? `Deadline ${dateLabel(task.due_date)}` : "Geen deadline",
    due: task.due_date ? timeFmt.format(new Date(task.due_date)) : "Later",
    priority: taskPriority(task.priority),
    status: task.due_date && new Date(task.due_date).getTime() < Date.now() ? "late" : "open",
  };
}

function mapAvailabilityDays(weekly: readonly WeeklyAvailability[]): InstructorAvailabilityDay[] {
  const blocksByWeekday = new Map<number, WeeklyAvailability[]>();
  for (const block of weekly) {
    const list = blocksByWeekday.get(block.weekday) ?? [];
    list.push(block);
    blocksByWeekday.set(block.weekday, list);
  }

  return WEEKDAY_ORDER.map((weekday) => {
    const blocks = (blocksByWeekday.get(weekday) ?? []).sort((a, b) => a.start_min - b.start_min);

    if (blocks.length === 0) {
      return {
        day: WEEKDAY_LABEL[weekday],
        active: false,
        start: "-",
        end: "-",
        breakLabel: "Niet ingesteld",
      };
    }

    const start = Math.min(...blocks.map((block) => block.start_min));
    const end = Math.max(...blocks.map((block) => block.end_min));

    return {
      day: WEEKDAY_LABEL[weekday],
      active: true,
      start: minutesToHHMM(start),
      end: minutesToHHMM(end),
      breakLabel: blocks.length > 1 ? `${blocks.length} blokken` : "Een blok",
    };
  });
}

export async function loadInstructorExperience(): Promise<InstructorExperience> {
  const { user, tenant, roles } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const supabase = await createServerSupabaseClient();
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;
  const now = new Date();
  const todayYmd = amsterdamYmd(now);
  const dayStart = startOfAmsterdamDayUtc(todayYmd);
  const dayEnd = startOfAmsterdamDayUtc(addDaysYmd(todayYmd, 1));
  const horizonEnd = startOfAmsterdamDayUtc(addDaysYmd(todayYmd, 15));

  const [
    lessonWindowResult,
    openTasksResult,
    openTaskCountResult,
    todayTrials,
    appointmentWindow,
    conversations,
    vehicles,
    weeklyAvailability,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", horizonEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title, priority, due_date, created_at, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("assignee_user_id", user.id)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(8),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("assignee_user_id", user.id)
      .is("archived_at", null),
    loadAgendaTrialLessons(supabase, {
      tenantId: tenant.id,
      from: dayStart,
      to: dayEnd,
      instructorId: user.id,
    }),
    loadAgendaAppointments(supabase, {
      tenantId: tenant.id,
      from: dayStart,
      to: horizonEnd,
      instructorId: user.id,
    }),
    loadInstructorConversations({
      tenantId: tenant.id,
      instructorId: user.id,
      isAdmin,
    }),
    loadVehicles(supabase, tenant.id, { includeShared: true }),
    loadWeeklyAvailability(supabase, tenant.id, user.id),
  ]);

  const lessonWindow = (lessonWindowResult.data ?? []) as Lesson[];
  const todayLessons = lessonWindow.filter((lesson) => isSameAmsterdamDay(new Date(lesson.starts_at), now));
  const todayAppointments = (appointmentWindow ?? []).filter((appointment) =>
    isSameAmsterdamDay(new Date(appointment.starts_at), now),
  );
  const studentIds = Array.from(
    new Set([
      ...lessonWindow.map((lesson) => lesson.student_id),
      ...appointmentWindow
        .map((appointment) => appointment.student_id)
        .filter((studentId): studentId is string => Boolean(studentId)),
    ]),
  );

  const [{ data: studentsRaw }, { data: balancesRaw }] = await Promise.all([
    studentIds.length
      ? supabase
          .from("students")
          .select("id, full_name, phone, postcode, email")
          .eq("tenant_id", tenant.id)
          .in("id", studentIds)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabase
          .from("student_credit_balance")
          .select("student_id, balance")
          .eq("tenant_id", tenant.id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const students = (studentsRaw ?? []) as StudentSummary[];
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((balance) => [balance.student_id, balance.balance]),
  );
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const mappedAppointments = [
    ...todayLessons.map((lesson) => mapLesson(lesson, studentMap, vehiclesById)),
    ...todayTrials.map(mapTrial),
    ...todayAppointments.map((appointment) => mapAppointment(appointment, vehiclesById)),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const activeVehicles = vehicles.filter((vehicle) => vehicle.active);
  const evaluations: InstructorEvaluation[] = lessonWindow.slice(0, 8).map((lesson) => {
    const student = studentMap.get(lesson.student_id);
    return {
      id: lesson.id,
      studentId: lesson.student_id,
      studentName: student?.full_name ?? "Leerling",
      lessonLabel: "Rijles",
      lessonDate: `${dateLabel(lesson.starts_at)} - ${timeFmt.format(new Date(lesson.starts_at))}`,
      status: lesson.status === "completed" ? "published" : "todo",
      mode: "ris",
      modules: [],
    };
  });
  const conversationMessages = await Promise.all(
    conversations.slice(0, 8).map(async (conversation) => ({
      conversationId: conversation.id,
      messages: await loadThreadMessages(tenant.id, conversation.id),
    })),
  );
  const messagesByConversation = new Map(
    conversationMessages.map((thread) => [thread.conversationId, thread.messages]),
  );
  const messages: InstructorMessageThread[] = conversations.slice(0, 8).map((conversation) => ({
    id: conversation.id,
    name: conversation.studentName,
    role: "Leerling",
    preview: conversation.lastMessagePreview ?? "Nog geen berichtinhoud.",
    time: conversation.lastMessageAt ? timeFmt.format(new Date(conversation.lastMessageAt)) : "Nieuw",
    unread: conversation.unreadCount,
    messages: (messagesByConversation.get(conversation.id) ?? []).map((message) => ({
      id: message.id,
      sender: message.senderSide,
      body: message.body,
      time: timeFmt.format(new Date(message.createdAt)),
    })),
  }));
  const radar = mapStudentsForRadar(students, lessonWindow, balanceMap);
  const profileName = user.profile?.full_name ?? user.email ?? "Instructeur";
  const examTodayCount = todayAppointments.filter((appointment) => appointment.type === "exam" || appointment.type === "interim_test").length;

  return {
    profile: {
      name: profileName,
      role: "Instructeur",
      status: "Online",
      tenantName: tenant.name,
      email: user.email,
      phone: null,
    },
    stats: [
      { label: "Rijlessen", value: String(todayLessons.length), hint: "Vandaag", tone: "blue" },
      { label: "Proeflessen", value: String(todayTrials.length), hint: "Vandaag", tone: "purple" },
      { label: "Examens / TTT", value: String(examTodayCount), hint: "Vandaag", tone: "rose" },
      { label: "Open taken", value: String(openTaskCountResult.count ?? openTasksResult.data?.length ?? 0), hint: "Totaal", tone: "green" },
    ],
    appointments: mappedAppointments,
    students: students.map((student) => mapStudent(student, lessonWindow, balanceMap)),
    tasks: ((openTasksResult.data ?? []) as DashboardTask[]).map(mapTask),
    messages,
    vehicles: activeVehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.label,
      plate: vehicle.license_plate ?? "Kenteken niet ingevuld",
      transmission: vehicle.transmission ? VEHICLE_TRANSMISSION_LABEL[vehicle.transmission] : "Transmissie onbekend",
      status: mapVehicleStatus(vehicle),
      apk: vehicle.apk_expires_at ? dateLabel(vehicle.apk_expires_at) : "Niet ingevuld",
      mileage: vehicle.current_odometer_km ? `${vehicle.current_odometer_km.toLocaleString("nl-NL")} km` : "Niet ingevuld",
      maintenance: vehicle.status === "maintenance" ? "In onderhoud" : "Geen melding",
    })),
    evaluations,
    availability: mapAvailabilityDays(weeklyAvailability),
    radar,
  };
}

function mapStudentsForRadar(
  students: StudentSummary[],
  lessons: Lesson[],
  balanceMap: Map<string, number>,
): InstructorExperience["radar"] {
  const items: InstructorExperience["radar"] = [];
  for (const student of students) {
    const balance = balanceMap.get(student.id) ?? 0;
    const studentLessons = lessons.filter((lesson) => lesson.student_id === student.id);
    const futureCount = studentLessons.filter((lesson) => new Date(lesson.starts_at).getTime() >= Date.now()).length;
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

export function instructorGreeting(data: InstructorExperience, now = new Date()) {
  return `${greetingFor(now)} ${firstName(data.profile.name)}!`;
}
