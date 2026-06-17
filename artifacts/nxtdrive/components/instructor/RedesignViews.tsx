import Link from "next/link";
import {
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
  ListTodo,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Route,
  Search,
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
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getInstructorAppointment,
  getInstructorEvaluation,
  getInstructorExperience,
  getInstructorMessageThread,
  getInstructorStudent,
  type InstructorAppointment,
  type InstructorAppointmentType,
  type InstructorEvaluation,
  type InstructorEvaluationStatus,
  type InstructorStudent,
  type InstructorStudentStatus,
  type InstructorTaskPriority,
  type InstructorVehicleStatus,
} from "@/lib/instructor/redesign-data";

type IconComponent = typeof CalendarDays;

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
    <div className={cn("min-w-0 space-y-4 md:space-y-5 xl:space-y-6", className)}>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[clamp(1.65rem,4vw,2.45rem)] font-black leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function InstructorCard({
  children,
  title,
  icon: Icon,
  right,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  title?: string;
  icon?: IconComponent;
  right?: React.ReactNode;
  className?: string;
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
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-brand-border/70 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            <h2 className="truncate text-sm font-black text-foreground">{title}</h2>
          </div>
          {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0 p-4", contentClassName)}>{children}</div>
    </section>
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
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        dimension,
      )}
      style={{
        background: `conic-gradient(var(--brand-primary) ${value * 3.6}deg, var(--brand-muted) 0deg)`,
      }}
    >
      <div className="grid h-[78%] w-[78%] place-items-center rounded-full bg-white text-center shadow-inner">
        <div>
          <p className={cn("font-black text-foreground", size === "sm" ? "text-sm" : "text-2xl")}>
            {value}%
          </p>
          <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
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
    <div className="rounded-[1.15rem] border border-brand-border/80 bg-white p-4 shadow-brand-card">
      <div className="flex items-center gap-3">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-black leading-none text-foreground">{value}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{label}</p>
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
    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", appointmentTone[type])}>
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
        "relative block overflow-hidden rounded-[1.15rem] border border-brand-border bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-primary/35 hover:shadow-brand-card",
        compact && "p-3",
      )}
    >
      <span className={cn("absolute inset-y-3 left-0 w-1 rounded-full", appointmentRail[appointment.type])} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">{appointment.title}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {appointment.studentName ?? appointment.location}
            </p>
          </div>
          <AppointmentTypeBadge type={appointment.type} />
        </div>
        <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
          <span>{appointment.startsAt} - {appointment.endsAt}</span>
          <span>{appointment.duration} - {appointment.location}</span>
        </div>
      </div>
    </Link>
  );
}

function NextLessonCard() {
  const data = getInstructorExperience();
  const lesson = data.appointments.find((appointment) => appointment.id === "apt-1000")!;

  return (
    <InstructorCard
      title="Volgende les"
      icon={CalendarDays}
      right={<Badge variant="primary">Over 45 min</Badge>}
      className="h-full"
      contentClassName="space-y-4"
    >
      <div className="flex items-start gap-3">
        <Avatar name="Emma Jansen" className="h-14 w-14 text-sm" />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black text-foreground">Emma Jansen</h3>
          <p className="text-sm text-muted-foreground">Rijles - 90 minuten</p>
        </div>
      </div>
      <div className="grid gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-brand-primary" aria-hidden />
          {lesson.startsAt} - {lesson.endsAt} - 23 mei 2025
        </span>
        <span className="flex items-center gap-2">
          <Home className="h-4 w-4 text-brand-primary" aria-hidden />
          {lesson.location}
        </span>
        <span className="flex items-center gap-2">
          <CarFront className="h-4 w-4 text-brand-primary" aria-hidden />
          {lesson.vehicle} (N-285-DF)
        </span>
      </div>
      <div className="rounded-2xl border border-brand-border/80 bg-brand-muted/60 p-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Leerdoelen
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          <li>Kijktechniek bij kruispunten</li>
          <li>Voorsorteren en rijstrookgebruik</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/instructor/evaluations/lesson-emma" className={buttonVariants({ size: "sm" })}>
          Les starten
        </Link>
        <Link
          href="/instructor/agenda/apt-1000"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Details bekijken
        </Link>
      </div>
    </InstructorCard>
  );
}

export function InstructorCockpitView() {
  const data = getInstructorExperience();

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Dinsdag 23 mei 2025"
        title={`Goedemorgen ${data.profile.name.split(" ")[0]}!`}
        subtitle="Alles voor je lesdag staat klaar: lessen, taken, aandachtspunten en berichten."
        actions={
          <Link href="/instructor/agenda/new" className={buttonVariants()}>
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Nieuwe afspraak
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rijlessen" value="7" hint="Vandaag" icon={CalendarDays} tone="bg-blue-50 text-blue-700" />
        <StatCard label="Proeflessen" value="1" hint="Vandaag" icon={Users} tone="bg-violet-50 text-violet-700" />
        <StatCard label="Examens / TTT" value="1" hint="Vandaag" icon={Flag} tone="bg-rose-50 text-rose-700" />
        <StatCard label="Open taken" value="4" hint="Totaal" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.95fr_0.95fr]">
        <NextLessonCard />

        <InstructorCard title="Op de radar" icon={Target} className="h-full">
          <div className="space-y-3">
            {data.radar.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-brand-border/70 bg-brand-muted/45 p-3">
                <Avatar name={item.student} className="h-10 w-10 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{item.student}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.reason}</p>
                </div>
                <span className={cn("h-2.5 w-2.5 rounded-full", priorityLabel[item.priority].dot)} />
              </div>
            ))}
            <Link href="/instructor/students" className="inline-flex items-center gap-1 text-sm font-bold text-brand-primary">
              Naar alle aandachtspunten
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </InstructorCard>

        <InstructorCard title="Openstaande taken" icon={ListTodo} right={<Badge variant="primary">4</Badge>}>
          <div className="space-y-2">
            {data.tasks.map((task) => (
              <Link key={task.id} href="/instructor/tasks" className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-brand-muted/60">
                <span className="h-4 w-4 rounded border border-muted-foreground/40" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{task.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{task.subject}</p>
                </div>
                <Badge variant={priorityLabel[task.priority].variant}>{priorityLabel[task.priority].label}</Badge>
              </Link>
            ))}
          </div>
        </InstructorCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.78fr_0.92fr]">
        <InstructorCard title="Berichten" icon={MessageCircle}>
          <div className="space-y-2">
            {data.messages.map((thread) => (
              <Link key={thread.id} href={`/instructor/messages/${thread.id}`} className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-brand-muted/60">
                <Avatar name={thread.name} className="h-10 w-10 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{thread.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{thread.preview}</p>
                </div>
                <span className="text-xs text-muted-foreground">{thread.time}</span>
              </Link>
            ))}
          </div>
        </InstructorCard>

        <InstructorCard title="Quick links" icon={Route}>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Leerlingen", "/instructor/students", Users],
              ["Agenda", "/instructor/agenda", CalendarDays],
              ["Les evaluaties", "/instructor/evaluations", FileText],
              ["Voertuigen", "/instructor/vehicles", CarFront],
              ["Beschikbaarheid", "/instructor/availability", Clock3],
              ["Rapportages", "/instructor/reports", BarChart3],
            ].map(([label, href, Icon]) => {
              const LinkIcon = Icon as IconComponent;
              return (
                <Link key={String(href)} href={String(href)} className="rounded-2xl border border-brand-border bg-white p-3 text-center shadow-sm hover:border-brand-primary/40">
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
                    <LinkIcon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="mt-2 block text-xs font-bold text-foreground">{String(label)}</span>
                </Link>
              );
            })}
          </div>
        </InstructorCard>

        <InstructorCard title="Dagoverzicht" icon={BarChart3}>
          <div className="flex items-center gap-5">
            <ProgressRing value={78} label="Vandaag" />
            <div className="min-w-0 flex-1 space-y-2">
              {[
                ["Rijlessen", 7, "bg-blue-500"],
                ["Proeflessen", 1, "bg-emerald-500"],
                ["Examen / TTT", 1, "bg-violet-500"],
                ["Administratie", 2, "bg-amber-500"],
              ].map(([label, value, dot]) => (
                <div key={String(label)} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", String(dot))} />
                    {String(label)}
                  </span>
                  <span className="font-black text-foreground">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
          <Link href="/instructor/agenda" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-primary">
            Naar volledige agenda
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorAgendaView() {
  const data = getInstructorExperience();

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Planning"
        title="Agenda"
        subtitle="Plan je dag, week en maand met snelle toegang tot lessen, proeflessen en administratieve blokken."
        actions={
          <>
            <Link href="/instructor/agenda/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" aria-hidden />
              Nieuwe afspraak
            </Link>
            <Link href="/instructor/availability" className={buttonVariants({ variant: "outline" })}>
              Beschikbaarheid
            </Link>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <InstructorCard
          title="Dinsdag 23 mei 2025"
          icon={CalendarDays}
          right={
            <div className="flex rounded-full bg-brand-muted p-1 text-xs font-bold">
              {["Dag", "Week", "Maand"].map((tab, index) => (
                <span key={tab} className={cn("rounded-full px-3 py-1.5", index === 0 ? "bg-white text-brand-primary shadow-sm" : "text-muted-foreground")}>
                  {tab}
                </span>
              ))}
            </div>
          }
        >
          <div className="grid gap-3">
            {data.appointments.map((appointment) => (
              <div key={appointment.id} className="grid gap-3 md:grid-cols-[4.5rem_1fr]">
                <div className="pt-3 text-sm font-bold tabular-nums text-muted-foreground">
                  {appointment.startsAt}
                </div>
                <AppointmentCard appointment={appointment} />
              </div>
            ))}
          </div>
        </InstructorCard>

        <div className="space-y-4">
          <InstructorCard title="Mei 2025" icon={CalendarDays}>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => (
                <span key={day} className="py-1 font-bold text-muted-foreground">{day}</span>
              ))}
              {Array.from({ length: 35 }, (_, index) => index + 1).map((day) => (
                <span key={day} className={cn("rounded-xl py-2", day === 23 ? "bg-brand-primary text-white" : "text-foreground hover:bg-brand-muted")}>
                  {day}
                </span>
              ))}
            </div>
          </InstructorCard>
          <InstructorCard title="Afspraken" icon={ListTodo}>
            <div className="space-y-2">
              {["Rijlessen 7", "Proeflessen 1", "Examens / TTT 1", "Overig 2"].map((line) => (
                <div key={line} className="flex items-center justify-between rounded-2xl bg-brand-muted/55 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{line.split(" ")[0]}</span>
                  <span className="font-black text-foreground">{line.split(" ").at(-1)}</span>
                </div>
              ))}
            </div>
          </InstructorCard>
        </div>
      </div>
    </InstructorPage>
  );
}

export function InstructorNewAppointmentView() {
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Nieuwe planning"
        title="Nieuwe afspraak"
        subtitle="Maak snel een rijles, proefles, examenblok of administratieve afspraak aan."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <InstructorCard title="Afspraakgegevens" icon={CalendarPlus}>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Type afspraak",
              "Leerling",
              "Datum",
              "Starttijd",
              "Duur",
              "Voertuig",
              "Locatie",
              "Status",
            ].map((label) => (
              <label key={label} className="grid gap-2 text-sm font-bold text-foreground">
                {label}
                <Input placeholder={label} />
              </label>
            ))}
            <label className="grid gap-2 text-sm font-bold text-foreground md:col-span-2">
              Leerdoelen en notities
              <Textarea placeholder="Bijvoorbeeld: kijktechniek, rotondes, snelheid aanpassen..." />
            </label>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/instructor/agenda" className={buttonVariants({ variant: "outline" })}>Annuleren</Link>
            <button className={buttonVariants()}>Aanmaken</button>
          </div>
        </InstructorCard>
        <InstructorCard title="Beschikbaarheidscheck" icon={ShieldCheck}>
          <div className="space-y-3 text-sm">
            <Badge variant="success">Binnen beschikbaarheid</Badge>
            <p className="leading-6 text-muted-foreground">
              De gekozen tijd valt binnen je zichtbare agenda-uren. Conflicten met voertuig of leerling verschijnen hier zodra de planning-core dit valideert.
            </p>
          </div>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorAppointmentDetailView({ appointmentId }: { appointmentId?: string }) {
  const appointment = getInstructorAppointment(appointmentId);

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Afspraakdetail"
        title={appointment.studentName ?? appointment.title}
        subtitle={`${appointment.title} - ${appointment.startsAt} tot ${appointment.endsAt} - ${appointment.location}`}
        actions={<AppointmentTypeBadge type={appointment.type} />}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <InstructorCard title="Samenvatting" icon={CalendarDays}>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Tijd", `${appointment.startsAt} - ${appointment.endsAt}`],
              ["Duur", appointment.duration],
              ["Locatie", appointment.location],
              ["Voertuig", appointment.vehicle ?? "Niet gekoppeld"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-brand-border bg-brand-muted/45 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-sm font-black text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </InstructorCard>
        <InstructorCard title="Acties" icon={Sparkles}>
          <div className="grid gap-2">
            <Link href="/instructor/evaluations/lesson-emma" className={buttonVariants()}>Les starten</Link>
            <Link href="/instructor/messages/emma" className={buttonVariants({ variant: "outline" })}>Bericht sturen</Link>
            <button className={buttonVariants({ variant: "outline" })}>Wijzigen</button>
          </div>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

function StudentListItem({ student, active }: { student: InstructorStudent; active?: boolean }) {
  return (
    <Link
      href={`/instructor/students/${student.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-3 transition",
        active ? "border-brand-primary bg-brand-accent" : "border-brand-border bg-white hover:border-brand-primary/35",
      )}
    >
      <Avatar name={student.name} className="h-11 w-11 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-foreground">{student.name}</p>
        <p className="truncate text-xs text-muted-foreground">{student.license} - {student.progress}% voortgang</p>
      </div>
      <Badge variant={studentStatus[student.status].variant}>{studentStatus[student.status].label}</Badge>
    </Link>
  );
}

export function InstructorStudentsView() {
  const data = getInstructorExperience();
  const active = data.students[0]!;

  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Leerlingen"
        title="Mijn leerlingen"
        subtitle="Zoek, filter en open direct het dossier of de voortgang van je gekoppelde leerlingen."
      />
      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <InstructorCard title="Leerlingenlijst" icon={Users}>
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-brand-border bg-white px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm text-muted-foreground">Zoek leerling...</span>
          </div>
          <div className="space-y-2">
            {data.students.map((student, index) => (
              <StudentListItem key={student.id} student={student} active={index === 0} />
            ))}
          </div>
        </InstructorCard>
        <StudentDetailPanel student={active} />
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
            <h2 className="text-2xl font-black text-foreground">{student.name}</h2>
            <p className="text-sm text-muted-foreground">{student.license} - {studentStatus[student.status].label}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/instructor/messages/emma" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <MessageCircle className="h-4 w-4" aria-hidden /> Bericht
              </Link>
              <a href={`tel:${student.phone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Phone className="h-4 w-4" aria-hidden /> Bel
              </a>
              <a href={`mailto:${student.email}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Mail className="h-4 w-4" aria-hidden /> Mail
              </a>
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
        <p className="mt-1 text-sm text-muted-foreground">{student.attention}</p>
      </div>
    </InstructorCard>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-black text-foreground">{value}</p>
    </div>
  );
}

export function InstructorStudentDetailView({ studentId }: { studentId?: string }) {
  const student = getInstructorStudent(studentId);
  return (
    <InstructorPage>
      <PageHeader eyebrow="Leerlingdossier" title={student.name} subtitle="Overzicht, voortgang, lessen, planning en dossierinformatie in een tablet-first detailview." />
      <StudentDetailPanel student={student} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <InstructorCard title="Modulevoortgang" icon={Route}>
          <div className="space-y-4">
            {["Voertuigbeheersing", "Verkeersinzicht", "Verkeershandelen", "Risicoperceptie"].map((module, index) => (
              <div key={module}>
                <div className="flex justify-between text-sm">
                  <span className="font-bold text-foreground">{module}</span>
                  <span className="text-muted-foreground">{[82, 68, 54, 42][index]}%</span>
                </div>
                <Progress value={[82, 68, 54, 42][index]!} className="mt-2" />
              </div>
            ))}
          </div>
        </InstructorCard>
        <InstructorCard title="AI coachnotitie" icon={Sparkles}>
          <p className="text-sm leading-6 text-muted-foreground">
            Emma maakt mooie stappen. Houd de komende lessen focus op kijktechniek bij kruispunten en rustiger voorsorteren in druk verkeer.
          </p>
          <Link href="/instructor/evaluations/lesson-emma" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
            Open lesevaluatie
          </Link>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorEvaluationsView() {
  const data = getInstructorExperience();
  return (
    <InstructorPage>
      <PageHeader eyebrow="RIS" title="Les evaluaties" subtitle="Beoordeel lessen, open concepten en publiceer pas wanneer jij akkoord geeft." />
      <InstructorCard title="Te beoordelen en recent" icon={FileText}>
        <div className="space-y-3">
          {data.evaluations.map((evaluation) => (
            <Link key={evaluation.id} href={`/instructor/evaluations/${evaluation.id}`} className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 transition hover:border-brand-primary/35 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 gap-3">
                <Avatar name={evaluation.studentName} className="h-11 w-11 text-xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">{evaluation.studentName}</p>
                  <p className="text-sm text-muted-foreground">{evaluation.lessonLabel} - {evaluation.lessonDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={evaluationStatus[evaluation.status].variant}>{evaluationStatus[evaluation.status].label}</Badge>
                <span className="text-sm font-bold text-brand-primary">Open</span>
              </div>
            </Link>
          ))}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorEvaluationDetailView({ lessonId }: { lessonId?: string }) {
  const evaluation = getInstructorEvaluation(lessonId);
  return (
    <InstructorPage>
      <PageHeader
        eyebrow="Les evaluatie"
        title={evaluation.studentName}
        subtitle={`${evaluation.lessonLabel} - ${evaluation.lessonDate}`}
        actions={<Badge variant={evaluationStatus[evaluation.status].variant}>{evaluationStatus[evaluation.status].label}</Badge>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <InstructorCard title="RIS beoordeling" icon={FileText}>
          <div className="mb-4 flex flex-wrap gap-2">
            {["Lesinfo", "RIS beoordeling", "Reflectie", "Samenvatting"].map((tab, index) => (
              <span key={tab} className={cn("rounded-full px-3 py-2 text-xs font-bold", index === 1 ? "bg-brand-primary text-white" : "bg-brand-muted text-muted-foreground")}>
                {tab}
              </span>
            ))}
          </div>
          <div className="space-y-4">
            {evaluation.modules.map((module) => (
              <div key={module.id} className="rounded-[1.25rem] border border-brand-border bg-white">
                <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
                  <p className="font-black text-foreground">{module.name}</p>
                  <span className="text-xs font-bold text-muted-foreground">{module.completed} / {module.total} scripts beoordeeld</span>
                </div>
                <div className="divide-y divide-brand-border">
                  {module.scripts.map((script) => (
                    <div key={script.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
                      <span className="text-sm font-bold text-muted-foreground">{script.index}.</span>
                      <p className="text-sm font-bold text-foreground">{script.name}</p>
                      <div className="flex items-center gap-2">
                        <button className="h-8 w-8 rounded-lg border border-brand-border bg-white font-black text-muted-foreground">-</button>
                        <span className={cn("grid h-8 min-w-12 place-items-center rounded-lg px-3 text-sm font-black", script.status === "ready" ? "bg-emerald-50 text-emerald-700" : script.status === "attention" ? "bg-amber-50 text-amber-700" : "bg-brand-muted text-muted-foreground")}>
                          {script.score}
                        </span>
                        <button className="h-8 w-8 rounded-lg border border-brand-border bg-white font-black text-brand-primary">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </InstructorCard>
        <div className="space-y-4">
          <InstructorCard title="Samenvatting concept" icon={Sparkles}>
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p><strong className="text-foreground">Wat ging goed?</strong><br />Je keek goed op tijd en hebt overzicht gehouden.</p>
              <p><strong className="text-foreground">Waar werken we aan?</strong><br />Let op risico's bij kruispunten en stem je snelheid eerder af.</p>
              <p><strong className="text-foreground">Volgende focus</strong><br />Kijktechniek bij kruispunten en voorrangssituaties.</p>
            </div>
          </InstructorCard>
          <InstructorCard title="Publiceren" icon={Send}>
            <p className="text-sm leading-6 text-muted-foreground">
              AI-tekst blijft een voorstel. Pas na jouw bevestiging ziet de leerling de reflectie; interne notities blijven verborgen.
            </p>
            <div className="mt-4 grid gap-2">
              <button className={buttonVariants({ variant: "outline" })}>Opslaan als concept</button>
              <button className={buttonVariants({ variant: "outline" })}>AI-voorstel genereren</button>
              <button className={buttonVariants()}>Afronden & publiceren</button>
            </div>
          </InstructorCard>
        </div>
      </div>
    </InstructorPage>
  );
}

export function InstructorMessagesView({ threadId }: { threadId?: string }) {
  const data = getInstructorExperience();
  const active = getInstructorMessageThread(threadId);
  return (
    <InstructorPage>
      <PageHeader eyebrow="Communicatie" title="Berichten" subtitle="Gesprekken met leerlingen, planning en team in een overzichtelijke split-view." />
      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        <InstructorCard title="Gesprekken" icon={MessageCircle}>
          <div className="space-y-2">
            {data.messages.map((thread) => (
              <Link key={thread.id} href={`/instructor/messages/${thread.id}`} className={cn("flex items-center gap-3 rounded-2xl border p-3", thread.id === active.id ? "border-brand-primary bg-brand-accent" : "border-brand-border bg-white")}>
                <Avatar name={thread.name} className="h-10 w-10 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-foreground">{thread.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{thread.preview}</p>
                </div>
                {thread.unread ? <Badge variant="primary">{thread.unread}</Badge> : null}
              </Link>
            ))}
          </div>
        </InstructorCard>
        <InstructorCard title={active.name} icon={User} right={<Badge variant="success">Online</Badge>}>
          <div className="flex min-h-[28rem] flex-col">
            <div className="flex-1 space-y-3">
              {active.messages.map((message) => (
                <div key={message.id} className={cn("flex", message.sender === "instructor" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm", message.sender === "instructor" ? "bg-brand-primary text-white" : "bg-brand-muted text-foreground")}>
                    <p>{message.body}</p>
                    <p className={cn("mt-1 text-[10px]", message.sender === "instructor" ? "text-white/70" : "text-muted-foreground")}>{message.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-brand-border bg-white p-2">
              <Input placeholder="Typ een bericht..." className="border-0 shadow-none focus-visible:ring-0" />
              <button className={buttonVariants({ size: "icon" })} aria-label="Versturen">
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorTasksView() {
  const data = getInstructorExperience();
  return (
    <InstructorPage>
      <PageHeader eyebrow="Taken" title="Openstaande taken" subtitle="Werk acties af rond lessen, leerlingen, voertuigen en planning." />
      <InstructorCard title="Takenlijst" icon={ListTodo}>
        <div className="space-y-2">
          {data.tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-3 rounded-2xl border border-brand-border bg-white p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-4 w-4 rounded border border-muted-foreground/40" />
                <div>
                  <p className="font-black text-foreground">{task.title}</p>
                  <p className="text-sm text-muted-foreground">{task.subject} - {task.due}</p>
                </div>
              </div>
              <Badge variant={priorityLabel[task.priority].variant}>{priorityLabel[task.priority].label}</Badge>
            </div>
          ))}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorVehiclesView() {
  const data = getInstructorExperience();
  return (
    <InstructorPage>
      <PageHeader eyebrow="Voertuigen" title="Voertuigen" subtitle="Bekijk je gekoppelde lesauto's, status, APK en onderhoudscontext." />
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <InstructorCard title="Voertuigen" icon={CarFront}>
          <div className="space-y-2">
            {data.vehicles.map((vehicle, index) => (
              <div key={vehicle.id} className={cn("rounded-2xl border p-3", index === 0 ? "border-brand-primary bg-brand-accent" : "border-brand-border bg-white")}>
                <p className="font-black text-foreground">{vehicle.name}</p>
                <p className="text-sm text-muted-foreground">{vehicle.plate}</p>
              </div>
            ))}
          </div>
        </InstructorCard>
        <InstructorCard title="Volkswagen Golf" icon={CarFront} right={<Badge variant="success">Actief</Badge>}>
          <div className="grid gap-4 md:grid-cols-3">
            {data.vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-2xl border border-brand-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-foreground">{vehicle.name}</p>
                    <p className="text-sm text-muted-foreground">{vehicle.plate}</p>
                  </div>
                  <Badge variant={vehicleStatus[vehicle.status].variant}>{vehicleStatus[vehicle.status].label}</Badge>
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

export function InstructorAvailabilityView() {
  const data = getInstructorExperience();
  return (
    <InstructorPage>
      <PageHeader eyebrow="Beschikbaarheid" title="Agenda uren" subtitle="Beheer je zichtbare agenda-uren, pauzes en uitzonderingen." />
      <InstructorCard title="Weekoverzicht" icon={Clock3}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.availability.map((day) => (
            <div key={day.day} className="rounded-2xl border border-brand-border bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-black text-foreground">{day.day}</p>
                <Switch checked={day.active} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{day.start} - {day.end}</p>
              <p className="text-sm text-muted-foreground">Pauze: {day.breakLabel}</p>
            </div>
          ))}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorReportsView() {
  return (
    <InstructorPage>
      <PageHeader eyebrow="Rapportages" title="Rapportages" subtitle="Lichte operationele inzichten voor jouw week en leerlingen met aandachtspunten." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lessen deze week" value="31" hint="5 dagen" icon={CalendarDays} tone="bg-blue-50 text-blue-700" />
        <StatCard label="Evaluatiegraad" value="92%" hint="Afgerond" icon={FileText} tone="bg-emerald-50 text-emerald-700" />
        <StatCard label="Aandacht" value="3" hint="Leerlingen" icon={Target} tone="bg-amber-50 text-amber-700" />
        <StatCard label="Examens" value="2" hint="Komend" icon={Flag} tone="bg-violet-50 text-violet-700" />
      </div>
      <InstructorCard title="Weektrend" icon={BarChart3}>
        <div className="grid gap-3 md:grid-cols-5">
          {[62, 78, 54, 88, 70].map((value, index) => (
            <div key={index} className="flex h-44 items-end rounded-2xl bg-brand-muted p-3">
              <div className="w-full rounded-xl bg-brand-primary" style={{ height: `${value}%` }} />
            </div>
          ))}
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorSettingsView() {
  return (
    <InstructorPage>
      <PageHeader eyebrow="Instellingen" title="Instellingen" subtitle="Profiel, agenda-uren, notificaties, app instellingen en thema." />
      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <InstructorCard title="Menu" icon={Settings}>
          <div className="grid gap-2">
            {["Profiel", "Agenda uren", "Notificaties", "Thema", "Account"].map((item, index) => (
              <span key={item} className={cn("rounded-2xl px-3 py-2 text-sm font-bold", index === 0 ? "bg-brand-accent text-brand-primary" : "text-muted-foreground")}>
                {item}
              </span>
            ))}
          </div>
        </InstructorCard>
        <InstructorCard title="Profiel" icon={User}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-foreground">Naam<Input defaultValue="Mark de Vries" /></label>
            <label className="grid gap-2 text-sm font-bold text-foreground">Telefoon<Input defaultValue="+31 6 12 34 56 78" /></label>
            <label className="grid gap-2 text-sm font-bold text-foreground md:col-span-2">E-mail<Input defaultValue="mark@nxtdrive.nl" /></label>
          </div>
          <button className={cn(buttonVariants(), "mt-5")}>Instellingen opslaan</button>
        </InstructorCard>
      </div>
    </InstructorPage>
  );
}

export function InstructorProfileView() {
  const data = getInstructorExperience();
  return (
    <InstructorPage>
      <PageHeader eyebrow="Profiel" title={data.profile.name} subtitle={`${data.profile.role} - ${data.profile.tenantName}`} />
      <InstructorCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <Avatar name={data.profile.name} className="h-20 w-20 text-xl" />
          <div>
            <h2 className="text-2xl font-black text-foreground">{data.profile.name}</h2>
            <p className="text-muted-foreground">{data.profile.role} - {data.profile.status}</p>
          </div>
        </div>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorMoreView() {
  const links = [
    ["Taken", "/instructor/tasks", ListTodo],
    ["Voertuigen", "/instructor/vehicles", CarFront],
    ["Beschikbaarheid", "/instructor/availability", Clock3],
    ["Rapportages", "/instructor/reports", BarChart3],
    ["Instellingen", "/instructor/settings", Settings],
    ["Profiel", "/instructor/profile", User],
  ] as const;

  return (
    <InstructorPage>
      <PageHeader eyebrow="Meer" title="Meer" subtitle="Alle aanvullende instructeurfuncties op een plek." />
      <InstructorCard>
        <div className="grid gap-2">
          {links.map(([label, href, Icon]) => (
            <Link key={href} href={href} className="flex items-center justify-between rounded-2xl border border-brand-border bg-white px-4 py-3">
              <span className="flex items-center gap-3 font-bold text-foreground">
                <Icon className="h-4 w-4 text-brand-primary" aria-hidden />
                {label}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
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
          Deze pagina gebruikt dezelfde instructeur-shell, theme tokens en responsive kaartstijl. De functionele backend kan hierop aansluiten zonder de navigatiestructuur te wijzigen.
        </p>
      </InstructorCard>
    </InstructorPage>
  );
}

export function InstructorNotificationsView() {
  return (
    <InstructorSimpleView
      eyebrow="Meldingen"
      title="Meldingen"
      subtitle="Belangrijke updates over leerlingen, planning en taken."
      icon={Bell}
    />
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
