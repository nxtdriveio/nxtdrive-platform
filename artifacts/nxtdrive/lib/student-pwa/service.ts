import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getInstructorNames } from "@/lib/students/instructor-names";
import { loadStudentLeskaart } from "@/lib/skills/student-leskaart-data";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentCbrSummary } from "@/lib/cbr/data";
import { VEHICLE_TRANSMISSION_LABEL, type Lesson, type VehicleTransmission } from "@/lib/lessons/types";
import type { InvoiceStatus } from "@/lib/invoices/types";
import type { StudentExperience, StudentInvoiceStatus, StudentLesson, StudentMessageThread } from "./types";
import { createNlDateTimeFormatter, resolveTenantTimeZone } from "@/lib/datetime";

const quickActions: StudentExperience["quickActions"] = [
  { label: "Planning", href: "/student/agenda", description: "Je lessen en tijden", iconName: "calendar" },
  { label: "Voortgang", href: "/student/journey", description: "Je rijbewijsreis", iconName: "route" },
  { label: "Betalingen", href: "/student/payments", description: "Tegoed en facturen", iconName: "wallet" },
  { label: "Examens", href: "/student/cbr-exams", description: "CBR en gereedheid", iconName: "badge" },
  { label: "Theorie", href: "/student/theory", description: "Huiswerk en toetsen", iconName: "book" },
  { label: "Berichten", href: "/student/messages", description: "Chat met je rijschool", iconName: "message" },
];

type StudentFormatters = {
  dateFmt: Intl.DateTimeFormat;
  dateLongFmt: Intl.DateTimeFormat;
  timeFmt: Intl.DateTimeFormat;
};

function createStudentFormatters(timeZone: string): StudentFormatters {
  return {
    dateFmt: createNlDateTimeFormatter(
      {
        weekday: "short",
        day: "numeric",
        month: "short",
      },
      timeZone,
    ),
    dateLongFmt: createNlDateTimeFormatter(
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      },
      timeZone,
    ),
    timeFmt: createNlDateTimeFormatter(
      {
        hour: "2-digit",
        minute: "2-digit",
      },
      timeZone,
    ),
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Leerling";
}

function euros(cents: number) {
  return (cents / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function invoiceStatus(status: InvoiceStatus, dueDate: string | null): StudentInvoiceStatus {
  if (status === "paid") return "paid";
  if (status === "open" && dueDate && new Date(dueDate).getTime() < Date.now()) return "overdue";
  return "open";
}

function mapLesson(
  lesson: Lesson,
  instructorName: string,
  vehicle: { label: string; transmission: VehicleTransmission | null } | null,
  formatters: StudentFormatters,
): StudentLesson {
  const start = new Date(lesson.starts_at);
  const end = new Date(lesson.ends_at);
  return {
    id: lesson.id,
    title: lesson.status === "completed" ? "Les afgerond" : "Rijles",
    dateLabel: formatters.dateFmt.format(start),
    timeLabel: `${formatters.timeFmt.format(start)} - ${formatters.timeFmt.format(end)}`,
    location: lesson.location ?? "Locatie volgt",
    instructor: instructorName,
    vehicle: vehicle
      ? [vehicle.label, vehicle.transmission ? VEHICLE_TRANSMISSION_LABEL[vehicle.transmission] : null]
          .filter(Boolean)
          .join(" - ")
      : "Voertuig volgt",
    lessonType: "Rijles",
    status:
      lesson.status === "completed"
        ? "completed"
        : lesson.status === "planned" || lesson.status === "in_progress"
          ? "planned"
          : lesson.status.startsWith("cancelled")
            ? "cancelled"
            : "pending",
    href: `/student/agenda/${lesson.id}`,
    preparation: [lesson.attention_points, lesson.advice, lesson.student_note, lesson.notes]
      .filter((value): value is string => Boolean(value?.trim()))
      .flatMap((value) =>
        value
          .split(/\r?\n|•|;|,/)
          .map((entry) => entry.trim())
          .filter(Boolean),
      )
      .slice(0, 4),
    publishedReflection: lesson.progress_summary
      ? {
          summary: lesson.progress_summary,
          feedback: lesson.advice ?? "Je instructeur heeft feedback gepubliceerd.",
          nextFocus: lesson.attention_points ?? "Volgende les verder oefenen.",
        }
      : undefined,
  };
}

export async function getStudentExperience({
  studentName,
  tenantName,
  email,
  phone,
  tenantId,
  studentId,
  timeZone,
}: {
  studentName: string;
  tenantName: string;
  email?: string | null;
  phone?: string | null;
  tenantId?: string;
  studentId?: string | null;
  timeZone?: string | null;
}): Promise<StudentExperience> {
  const first = firstName(studentName);
  const formatters = createStudentFormatters(resolveTenantTimeZone(timeZone));

  if (!tenantId || !studentId) {
    return buildEmptyExperience({ studentName, tenantName, email, phone, first });
  }

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const [
    lessonsRes,
    invoicesRes,
    balanceRes,
    notificationsRes,
    leskaart,
    readiness,
    cbrSummary,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .order("starts_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, invoice_no, status, issued_at, due_date, paid_at, total_cents")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .order("issued_at", { ascending: false })
      .limit(12),
    supabase
      .from("student_credit_balance")
      .select("balance")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("app_notifications")
      .select("id, type, title, body, created_at, read_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(12),
    loadStudentLeskaart(supabase, tenantId, studentId),
    loadStudentReadiness(supabase, tenantId, studentId),
    loadStudentCbrSummary(supabase, tenantId, studentId),
  ]);

  if (lessonsRes.error) throw new Error(`student pwa: lessen laden mislukt: ${lessonsRes.error.message}`);
  if (invoicesRes.error) throw new Error(`student pwa: facturen laden mislukt: ${invoicesRes.error.message}`);
  if (balanceRes.error) throw new Error(`student pwa: tegoed laden mislukt: ${balanceRes.error.message}`);
  if (notificationsRes.error) throw new Error(`student pwa: notificaties laden mislukt: ${notificationsRes.error.message}`);

  const lessons = (lessonsRes.data ?? []) as Lesson[];
  const instructorNames = await getInstructorNames(Array.from(new Set(lessons.map((lesson) => lesson.instructor_id))));
  const vehicleIds = Array.from(new Set(lessons.map((lesson) => lesson.vehicle_id).filter((id): id is string => Boolean(id))));
  const vehicleRows = vehicleIds.length
    ? await supabase
        .from("vehicles")
        .select("id, label, transmission")
        .eq("tenant_id", tenantId)
        .in("id", vehicleIds)
    : { data: [], error: null };
  if (vehicleRows.error) throw new Error(`student pwa: voertuigen laden mislukt: ${vehicleRows.error.message}`);
  const vehiclesById = new Map(
    ((vehicleRows.data ?? []) as { id: string; label: string; transmission: VehicleTransmission | null }[]).map((vehicle) => [
      vehicle.id,
      vehicle,
    ]),
  );

  const mappedLessons = lessons.map((lesson) =>
    mapLesson(
      lesson,
      instructorNames.get(lesson.instructor_id) ?? tenantName,
      lesson.vehicle_id ? vehiclesById.get(lesson.vehicle_id) ?? null : null,
      formatters,
    ),
  );
  const nextLesson =
    mappedLessons.find((lesson) => {
      const raw = lessons.find((item) => item.id === lesson.id);
      return raw ? raw.status !== "completed" && new Date(raw.starts_at).toISOString() >= nowIso : false;
    }) ?? null;
  const previousLessons = mappedLessons
    .filter((lesson) => lesson.id !== nextLesson?.id && lesson.status !== "planned")
    .reverse()
    .slice(0, 8);

  const invoices = ((invoicesRes.data ?? []) as Array<{
    id: string;
    invoice_no: number;
    status: InvoiceStatus;
    issued_at: string | null;
    due_date: string | null;
    paid_at: string | null;
    total_cents: number;
  }>).map((invoice) => ({
    id: invoice.id,
    invoiceNumber: String(invoice.invoice_no),
    dateLabel: invoice.issued_at ? formatters.dateLongFmt.format(new Date(invoice.issued_at)) : "Datum volgt",
    amountLabel: euros(invoice.total_cents),
    status: invoiceStatus(invoice.status, invoice.due_date),
    href: "/student/payments",
  }));

  const messages = await loadStudentMessageThreads({
    tenantId,
    studentId,
    studentName: first,
    formatters,
  });

  const journeyModules = leskaart.categories.map((category) => ({
    id: category.id,
    title: category.label,
    description: `${category.scoredLeaves}/${category.totalLeaves} onderdelen beoordeeld`,
    progress: category.progressPct,
    status: category.progressPct >= 100 ? "done" : category.progressPct > 0 ? "active" : "todo",
  } as const));
  const journeyTrend = leskaart.history.slice(-3).map((point, index) => ({
    label: formatters.dateFmt.format(new Date(point.startsAt)),
    module1: journeyModules[0]?.progress ?? 0,
    module2: journeyModules[1]?.progress ?? 0,
    module3: journeyModules[2]?.progress ?? 0,
    module4: journeyModules[3]?.progress ?? 0,
    module5: journeyModules[4]?.progress ?? 0,
  }));
  if (journeyTrend.length === 0) {
    journeyTrend.push({ label: "Start", module1: 0, module2: 0, module3: 0, module4: 0, module5: 0 });
  }

  const balanceMinutes = (balanceRes.data as { balance?: number } | null)?.balance ?? 0;
  const openInvoicesTotal = invoices
    .filter((invoice) => invoice.status === "open" || invoice.status === "overdue")
    .reduce((sum, invoice) => sum + Number(invoice.amountLabel.replace(/[^\d,-]/g, "").replace(",", ".")) * 100, 0);

  return {
    profile: {
      id: studentId,
      name: studentName,
      firstName: first,
      tenantName,
      roleLabel: "Leerling",
      email,
      phone,
    },
    nextStep: {
      title: journeyModules.find((module) => module.status === "active")?.title ?? "Jouw volgende stap",
      body: leskaart.recent?.skills[0]?.label
        ? `Blijf oefenen met ${leskaart.recent.skills[0].label.toLowerCase()}.`
        : "Je volgende focus verschijnt zodra je instructeur de leskaart bijwerkt.",
      ctaLabel: "Bekijk plan",
      href: "/student/journey",
      progressLabel: nextLesson?.status === "planned" ? "Volgende les gepland" : "Nog te plannen",
      progressCurrent: nextLesson?.status === "planned" ? 1 : 0,
      progressTotal: 1,
    },
    quickActions,
    nextLesson,
    previousLessons,
    journeyModules,
    journeyTrend,
    ris: {
      active: journeyModules.length > 0,
      modules: journeyModules,
      reflection: leskaart.recent
        ? {
            title: "Laatste leskaartupdate",
            lessonLabel: formatters.dateFmt.format(new Date(leskaart.recent.startsAt)),
            publishedAt: leskaart.recent.isToday ? "Vandaag" : formatters.dateFmt.format(new Date(leskaart.recent.startsAt)),
            whatWentWell: leskaart.recent.skills[0]?.label ?? "Nieuwe score toegevoegd",
            workingOn: leskaart.recent.skills[1]?.label ?? "Volgende focus volgt vanuit je instructeur",
            nextFocus: leskaart.recent.skills[2]?.label ?? "Blijf consequent oefenen",
          }
        : null,
    },
    theory: {
      progress: cbrSummary.preconditions.theorieBehaald ? 100 : 0,
      statusCopy: cbrSummary.preconditions.theorieBehaald
        ? "Je theorie staat als behaald geregistreerd."
        : "Theorievoortgang wordt zichtbaar zodra je rijschool dit registreert.",
      homework: [],
      tests: [],
    },
    payments: {
      balance: {
        creditCents: 0,
        creditLabel: `${Math.round(balanceMinutes / 60)} lesuur`,
        hoursAvailable: `${Math.round((balanceMinutes / 60) * 10) / 10} lesuur beschikbaar`,
        warning: balanceMinutes <= 600 ? "Let op: minder dan 10 uur. Plan op tijd je volgende pakket." : "",
      },
      invoices,
      history: invoices.slice(0, 5).map((invoice) => ({
        id: invoice.id,
        title: invoice.status === "paid" ? "Factuur betaald" : "Factuur open",
        dateLabel: invoice.dateLabel,
        amountLabel: invoice.amountLabel,
      })),
    },
    cbr: {
      readiness: readiness.readinessPct,
      readinessCopy:
        readiness.readinessPct >= 90
          ? "Je staat er sterk voor richting de volgende examenstap."
          : "Je gereedheid groeit mee met de leskaart en CBR-voorwaarden.",
      statuses: [
        {
          id: "authorization",
          title: "Machtiging",
          status: cbrSummary.preconditions.machtigingGeregeld ? "approved" : "in_progress",
          explanation: cbrSummary.preconditions.machtigingGeregeld ? "Machtiging geregeld." : "Nog in behandeling.",
        },
        {
          id: "theory",
          title: "Theorie examen",
          status: cbrSummary.preconditions.theorieBehaald ? "passed" : "not_planned",
          explanation: cbrSummary.preconditions.theorieBehaald ? "Geslaagd geregistreerd." : "Nog niet als behaald geregistreerd.",
        },
        {
          id: "health",
          title: "Gezondheidsverklaring",
          status: cbrSummary.preconditions.gezondheidsverklaringGeregeld ? "approved" : "not_planned",
          explanation: cbrSummary.preconditions.gezondheidsverklaringGeregeld ? "Goedgekeurd." : "Nog niet geregeld.",
        },
        {
          id: "practice",
          title: "Praktijkexamen",
          status: cbrSummary.derived.nextAppointmentType === "exam" ? "planned" : "not_planned",
          explanation: cbrSummary.derived.nextAppointmentAt
            ? `Gepland op ${formatters.dateLongFmt.format(new Date(cbrSummary.derived.nextAppointmentAt))}.`
            : "Nog niet gepland.",
        },
      ],
    },
    messages,
    notifications: ((notificationsRes.data ?? []) as Array<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      created_at: string;
      read_at: string | null;
    }>).map((notification) => ({
      id: notification.id,
      kind: notification.type === "review_request" ? "feedback" : notification.type === "invoice" ? "payment" : "lesson",
      title: notification.title,
      body: notification.body ?? "",
      timeLabel: formatters.dateFmt.format(new Date(notification.created_at)),
      unread: !notification.read_at,
      href: notification.type === "invoice" ? "/student/payments" : "/student/notifications",
    })),
    documents: invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      title: `Factuur ${invoice.invoiceNumber}`,
      category: "Facturen",
      dateLabel: invoice.dateLabel,
      status: invoice.status === "paid" ? "Klaar" : "Nieuw",
      href: "/student/payments",
    })),
    activity: [
      ...previousLessons.slice(0, 3).map((lesson) => ({
        id: `lesson-${lesson.id}`,
        title: lesson.title,
        body: `${lesson.dateLabel} - ${lesson.timeLabel}`,
        timeLabel: lesson.dateLabel,
      })),
      ...invoices.slice(0, 2).map((invoice) => ({
        id: `invoice-${invoice.id}`,
        title: invoice.status === "paid" ? "Betaling ontvangen" : "Factuur open",
        body: invoice.amountLabel,
        timeLabel: invoice.dateLabel,
      })),
    ],
  };
}

function buildEmptyExperience({
  studentName,
  tenantName,
  email,
  phone,
  first,
}: {
  studentName: string;
  tenantName: string;
  email?: string | null;
  phone?: string | null;
  first: string;
}): StudentExperience {
  return {
    profile: { id: "student", name: studentName, firstName: first, tenantName, roleLabel: "Leerling", email, phone },
    nextStep: {
      title: "Nog geen leskaart",
      body: "Je gegevens worden zichtbaar zodra je rijschool je dossier koppelt.",
      ctaLabel: "Bekijk agenda",
      href: "/student/agenda",
      progressLabel: "0/1",
      progressCurrent: 0,
      progressTotal: 1,
    },
    quickActions,
    nextLesson: null,
    previousLessons: [],
    journeyModules: [],
    journeyTrend: [{ label: "Start", module1: 0, module2: 0, module3: 0, module4: 0, module5: 0 }],
    ris: { active: false, modules: [], reflection: null },
    theory: { progress: 0, statusCopy: "Nog geen theoriegegevens.", homework: [], tests: [] },
    payments: {
      balance: { creditCents: 0, creditLabel: "0 lesuur", hoursAvailable: "0 lesuur beschikbaar", warning: "" },
      invoices: [],
      history: [],
    },
    cbr: { readiness: 0, readinessCopy: "Nog geen CBR-gegevens.", statuses: [] },
    messages: [],
    notifications: [],
    documents: [],
    activity: [],
  };
}

async function loadStudentMessageThreads({
  tenantId,
  studentId,
  studentName,
  formatters,
}: {
  tenantId: string;
  studentId: string;
  studentName: string;
  formatters: StudentFormatters;
}): Promise<StudentMessageThread[]> {
  const service = createServiceRoleClient();
  const { data: conversationsRaw } = await service
    .from("chat_conversations")
    .select("id, instructor_id, last_message_at, last_message_preview, student_last_read_at")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  const conversations = (conversationsRaw ?? []) as Array<{
    id: string;
    instructor_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    student_last_read_at: string | null;
  }>;
  if (conversations.length === 0) return [];

  const instructorNames = await getInstructorNames(Array.from(new Set(conversations.map((conversation) => conversation.instructor_id))));
  const { data: messagesRaw } = await service
    .from("chat_messages")
    .select("id, conversation_id, sender_side, body, created_at")
    .eq("tenant_id", tenantId)
    .in("conversation_id", conversations.map((conversation) => conversation.id))
    .order("created_at", { ascending: true });
  const messagesByConversation = new Map<string, Array<{
    id: string;
    conversation_id: string;
    sender_side: "student" | "instructor";
    body: string;
    created_at: string;
  }>>();

  for (const message of (messagesRaw ?? []) as Array<{
    id: string;
    conversation_id: string;
    sender_side: "student" | "instructor";
    body: string;
    created_at: string;
  }>) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  return conversations.map((conversation) => {
    const name = instructorNames.get(conversation.instructor_id) ?? "Instructeur";
    const messages = messagesByConversation.get(conversation.id) ?? [];
    const unreadCount = messages.filter(
      (message) =>
        message.sender_side === "instructor" &&
        (!conversation.student_last_read_at || message.created_at > conversation.student_last_read_at),
    ).length;
    return {
      id: conversation.id,
      name,
      role: "Instructeur",
      latestMessage: conversation.last_message_preview ?? "Nog geen berichten.",
      timeLabel: conversation.last_message_at ? formatters.timeFmt.format(new Date(conversation.last_message_at)) : "Nieuw",
      unreadCount,
      href: `/student/messages/${conversation.id}`,
      messages: messages.map((message) => ({
        id: message.id,
        sender: message.sender_side === "student" ? "student" : "school",
        senderName: message.sender_side === "student" ? studentName : name,
        body: message.body,
        timeLabel: formatters.timeFmt.format(new Date(message.created_at)),
      })),
    };
  });
}

export function findLessonById(
  data: StudentExperience,
  lessonId: string,
) {
  const lessons = [data.nextLesson, ...data.previousLessons].filter(
    (lesson): lesson is StudentLesson => Boolean(lesson),
  );
  return lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

export function findMessageThreadById(
  data: StudentExperience,
  threadId: string | undefined,
) {
  if (!threadId) return data.messages[0] ?? null;
  return data.messages.find((thread) => thread.id === threadId) ?? data.messages[0] ?? null;
}
