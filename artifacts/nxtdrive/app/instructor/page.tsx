import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ListTodo,
  MessageCircle,
  Users,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import type { Lesson } from "@/lib/lessons/types";
import type { Student } from "@/lib/students/types";
import { loadAgendaTrialLessons } from "@/lib/trial-lessons/agenda";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import { loadAgendaAppointments } from "@/lib/agenda/appointments";
import type { AgendaAppointmentView } from "@/lib/agenda/appointments";
import {
  PWACard,
  PWAHero,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 1);
  return value;
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

type UpcomingFocus =
  | {
      href: string;
      title: string;
      eyebrow: string;
      meta: string;
    }
  | null;

function resolveUpcomingFocus(
  now: Date,
  lessons: Lesson[],
  studentNames: Map<string, string>,
  trials: AgendaTrialLesson[],
  appointments: AgendaAppointmentView[],
): UpcomingFocus {
  const nowMs = now.getTime();

  const candidates = [
    ...lessons.map((lesson) => ({
      startsAt: lesson.starts_at,
      href: `/instructor/${lesson.id}`,
      title: studentNames.get(lesson.student_id) ?? "Leerling",
      eyebrow: "Volgende les",
      meta: `${timeFmt.format(new Date(lesson.starts_at))} - ${lesson.location ?? "Locatie volgt"}`,
    })),
    ...trials.map((trial) => ({
      startsAt: trial.starts_at,
      href: `/backoffice/leads/${trial.lead_id}`,
      title: trial.lead_name,
      eyebrow: "Proefles",
      meta: `${timeFmt.format(new Date(trial.starts_at))} - ${trial.pickup_location ?? "Locatie volgt"}`,
    })),
    ...appointments.map((appointment) => ({
      startsAt: appointment.starts_at,
      href: `/instructor/afspraak/${appointment.id}`,
      title:
        appointment.student_name ?? appointment.title?.trim() ?? "Agenda-item",
      eyebrow: "Afspraak",
      meta: `${timeFmt.format(new Date(appointment.starts_at))} - ${appointment.location ?? "Locatie volgt"}`,
    })),
  ]
    .filter((item) => new Date(item.startsAt).getTime() >= nowMs)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return candidates[0] ?? null;
}

function SurfaceStat({
  label,
  value,
  hint,
  detail,
}: {
  label: string;
  value: string;
  hint: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/80 bg-gradient-to-b from-background to-background/90 px-4 py-3.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-[clamp(1.1rem,1.45vw,1.55rem)] font-bold leading-[1.15] tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{hint}</p>
      {detail ? (
        <p className="mt-2 border-t border-border/70 pt-2 text-xs leading-5 text-muted-foreground/90">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function ActionCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full items-start gap-3 rounded-[1.15rem] border border-border/80 bg-background px-3.5 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-primary-soft text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
    </Link>
  );
}

export default async function InstructorIndexPage() {
  const { user, tenant } = await requireActiveTenant(["instructor"]);

  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const weekEnd = endOfDay(addDays(now, 6));

  const supabase = await createServerSupabaseClient();

  const [
    lessonsResult,
    weekLessonsResult,
    openTasksResult,
    unreadNotificationsResult,
  ] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("lessons")
      .select("student_id, starts_at")
      .eq("tenant_id", tenant.id)
      .eq("instructor_id", user.id)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", weekEnd.toISOString())
      .order("starts_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("assignee_user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .is("read_at", null),
  ]);

  const lessons = (lessonsResult.data ?? []) as Lesson[];
  const weekLessons = (weekLessonsResult.data ?? []) as Array<{
    student_id: string;
    starts_at: string;
  }>;

  const [trials, appointments] = await Promise.all([
    loadAgendaTrialLessons(supabase, {
      tenantId: tenant.id,
      from: dayStart,
      to: dayEnd,
      instructorId: user.id,
    }),
    loadAgendaAppointments(supabase, {
      tenantId: tenant.id,
      from: dayStart,
      to: dayEnd,
      instructorId: user.id,
    }),
  ]);

  const studentIds = Array.from(
    new Set(lessons.map((lesson) => lesson.student_id)),
  );
  const { data: studentsRaw } = studentIds.length
    ? await supabase.from("students").select("id, full_name").in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as Pick<Student, "id" | "full_name">[]).map(
      (student) => [student.id, student.full_name],
    ),
  );

  const unreadCount = unreadNotificationsResult.count ?? 0;
  const openTaskCount = openTasksResult.count ?? 0;
  const weekStudentCount = new Set(
    weekLessons.map((lesson) => lesson.student_id),
  ).size;
  const upcomingFocus = resolveUpcomingFocus(
    now,
    lessons,
    studentNames,
    trials,
    appointments,
  );

  const heroSubtitle = upcomingFocus
    ? `${upcomingFocus.eyebrow} om ${upcomingFocus.meta}. Je houdt hier je dagritme, berichten en opvolging overzichtelijk bij elkaar.`
    : "Een rustige maar complete cockpit voor je dagritme, planning, opvolging en lesfocus. Ook zonder geplande les zie je hier direct wat aandacht vraagt.";
  const focusValue = upcomingFocus?.title ?? "Rustige agenda";
  const focusHint = upcomingFocus?.meta ?? "Geen les of afspraak direct ingepland.";
  const focusDetail = upcomingFocus
    ? `${upcomingFocus.eyebrow} staat als eerstvolgende focus voor je klaar.`
    : "Gebruik de agenda om vooruit te werken of rond open taken en berichten af.";

  return (
    <PWAPage app="instructor" contentClassName="space-y-5 xl:space-y-6">
      <PWAHero
        app="instructor"
        eyebrow={tenant.name}
        title="Vandaag"
        subtitle={heroSubtitle}
        aside={
          <PWAKpiGrid compact className="w-full min-w-0 max-w-xl">
            <PWAKpiTile
              label="Reguliere lessen"
              value={lessons.length}
              hint="Vandaag gepland"
              info="Alle gewone lessen die vandaag al op jouw agenda staan."
            />
            <PWAKpiTile
              label="Proeflessen"
              value={trials.length}
              hint="Nieuwe kandidaten"
              info="Nieuwe proeflessen of intake-achtige ritten die vandaag al ingepland staan."
            />
            <PWAKpiTile
              label="Afspraken"
              value={appointments.length}
              hint="Examens, blokken en meer"
              info="Alle niet-les agenda-items zoals examens, theoriebegeleiding, blokkades en andere afspraken."
            />
            <PWAKpiTile
              label="Open taken"
              value={openTaskCount}
              hint="Nog op te volgen"
              info="Taken die nog bij jou openstaan en nog om actie vragen."
            />
          </PWAKpiGrid>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Link
          href={upcomingFocus?.href ?? "/instructor/week"}
          className={buttonVariants({ size: "sm" })}
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
          {upcomingFocus ? `${upcomingFocus.eyebrow} openen` : "Dagplanning openen"}
        </Link>
        <Link
          href="/instructor/week"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <CalendarRange className="h-4 w-4" aria-hidden />
          Agenda
        </Link>
        <Link
          href="/instructor/berichten"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Berichten
        </Link>
        <Link
          href="/instructor/taken"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ListTodo className="h-4 w-4" aria-hidden />
          Mijn taken
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <PWACard title="Vandaag op je radar" className="bg-card">
          <div className="grid gap-3 sm:grid-cols-3">
            <SurfaceStat
              label="Volgende focus"
              value={focusValue}
              hint={focusHint}
              detail={focusDetail}
            />
            <SurfaceStat
              label="Ongelezen meldingen"
              value={String(unreadCount)}
              hint={
                unreadCount > 0
                  ? "Er staan nog updates voor je klaar in je notificaties."
                  : "Je inbox is bijgewerkt en vraagt nu niets van je."
              }
              detail={
                unreadCount > 0
                  ? "Loop ze even na zodat je cockpit weer helemaal schoon is."
                  : "Je communicatie is op dit moment rustig en bijgewerkt."
              }
            />
            <SurfaceStat
              label="Komende 7 dagen"
              value={String(weekLessons.length)}
              hint={`${weekStudentCount} leerlingen ingepland in je komende week.`}
              detail="Handig om je beschikbaarheid en lesfocus voor de rest van de week bij te sturen."
            />
          </div>
        </PWACard>

        <PWACard title="Snelle routes" className="bg-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <ActionCard
              href="/instructor/leerlingen"
              title="Leerlingen openen"
              description="Ga direct naar je actieve leerlingen en open hun dossier of lescontext."
              icon={<Users className="h-5 w-5" aria-hidden />}
            />
            <ActionCard
              href="/instructor/beschikbaarheid"
              title="Beschikbaarheid bijwerken"
              description="Pas je beschikbaarheid aan zodat planning en capaciteit blijven kloppen."
              icon={<CalendarClock className="h-5 w-5" aria-hidden />}
            />
            <ActionCard
              href="/instructor/meldingen"
              title="Meldingen nalopen"
              description="Bekijk recente updates, zet pushmeldingen aan en houd je inbox schoon."
              icon={<Bell className="h-5 w-5" aria-hidden />}
            />
            <ActionCard
              href="/instructor/taken"
              title="Taken afronden"
              description="Werk open acties weg en houd je bord in beweging."
              icon={<ClipboardList className="h-5 w-5" aria-hidden />}
            />
          </div>
        </PWACard>
      </div>
    </PWAPage>
  );
}
