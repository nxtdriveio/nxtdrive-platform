import "server-only";

import type { MobileInstructorContext } from "@/lib/mobile/auth";
import {
  addDaysYmd,
  resolveTenantTimeZone,
  startOfZonedDayUtc,
  zonedYmd,
} from "@/lib/datetime";
import { resolveAvailabilityDays } from "@/lib/availability/service";
import type {
  AvailabilityException,
  WeeklyAvailability,
} from "@/lib/availability/types";
import { instructorTaskStatus } from "@/lib/instructor/tasks";

type LessonRow = {
  id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string | null;
};

type AppointmentRow = {
  id: string;
  student_id: string | null;
  type: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
};

type ConversationRow = {
  id: string;
  student_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  instructor_last_read_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_side: "instructor" | "student";
  body: string;
  created_at: string;
};

const APPOINTMENT_LABELS: Record<string, string> = {
  exam: "Examen",
  interim_test: "Tussentijdse toets",
  theory_guidance: "Theoriebegeleiding",
  free_block: "Vrij blok",
  break: "Pauze",
  private_block: "Privéblokkade",
  maintenance: "Onderhoud",
  admin: "Administratie",
  vacation: "Vakantie",
};

export async function loadNativeInstructorBootstrap(
  context: MobileInstructorContext,
) {
  const { service, tenant, user } = context;
  const now = new Date();
  const timeZone = resolveTenantTimeZone(tenant);
  const todayYmd = zonedYmd(now, timeZone);
  const todayStart = startOfZonedDayUtc(todayYmd, timeZone);
  const tomorrowStart = startOfZonedDayUtc(addDaysYmd(todayYmd, 1), timeZone);
  const horizonEnd = startOfZonedDayUtc(addDaysYmd(todayYmd, 15), timeZone);

  const [
    profileResult,
    lessonsResult,
    appointmentsResult,
    trialsResult,
    tasksResult,
    conversationsResult,
    vehiclesResult,
    qualificationResult,
    weeklyAvailabilityResult,
    availabilityExceptionsResult,
  ] = await Promise.all([
    service
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("lessons")
      .select("id, student_id, starts_at, ends_at, status, location")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .order("starts_at", { ascending: false })
      .limit(2500),
    service
      .from("agenda_appointments")
      .select(
        "id, student_id, type, title, starts_at, ends_at, status, location",
      )
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .neq("status", "cancelled")
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", horizonEnd.toISOString())
      .order("starts_at", { ascending: true }),
    service
      .from("trial_lessons")
      .select(
        "id, lead_id, starts_at, ends_at, status, pickup_location, duration_min",
      )
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .in("status", ["provisional", "confirmed"])
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", horizonEnd.toISOString())
      .order("starts_at", { ascending: true }),
    service
      .from("tasks")
      .select("id, title, description, priority, due_date")
      .eq("tenant_id", tenant.id)
      .eq("assignee_user_id", user.id)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("chat_conversations")
      .select(
        "id, student_id, last_message_at, last_message_preview, instructor_last_read_at",
      )
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50),
    service
      .from("vehicles")
      .select("id, label, license_plate, transmission, status, active")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    service
      .from("instructor_training_qualifications")
      .select("is_qualified")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .eq("training_method", "RIS_2_0")
      .maybeSingle(),
    service
      .from("instructor_availability")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .is("branch_id", null)
      .order("weekday", { ascending: true })
      .order("start_min", { ascending: true }),
    service
      .from("instructor_availability_exception")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .is("branch_id", null)
      .gte("exception_date", todayYmd)
      .lte("exception_date", addDaysYmd(todayYmd, 7))
      .order("exception_date", { ascending: true }),
  ]);

  for (const result of [
    profileResult,
    lessonsResult,
    appointmentsResult,
    trialsResult,
    tasksResult,
    conversationsResult,
    vehiclesResult,
    qualificationResult,
    weeklyAvailabilityResult,
    availabilityExceptionsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const lessons = (lessonsResult.data ?? []) as LessonRow[];
  const futureLessons = lessons
    .filter(
      (lesson) =>
        lesson.starts_at >= todayStart.toISOString() &&
        lesson.starts_at < horizonEnd.toISOString() &&
        !lesson.status.startsWith("cancelled"),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const appointments = (appointmentsResult.data ?? []) as AppointmentRow[];
  const trials = (trialsResult.data ?? []) as Array<{
    id: string;
    lead_id: string;
    starts_at: string;
    ends_at: string;
    status: string;
    pickup_location: string | null;
  }>;
  const tasks = (tasksResult.data ?? []) as TaskRow[];
  const conversations = (conversationsResult.data ?? []) as ConversationRow[];
  const taskIds = tasks.map((task) => task.id);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const studentIdsFromData = new Set<string>([
    ...lessons.map((lesson) => lesson.student_id),
    ...appointments
      .map((appointment) => appointment.student_id)
      .filter((id): id is string => Boolean(id)),
    ...conversations.map((conversation) => conversation.student_id),
  ]);

  const [taskLinksResult, messagesResult, adminStudentsResult, leadsResult] =
    await Promise.all([
      taskIds.length
        ? service
            .from("task_links")
            .select("task_id, entity_id")
            .eq("tenant_id", tenant.id)
            .eq("entity_type", "student")
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      conversationIds.length
        ? service
            .from("chat_messages")
            .select("id, conversation_id, sender_side, body, created_at")
            .eq("tenant_id", tenant.id)
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: true })
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
      context.isAdmin
        ? service
            .from("students")
            .select("id")
            .eq("tenant_id", tenant.id)
            .order("full_name", { ascending: true })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      trials.length
        ? service
            .from("leads")
            .select("id, full_name")
            .eq("tenant_id", tenant.id)
            .in(
              "id",
              trials.map((trial) => trial.lead_id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);
  for (const result of [
    taskLinksResult,
    messagesResult,
    adminStudentsResult,
    leadsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const taskStudentById = new Map(
    (
      (taskLinksResult.data ?? []) as Array<{
        task_id: string;
        entity_id: string;
      }>
    ).map((link) => [link.task_id, link.entity_id]),
  );
  for (const studentId of taskStudentById.values()) {
    studentIdsFromData.add(studentId);
  }
  for (const row of (adminStudentsResult.data ?? []) as Array<{ id: string }>) {
    studentIdsFromData.add(row.id);
  }
  const studentIds = Array.from(studentIdsFromData);

  const [studentsResult, balancesResult] = await Promise.all([
    studentIds.length
      ? service
          .from("students")
          .select("id, full_name, email, phone, postcode")
          .eq("tenant_id", tenant.id)
          .in("id", studentIds)
          .order("full_name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? service
          .from("student_credit_balance")
          .select("student_id, balance")
          .eq("tenant_id", tenant.id)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (studentsResult.error) throw studentsResult.error;
  if (balancesResult.error) throw balancesResult.error;

  const students = (studentsResult.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    postcode: string | null;
  }>;
  const studentNameById = new Map(
    students.map((student) => [
      student.id,
      student.full_name ?? "Naamloze leerling",
    ]),
  );
  const balanceByStudent = new Map(
    (
      (balancesResult.data ?? []) as Array<{
        student_id: string;
        balance: number;
      }>
    ).map((balance) => [balance.student_id, Number(balance.balance) || 0]),
  );
  const leadNameById = new Map(
    (
      (leadsResult.data ?? []) as Array<{
        id: string;
        full_name: string | null;
      }>
    ).map((lead) => [lead.id, lead.full_name ?? "Proefleerling"]),
  );

  const nativeAppointments = [
    ...futureLessons.map((lesson) => ({
      id: lesson.id,
      kind: "lesson",
      title: "Rijles",
      studentName: studentNameById.get(lesson.student_id) ?? "Leerling",
      startsAt: lesson.starts_at,
      endsAt: lesson.ends_at,
      location: lesson.location,
      status: lesson.status,
    })),
    ...appointments.map((appointment) => ({
      id: appointment.id,
      kind: appointment.type,
      title:
        appointment.title ?? APPOINTMENT_LABELS[appointment.type] ?? "Afspraak",
      studentName: appointment.student_id
        ? (studentNameById.get(appointment.student_id) ?? "Leerling")
        : null,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      location: appointment.location,
      status: appointment.status,
    })),
    ...trials.map((trial) => ({
      id: trial.id,
      kind: "trial",
      title: "Proefles",
      studentName: leadNameById.get(trial.lead_id) ?? "Proefleerling",
      startsAt: trial.starts_at,
      endsAt: trial.ends_at,
      location: trial.pickup_location,
      status: trial.status,
    })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const messages = (messagesResult.data ?? []) as MessageRow[];
  const messagesByConversation = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const existing = messagesByConversation.get(message.conversation_id) ?? [];
    existing.push(message);
    messagesByConversation.set(message.conversation_id, existing);
  }

  const todayLessons = futureLessons.filter(
    (lesson) =>
      lesson.starts_at >= todayStart.toISOString() &&
      lesson.starts_at < tomorrowStart.toISOString(),
  );
  const todayAppointments = nativeAppointments.filter(
    (appointment) =>
      appointment.startsAt >= todayStart.toISOString() &&
      appointment.startsAt < tomorrowStart.toISOString(),
  );
  const availability = resolveAvailabilityDays(
    (weeklyAvailabilityResult.data ?? []) as WeeklyAvailability[],
    (availabilityExceptionsResult.data ?? []) as AvailabilityException[],
    { from: todayStart, days: 7, timeZone },
  );
  const profile = profileResult.data as {
    full_name: string | null;
    email: string | null;
  } | null;

  return {
    profile: {
      id: user.id,
      name: profile?.full_name ?? user.email ?? "Instructeur",
      email: profile?.email ?? user.email ?? "",
      activeTenantId: tenant.id,
      tenantName: tenant.name,
      ris20Qualified: Boolean(
        (
          qualificationResult.data as {
            is_qualified?: boolean;
          } | null
        )?.is_qualified,
      ),
    },
    tenants: context.tenants.map((item) => ({ id: item.id, name: item.name })),
    stats: [
      {
        label: "Rijlessen",
        value: String(todayLessons.length),
        hint: "Vandaag",
        tone: "blue",
      },
      {
        label: "Proeflessen",
        value: String(
          todayAppointments.filter(
            (appointment) => appointment.kind === "trial",
          ).length,
        ),
        hint: "Vandaag",
        tone: "purple",
      },
      {
        label: "Examens / TTT",
        value: String(
          todayAppointments.filter(
            (appointment) =>
              appointment.kind === "exam" ||
              appointment.kind === "interim_test",
          ).length,
        ),
        hint: "Vandaag",
        tone: "rose",
      },
      {
        label: "Open taken",
        value: String(tasks.length),
        hint: "Totaal",
        tone: "green",
      },
    ],
    appointments: nativeAppointments,
    students: students.map((student) => {
      const studentLessons = lessons.filter(
        (lesson) => lesson.student_id === student.id,
      );
      const nextLesson = studentLessons
        .filter(
          (lesson) =>
            lesson.starts_at >= now.toISOString() &&
            !lesson.status.startsWith("cancelled"),
        )
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
      return {
        id: student.id,
        name: student.full_name ?? "Naamloze leerling",
        email: student.email,
        phone: student.phone,
        postcode: student.postcode,
        creditMinutes: Math.max(
          0,
          Math.round(balanceByStudent.get(student.id) ?? 0),
        ),
        completedLessons: studentLessons.filter(
          (lesson) => lesson.status === "completed",
        ).length,
        nextLessonAt: nextLesson?.starts_at ?? null,
      };
    }),
    tasks: tasks.map((task) => {
      const studentId = taskStudentById.get(task.id) ?? null;
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.due_date,
        status: instructorTaskStatus(task.due_date, todayYmd),
        studentId,
        studentName: studentId
          ? (studentNameById.get(studentId) ?? "Onbekende leerling")
          : null,
      };
    }),
    conversations: conversations.map((conversation) => {
      const thread = messagesByConversation.get(conversation.id) ?? [];
      const unreadCount = thread.filter(
        (message) =>
          message.sender_side === "student" &&
          (!conversation.instructor_last_read_at ||
            message.created_at > conversation.instructor_last_read_at),
      ).length;
      return {
        id: conversation.id,
        studentName: studentNameById.get(conversation.student_id) ?? "Leerling",
        preview: conversation.last_message_preview,
        lastMessageAt: conversation.last_message_at,
        unreadCount,
        messages: thread.map((message) => ({
          id: message.id,
          sender: message.sender_side,
          body: message.body,
          createdAt: message.created_at,
        })),
      };
    }),
    vehicles: (
      (vehiclesResult.data ?? []) as Array<{
        id: string;
        label: string;
        license_plate: string | null;
        transmission: string | null;
        status: string;
      }>
    ).map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.label,
      licensePlate: vehicle.license_plate,
      transmission: vehicle.transmission,
      status: vehicle.status,
    })),
    availability: availability.map((day) => ({
      label: day.dayLabel,
      date: day.date,
      active: day.active,
      intervalLabel: day.intervalLabel,
      availableMinutes: day.availableMinutes,
    })),
  };
}
