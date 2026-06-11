import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  CheckCircle2,
  Circle,
  FileText,
  GraduationCap,
  ListTodo,
  MapPin,
  MessageCircle,
  Phone,
  Target,
  Users,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAgendaTrialLessons, type AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import { loadAgendaAppointments, type AgendaAppointmentView } from "@/lib/agenda/appointments";
import {
  APPOINTMENT_TYPE_LABEL,
  durationMinutes,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";
import { loadInstructorConversations } from "@/lib/chat/service";
import { loadLessonContext, loadLocations, loadVehicles } from "@/lib/lessons/context-data";
import {
  VEHICLE_TRANSMISSION_LABEL,
  type Lesson,
  type Location,
  type Vehicle,
} from "@/lib/lessons/types";
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
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { InfoBubble } from "@/components/ui/info-bubble";
import { PWAEmptyState, PWACard, PWAPage } from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const LESSON_SLOT_MINUTES = 100;

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const messageDateFmt = createNlDateTimeFormatter({
  day: "numeric",
  month: "short",
});

const lessonDateFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
});

type DashboardTask = Pick<
  Task,
  "id" | "title" | "priority" | "due_date" | "created_at" | "updated_at"
>;

type StudentSummary = Pick<
  Student,
  "id" | "full_name" | "phone" | "postcode" | "email"
>;

type RadarPriority = "Hoog" | "Medium";

type RadarItem = {
  id: string;
  name: string;
  message: string;
  detail?: string;
  priority: RadarPriority;
  href: string;
};

type KpiCardProps = {
  icon: ReactNode;
  value: string | number;
  label: string;
};

function capitalize(text: string) {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function firstName(fullName: string | null | undefined) {
  const value = fullName?.trim();
  if (!value) return "instructeur";
  return value.split(/\s+/)[0] ?? value;
}

function greetingFor(date: Date) {
  const hour = amsterdamHour(date);
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function formatMinuteRange(startsAt: string, endsAt: string) {
  return `${timeFmt.format(new Date(startsAt))} - ${timeFmt.format(new Date(endsAt))}`;
}

function formatMessageMoment(iso: string | null) {
  if (!iso) return "Geen update";
  const date = new Date(iso);
  const now = new Date();
  if (isSameAmsterdamDay(date, now)) return timeFmt.format(date);
  const dateYmd = amsterdamYmd(date);
  const yesterdayYmd = addDaysYmd(amsterdamYmd(now), -1);
  if (dateYmd === yesterdayYmd) return "Gisteren";
  return capitalize(messageDateFmt.format(date));
}

function formatTaskMoment(task: DashboardTask) {
  if (task.due_date) {
    return timeFmt.format(new Date(task.due_date));
  }
  return "Later";
}

function formatCountdown(now: Date, startsAt: string) {
  const diffMinutes = Math.max(
    0,
    Math.round((new Date(startsAt).getTime() - now.getTime()) / 60000),
  );
  if (diffMinutes === 0) return "Nu";
  if (diffMinutes < 60) return `Over ${diffMinutes} min`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `Over ${hours}u ${minutes}` : `Over ${hours}u`;
}

function splitGoals(...values: Array<string | null | undefined>) {
  const items = values
    .flatMap((value) =>
      (value ?? "")
        .split(/\r?\n|•|,|;/)
        .map((entry) => entry.replace(/^[-*]\s*/, "").trim()),
    )
    .filter(Boolean);
  return Array.from(new Set(items)).slice(0, 3);
}

function studentNameForAppointment(appointment: AgendaAppointmentView) {
  return appointment.student_name ??
    appointment.title?.trim() ??
    APPOINTMENT_TYPE_LABEL[appointment.type];
}

function priorityVariant(priority: RadarPriority) {
  return priority === "Hoog" ? "warning" : "info";
}

function taskPriorityVariant(priority: TaskPriority) {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "info";
  return "default";
}

function lessonVariantFor(type: AgendaAppointmentType) {
  if (type === "exam") return "danger";
  if (type === "interim_test") return "warning";
  if (type === "theory_guidance") return "success";
  return "info";
}

function lessonTypeShort(type: AgendaAppointmentType) {
  if (type === "exam") return "Examen";
  if (type === "interim_test") return "TTT";
  if (type === "theory_guidance") return "Theorie";
  return APPOINTMENT_TYPE_LABEL[type];
}

function buildRadarItems(params: {
  dayStart: Date;
  todayLessons: Lesson[];
  lessonWindow: Lesson[];
  todayTrials: AgendaTrialLesson[];
  upcomingAppointments: AgendaAppointmentView[];
  studentMap: Map<string, StudentSummary>;
  balanceMap: Map<string, number>;
}): RadarItem[] {
  const items: RadarItem[] = [];
  const seen = new Set<string>();

  const pushUnique = (item: RadarItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const relevantStudentIds = new Set(
    params.todayLessons.map((lesson) => lesson.student_id),
  );

  for (const [studentId, balance] of params.balanceMap.entries()) {
    if (!relevantStudentIds.has(studentId) || balance > LESSON_SLOT_MINUTES * 6) continue;
    const student = params.studentMap.get(studentId);
    const lessonsLeft = Math.max(1, Math.floor(balance / LESSON_SLOT_MINUTES));
    pushUnique({
      id: `balance-${studentId}`,
      name: student?.full_name ?? "Leerling",
      message: `Pakket bijna op (${lessonsLeft} lessen over)`,
      detail: `${balance} minuten beschikbaar voor vervolgplanning.`,
      priority: lessonsLeft <= 3 ? "Hoog" : "Medium",
      href: `/instructor/leerlingen/${studentId}`,
    });
  }

  for (const trial of params.todayTrials) {
    pushUnique({
      id: `trial-${trial.id}`,
      name: trial.lead_name,
      message: `Proefles om ${timeFmt.format(new Date(trial.starts_at))}`,
      detail: trial.pickup_location ?? "Locatie volgt nog.",
      priority: "Hoog",
      href: "/instructor/intake",
    });
  }

  for (const appointment of params.upcomingAppointments) {
    if (!["exam", "interim_test", "theory_guidance"].includes(appointment.type)) continue;
    const startsAt = new Date(appointment.starts_at);
    const diffDays = Math.max(
      0,
      Math.ceil((startsAt.getTime() - params.dayStart.getTime()) / 86400000),
    );
    const when =
      diffDays === 0
        ? "vandaag"
        : diffDays === 1
          ? "morgen"
          : `over ${diffDays} dagen`;
    pushUnique({
      id: `appointment-${appointment.id}`,
      name: studentNameForAppointment(appointment),
      message: `${lessonTypeShort(appointment.type)} ${when}`,
      detail: appointment.location ?? appointment.team_name ?? "Agenda-item",
      priority:
        appointment.type === "exam" && diffDays <= 7
          ? "Hoog"
          : appointment.type === "interim_test" && diffDays <= 5
            ? "Hoog"
            : "Medium",
      href: `/instructor/afspraak/${appointment.id}`,
    });
  }

  for (const lesson of params.todayLessons) {
    const futureLessons = params.lessonWindow.filter(
      (candidate) =>
        candidate.student_id === lesson.student_id &&
        new Date(candidate.starts_at).getTime() > new Date(lesson.starts_at).getTime(),
    );
    if (futureLessons.length > 0) continue;
    const student = params.studentMap.get(lesson.student_id);
    pushUnique({
      id: `followup-${lesson.student_id}`,
      name: student?.full_name ?? "Leerling",
      message: "Nog geen vervolgles ingepland",
      detail: "Plan een nieuwe les om ritme en opvolging vast te houden.",
      priority: "Medium",
      href: `/instructor/leerlingen/${lesson.student_id}`,
    });
  }

  return items.slice(0, 4);
}

function HeroMetricCard({ icon, value, label }: KpiCardProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/6 px-4 py-3 backdrop-blur-xl">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.15rem] bg-white/10 text-white shadow-inner shadow-white/5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-2 text-white">
          <span className="text-[1.55rem] font-black leading-none tracking-tight">
            {value}
          </span>
          <span className="truncate text-sm font-semibold">{label}</span>
        </p>
      </div>
    </div>
  );
}

function CardHeading({
  title,
  info,
}: {
  title: string;
  info?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="truncate">{title}</span>
      {info ? <InfoBubble>{info}</InfoBubble> : null}
    </div>
  );
}

function QuickLinkButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[6.35rem] flex-col items-center justify-center gap-2 rounded-[1.2rem] border border-border/70 bg-primary-soft/55 px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary-soft/72"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-background/85 text-primary shadow-sm">
        {icon}
      </span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </Link>
  );
}

export default async function InstructorIndexPage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const isAdmin = roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  const now = new Date();
  const todayYmd = amsterdamYmd(now);
  const dayStart = startOfAmsterdamDayUtc(todayYmd);
  const dayEnd = startOfAmsterdamDayUtc(addDaysYmd(todayYmd, 1));
  const horizonEnd = startOfAmsterdamDayUtc(addDaysYmd(todayYmd, 15));
  const displayName = user.profile?.full_name ?? user.email ?? "Instructeur";
  const firstUserName = firstName(displayName);

  const supabase = await createServerSupabaseClient();

  const [
    lessonWindowResult,
    openTasksResult,
    openTaskCountResult,
    todayTrials,
    appointmentWindow,
    conversations,
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
  ]);

  const lessonWindow = (lessonWindowResult.data ?? []) as Lesson[];
  const todayLessons = lessonWindow.filter((lesson) =>
    isSameAmsterdamDay(new Date(lesson.starts_at), now)
  );
  const upcomingLessons = lessonWindow.filter(
    (lesson) => new Date(lesson.starts_at).getTime() >= now.getTime(),
  );
  const nextLesson = upcomingLessons[0] ?? null;
  const upcomingAppointments = appointmentWindow ?? [];
  const todayAppointments = upcomingAppointments.filter((appointment) =>
    isSameAmsterdamDay(new Date(appointment.starts_at), now)
  );
  const openTasks = (openTasksResult.data ?? []) as DashboardTask[];
  const openTaskCount = openTaskCountResult.count ?? openTasks.length;

  const studentIds = Array.from(
    new Set([
      ...lessonWindow.map((lesson) => lesson.student_id),
      ...upcomingAppointments
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

  const studentMap = new Map(
    ((studentsRaw ?? []) as StudentSummary[]).map((student) => [student.id, student]),
  );
  const balanceMap = new Map(
    ((balancesRaw ?? []) as StudentBalance[]).map((balance) => [
      balance.student_id,
      balance.balance,
    ]),
  );

  let nextLessonContext:
    | {
        vehicle: Vehicle | null;
        location: Location | null;
        goals: string[];
        student: StudentSummary | null;
        lessonIndex: number;
        lessonCount: number;
      }
    | null = null;

  if (nextLesson) {
    const [context, vehicles, locations, studentLessonRowsResult] = await Promise.all([
      loadLessonContext(supabase, tenant.id, nextLesson.id),
      loadVehicles(supabase, tenant.id, { includeShared: true }),
      loadLocations(supabase, tenant.id, { includeShared: true }),
      supabase
        .from("lessons")
        .select("id, starts_at")
        .eq("tenant_id", tenant.id)
        .eq("student_id", nextLesson.student_id)
        .order("starts_at", { ascending: true }),
    ]);

    const vehicle = vehicles.find((item) => item.id === context.vehicleId) ?? null;
    const location = locations.find((item) => item.id === context.locationId) ?? null;
    const studentLessons = (studentLessonRowsResult.data ?? []) as Array<{
      id: string;
      starts_at: string;
    }>;
    const lessonIndex = Math.max(
      1,
      studentLessons.findIndex((lesson) => lesson.id === nextLesson.id) + 1,
    );
    const goals = splitGoals(
      context.attentionPoints,
      context.advice,
      context.studentNote,
      nextLesson.notes,
    );

    nextLessonContext = {
      vehicle,
      location,
      goals,
      student: studentMap.get(nextLesson.student_id) ?? null,
      lessonIndex,
      lessonCount: studentLessons.length,
    };
  }

  const radarItems = buildRadarItems({
    dayStart,
    todayLessons,
    lessonWindow,
    todayTrials,
    upcomingAppointments,
    studentMap,
    balanceMap,
  });

  const unreadMessageCount = conversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0,
  );
  const examTodayCount = todayAppointments.filter(
    (appointment) => appointment.type === "exam",
  ).length;
  const nextStudent = nextLesson
    ? nextLessonContext?.student ?? studentMap.get(nextLesson.student_id) ?? null
    : null;
  const vehiclePrimary = nextLessonContext?.vehicle?.transmission
    ? VEHICLE_TRANSMISSION_LABEL[nextLessonContext.vehicle.transmission]
    : "Voertuig";
  const vehicleSecondary = nextLessonContext?.vehicle?.label ?? "Nog niet gekoppeld";
  const locationPrimary = nextLesson?.location ??
    nextLessonContext?.location?.name ??
    "Locatie volgt";
  const locationSecondary = nextLessonContext?.location?.address ??
    nextStudent?.postcode ??
    tenant.name;
  const lessonGoals = nextLessonContext?.goals.length
    ? nextLessonContext.goals
    : ["Lesdoelen verschijnen zodra de lescontext is ingevuld."];

  return (
    <PWAPage
      app="instructor"
      className="lg:flex lg:h-full lg:flex-col"
      contentClassName="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-y-4 lg:space-y-0 lg:overflow-hidden"
    >
      <section
        className="relative overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(255,255,255,0.18),transparent_26%),radial-gradient(circle_at_100%_10%,rgba(129,98,255,0.25),transparent_32%),linear-gradient(138deg,#1a1f32_0%,#111523_52%,#18122b_100%)] px-5 py-5 text-white shadow-2xl shadow-black/20 sm:px-6 lg:px-7 lg:py-4"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-56 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)] lg:items-end">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">
              {tenant.name}
            </p>
            <h1 className="text-balance text-[clamp(1.9rem,3vw,2.85rem)] font-black leading-[1.02] tracking-tight">
              {greetingFor(now)}, {firstUserName}! <span aria-hidden>👋</span>
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/72 sm:text-[0.95rem]">
              Hier is je overzicht van vandaag.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HeroMetricCard
              icon={<Users className="h-5 w-5" aria-hidden />}
              value={todayLessons.length}
              label="Lessen"
            />
            <HeroMetricCard
              icon={<GraduationCap className="h-5 w-5" aria-hidden />}
              value={todayTrials.length}
              label="Proeflessen"
            />
            <HeroMetricCard
              icon={<FileText className="h-5 w-5" aria-hidden />}
              value={examTodayCount}
              label="Examens"
            />
            <HeroMetricCard
              icon={<ListTodo className="h-5 w-5" aria-hidden />}
              value={openTaskCount}
              label="Taken"
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:min-h-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.96fr)_minmax(0,0.96fr)] lg:overflow-hidden">
        <PWACard
          title={
            <CardHeading
              title="Volgende les"
              info="Je eerstvolgende reguliere rijles met alle context die je direct nodig hebt om te vertrekken."
            />
          }
          className="flex h-full min-h-0 flex-col bg-card"
          contentClassName="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
          headerRight={
            nextLesson ? (
              <Badge variant="primary">{formatCountdown(now, nextLesson.starts_at)}</Badge>
            ) : null
          }
        >
          {nextLesson && nextLessonContext ? (
            <>
              <div className="grid gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Avatar name={nextStudent?.full_name ?? "Leerling"} className="h-14 w-14 text-base" />
                    <div className="min-w-0">
                      <p className="truncate text-[1.4rem] font-bold tracking-tight text-foreground">
                        {nextStudent?.full_name ?? "Leerling"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {nextStudent?.email ?? "Leerlingcontext beschikbaar vanuit je agenda"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-foreground">{locationPrimary}</p>
                        <p className="text-sm text-muted-foreground">{locationSecondary}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <CarFront className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-foreground">{vehiclePrimary}</p>
                        <p className="text-sm text-muted-foreground">{vehicleSecondary}</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Leerdoelen</p>
                        <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                          {lessonGoals.map((goal) => (
                            <li key={goal} className="truncate">
                              • {goal}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-[1.35rem] border border-border/70 bg-background/80 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Tijdslot
                    </p>
                    <p className="mt-2 text-base font-semibold text-foreground">
                      {formatMinuteRange(nextLesson.starts_at, nextLesson.ends_at)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Les {nextLessonContext.lessonIndex} van {nextLessonContext.lessonCount}
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-primary/20 bg-primary-soft/40 px-3 py-2 text-xs font-medium text-primary">
                    {durationMinutes(nextLesson.starts_at, nextLesson.ends_at)} min ingepland
                  </div>
                  <Badge variant="outline" className="justify-center border-border/80 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                    {capitalize(lessonDateFmt.format(new Date(nextLesson.starts_at)))}
                  </Badge>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap gap-3 pt-1">
                <Link href={`/instructor/${nextLesson.id}`} className={buttonVariants({ size: "lg" })}>
                  Start les
                </Link>
                {nextStudent?.phone ? (
                  <a
                    href={`tel:${nextStudent.phone.replace(/\s+/g, "")}`}
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    <Phone className="h-4 w-4" aria-hidden />
                    Bel leerling
                  </a>
                ) : (
                  <Link
                    href={`/instructor/berichten`}
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden />
                    Bericht sturen
                  </Link>
                )}
              </div>
            </>
          ) : (
            <PWAEmptyState
              icon={<CalendarDays className="h-8 w-8" aria-hidden />}
              title="Nog geen volgende les"
              message="Er staat op dit moment geen reguliere rijles voor je klaar. Open je agenda om een rit, proefles of afspraak in te plannen."
            />
          )}
        </PWACard>

        <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <PWACard
          title={
            <CardHeading
              title="Op de radar"
              info="Aandachtspunten die vandaag of binnenkort iets van je vragen rond leerlingen, examens of proeflessen."
            />
          }
          className="flex h-full flex-col bg-card"
          contentClassName="flex h-full min-h-0 flex-col"
          headerRight={
            <Link
              href="/instructor/leerlingen"
              className="text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              Bekijk alle
            </Link>
          }
        >
            {radarItems.length === 0 ? (
              <PWAEmptyState
                icon={<Target className="h-7 w-7" aria-hidden />}
                title="Rustig op de radar"
                message="Er zijn nu geen extra aandachtspunten bovenop je planning. Je cockpit is bijgewerkt."
                className="h-full"
              />
            ) : (
              <div className="min-h-0 space-y-2 overflow-auto">
                {radarItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-start gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 px-3.5 py-3 transition hover:border-primary/30 hover:bg-background"
                  >
                    <Avatar name={item.name} className="h-10 w-10 text-xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                      <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                        {item.message}
                      </p>
                      {item.detail ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground/90">{item.detail}</p>
                      ) : null}
                    </div>
                    <Badge variant={priorityVariant(item.priority)}>{item.priority}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </PWACard>

          <PWACard
          title={
            <CardHeading
              title="Openstaande taken"
              info="Taken die vandaag nog bij jou liggen en snel overzicht vragen."
            />
          }
          className="flex h-full flex-col bg-card"
          contentClassName="flex h-full min-h-0 flex-col"
          headerRight={
            <Link
              href="/instructor/taken"
              className="text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              Bekijk alle
            </Link>
          }
        >
            {openTasks.length === 0 ? (
              <PWAEmptyState
                icon={<CheckCircle2 className="h-7 w-7" aria-hidden />}
                title="Geen open taken"
                message="Je takenlijst is leeg. Nieuwe opvolging verschijnt hier vanzelf zodra er iets wordt toegewezen."
                className="h-full"
              />
            ) : (
              <div className="min-h-0 space-y-1.5 overflow-auto">
                {openTasks.slice(0, 4).map((task) => (
                  <Link
                    key={task.id}
                    href="/instructor/taken"
                    className="flex items-center gap-3 rounded-[1.05rem] px-2.5 py-2.5 transition hover:bg-background/70"
                  >
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={taskPriorityVariant(task.priority)}>{task.priority}</Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatTaskMoment(task)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </PWACard>
        </div>

        <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
          <PWACard
          title={
            <CardHeading
              title="Berichten"
              info="Je recentste leerlinggesprekken. Open meteen de juiste thread of werk je inbox bij."
            />
          }
          className="flex h-full flex-col bg-card"
          contentClassName="flex h-full min-h-0 flex-col"
          headerRight={
            <>
              {unreadMessageCount > 0 ? (
                <Badge variant="primary">{unreadMessageCount} ongelezen</Badge>
              ) : null}
              <Link
                href="/instructor/berichten"
                className="text-xs font-semibold text-primary transition hover:text-primary/80"
              >
                Bekijk alle
              </Link>
            </>
          }
        >
            {conversations.length === 0 ? (
              <PWAEmptyState
                icon={<MessageCircle className="h-7 w-7" aria-hidden />}
                title="Nog geen gesprekken"
                message="Zodra een leerling een bericht stuurt of jij een gesprek opent, verschijnt het hier."
                className="h-full"
              />
            ) : (
              <div className="min-h-0 space-y-2 overflow-auto">
                {conversations.slice(0, 4).map((conversation) => (
                  <Link
                    key={conversation.id}
                    href={`/instructor/berichten?conversation=${conversation.id}`}
                    className="flex items-start gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 px-3.5 py-3 transition hover:border-primary/30 hover:bg-background"
                  >
                    <Avatar name={conversation.studentName} className="h-10 w-10 text-xs" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {conversation.studentName}
                        </p>
                        {conversation.unreadCount > 0 ? (
                          <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {conversation.lastMessagePreview ?? "Nog geen berichtinhoud zichtbaar."}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {formatMessageMoment(conversation.lastMessageAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </PWACard>

          <PWACard
            title={
              <CardHeading
                title="Quick links"
                info="Vier snelle ingangen naar de plekken waar je het vaakst springt tijdens je dag."
              />
            }
            className="bg-card"
            contentClassName="grid gap-3 sm:grid-cols-2"
          >
            <QuickLinkButton
              href="/instructor/leerlingen"
              label="Leerlingen"
              icon={<Users className="h-5 w-5" aria-hidden />}
            />
            <QuickLinkButton
              href="/instructor/week"
              label="Agenda"
              icon={<CalendarDays className="h-5 w-5" aria-hidden />}
            />
            <QuickLinkButton
              href="/instructor/les-evaluaties"
              label="Les evaluaties"
              icon={<FileText className="h-5 w-5" aria-hidden />}
            />
            <QuickLinkButton
              href="/instructor/voertuigen"
              label="Voertuigen"
              icon={<CarFront className="h-5 w-5" aria-hidden />}
            />
          </PWACard>
        </div>
      </div>
    </PWAPage>
  );
}
