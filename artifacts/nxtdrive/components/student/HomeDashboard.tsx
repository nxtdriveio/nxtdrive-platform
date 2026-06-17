"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard as CreditCardIcon,
  MapPin,
  Route,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QuickActions } from "@/components/student/QuickActions";
import { cn } from "@/lib/utils";
import type { StudentJourneyStep } from "@/lib/students/app-summary";

export type StudentNextLessonSummary = {
  href: string;
  dayLabel: string;
  timeLabel: string;
  primary: string;
  secondary?: string | null;
  vehicle?: string | null;
};

export type StudentExamReadinessSummary = {
  href: string;
  readinessPct: number;
  badgeLabel: string;
  badgeVariant: "success" | "warning" | "default";
  title: string;
  detail: string;
  eta: string;
};

export type StudentCoachSummary = {
  title: string;
  body: string;
  ctaHref: string;
  eyebrow?: string;
};

const HOURS_FMT = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

function formatHours(minutes: number) {
  return `${HOURS_FMT.format(Math.max(0, minutes) / 60)} lesuur`;
}

function cleanDisplayText(text: string) {
  return text
    .replace(/\u00c2\u00b7/g, "-")
    .replace(/\u00c3\u0082\u00c2\u00b7/g, "-")
    .replace(/!\s.+$/, "")
    .trim();
}

function DashboardCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border border-brand-border/80 bg-white shadow-brand-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-brand-accent text-brand-primary">
          {icon}
        </span>
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-muted-foreground">
          {label}
        </span>
      </div>
      {badge}
    </div>
  );
}

function ProgressRing({
  pct,
  size = 104,
  stroke = 10,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="student-home-progress-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-secondary)" />
            <stop offset="100%" stopColor="var(--brand-primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="color-mix(in oklab, var(--brand-border) 82%, white)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#student-home-progress-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-[1.05rem] flex items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-xl font-black tracking-tight text-brand-foreground">
          {safe}%
        </span>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 150;
  const height = 44;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-full text-brand-primary">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function HeroRoad() {
  return (
    <svg
      viewBox="0 0 260 120"
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-75"
      aria-hidden
    >
      <defs>
        <linearGradient id="student-road-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M26 111 C82 76 93 74 119 63 C151 49 142 29 187 19 C213 13 236 17 252 23"
        fill="none"
        stroke="url(#student-road-glow)"
        strokeWidth="11"
        strokeLinecap="round"
        opacity="0.34"
      />
      <path
        d="M40 112 C88 82 101 78 124 66 C152 52 150 34 190 24 C216 18 238 22 252 28"
        fill="none"
        stroke="#ffffff"
        strokeDasharray="10 13"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.54"
      />
      <circle cx="206" cy="22" r="5" fill="#38bdf8" opacity="0.85" />
    </svg>
  );
}

function NextStepHero({ coach }: { coach: StudentCoachSummary }) {
  return (
    <section
      data-student-hero=""
      className="relative overflow-hidden rounded-[1.35rem] border border-white/15 px-4 py-4 text-white shadow-brand-floating sm:rounded-[1.55rem] sm:px-5 sm:py-5 xl:px-6"
      style={{ background: "var(--brand-hero-background)" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(255,255,255,0.18),transparent_28%)]" />
      <HeroRoad />
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/64">
            Jouw volgende stap
          </p>
          <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">
            Kijktechniek en rotondes
          </h2>
          <p className="max-w-xl text-xs leading-5 text-white/78 sm:text-sm sm:leading-6">
            Blijf werken aan je kijktechniek en voorsorteren. Kleine stappen,
            groot resultaat.
          </p>
          <Link
            href={coach.ctaHref}
            className="inline-flex h-9 items-center gap-2 rounded-[0.85rem] bg-white px-3.5 text-xs font-semibold text-brand-primary shadow-sm transition hover:bg-white/92 sm:h-10 sm:text-sm"
          >
            Bekijk plan
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <div className="hidden shrink-0 flex-col items-center gap-1 rounded-full border border-white/20 bg-white/10 p-2 backdrop-blur sm:flex">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-cyan-300/70 text-lg font-black text-white">
            2/3
          </div>
          <span className="text-[10px] font-semibold text-white/70">Deze week</span>
        </div>
      </div>
    </section>
  );
}

function NextLessonCard({ nextLesson }: { nextLesson: StudentNextLessonSummary | null }) {
  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<CalendarDays className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="Volgende les"
      />
      {nextLesson ? (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-lg font-black tracking-tight text-brand-foreground">
              {nextLesson.dayLabel}
            </h3>
            <p className="mt-1 text-sm font-semibold text-brand-foreground">
              {nextLesson.timeLabel}
            </p>
          </div>
          <div className="space-y-1.5 text-xs leading-5 text-brand-muted-foreground">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand-primary" aria-hidden />
              {nextLesson.secondary ?? "Locatie volgt"}
            </p>
            <p>{nextLesson.primary}</p>
            {nextLesson.vehicle ? <p>{nextLesson.vehicle}</p> : null}
          </div>
          <Link
            href={nextLesson.href}
            className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-accent px-3.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary hover:text-brand-primary-foreground"
          >
            Bekijk les
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-lg font-black tracking-tight text-brand-foreground">
              Nog niet ingepland
            </h3>
            <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
              Plan je ritme met je rijschool en zet de volgende les alvast vast.
            </p>
          </div>
          <Link
            href="/student/agenda"
            className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-primary px-3.5 text-sm font-semibold text-brand-primary-foreground transition hover:brightness-105"
          >
            Les plannen
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </DashboardCard>
  );
}

function ProgressCard({
  journeyPct,
  journeyStatus,
  sparklineValues,
}: {
  journeyPct: number;
  journeyStatus: string;
  sparklineValues: number[];
}) {
  return (
    <DashboardCard className="p-4">
      <CardHeader icon={<Route className="h-[1.125rem] w-[1.125rem]" aria-hidden />} label="Voortgang" />
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing pct={journeyPct} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black tracking-tight text-brand-foreground">
            {journeyStatus}
          </h3>
          <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
            Je voortgang in begrijpelijke stappen.
          </p>
          <Link
            href="/student/journey"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary"
          >
            Bekijk voortgang
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      <div className="mt-4 hidden rounded-[1rem] bg-brand-muted/55 px-3 py-2 md:block">
        <Sparkline values={sparklineValues} />
      </div>
    </DashboardCard>
  );
}

function CoachCard({ coach }: { coach: StudentCoachSummary }) {
  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<Sparkles className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="AI Coach"
        badge={
          <Badge variant="primary" className="bg-brand-accent text-brand-primary shadow-none">
            Nieuw
          </Badge>
        }
      />
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-muted-foreground">
          Volgende focus
        </p>
        <h3 className="mt-1 text-lg font-black tracking-tight text-brand-primary">
          {cleanDisplayText(coach.title)}
        </h3>
        <p className="mt-2 text-sm leading-6 text-brand-muted-foreground">
          {coach.body}
        </p>
        <Link
          href={coach.ctaHref}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-primary px-3.5 text-sm font-semibold text-brand-primary-foreground transition hover:brightness-105"
        >
          Bekijk advies
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}

function CreditBalanceCard({ availableMinutes }: { availableMinutes: number }) {
  const low = availableMinutes < 600;

  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<Wallet className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="Tegoed"
        badge={
          low ? (
            <Badge variant="warning" className="shadow-none">
              Let op
            </Badge>
          ) : null
        }
      />
      <div className="mt-4">
        <div className="text-2xl font-black tracking-tight text-brand-foreground">
          {formatHours(availableMinutes)}
        </div>
        <p className="mt-1 text-sm text-brand-muted-foreground">
          Beschikbaar voor je volgende lessen.
        </p>
        {low ? (
          <div className="mt-3 rounded-[0.95rem] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            Je tegoed is bijna op. Vul op tijd aan om je lessen door te plannen.
          </div>
        ) : null}
        <Link
          href="/student/payments"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-accent px-3.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary hover:text-brand-primary-foreground"
        >
          Tegoed opwaarderen
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </DashboardCard>
  );
}

function ExamCard({ examStatus }: { examStatus: StudentExamReadinessSummary }) {
  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<BadgeCheck className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="Examens"
        badge={<Badge variant={examStatus.badgeVariant}>{examStatus.badgeLabel}</Badge>}
      />
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing pct={examStatus.readinessPct} size={88} stroke={9} />
        <div className="min-w-0">
          <h3 className="text-base font-black tracking-tight text-brand-foreground">
            {examStatus.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-brand-muted-foreground">
            {cleanDisplayText(examStatus.detail)}
          </p>
          <p className="mt-1 text-xs font-semibold text-brand-primary">
            {examStatus.eta}
          </p>
        </div>
      </div>
      <Link
        href={examStatus.href}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary"
      >
        Naar examens
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </DashboardCard>
  );
}

function JourneyPanel({ steps }: { steps: StudentJourneyStep[] }) {
  return (
    <DashboardCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-muted-foreground">
            Mijn reis
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-brand-foreground">
            Jouw rijbewijsreis
          </h2>
        </div>
        <Link
          href="/student/journey"
          className="text-sm font-semibold text-brand-primary"
        >
          Bekijk alles
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step) => {
          const complete = step.status === "complete";
          const active = step.status === "active";

          return (
            <div key={step.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  complete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : active
                      ? "border-brand-primary/30 bg-brand-accent text-brand-primary"
                      : "border-brand-border bg-white text-brand-muted-foreground",
                )}
              >
                {complete ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0 flex-1 border-b border-brand-border/65 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-brand-foreground">
                    {step.label}
                  </span>
                  {step.value ? (
                    <span className="shrink-0 text-xs font-semibold text-brand-primary">
                      {step.value}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function ActivityPanel() {
  const items = [
    {
      label: "Les afgerond",
      detail: "Je laatste les is verwerkt",
      icon: CheckCircle2,
    },
    {
      label: "Theorie oefenen",
      detail: "Nieuwe opdrachten beschikbaar",
      icon: BookOpen,
    },
    {
      label: "Betaling ontvangen",
      detail: "Je tegoed is bijgewerkt",
      icon: CreditCardIcon,
    },
  ];

  return (
    <DashboardCard className="p-4 sm:p-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-muted-foreground">
          Activiteit
        </p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-brand-foreground">
          Laatste activiteit
        </h2>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent text-brand-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-brand-foreground">
                  {item.label}
                </div>
                <div className="text-xs leading-5 text-brand-muted-foreground">
                  {item.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

export function StudentHomeDashboard({
  greeting,
  firstName,
  journeyPct,
  journeyStatus,
  journeySteps,
  sparklineValues,
  nextLesson,
  examStatus,
  coach,
  messageUnreadCount,
  creditAvailableMinutes,
}: {
  greeting: string;
  firstName: string;
  journeyPct: number;
  journeyStatus: string;
  journeySteps: StudentJourneyStep[];
  sparklineValues: number[];
  nextLesson: StudentNextLessonSummary | null;
  examStatus: StudentExamReadinessSummary;
  coach: StudentCoachSummary;
  messageUnreadCount: number;
  creditAvailableMinutes: number;
}) {
  return (
    <div className="min-w-0 space-y-4 sm:space-y-5 xl:space-y-6">
      <section className="px-1">
        <p className="text-sm font-semibold text-brand-muted-foreground">
          Wat gaan we vandaag doen?
        </p>
        <h1 className="mt-1 text-[clamp(1.75rem,7vw,2.45rem)] font-black leading-[1.02] tracking-tight text-brand-foreground md:text-[2.35rem]">
          {greeting}, {firstName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted-foreground sm:text-[0.96rem]">
          Klaar voor je volgende stap? Alles wat belangrijk is staat direct
          voor je klaar.
        </p>
      </section>

      <NextStepHero coach={coach} />

      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <NextLessonCard nextLesson={nextLesson} />
        <ProgressCard
          journeyPct={journeyPct}
          journeyStatus={journeyStatus}
          sparklineValues={sparklineValues}
        />
        <CreditBalanceCard availableMinutes={creditAvailableMinutes} />
        <ExamCard examStatus={examStatus} />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <QuickActions messageUnreadCount={messageUnreadCount} />
          <JourneyPanel steps={journeySteps} />
        </div>
        <aside className="min-w-0 space-y-4 sm:space-y-5">
          <CoachCard coach={coach} />
          <ActivityPanel />
        </aside>
      </div>
    </div>
  );
}
