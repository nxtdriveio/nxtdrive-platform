import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CarFront,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  Home,
  Info as InfoIcon,
  ListTodo,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Route,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { InstructorCreditManager } from "@/components/instructor/InstructorCreditManager";
import { InstructorMessageComposer } from "@/components/instructor/InstructorMessageComposer";
import { InstructorTaskManager } from "@/components/instructor/InstructorTaskManager";
import { SecureInstructorLogoutForm } from "@/components/instructor/SecureLogoutForm";
import { NotificationInbox } from "@/components/notifications/NotificationInbox";
import {
  type InstructorAppointment,
  type InstructorAppointmentType,
  type InstructorEvaluation,
  type InstructorEvaluationStatus,
  type InstructorExperience,
  type InstructorStudent,
  type InstructorStudentStatus,
  type InstructorTaskPriority,
  type InstructorVehicleStatus,
} from "@/lib/instructor/redesign-data";
import type { InstructorTaskWorkspace } from "@/lib/instructor/tasks";
import type { InAppNotification } from "@/lib/notifications/types";

type IconComponent = typeof CalendarDays;

function currentMonthCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayFirstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const label = new Intl.DateTimeFormat("nl-NL", {
    month: "long",
    year: "numeric",
  }).format(today);

  return {
    label: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
    today: today.getDate(),
    days: [
      ...Array.from({ length: mondayFirstOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ],
  };
}

const appointmentTone: Record<InstructorAppointmentType, string> = {
  lesson: "border-blue-200 bg-blue-50 text-blue-700",
  trial: "border-emerald-200 bg-emerald-50 text-emerald-700",
  exam: "border-violet-200 bg-violet-50 text-violet-700",
  admin: "border-amber-200 bg-amber-50 text-amber-700",
  theory: "border-cyan-200 bg-cyan-50 text-cyan-700",
  private: "border-slate-200 bg-slate-50 text-slate-700",
};

const appointmentRail: Record<InstructorAppointmentType, string> = {
  lesson: "bg-blue-500",
  trial: "bg-emerald-500",
  exam: "bg-violet-500",
  admin: "bg-amber-500",
  theory: "bg-cyan-500",
  private: "bg-slate-400",
};

const studentStatus: Record<
  InstructorStudentStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  active: { label: "Actief", variant: "success" },
  attention: { label: "Aandacht", variant: "warning" },
  exam: { label: "Examenfase", variant: "primary" },
  new: { label: "Nieuwe leerling", variant: "info" },
};

const evaluationStatus: Record<
  InstructorEvaluationStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  todo: { label: "Nog te beoordelen", variant: "warning" },
  draft: { label: "Concept", variant: "primary" },
  published: { label: "Gepubliceerd", variant: "success" },
};

const priorityLabel: Record<
  InstructorTaskPriority,
  { label: string; variant: BadgeProps["variant"]; dot: string }
> = {
  high: { label: "Hoog", variant: "warning", dot: "bg-amber-500" },
  medium: { label: "Middel", variant: "info", dot: "bg-blue-500" },
  low: { label: "Laag", variant: "success", dot: "bg-emerald-500" },
};

const vehicleStatus: Record<
  InstructorVehicleStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  active: { label: "Actief", variant: "success" },
  maintenance: { label: "Onderhoud", variant: "warning" },
  unavailable: { label: "Niet beschikbaar", variant: "danger" },
};

function InstructorPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-4 xl:space-y-5", className)}>
      {children}
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-foreground sm:text-2xl xl:text-[2.35rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

function InstructorCard({
  children,
  title,
  icon: Icon,
  right,
  className,
  headerClassName,
  contentClassName,
}: {
  children: React.ReactNode;
  title?: string;
  icon?: IconComponent;
  right?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[1.35rem] border border-brand-border/80 bg-white/92 shadow-brand-card backdrop-blur",
        className,
      )}
    >
      {title ? (
        <div
          className={cn(
            "flex min-w-0 items-center justify-between gap-3 border-b border-brand-border/70 px-4 py-3.5",
            headerClassName,
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            <h2 className="truncate text-sm font-black text-foreground">
              {title}
            </h2>
          </div>
          {right ? (
            <div className="flex shrink-0 items-center gap-2">{right}</div>
          ) : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 p-4", contentClassName)}>{children}</div>
    </section>
  );
}

function DataUnavailableState({
  title = "Geen gegevens beschikbaar",
  subtitle = "Er zijn nog geen gegevens beschikbaar voor deze weergave.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <InstructorPage>
      <PageHeader eyebrow="Instructeur" title={title} subtitle={subtitle} />
      <InstructorCard icon={InfoIcon} title="Lege status">
        <p className="text-sm leading-6 text-muted-foreground">
          Zodra er gegevens beschikbaar zijn, verschijnt deze pagina automatisch
          gevuld.
        </p>
      </InstructorCard>
    </InstructorPage>
  );
}

function ProgressRing({
  value,
  label,
  size = "lg",
}: {
  value: number;
  label: string;
  size?: "sm" | "lg";
}) {
  const dimension = size === "sm" ? "h-16 w-16" : "h-24 w-24";
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full", dimension)}
      style={{
        background: `conic-gradient(var(--brand-primary) ${value * 3.6}deg, var(--brand-muted) 0deg)`,
      }}
    >
      <div className="grid h-[78%] w-[78%] place-items-center rounded-full bg-white text-center shadow-inner">
        <div>
          <p
            className={cn(
              "font-black text-foreground",
              size === "sm" ? "text-sm" : "text-2xl",
            )}
          >
            {value}%
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function minutesLabel(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} uur`;
  return `${hours}u ${rest}m`;
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: IconComponent;
  tone: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-brand-border/80 bg-white p-3 shadow-brand-card xl:p-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {label}
          </p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function AppointmentTypeBadge({ type }: { type: InstructorAppointmentType }) {
  const label: Record<InstructorAppointmentType, string> = {
    lesson: "Rijles",
    trial: "Proefles",
    exam: "Examen / TTT",
    admin: "Administratie",
    theory: "Theorie",
    private: "Prive",
  };

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-bold",
        appointmentTone[type],
      )}
    >
      {label[type]}
    </span>
  );
}

function AppointmentCard({
  appointment,
  compact = false,
}: {
  appointment: InstructorAppointment;
  compact?: boolean;
}) {
  return (
    <Link
      href={appointment.href}
      className={cn(
        "relative block overflow-hidden rounded-[1.15rem] border border-brand-border bg-white p-3.5 shadow-sm transition-colors hover:border-brand-primary/35",
        compact && "p-3",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-3 left-0 w-1 rounded-full",
          appointmentRail[appointment.type],
        )}
      />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">
              {appointment.title}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {appointment.studentName ?? appointment.location}
            </p>
          </div>
          <AppointmentTypeBadge type={appointment.type} />
        </div>
        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
          <span>
            {appointment.startsAt} - {appointment.endsAt}
          </span>
          <span>
            {appointment.duration} - {appointment.location}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function InstructorCockpitView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data) return <DataUnavailableState title="Cockpit niet beschikbaar" />;
  const firstName = data.profile.name.split(" ")[0] ?? data.profile.name;

  return (
    <InstructorPage className="space-y-3">
      <PageHeader
        eyebrow={data.profile.tenantName}
        title={`Dag ${firstName}!`}
        subtitle="Alles voor je lesdag staat klaar: lessen, taken, aandachtspunten en berichten."
        actions={
          <Link href="/instructeur/agenda/nieuw" className={buttonVariants()}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Nieuwe afspraak
          </Link>
        }
      />

      <InstructorCard
        title="Volgende actie"
        icon={Target}
        right={<Badge variant="primary">{data.nextAction.urgency}</Badge>}
        className="border-brand-primary/25 bg-gradient-to-br from-white to-brand-accent/45"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-foreground">
              {data.nextAction.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {data.nextAction.reason}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              {data.nextAction.subject ? (
                <span>Leerling / onderwerp: {data.nextAction.subject}</span>
              ) : null}
              {data.nextAction.time ? (
                <span>Tijd: {data.nextAction.time}</span>
              ) : null}
            </div>
          </div>
          <Link
            href={data.nextAction.href}
            className={cn(buttonVariants(), "min-h-11 shrink-0")}
          >
            Open actie
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </InstructorCard>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {data.stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            icon={
              stat.label.includes("Proef")
                ? Users
                : stat.label.includes("Examen")
                  ? Flag
                  : stat.label.includes("Taken")
                    ? CheckCircle2
                    : CalendarDays
            }
            tone={
              stat.tone === "purple"
                ? "bg-violet-50 text-violet-700"
                : stat.tone === "rose"
                  ? "bg-rose-50 text-rose-700"
                  : stat.tone === "green"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
            }
          />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <InstructorCard
          title="Vandaag"
          icon={CalendarDays}
          right={<Badge variant="primary">{data.appointments.length}</Badge>}
          className="md:col-span-2"
        >
          {data.appointments.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.appointments.map((appointment) => (
                <AppointmentCard
                  key={`${appointment.type}:${appointment.id}`}
                  appointment={appointment}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Er staan vandaag geen afspraken meer in je planning.
              </p>
              <Link
                href="/instructeur/agenda/nieuw"
                className={buttonVariants({ size: "sm" })}
              >
                Afspraak plannen
              </Link>
            </div>
          )}
          <Link
            href="/instructeur/agenda"
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-primary"
          >
            Naar volledige planning
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </InstructorCard>

        <InstructorCard
          title="Taken"
          icon={ListTodo}
          right={<Badge variant="primary">{data.tasks.length}</Badge>}
        >
          <div className="space-y-2">
            {data.tasks.length > 0 ? (
              data.tasks.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  href="/instructeur/taken"
                  className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-brand-muted/60"
                >
                  <span className="h-4 w-4 rounded border border-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {task.subject}
                    </p>
                  </div>
                  <Badge variant={priorityLabel[task.priority].variant}>
                    {priorityLabel[task.priority].label}
                  </Badge>
                </Link>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Geen openstaande taken.
              </p>
            )}
          </div>
        </InstructorCard>

        <InstructorCard
          title="Berichten"
          icon={MessageCircle}
        >
          <div className="space-y-2">
            {data.messages.length > 0 ? (
              data.messages.slice(0, 4).map((thread) => (
                <Link
                  key={thread.id}
                  href={`/instructeur/berichten/${thread.id}`}
                  className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-brand-muted/60"
                >
                  <Avatar name={thread.name} className="h-10 w-10 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {thread.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.preview}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {thread.time}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                Nog geen gesprekken.
              </p>
            )}
          </div>
        </InstructorCard>

        <InstructorCard
          title="Dagoverzicht"
          icon={BarChart3}
          className="md:col-span-2"
        >
          <div className="flex items-center gap-5">
            <ProgressRing
              value={data.availabilityToday.utilizationPct}
              label="Bezet"
            />
            <div className="min-w-0 flex-1 space-y-2">
              {[
                [
                  "Beschikbaar",
                  minutesLabel(data.availabilityToday.availableMinutes),
                  "bg-emerald-500",
                ],
                [
                  "Gepland",
                  minutesLabel(data.availabilityToday.bookedMinutes),
                  "bg-violet-500",
                ],
                ["Schema", data.availabilityToday.sourceLabel, "bg-blue-500"],
                [
                  "Tijden",
                  data.availabilityToday.intervalLabel,
                  "bg-amber-500",
                ],
              ].map(([label, value, tone]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", tone)}
                    />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="max-w-[11rem] truncate text-right font-black text-foreground">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/instructeur/agenda"
            className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-primary"
          >
            Naar volledige agenda
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </InstructorCard>

      </div>
    </InstructorPage>
  );
}

export function InstructorAgendaView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data) return <DataUnavailableState title="Agenda niet beschikbaar" />;
  const calendar = currentMonthCalendar();

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Planning"
        title="Agenda"
        subtitle="Plan je dag, week en maand met snelle toegang tot lessen, proeflessen en administratieve blokken."
        actions={
          <>
            <Link href="/instructeur/agenda/nieuw" className={buttonVariants()}>
              <Plus className="h-4 w-4" aria-hidden />
              Nieuwe afspraak
            </Link>
            <Link
              href="/instructeur/beschikbaarheid"
              className={buttonVariants({ variant: "outline" })}
            >
              Beschikbaarheid
            </Link>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InstructorCard
          title="Vandaag"
          icon={CalendarDays}
          right={
            <div className="flex rounded-full bg-brand-muted p-1 text-xs font-bold">
              {["Dag", "Week", "Maand"].map((tab, index) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-full px-3 py-1.5",
                    index === 0
                      ? "bg-white text-brand-primary shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>
          }
        >
          <div className="grid gap-3">
            {data.appointments.length > 0 ? (
              data.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="grid gap-3 md:grid-cols-[4.5rem_1fr]"
                >
                  <div className="pt-3 text-sm font-bold tabular-nums text-muted-foreground">
                    {appointment.startsAt}
                  </div>
                  <AppointmentCard appointment={appointment} />
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm text-muted-foreground">
                Er staan vandaag geen agenda-items voor jou.
              </p>
            )}
          </div>
        </InstructorCard>

        <div className="space-y-4">
          <InstructorCard title={calendar.label} icon={CalendarDays}>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => (
                <span
                  key={day}
                  className="py-1 font-bold text-muted-foreground"
                >
                  {day}
                </span>
              ))}
              {calendar.days.map((day, index) =>
                day === null ? (
                  <span key={`empty-${index}`} aria-hidden className="py-2" />
                ) : (
                  <span
                    key={day}
                    aria-current={day === calendar.today ? "date" : undefined}
                    className={cn(
                      "rounded-xl py-2",
                      day === calendar.today
                        ? "bg-brand-primary text-white"
                        : "text-foreground hover:bg-brand-muted",
                    )}
                  >
                    {day}
                  </span>
                ),
              )}
            </div>
          </InstructorCard>
          <InstructorCard title="Afspraken" icon={ListTodo}>
            <div className="space-y-2">
              {data.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-2xl bg-brand-muted/55 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{stat.label}</span>
                  <span className="font-black text-foreground">
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>
          </InstructorCard>
        </div>
      </div>
    </InstructorPage>
  );
}

function StudentListItem({
  student,
  active,
}: {
  student: InstructorStudent;
  active?: boolean;
}) {
  return (
    <Link
      href={`/instructeur/leerlingen/${student.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition",
        active
          ? "border-brand-primary bg-brand-accent"
          : "border-brand-border bg-white hover:border-brand-primary/35",
      )}
    >
      <Avatar name={student.name} className="h-11 w-11 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-foreground">
          {student.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {student.license} - {student.progress}% voortgang
        </p>
      </div>
      <Badge variant={studentStatus[student.status].variant}>
        {studentStatus[student.status].label}
      </Badge>
    </Link>
  );
}

export function InstructorStudentsView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Leerlingen niet beschikbaar" />;
  const active = data.students[0] ?? null;

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Leerlingen"
        title="Mijn leerlingen"
        subtitle="Open direct het dossier of de voortgang van je gekoppelde leerlingen."
        actions={
          <AddStudentDialog ris20Qualified={data.profile.ris20Qualified} />
        }
      />
      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <InstructorCard title="Leerlingenlijst" icon={Users}>
          <div className="space-y-2">
            {data.students.length > 0 ? (
              data.students.map((student, index) => (
                <StudentListItem
                  key={student.id}
                  student={student}
                  active={index === 0}
                />
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm text-muted-foreground">
                Geen gekoppelde leerlingen gevonden voor jouw agenda.
              </p>
            )}
          </div>
        </InstructorCard>
        {active ? <StudentDetailPanel student={active} /> : null}
      </div>
    </InstructorPage>
  );
}

function StudentDetailPanel({ student }: { student: InstructorStudent }) {
  return (
    <InstructorCard>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={student.name} className="h-16 w-16 text-base" />
          <div>
            <h2 className="text-2xl font-black text-foreground">
              {student.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {student.license} - {studentStatus[student.status].label}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={
                  student.conversationId
                    ? `/instructeur/berichten/${student.conversationId}`
                    : "/instructeur/berichten"
                }
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <MessageCircle className="h-4 w-4" aria-hidden /> Bericht
              </Link>
              {student.phone ? (
                <a
                  href={`tel:${student.phone}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Phone className="h-4 w-4" aria-hidden /> Bel
                </a>
              ) : null}
              {student.email ? (
                <a
                  href={`mailto:${student.email}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Mail className="h-4 w-4" aria-hidden /> Mail
                </a>
              ) : (
                <Badge variant="outline">Portaal nog niet geactiveerd</Badge>
              )}
            </div>
          </div>
        </div>
        <ProgressRing value={student.progress} label="Voortgang" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <InfoTile label="Laatste les" value={student.latestLesson} />
        <InfoTile label="Volgende les" value={student.nextLesson} />
        <InfoTile label="Verwachte gereedheid" value={student.readiness} />
      </div>
      <div className="mt-4 rounded-2xl border border-brand-border bg-brand-muted/45 p-4">
        <p className="text-sm font-black text-foreground">Aandachtspunt</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {student.attention}
        </p>
      </div>
    </InstructorCard>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4">
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

export function InstructorStudentDetailView({
  studentId,
  data,
}: {
  studentId?: string;
  data?: InstructorExperience;
}) {
  if (!data) return <DataUnavailableState title="Leerling niet beschikbaar" />;
  const student = data.students.find((item) => item.id === studentId);
  if (!student) {
    return (
      <DataUnavailableState
        title="Leerling niet gevonden"
        subtitle="Deze leerling is niet gekoppeld aan jouw instructeursoverzicht."
      />
    );
  }
  const studentEvaluation = data.evaluations.find(
    (item) => item.studentId === student.id,
  );
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Leerlingdossier"
        title={student.name}
        subtitle="Overzicht, voortgang, lessen, planning en dossierinformatie in een tablet-first detailview."
      />
      <StudentDetailPanel student={student} />
      <div className="grid gap-4 xl:grid-cols-3">
        <InstructorCard title="Lestegoed" icon={WalletCards}>
          <InstructorCreditManager
            studentId={student.id}
            studentName={student.name}
            balanceMinutes={student.creditMinutes}
          />
        </InstructorCard>
        <InstructorCard title="Modulevoortgang" icon={Route}>
          <div className="space-y-4">
            {studentEvaluation?.modules.length ? (
              studentEvaluation.modules.map((module) => {
                const progress =
                  module.total > 0
                    ? Math.round((module.completed / module.total) * 100)
                    : 0;
                return (
                  <div key={module.id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-foreground">
                        {module.name}
                      </span>
                      <span className="text-muted-foreground">{progress}%</span>
                    </div>
                    <Progress value={progress} className="mt-2" />
                  </div>
                );
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm leading-6 text-muted-foreground">
                Nog geen RIS-modulevoortgang beschikbaar voor deze leerling.
              </p>
            )}
          </div>
        </InstructorCard>
        <InstructorCard title="Volgende focus" icon={Target}>
          <p className="text-sm leading-6 text-muted-foreground">
            {student.attention === "Geen urgente aandachtspunten."
              ? `${student.name} heeft geen urgente aandachtspunten. Gebruik de volgende les om de voortgang actueel te houden.`
              : student.attention}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
            <div>
              <dt className="inline font-bold text-foreground">Reden: </dt>
              <dd className="inline">
                planning, leshistorie en actueel tegoed
              </dd>
            </div>
            <div>
              <dt className="inline font-bold text-foreground">
                Ontbrekend bewijs:{" "}
              </dt>
              <dd className="inline">
                nieuwe lesobservaties worden pas na beoordeling meegenomen
              </dd>
            </div>
          </dl>
          <Link
            href={
              studentEvaluation
                ? `/instructeur/lessen/${studentEvaluation.id}`
                : "/instructeur/agenda"
            }
            className={cn(buttonVariants({ size: "sm" }), "mt-4")}
          >
            Open lesevaluatie
          </Link>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorEvaluationsView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Lesevaluaties niet beschikbaar" />;
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="RIS"
        title="Lesevaluaties"
        subtitle="Beoordeel lessen, open concepten en publiceer pas wanneer jij akkoord geeft."
      />
      <InstructorCard title="Open leskaarten" icon={FileText}>
        <div className="space-y-3">
          {data.evaluations.length > 0 ? (
            data.evaluations.map((evaluation) => (
              <Link
                key={evaluation.id}
                href={`/instructeur/lessen/${evaluation.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 transition hover:border-brand-primary/35 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 gap-3">
                  <Avatar
                    name={evaluation.studentName}
                    className="h-11 w-11 text-xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">
                      {evaluation.studentName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {evaluation.lessonLabel} - {evaluation.lessonDate}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={evaluationStatus[evaluation.status].variant}>
                    {evaluationStatus[evaluation.status].label}
                  </Badge>
                  <span className="text-sm font-bold text-brand-primary">
                    Open
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm text-muted-foreground">
              Geen lessen gevonden om te evalueren.
            </p>
          )}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorEvaluationDetailView({
  lessonId,
  data,
}: {
  lessonId?: string;
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Lesevaluatie niet beschikbaar" />;
  const evaluation = data.evaluations.find((item) => item.id === lessonId);
  if (!evaluation) {
    return (
      <DataUnavailableState
        title="Lesevaluatie niet gevonden"
        subtitle="Deze leskaart staat niet in jouw instructeursoverzicht."
      />
    );
  }
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Les evaluatie"
        title={evaluation.studentName}
        subtitle={`${evaluation.lessonLabel} - ${evaluation.lessonDate}`}
        actions={
          <Badge variant={evaluationStatus[evaluation.status].variant}>
            {evaluationStatus[evaluation.status].label}
          </Badge>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <InstructorCard title="RIS beoordeling" icon={FileText}>
          <div className="mb-4 flex flex-wrap gap-2">
            {["Lesinfo", "RIS beoordeling", "Reflectie", "Samenvatting"].map(
              (tab, index) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-bold",
                    index === 1
                      ? "bg-brand-primary text-white"
                      : "bg-brand-muted text-muted-foreground",
                  )}
                >
                  {tab}
                </span>
              ),
            )}
          </div>
          <div className="space-y-4">
            {evaluation.modules.length > 0 ? (
              evaluation.modules.map((module) => (
                <div
                  key={module.id}
                  className="rounded-[1.25rem] border border-brand-border bg-white"
                >
                  <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
                    <p className="font-black text-foreground">{module.name}</p>
                    <span className="text-xs font-bold text-muted-foreground">
                      {module.completed} / {module.total} scripts beoordeeld
                    </span>
                  </div>
                  <div className="divide-y divide-brand-border">
                    {module.scripts.map((script) => (
                      <div
                        key={script.id}
                        className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_1fr_auto] sm:items-center"
                      >
                        <span className="text-sm font-bold text-muted-foreground">
                          {script.index}.
                        </span>
                        <p className="text-sm font-bold text-foreground">
                          {script.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <button className="h-8 w-8 rounded-lg border border-brand-border bg-white font-black text-muted-foreground">
                            -
                          </button>
                          <span
                            className={cn(
                              "grid h-8 min-w-12 place-items-center rounded-lg px-3 text-sm font-black",
                              script.status === "ready"
                                ? "bg-emerald-50 text-emerald-700"
                                : script.status === "attention"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-brand-muted text-muted-foreground",
                            )}
                          >
                            {script.score}
                          </span>
                          <button className="h-8 w-8 rounded-lg border border-brand-border bg-white font-black text-brand-primary">
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm leading-6 text-muted-foreground">
                Deze leskaart bevat nog geen RIS-modules. Open de volledige
                lesevaluatie om met actuele RIS-data te werken.
              </p>
            )}
          </div>
        </InstructorCard>
        <div className="space-y-4">
          <InstructorCard title="Samenvatting concept" icon={FileText}>
            <p className="text-sm leading-6 text-muted-foreground">
              Er is nog geen conceptsamenvatting opgeslagen voor deze leskaart.
            </p>
          </InstructorCard>
          <InstructorCard title="Publiceren" icon={Send}>
            <p className="text-sm leading-6 text-muted-foreground">
              Controleer de samenvatting voordat je publiceert. Pas na jouw
              bevestiging ziet de leerling de reflectie; interne notities
              blijven verborgen.
            </p>
            <div className="mt-4 grid gap-2">
              <button className={buttonVariants({ variant: "outline" })}>
                Opslaan als concept
              </button>
              <button className={buttonVariants()}>
                Afronden & publiceren
              </button>
            </div>
          </InstructorCard>
        </div>
      </div>
    </InstructorPage>
  );
}

export function InstructorMessagesView({
  threadId,
  data,
}: {
  threadId?: string;
  data?: InstructorExperience;
}) {
  if (!data) return <DataUnavailableState title="Berichten niet beschikbaar" />;
  const hasSelectedThread = Boolean(threadId);
  const active =
    data.messages.find((thread) => thread.id === threadId) ??
    (hasSelectedThread ? null : data.messages[0]) ??
    null;
  return (
    <InstructorPage>
      <div className={cn(hasSelectedThread && "hidden md:block")}>
        <PageHeader
          eyebrow="Communicatie"
          title="Berichten"
          subtitle="Gesprekken met leerlingen, planning en team in een overzichtelijke split-view."
        />
      </div>
      <div className="grid gap-3 md:h-[calc(100dvh-12rem)] md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
        <InstructorCard
          title="Gesprekken"
          icon={MessageCircle}
          className={cn(hasSelectedThread && "hidden md:block", "md:h-full")}
          contentClassName="p-3 md:h-[calc(100%-4.25rem)] md:overflow-y-auto"
        >
          <div className="space-y-2">
            {data.messages.length > 0 ? (
              data.messages.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/instructeur/berichten/${thread.id}`}
                  className={cn(
                    "flex min-h-[4.75rem] items-center gap-3 rounded-2xl border p-3 transition hover:border-brand-primary/40 hover:bg-brand-accent/70",
                    thread.id === active?.id
                      ? "border-brand-primary bg-brand-accent"
                      : "border-brand-border bg-white",
                  )}
                >
                  <Avatar name={thread.name} className="h-11 w-11 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">
                      {thread.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {thread.preview}
                    </p>
                  </div>
                  {thread.unread ? (
                    <Badge variant="primary">{thread.unread}</Badge>
                  ) : null}
                </Link>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm text-muted-foreground">
                Nog geen gesprekken.
              </p>
            )}
          </div>
        </InstructorCard>
        {active ? (
          <InstructorCard
            title={active.name}
            icon={User}
            right={<Badge variant="success">Online</Badge>}
            className={cn(!hasSelectedThread && "hidden md:block", "md:h-full")}
            headerClassName="hidden md:flex"
            contentClassName="flex min-h-[calc(100dvh-8.5rem)] flex-col p-0 md:h-[calc(100%-4.25rem)] md:min-h-0"
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-2 border-b border-brand-border/70 px-4 py-3 md:hidden">
                <Link
                  href="/instructeur/berichten"
                  aria-label="Terug naar gesprekken"
                  className="grid h-9 w-9 place-items-center rounded-xl border border-brand-border bg-white text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </Link>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">
                    {active.name}
                  </p>
                  <p className="text-xs text-success">Online</p>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {active.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.sender === "instructor"
                        ? "justify-end"
                        : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm md:max-w-[68%]",
                        message.sender === "instructor"
                          ? "bg-brand-primary text-white"
                          : "bg-brand-muted text-foreground",
                      )}
                    >
                      <p>{message.body}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          message.sender === "instructor"
                            ? "text-white/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {message.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-brand-border/70 bg-white/95 p-3">
                <InstructorMessageComposer conversationId={active.id} />
              </div>
            </div>
          </InstructorCard>
        ) : (
          <InstructorCard
            title="Geen gesprek geselecteerd"
            icon={User}
            className={cn(!hasSelectedThread && "hidden md:block", "md:h-full")}
            contentClassName="flex min-h-[calc(100dvh-8.5rem)] items-center justify-center p-6 md:h-[calc(100%-4.25rem)] md:min-h-0"
          >
            <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">
              Er zijn nog geen gesprekken voor deze instructeur.
            </p>
          </InstructorCard>
        )}
      </div>
    </InstructorPage>
  );
}

export function InstructorTasksView({
  workspace,
}: {
  workspace: InstructorTaskWorkspace;
}) {
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Taken"
        title="Openstaande taken"
        subtitle="Werk acties af rond lessen, leerlingen, voertuigen en planning."
      />
      <InstructorCard title="Takenlijst" icon={ListTodo}>
        <InstructorTaskManager workspace={workspace} />
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorVehiclesView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Voertuigen niet beschikbaar" />;
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Voertuigen"
        title="Voertuigen"
        subtitle="Bekijk je gekoppelde lesauto's, status, APK en onderhoudscontext."
      />
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <InstructorCard title="Voertuigen" icon={CarFront}>
          <div className="space-y-2">
            {data.vehicles.length > 0 ? (
              data.vehicles.map((vehicle, index) => (
                <div
                  key={vehicle.id}
                  className={cn(
                    "rounded-2xl border p-3",
                    index === 0
                      ? "border-brand-primary bg-brand-accent"
                      : "border-brand-border bg-white",
                  )}
                >
                  <p className="font-black text-foreground">{vehicle.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {vehicle.plate}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border bg-brand-muted/45 p-4 text-sm text-muted-foreground">
                Geen actieve voertuigen gevonden.
              </p>
            )}
          </div>
        </InstructorCard>
        <InstructorCard title="Voertuigdetails" icon={CarFront}>
          <div className="grid gap-4 md:grid-cols-3">
            {data.vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="rounded-2xl border border-brand-border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">{vehicle.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {vehicle.plate}
                    </p>
                  </div>
                  <Badge variant={vehicleStatus[vehicle.status].variant}>
                    {vehicleStatus[vehicle.status].label}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                  <span>{vehicle.transmission}</span>
                  <span>APK: {vehicle.apk}</span>
                  <span>Kilometerstand: {vehicle.mileage}</span>
                  <span>Onderhoud: {vehicle.maintenance}</span>
                </div>
              </div>
            ))}
          </div>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorReportsView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Rapportages niet beschikbaar" />;
  const lessonsToday =
    data.stats.find((stat) => stat.label === "Rijlessen")?.value ?? "0";
  const openTasks = data.tasks.length;
  const attentionCount = data.radar.length;
  const activeVehicles = data.vehicles.filter(
    (vehicle) => vehicle.status === "active",
  ).length;
  const trendValues = data.stats.map((stat) =>
    Math.max(0, Math.min(100, Number(stat.value) * 16 || 0)),
  );

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Rapportages"
        title="Rapportages"
        subtitle="Lichte operationele inzichten voor jouw week en leerlingen met aandachtspunten."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rijlessen vandaag"
          value={lessonsToday}
          hint="Agenda"
          icon={CalendarDays}
          tone="bg-blue-50 text-blue-700"
        />
        <StatCard
          label="Open taken"
          value={String(openTasks)}
          hint="Acties"
          icon={FileText}
          tone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          label="Aandacht"
          value={String(attentionCount)}
          hint="Leerlingen"
          icon={Target}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          label="Actieve voertuigen"
          value={String(activeVehicles)}
          hint="Beschikbaar"
          icon={Flag}
          tone="bg-violet-50 text-violet-700"
        />
      </div>
      <InstructorCard title="Dagmix" icon={BarChart3}>
        <div className="grid gap-3 md:grid-cols-4">
          {data.stats.map((stat, index) => (
            <div
              key={stat.label}
              className="flex h-44 flex-col justify-end rounded-2xl bg-brand-muted p-3"
            >
              <div
                className="w-full rounded-xl bg-brand-primary"
                style={{ height: `${trendValues[index] ?? 8}%` }}
              />
              <p className="mt-2 truncate text-xs font-bold text-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorSettingsView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data)
    return <DataUnavailableState title="Instellingen niet beschikbaar" />;
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Instellingen"
        title="Account en voorkeuren"
        subtitle="Open de juiste omgeving voor je profiel, beschikbaarheid en meldingen."
      />
      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <InstructorCard title="Snel naar" icon={Settings}>
          <div className="grid gap-2">
            {[
              ["Profiel", "/instructeur/profiel"],
              ["Beschikbaarheid", "/instructeur/beschikbaarheid"],
              ["Meldingen", "/instructeur/meldingen"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="flex min-h-11 items-center justify-between rounded-2xl px-3 py-2 text-sm font-bold text-foreground transition hover:bg-brand-muted"
              >
                {label}
                <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          </div>
        </InstructorCard>
        <div className="space-y-4">
          <InstructorCard title="Profiel" icon={User}>
            <div className="grid gap-3 md:grid-cols-3">
              <InfoTile label="Naam" value={data.profile.name} />
              <InfoTile
                label="Telefoon"
                value={data.profile.phone ?? "Niet ingevuld"}
              />
              <InfoTile
                label="E-mail"
                value={data.profile.email ?? "Niet ingevuld"}
              />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Je rijschool beheert je accountgegevens. Neem contact op met de
              administratie wanneer deze gegevens niet kloppen.
            </p>
          </InstructorCard>
        </div>
      </div>
    </InstructorPage>
  );
}

export function InstructorProfileView({
  data,
}: {
  data?: InstructorExperience;
}) {
  if (!data) return <DataUnavailableState title="Profiel niet beschikbaar" />;
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Profiel"
        title={data.profile.name}
        subtitle={`${data.profile.role} - ${data.profile.tenantName}`}
      />
      <InstructorCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Avatar name={data.profile.name} className="h-20 w-20 text-xl" />
          <div>
            <h2 className="text-2xl font-black text-foreground">
              {data.profile.name}
            </h2>
            <p className="text-muted-foreground">
              {data.profile.role} - {data.profile.status}
            </p>
          </div>
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorMoreView() {
  const links = [
    ["Berichten", "/instructeur/berichten", MessageCircle],
    ["Meldingen", "/instructeur/meldingen", Bell],
    ["Voertuigen", "/instructeur/voertuigen", CarFront],
    ["Beschikbaarheid", "/instructeur/beschikbaarheid", Clock3],
    ["Rapportages", "/instructeur/rapportages", BarChart3],
    ["Instellingen", "/instructeur/instellingen", Settings],
    ["Profiel", "/instructeur/profiel", User],
  ] as const;

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Account"
        title="Account"
        subtitle="Berichten, meldingen, hulpmiddelen en je accountvoorkeuren."
      />
      <InstructorCard>
        <div className="grid gap-2">
          {links.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between rounded-2xl border border-brand-border bg-white px-4 py-3"
            >
              <span className="flex items-center gap-3 font-bold text-foreground">
                <Icon className="h-4 w-4 text-brand-primary" aria-hidden />
                {label}
              </span>
              <ArrowRight
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
            </Link>
          ))}
          <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4">
            <SecureInstructorLogoutForm />
          </div>
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorSimpleView({
  eyebrow,
  title,
  subtitle,
  icon: Icon = Sparkles,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon?: IconComponent;
}) {
  return (
    <InstructorPage>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <InstructorCard title={title} icon={Icon}>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Zodra er gegevens voor dit onderdeel beschikbaar zijn, verschijnt hier
          de bijbehorende instructeursweergave.
        </p>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorNotificationsView({
  items,
  unreadCount,
}: {
  items: InAppNotification[];
  unreadCount: number;
}) {
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Meldingen"
        title="Meldingen"
        subtitle="Belangrijke updates over leerlingen, planning en taken."
      />
      <NotificationInbox items={items} unreadCount={unreadCount} />
    </InstructorPage>
  );
}

export function InstructorOfflineView() {
  return (
    <InstructorSimpleView
      eyebrow="Offline"
      title="Geen verbinding"
      subtitle="Je kunt de app blijven openen; zodra de verbinding terug is synchroniseert de planning."
      icon={ShieldCheck}
    />
  );
}

export function InstructorIntakeView() {
  return (
    <InstructorSimpleView
      eyebrow="Intake"
      title="Proefles intake"
      subtitle="Leg intakepunten vast en koppel de proefles aan een vervolgactie."
      icon={BookOpen}
    />
  );
}

export function InstructorLessonPlanView() {
  return (
    <InstructorSimpleView
      eyebrow="Les plannen"
      title="Nieuwe les"
      subtitle="Plan een rijles met leerling, voertuig, locatie en lesdoelen."
      icon={CalendarPlus}
    />
  );
}

export function InstructorPaymentsContextView() {
  return (
    <InstructorSimpleView
      eyebrow="Context"
      title="Administratieve context"
      subtitle="Betaal- en tegoedcontext blijft read-only voor instructeurs."
      icon={WalletCards}
    />
  );
}
