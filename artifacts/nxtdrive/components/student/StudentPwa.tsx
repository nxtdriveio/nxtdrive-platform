import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  StudentCBRStatus,
  StudentCBRStatusItem,
  StudentInvoice,
  StudentInvoiceStatus,
  StudentJourneyModule,
  StudentJourneyPoint,
  StudentJourneyStatus,
  StudentLesson,
  StudentLessonStatus,
  StudentPaymentBalance,
  StudentQuickAction,
  StudentRISReflection,
  StudentTheoryProgress,
} from "@/lib/student-pwa/types";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

const quickActionIcons: Record<StudentQuickAction["iconName"], LucideIcon> = {
  calendar: CalendarDays,
  route: Route,
  wallet: Wallet,
  badge: BadgeCheck,
  book: BookOpen,
  message: MessageCircle,
};

const lessonStatus: Record<
  StudentLessonStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  planned: { label: "Gepland", variant: "primary" },
  completed: { label: "Afgerond", variant: "success" },
  cancelled: { label: "Geannuleerd", variant: "danger" },
  pending: { label: "Wacht op bevestiging", variant: "warning" },
};

const journeyStatus: Record<
  StudentJourneyStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  done: { label: "Afgerond", variant: "success" },
  active: { label: "Actief", variant: "primary" },
  todo: { label: "Nog te doen", variant: "default" },
};

const invoiceStatus: Record<
  StudentInvoiceStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  paid: { label: "Betaald", variant: "success" },
  open: { label: "Openstaand", variant: "warning" },
  overdue: { label: "Verlopen", variant: "danger" },
};

const cbrStatus: Record<
  StudentCBRStatus,
  { label: string; variant: BadgeProps["variant"]; icon: LucideIcon }
> = {
  in_progress: { label: "In behandeling", variant: "warning", icon: Clock },
  passed: { label: "Geslaagd", variant: "success", icon: CheckCircle2 },
  approved: { label: "Goedgekeurd", variant: "success", icon: ShieldCheck },
  not_planned: { label: "Nog niet gepland", variant: "default", icon: CalendarDays },
  planned: { label: "Gepland", variant: "primary", icon: CalendarDays },
  action_needed: { label: "Actie nodig", variant: "danger", icon: AlertTriangle },
};

const theoryStatus: Record<
  StudentTheoryProgress["homework"][number]["status"],
  { label: string; variant: BadgeProps["variant"] }
> = {
  open: { label: "Openstaand", variant: "warning" },
  active: { label: "Actief", variant: "primary" },
  done: { label: "Afgerond", variant: "success" },
  available: { label: "Beschikbaar", variant: "info" },
};

function StudentCard({ children, className }: CardProps) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-brand-border/80 bg-white shadow-brand-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function StudentPageHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase text-brand-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-brand-foreground sm:text-2xl xl:text-[2.35rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-brand-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StudentSection({
  title,
  children,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  children: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          <h2 className="truncate text-sm font-extrabold text-brand-foreground sm:text-base">
            {title}
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StudentProgressRing({
  value,
  label,
  className,
  showValue = true,
}: {
  value: number;
  label?: string;
  className?: string;
  showValue?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, value));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;

  return (
    <div className={cn("relative h-24 w-24 shrink-0", className)}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--brand-muted)"
          strokeWidth="9"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="url(#student-ring-gradient)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="student-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" />
            <stop offset="100%" stopColor="var(--brand-secondary)" />
          </linearGradient>
        </defs>
      </svg>
      {showValue ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black tabular-nums text-brand-foreground">
            {Math.round(safe)}%
          </span>
          {label ? (
            <span className="mt-0.5 text-[10px] font-semibold text-brand-muted-foreground">
              {label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StudentHeroNextStepCard({
  title,
  body,
  ctaLabel,
  href,
  progressLabel,
  progressCurrent,
  progressTotal,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
}) {
  const progress = Math.round((progressCurrent / progressTotal) * 100);

  return (
    <StudentCard className="relative border-white/10 bg-brand-primary text-brand-primary-foreground shadow-brand-card">
      <div className="absolute inset-0" style={{ background: "var(--brand-hero-background)" }} />
      <svg
        viewBox="0 0 360 160"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-70"
        aria-hidden
      >
        <path
          d="M-10 142 C66 94 92 116 142 74 C184 39 226 58 258 24 C284 -3 324 2 382 -30"
          fill="none"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="2"
        />
        <path
          d="M-20 165 C68 110 98 132 154 88 C201 51 243 65 286 27 C314 2 344 2 390 -18"
          fill="none"
          stroke="rgba(47,183,255,0.58)"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>
      <div className="relative grid min-w-0 gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase text-white/64">
            Volgende focus
          </p>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="max-w-lg text-sm leading-6 text-white/78">{body}</p>
          <Link
            href={href}
            className={buttonVariants({
              size: "sm",
              className: "mt-1 bg-white text-brand-primary hover:bg-white/92",
            })}
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:justify-center">
          <div className="relative h-20 w-20 shrink-0 rounded-full border border-white/20 bg-white/10">
            <StudentProgressRing
              value={progress}
              showValue={false}
              className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 [&_span:first-child]:text-white [&_span:last-child]:text-white/70 [&_svg_circle:first-child]:stroke-white/20"
            />
            <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-white">
              {progressCurrent}/{progressTotal}
            </div>
          </div>
          <p className="text-xs font-semibold text-white/74 sm:text-center">{progressLabel}</p>
        </div>
      </div>
    </StudentCard>
  );
}

export function StudentStatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  href?: string;
}) {
  const content = (
    <StudentCard className="h-full p-4 transition-colors hover:border-brand-primary/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {href ? <ChevronRight className="h-4 w-4 text-brand-muted-foreground" aria-hidden /> : null}
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-brand-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-black text-brand-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-brand-muted-foreground">{hint}</p>
    </StudentCard>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

export function StudentQuickActionGrid({
  actions,
}: {
  actions: StudentQuickAction[];
}) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">
      {actions.map((action) => {
        const Icon = quickActionIcons[action.iconName];
        return (
          <Link
            key={action.href}
            href={action.href}
            className="group min-w-0 rounded-[var(--radius-card)] border border-brand-border/80 bg-card/90 p-4 shadow-brand-card transition-colors hover:border-brand-primary/40"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <ArrowRight className="h-4 w-4 text-brand-muted-foreground transition group-hover:text-brand-primary" aria-hidden />
            </div>
            <p className="mt-3 truncate text-sm font-extrabold text-brand-foreground">{action.label}</p>
            <p className="mt-1 text-xs leading-5 text-brand-muted-foreground">{action.description}</p>
          </Link>
        );
      })}
    </div>
  );
}

export function StudentPersonalAdviceCard({
  title,
  body,
  href = "/leerling/voortgang",
}: {
  title: string;
  body: string;
  href?: string;
}) {
  return (
    <StudentCard className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase text-brand-muted-foreground">
              Persoonlijk advies
            </p>
            <Badge variant="primary">Nieuw</Badge>
          </div>
          <h3 className="mt-2 text-lg font-black text-brand-primary">
            {title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">
            {body}
          </p>
          <Link
            href={href}
            className={buttonVariants({ size: "sm", className: "mt-3" })}
          >
            Bekijk uitleg
          </Link>
        </div>
      </div>
    </StudentCard>
  );
}

export function StudentModuleProgressList({
  modules,
}: {
  modules: StudentJourneyModule[];
}) {
  return (
    <StudentCard>
      <div className="divide-y divide-brand-border/80">
        {modules.map((module) => (
          <div key={module.id} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[10rem_1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-brand-foreground">{module.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-brand-muted-foreground">
                {module.description}
              </p>
            </div>
            <div className="min-w-0">
              <div className="h-2 rounded-full bg-brand-muted">
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: `${Math.max(0, Math.min(100, module.progress))}%` }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 sm:min-w-[7rem] sm:justify-end">
              <span className="text-sm font-black tabular-nums text-brand-foreground">
                {module.progress}%
              </span>
              <Badge variant={journeyStatus[module.status].variant}>
                {journeyStatus[module.status].label}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </StudentCard>
  );
}

export function StudentDevelopmentChart({
  data,
}: {
  data: StudentJourneyPoint[];
}) {
  const modules: Array<keyof Omit<StudentJourneyPoint, "label">> = [
    "module1",
    "module2",
    "module3",
    "module4",
    "module5",
  ];
  const colors = [
    "var(--brand-primary)",
    "var(--brand-secondary)",
    "#28a4a8",
    "#7c5cff",
    "#a78bfa",
  ];
  const width = 420;
  const height = 190;
  const left = 30;
  const bottom = 150;
  const step = (width - 60) / Math.max(1, data.length - 1);

  const polyline = (key: keyof Omit<StudentJourneyPoint, "label">) =>
    data
      .map((item, index) => {
        const x = left + index * step;
        const y = bottom - (item[key] / 100) * 110;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <StudentCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-brand-foreground">Ontwikkeling</p>
          <p className="mt-1 text-xs text-brand-muted-foreground">
            Je voortgang per module in de afgelopen maanden.
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-48 w-full" aria-hidden>
        {[25, 50, 75, 100].map((line) => (
          <line
            key={line}
            x1={left}
            x2={width - 20}
            y1={bottom - (line / 100) * 110}
            y2={bottom - (line / 100) * 110}
            stroke="var(--brand-border)"
            strokeWidth="1"
          />
        ))}
        {modules.map((module, index) => (
          <polyline
            key={module}
            fill="none"
            points={polyline(module)}
            stroke={colors[index]}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
        {data.map((item, index) => (
          <text
            key={item.label}
            x={left + index * step}
            y={176}
            textAnchor="middle"
            className="fill-[var(--brand-muted-foreground)] text-[11px]"
          >
            {item.label}
          </text>
        ))}
      </svg>
    </StudentCard>
  );
}

export function StudentReadinessCard({
  readiness,
  copy,
}: {
  readiness: number;
  copy: string;
}) {
  return (
    <StudentCard className="p-4">
      <div className="flex items-center gap-4">
        <StudentProgressRing value={readiness} label="gereed" />
        <div className="min-w-0">
          <p className="text-sm font-black text-brand-foreground">Verwachte gereedheid</p>
          <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">{copy}</p>
          <Link href="/leerling/examens" className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-brand-primary">
            Naar examens
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </StudentCard>
  );
}

export function StudentLessonCard({ lesson }: { lesson: StudentLesson }) {
  return (
    <Link href={lesson.href} className="block">
      <StudentCard className="p-4 transition-colors hover:border-brand-primary/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-brand-muted-foreground">
              {lesson.title}
            </p>
            <h3 className="mt-1 text-lg font-black text-brand-foreground">{lesson.dateLabel}</h3>
            <p className="mt-1 text-sm font-bold text-brand-foreground">{lesson.timeLabel}</p>
          </div>
          <Badge variant={lessonStatus[lesson.status].variant}>
            {lessonStatus[lesson.status].label}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-brand-muted-foreground sm:grid-cols-2">
          <span className="inline-flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{lesson.location}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-2">
            <User className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{lesson.instructor}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-2">
            <Route className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{lesson.lessonType}</span>
          </span>
          <span className="truncate">{lesson.vehicle}</span>
        </div>
      </StudentCard>
    </Link>
  );
}

export function StudentLessonTable({ lessons }: { lessons: StudentLesson[] }) {
  if (lessons.length === 0) {
    return (
      <StudentCard className="hidden p-5 text-sm leading-6 text-brand-muted-foreground lg:block">
        Zodra je eerste les is afgerond verschijnt je lesgeschiedenis hier.
      </StudentCard>
    );
  }

  return (
    <StudentCard className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-brand-border/80 text-xs uppercase text-brand-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-extrabold">Datum</th>
            <th className="px-4 py-3 font-extrabold">Locatie</th>
            <th className="px-4 py-3 font-extrabold">Voertuig</th>
            <th className="px-4 py-3 font-extrabold">Instructeur</th>
            <th className="px-4 py-3 font-extrabold">Status</th>
            <th className="px-4 py-3 font-extrabold">Actie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border/80">
          {lessons.map((lesson) => (
            <tr key={lesson.id} className="text-brand-foreground">
              <td className="px-4 py-3">
                <div className="font-extrabold">{lesson.dateLabel}</div>
                <div className="text-xs text-brand-muted-foreground">{lesson.timeLabel}</div>
              </td>
              <td className="px-4 py-3">{lesson.location}</td>
              <td className="px-4 py-3">{lesson.vehicle}</td>
              <td className="px-4 py-3">{lesson.instructor}</td>
              <td className="px-4 py-3">
                <Badge variant={lessonStatus[lesson.status].variant}>
                  {lessonStatus[lesson.status].label}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Link href={lesson.href} className="font-extrabold text-brand-primary hover:underline">
                  Bekijk les
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </StudentCard>
  );
}

export function StudentLessonTimeline({ lesson }: { lesson: StudentLesson }) {
  const items = [
    "Les gepland",
    lesson.status === "completed" ? "Les afgerond" : "Voorbereiding klaarzetten",
    lesson.publishedReflection ? "Feedback gepubliceerd" : "Feedback volgt na de les",
    "Reflectie invullen",
  ];

  return (
    <StudentCard className="p-4">
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-accent text-xs font-black text-brand-primary">
              {index + 1}
            </span>
            <span className="text-sm font-bold text-brand-foreground">{item}</span>
          </li>
        ))}
      </ol>
    </StudentCard>
  );
}

export function StudentTheoryProgressCard({
  theory,
}: {
  theory: StudentTheoryProgress;
}) {
  return (
    <StudentCard className="p-4">
      <div className="flex items-center gap-4">
        <StudentProgressRing value={theory.progress} />
        <div className="min-w-0">
          <p className="text-sm font-black text-brand-foreground">Theorie voortgang</p>
          <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">
            {theory.statusCopy}
          </p>
          <Link href="/leerling/theorie" className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-brand-primary">
            Naar theorie
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </StudentCard>
  );
}

export function StudentTheoryList({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; title: string; countLabel?: string; meta?: string; status: keyof typeof theoryStatus }>;
}) {
  return (
    <StudentCard>
      <div className="border-b border-brand-border/80 px-4 py-3">
        <h3 className="text-sm font-black text-brand-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-brand-border/80">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-brand-foreground">{item.title}</p>
              <p className="text-xs text-brand-muted-foreground">
                {item.countLabel ?? item.meta}
              </p>
            </div>
            <Badge variant={theoryStatus[item.status].variant}>
              {theoryStatus[item.status].label}
            </Badge>
          </div>
        ))}
      </div>
    </StudentCard>
  );
}

export function StudentPaymentBalanceCard({
  balance,
}: {
  balance: StudentPaymentBalance;
}) {
  return (
    <StudentCard className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-brand-muted-foreground">
            Tegoed
          </p>
          <p className="mt-2 text-3xl font-black text-brand-foreground">
            {balance.creditLabel}
          </p>
          <p className="mt-1 text-sm text-brand-muted-foreground">
            {balance.hoursAvailable}
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-accent text-brand-primary">
          <Wallet className="h-6 w-6" aria-hidden />
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-brand-warning/25 bg-[color-mix(in_oklab,var(--brand-warning)_10%,white)] px-3 py-3 text-sm text-brand-foreground">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-warning" aria-hidden />
          <p>{balance.warning}</p>
        </div>
      </div>
      <Link
        href="/leerling/betalingen"
        className={buttonVariants({ className: "mt-4 w-full" })}
      >
        Tegoed opwaarderen
      </Link>
    </StudentCard>
  );
}

export function StudentInvoiceList({ invoices }: { invoices: StudentInvoice[] }) {
  return (
    <StudentCard>
      <div className="divide-y divide-brand-border/80">
        {invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={invoice.href}
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-brand-muted/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-brand-foreground">
                Factuur #{invoice.invoiceNumber}
              </p>
              <p className="text-xs text-brand-muted-foreground">{invoice.dateLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-brand-foreground">{invoice.amountLabel}</p>
              <Badge variant={invoiceStatus[invoice.status].variant}>
                {invoiceStatus[invoice.status].label}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </StudentCard>
  );
}

export function StudentCBRStatusList({ items }: { items: StudentCBRStatusItem[] }) {
  return (
    <StudentCard>
      <div className="divide-y divide-brand-border/80">
        {items.map((item) => {
          const meta = cbrStatus[item.status];
          const Icon = meta.icon;
          return (
            <div key={item.id} className="flex gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold text-brand-foreground">{item.title}</p>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
                  {item.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </StudentCard>
  );
}

export function StudentActivityList({
  items,
}: {
  items: Array<{ id: string; title: string; body: string; timeLabel: string }>;
}) {
  return (
    <StudentCard>
      <div className="divide-y divide-brand-border/80">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-accent text-brand-primary">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-brand-foreground">{item.title}</p>
              <p className="text-xs text-brand-muted-foreground">{item.body}</p>
            </div>
            <span className="shrink-0 text-xs text-brand-muted-foreground">
              {item.timeLabel}
            </span>
          </div>
        ))}
      </div>
    </StudentCard>
  );
}

export function StudentRISReflectionCard({
  reflection,
}: {
  reflection: StudentRISReflection;
}) {
  return (
    <StudentCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-brand-foreground">{reflection.title}</p>
          <p className="mt-1 text-xs text-brand-muted-foreground">
            {reflection.lessonLabel} - {reflection.publishedAt}
          </p>
        </div>
        <Badge variant="success">Gepubliceerd</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-brand-border/70 bg-white/90 p-3 shadow-sm">
          <p className="text-xs font-extrabold text-brand-muted-foreground">Wat ging goed?</p>
          <p className="mt-1 text-sm leading-6 text-brand-foreground">
            {reflection.whatWentWell}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-border/70 bg-white/90 p-3 shadow-sm">
          <p className="text-xs font-extrabold text-brand-muted-foreground">Waar werken we aan?</p>
          <p className="mt-1 text-sm leading-6 text-brand-foreground">
            {reflection.workingOn}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-border/70 bg-white/90 p-3 shadow-sm">
          <p className="text-xs font-extrabold text-brand-muted-foreground">Volgende focus</p>
          <p className="mt-1 text-sm leading-6 text-brand-foreground">
            {reflection.nextFocus}
          </p>
        </div>
      </div>
    </StudentCard>
  );
}

export function StudentMoreMenu() {
  const links = [
    { href: "/leerling/berichten", label: "Berichten", icon: MessageCircle },
    { href: "/leerling/betalingen", label: "Betalingen", icon: Wallet },
    { href: "/leerling/examens", label: "CBR & Examens", icon: BadgeCheck },
    {
      href: "/leerling/instellingen?tab=documenten",
      label: "Documenten",
      icon: FileText,
    },
    { href: "/leerling/meldingen", label: "Meldingen", icon: Bell },
    {
      href: "/leerling/instellingen?tab=instellingen",
      label: "Account & instellingen",
      icon: Settings,
    },
    {
      href: "/leerling/instellingen?tab=contact",
      label: "Hulp & contact",
      icon: MessageCircle,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href + item.label}
            href={item.href}
            className="flex items-center gap-3 rounded-[var(--radius-card)] border border-brand-border bg-white p-4 shadow-brand-card transition hover:border-brand-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-black text-brand-foreground">
              {item.label}
            </span>
            <ChevronRight className="h-4 w-4 text-brand-muted-foreground" aria-hidden />
          </Link>
        );
      })}
      <form action="/auth/logout" method="post">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-brand-border bg-white p-4 text-left shadow-brand-card transition hover:border-danger/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <LogOut className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-black text-danger">
            Uitloggen
          </span>
          <ChevronRight className="h-4 w-4 text-brand-muted-foreground" aria-hidden />
        </button>
      </form>
    </div>
  );
}

export function StudentEmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon?: LucideIcon;
  title?: string;
  message: string;
}) {
  return (
    <StudentCard className="p-6 text-center">
      {Icon ? (
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-accent text-brand-primary">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
      ) : null}
      {title ? <p className="mt-3 font-black text-brand-foreground">{title}</p> : null}
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-brand-muted-foreground">
        {message}
      </p>
    </StudentCard>
  );
}

export const studentRouteIcons = {
  home: Home,
  journey: Route,
  agenda: CalendarDays,
  theory: BookOpen,
  more: MoreHorizontal,
  payments: Wallet,
  messages: MessageCircle,
  cbr: BadgeCheck,
  documents: FileText,
  settings: Settings,
  notifications: Bell,
  credit: CreditCard,
};
